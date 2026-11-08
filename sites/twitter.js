(() => {
  const { clean, extFromUrl, bgFetchJson, register } = globalThis.__dl;

  // Token expected by the public tweet endpoint (same formula the official embeds use).
  const tokenFor = (id) => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");

  function tweetInfo(el) {
    const article = el.closest("article");
    const timeLink = article && article.querySelector('a[href*="/status/"] time');
    const href = (timeLink && timeLink.closest("a").getAttribute("href")) || location.pathname;
    const m = href.match(/^\/([^/]+)\/status\/(\d+)/) || location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    return m ? { user: m[1], id: m[2] } : null;
  }

  function bestMp4(variants) {
    const mp4 = (variants || [])
      .filter((v) => v.content_type === "video/mp4" && v.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    return mp4[0] ? mp4[0].url : null;
  }

  function findVideoUrl(data) {
    const lists = [data.mediaDetails, data.quoted_tweet && data.quoted_tweet.mediaDetails];
    for (const list of lists) {
      for (const m of list || []) {
        const url = m.video_info && bestMp4(m.video_info.variants);
        if (url) return url;
      }
    }
    return data.video ? bestMp4(data.video.variants) : null;
  }

  async function resolve(el) {
    const info = tweetInfo(el);

    if (el.tagName === "IMG") {
      const u = new URL(el.currentSrc || el.src);
      let fmt = u.searchParams.get("format");
      if (!fmt) fmt = extFromUrl(u.href, "jpg");
      u.searchParams.set("name", "orig"); // original resolution
      const base = u.pathname.split("/").pop().replace(/\.\w+$/, "");
      const prefix = info ? `${clean(info.user)}_${info.id}_` : "";
      return { url: u.toString(), filename: `Twitter/${prefix}${clean(base)}.${fmt}` };
    }

    // Videos play from blob: URLs, so look the real file up via the public tweet endpoint.
    if (!info) throw new Error("Could not identify this tweet");
    const data = await bgFetchJson(
      `https://cdn.syndication.twimg.com/tweet-result?id=${info.id}&lang=en&token=${tokenFor(info.id)}`
    );
    const url = findVideoUrl(data || {});
    if (!url) throw new Error("Video not available (protected, age-restricted or deleted tweet?)");
    return { url, filename: `Twitter/${clean(info.user)}_${info.id}.mp4` };
  }

  register({
    name: "X",
    // Only real tweet photos: skips avatars, banners, and video poster images.
    acceptImage: (img) => /pbs\.twimg\.com\/media\//.test(img.currentSrc || img.src || ""),
    topOffset: () => 10,
    resolve
  });
})();
