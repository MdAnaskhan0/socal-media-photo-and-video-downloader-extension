(() => {
  const { clean, directVideoUrl, bgFetchJson, onHookData, askHook, sleep, register } = globalThis.__dl;

  const tweets = new Map(); // tweet id -> media items captured from X's own API data
  onHookData((type, data) => {
    if (type !== "tweet-media") return;
    tweets.set(data.id, data.items);
    if (tweets.size > 4000) tweets.delete(tweets.keys().next().value);
  });

  const tokenFor = (id) => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");

  // Which tweet(s) does this media belong to? Nearest first.
  function tweetRefs(el) {
    const out = [];
    const add = (user, id) => { if (id && !out.some((r) => r.id === id)) out.push({ user, id }); };
    let node = el.parentElement;
    for (let i = 0; i < 30 && node; i++, node = node.parentElement) {
      const links = node.querySelectorAll('a[href*="/status/"]');
      if (!links.length) continue;
      for (const a of links) {
        const m = (a.getAttribute("href") || "").match(/^\/([^/]+)\/status\/(\d+)/);
        if (m) add(m[1], m[2]);
      }
      if (out.length) break;
    }
    const m = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (m) add(m[1], m[2]);
    return out;
  }

  const sortedMp4 = (variants) =>
    (variants || []).slice().sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0)).map((v) => v.url);

  function lookup(el, refs) {
    for (const r of refs) {
      const items = tweets.get(r.id);
      const vid = items && items.find((i) => i.variants.length);
      if (vid) return { ref: r, vid };
    }
    // Couldn't tie it to a tweet link: match by video length instead.
    const d = el.duration;
    if (isFinite(d) && d > 0) {
      let best = null, bestDiff = 1.5;
      for (const [id, items] of tweets) {
        for (const i of items) {
          if (!i.variants.length || !i.dur) continue;
          const diff = Math.abs(i.dur - d);
          if (diff <= bestDiff) { bestDiff = diff; best = { ref: { user: "x", id }, vid: i }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  async function resolveVideo(el) {
    const refs = tweetRefs(el);
    const tag = refs[0] ? `${clean(refs[0].user)}_${refs[0].id}` : `video_${Date.now()}`;
    const filename = `Twitter/${tag}.mp4`;

    // 1) GIFs and some videos point straight at an MP4.
    const direct = directVideoUrl(el);
    if (direct) return { url: direct, filename, recordOnFail: true };

    // 2) Links captured from X's own data (works for any tweet you can see).
    let hit = lookup(el, refs);
    if (!hit) {
      askHook("sync");
      await sleep(300);
      hit = lookup(el, refs);
    }
    if (hit) {
      return {
        urls: sortedMp4(hit.vid.variants),
        filename: `Twitter/${clean(hit.ref.user)}_${hit.ref.id}.mp4`,
        recordOnFail: true
      };
    }

    // 3) Public tweet endpoint.
    for (const r of refs) {
      try {
        const data = await bgFetchJson(
          `https://cdn.syndication.twimg.com/tweet-result?id=${r.id}&lang=en&token=${tokenFor(r.id)}`
        );
        const lists = [data && data.mediaDetails, data && data.quoted_tweet && data.quoted_tweet.mediaDetails];
        for (const list of lists) {
          for (const m of list || []) {
            const vs = ((m.video_info && m.video_info.variants) || [])
              .filter((v) => v.content_type === "video/mp4")
              .map((v) => ({ url: v.url, bitrate: v.bitrate }));
            if (vs.length) {
              return { urls: sortedMp4(vs), filename: `Twitter/${clean(r.user)}_${r.id}.mp4`, recordOnFail: true };
            }
          }
        }
      } catch (_) { /* next */ }
    }

    // 4) Nothing found: record it as it plays.
    return { record: true, filename };
  }

  function resolvePhoto(el) {
    const src = el.currentSrc || el.src;
    const u = new URL(src);
    const base = u.pathname.split("/").pop().replace(/\.\w+$/, "");
    const fmt = u.searchParams.get("format") || (u.pathname.match(/\.(\w+)$/) || [])[1] || "jpg";
    const first = fmt === "webp" ? "jpg" : fmt;
    const mk = (format, name) => `https://pbs.twimg.com/media/${base}?format=${format}&name=${name}`;
    const urls = [
      mk(first, "orig"), mk("jpg", "orig"), mk("png", "orig"),
      mk(first, "4096x4096"), mk(first, "large"), src
    ].filter((x, i, a) => a.indexOf(x) === i);
    const refs = tweetRefs(el);
    const tag = refs[0] ? `${clean(refs[0].user)}_${refs[0].id}_` : "";
    return { urls, filename: `Twitter/${tag}${clean(base)}.{ext}`, ext: "jpg" };
  }

  register({
    name: "X",
    acceptImage: (img) => /pbs\.twimg\.com\/media\//.test(img.currentSrc || img.src || ""),
    topOffset: () => 10,
    resolve: (el) => (el.tagName === "IMG" ? resolvePhoto(el) : resolveVideo(el))
  });
})();
