(() => {
  const { clean, extFromUrl, register } = globalThis.__dl;

  const ID_PATTERNS = [/[?&]v=(\d+)/, /\/reel\/(\d+)/, /\/videos\/(?:[^/?]+\/)?(\d+)/];
  const LINK_SELECTOR = [
    'a[href*="/videos/"]',
    'a[href*="/reel/"]',
    'a[href*="/watch"]',
    'a[href*="/posts/"]',
    'a[href*="/permalink.php"]',
    'a[href*="story_fbid"]',
    'a[href*="/share/v/"]',
    'a[href*="/share/r/"]'
  ].join(",");

  // Keys Facebook uses for progressive MP4 links (with audio), best quality first.
  const URL_KEYS = ["browser_native_hd_url", "browser_native_sd_url", "playable_url_quality_hd", "playable_url"];

  const videoIdFromHref = (href) => {
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

  // Figure out which video / post page this <video> belongs to.
  function findSource(el) {
    let id = videoIdFromHref(location.href);
    if (id) return { id, pageUrl: `${location.origin}/watch/?v=${id}` };

    let node = el.parentElement;
    for (let i = 0; i < 30 && node; i++, node = node.parentElement) {
      const links = node.querySelectorAll(LINK_SELECTOR);
      for (const a of links) {
        id = videoIdFromHref(a.href);
        if (id) return { id, pageUrl: `${location.origin}/watch/?v=${id}` };
      }
      if (links.length) return { id: null, pageUrl: sameOrigin(links[0].href) };
    }
    return null;
  }

  function positionsOf(html, needle) {
    const out = [];
    let i = -1;
    while (out.length < 30 && (i = html.indexOf(needle, i + 1)) !== -1) out.push(i);
    return out;
  }

  function decode(raw) {
    try {
      return JSON.parse('"' + raw + '"');
    } catch {
      return raw.replace(/\\\//g, "/").replace(/\\u0025/g, "%").replace(/\\u0026/g, "&");
    }
  }

  // Pull the MP4 link out of the page's embedded JSON.
  function extractVideoUrl(html, id) {
    const idPos = id ? positionsOf(html, id) : [];
    for (const key of URL_KEYS) {
      const re = new RegExp('"' + key + '":"((?:[^"\\\\]|\\\\.)*)"', "g");
      let best = null;
      let bestDist = Infinity;
      let m;
      while ((m = re.exec(html))) {
        if (!idPos.length) { best = m; break; } // no id: take the first match
        const dist = Math.min(...idPos.map((p) => Math.abs(p - m.index)));
        if (dist < bestDist) { bestDist = dist; best = m; }
      }
      if (best) return decode(best[1]).replace(/&amp;/g, "&");
    }
    return null;
  }

  async function resolve(el) {
    if (el.tagName === "IMG") {
      const url = el.currentSrc || el.src;
      if (!url || url.startsWith("blob:") || url.startsWith("data:")) throw new Error("Image URL not available");
      const base = new URL(url).pathname.split("/").pop().replace(/\.\w+$/, "");
      return { url, filename: `Facebook/facebook_photo_${clean(base)}.${extFromUrl(url, "jpg")}` };
    }

    const src = findSource(el);
    if (!src) throw new Error("Could not identify this video");
    const res = await fetch(src.pageUrl, { credentials: "include", headers: { accept: "text/html" } });
    if (!res.ok) throw new Error(`Facebook returned ${res.status}`);
    const html = await res.text();
    const url = extractVideoUrl(html, src.id);
    if (!url) throw new Error("Video link not found (private video, or Facebook changed its page format)");
    return { url, filename: `Facebook/facebook_video_${src.id || Date.now()}.mp4` };
  }

  register({
    name: "Facebook",
    // Only real photos: skips emoji, icons and other static assets.
    acceptImage: (img) => {
      const s = img.currentSrc || img.src || "";
      return /fbcdn\.net|fbsbx\.com/.test(s) && !/static\.xx\.fbcdn\.net|emoji|\/rsrc\.php/.test(s);
    },
    topOffset: () => 10,
    resolve
  });
})();
