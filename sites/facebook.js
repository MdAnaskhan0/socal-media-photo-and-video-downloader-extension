(() => {
  const { clean, directVideoUrl, onHookData, askHook, register } = globalThis.__dl;

  const videos = new Map(); // id (or "u:url") -> { id, dur, hd, sd }
  const photos = new Map(); // file name -> { url, width } (largest known version)
  let waiters = [];

  function addVideo(v) {
    const key = v.id || "u:" + (v.hd || v.sd);
    const cur = videos.get(key) || { id: v.id || null };
    if (v.generic) { // guessed links never replace known ones
      if (v.hd && !cur.hd) cur.hd = v.hd;
      if (v.sd && !cur.sd) cur.sd = v.sd;
    } else {
      if (v.hd) cur.hd = v.hd;
      if (v.sd) cur.sd = v.sd;
    }
    if (v.dur) cur.dur = v.dur;
    videos.delete(key);
    videos.set(key, cur); // keep "most recent last"
    if (videos.size > 3000) videos.delete(videos.keys().next().value);
  }

  onHookData((type, data) => {
    if (type === "fb-videos") data.forEach(addVideo);
    else if (type === "fb-photos") {
      for (const p of data) {
        const cur = photos.get(p.base);
        if (!cur || p.width > cur.width) photos.set(p.base, { url: p.url, width: p.width });
      }
    } else if (type === "rescan-done") {
      const w = waiters;
      waiters = [];
      w.forEach((f) => f());
    }
  });

  const rescan = () =>
    new Promise((res) => {
      waiters.push(res);
      askHook("rescan");
      setTimeout(res, 1500);
    });

  const ID_PATTERNS = [/[?&]v=(\d+)/, /\/reel\/(\d+)/, /\/videos\/(?:[^/?]+\/)?(\d+)/];
  const LINK_SELECTOR = [
    'a[href*="/videos/"]', 'a[href*="/reel/"]', 'a[href*="/watch"]', 'a[href*="/posts/"]',
    'a[href*="/permalink.php"]', 'a[href*="story_fbid"]', 'a[href*="/share/v/"]', 'a[href*="/share/r/"]'
  ].join(",");

  const idFromHref = (href) => {
    for (const p of ID_PATTERNS) {
      const m = href.match(p);
      if (m) return m[1];
    }
    return null;
  };
  const sameOrigin = (href) => {
    const u = new URL(href, location.href);
    return location.origin + u.pathname + u.search;
  };

  function findSource(el) {
    const ids = [];
    let pageUrl = null;
    const push = (id) => { if (id && !ids.includes(id)) ids.push(id); };
    push(idFromHref(location.href));
    let node = el.parentElement;
    for (let i = 0; i < 30 && node; i++, node = node.parentElement) {
      const links = node.querySelectorAll(LINK_SELECTOR);
      if (!links.length) continue;
      for (const a of links) {
        const id = idFromHref(a.href);
        push(id);
        if (!id && !pageUrl) pageUrl = sameOrigin(a.href);
      }
      break;
    }
    if (!pageUrl && ids[0]) pageUrl = `${location.origin}/watch/?v=${ids[0]}`;
    return { ids, pageUrl };
  }

  function pick(el, ids) {
    for (const id of ids) {
      const e = videos.get(id);
      if (e && (e.hd || e.sd)) return e;
    }
    const d = el.duration;
    if (isFinite(d) && d > 0) {
      const all = [...videos.values()].reverse().filter((e) => e.dur && (e.hd || e.sd));
      for (const tol of [1.5, 5]) { // exact-ish match first, then looser
        const c = all.filter((e) => Math.abs(e.dur - d) <= tol)
          .sort((a, b) => Math.abs(a.dur - d) - Math.abs(b.dur - d)); // ties keep "most recent first"
        if (c.length) return c[0];
      }
    }
    return null;
  }

  /* ---- fallback: read the video page's HTML ---- */
  const URL_KEYS = ["browser_native_hd_url", "browser_native_sd_url", "playable_url_quality_hd", "playable_url", "progressive_url"];

  function decode(raw) {
    try { return JSON.parse('"' + raw + '"'); }
    catch { return raw.replace(/\\\//g, "/").replace(/\\u0025/g, "%").replace(/\\u0026/g, "&"); }
  }

  function extractFromHtml(html, id) {
    const idPos = [];
    if (id) {
      let i = -1;
      while (idPos.length < 30 && (i = html.indexOf(id, i + 1)) !== -1) idPos.push(i);
    }
    for (const key of URL_KEYS) {
      const re = new RegExp('"' + key + '":"((?:[^"\\\\]|\\\\.)*)"', "g");
      let best = null, bestDist = Infinity, m;
      while ((m = re.exec(html))) {
        if (!idPos.length) { best = m; break; }
        const dist = Math.min(...idPos.map((p) => Math.abs(p - m.index)));
        if (dist < bestDist) { bestDist = dist; best = m; }
      }
      if (best) return decode(best[1]).replace(/&amp;/g, "&");
    }
    return null;
  }

  async function resolveVideo(el) {
    const { ids, pageUrl } = findSource(el);
    const tag = ids[0] || Date.now();
    const filename = `Facebook/facebook_video_${tag}.mp4`;

    const direct = directVideoUrl(el);
    if (direct) return { url: direct, filename, recordOnFail: true };

    let entry = pick(el, ids);
    if (!entry) {
      await rescan(); // pick up data embedded in the page that just arrived
      entry = pick(el, ids);
    }
    if (entry) {
      const urls = [entry.hd, entry.sd].filter(Boolean);
      return { urls, filename: `Facebook/facebook_video_${entry.id || tag}.mp4`, recordOnFail: true };
    }

    if (pageUrl) {
      try {
        const res = await fetch(pageUrl, { credentials: "include", headers: { accept: "text/html" } });
        if (res.ok) {
          const url = extractFromHtml(await res.text(), ids[0]);
          if (url) return { url, filename, recordOnFail: true };
        }
      } catch (_) { /* fall through */ }
    }

    // Nothing found: record it as it plays.
    return { record: true, filename };
  }

  function resolvePhoto(el) {
    const src = el.currentSrc || el.src;
    if (!src || src.startsWith("blob:") || src.startsWith("data:")) throw new Error("Image URL not available");
    const base = new URL(src).pathname.split("/").pop();
    const hit = photos.get(base);
    const urls = [];
    if (hit && hit.width >= (el.naturalWidth || 0)) urls.push(hit.url);
    urls.push(src);
    return { urls, filename: `Facebook/facebook_photo_${clean(base.replace(/\.\w+$/, ""))}.{ext}`, ext: "jpg" };
  }

  register({
    name: "Facebook",
    acceptImage: (img) => {
      const s = img.currentSrc || img.src || "";
      return /fbcdn\.net|fbsbx\.com/.test(s) && !/static\.xx\.fbcdn\.net|emoji|\/rsrc\.php/.test(s);
    },
    topOffset: () => 10,
    resolve: (el) => (el.tagName === "IMG" ? resolvePhoto(el) : resolveVideo(el))
  });
})();
