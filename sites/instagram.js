(() => {
  const { clean, extFromUrl, bestImageUrl, register } = globalThis.__dl;

  const IG_APP_ID = "936619743392459"; // public web app id used by instagram.com
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const POST_RE = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;

  function shortcodeToId(code) {
    let id = 0n;
    for (const c of code.slice(0, 11)) id = id * 64n + BigInt(ALPHABET.indexOf(c));
    return id.toString();
  }

  function getShortcode(el) {
    let node = el.parentElement;
    for (let i = 0; i < 25 && node; i++, node = node.parentElement) {
      const a = node.querySelector('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
      if (a) {
        const m = a.getAttribute("href").match(POST_RE);
        if (m && m[1] !== "audio") return m[1];
      }
    }
    const m = location.pathname.match(POST_RE);
    return m && m[1] !== "audio" ? m[1] : null;
  }

  function getStoryId() {
    const m = location.pathname.match(/^\/stories\/(?!highlights)[^/]+\/(\d+)/);
    return m ? m[1] : null;
  }

  async function fetchMediaInfo(mediaId) {
    const res = await fetch(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, {
      credentials: "include",
      headers: {
        "x-ig-app-id": IG_APP_ID,
        "x-requested-with": "XMLHttpRequest",
        accept: "*/*"
      }
    });
    if (!res.ok) throw new Error(`Instagram API returned ${res.status}`);
    const json = await res.json();
    const item = json.items && json.items[0];
    if (!item) throw new Error("Media info not found");
    return item;
  }

  function pickVideoNode(item, videoEl) {
    if (item.carousel_media && item.carousel_media.length) {
      const vids = item.carousel_media.filter((m) => m.video_versions && m.video_versions.length);
      if (!vids.length) throw new Error("No video found in this post");
      if (vids.length === 1 || !isFinite(videoEl.duration)) return vids[0];
      return vids.reduce((best, m) =>
        Math.abs((m.video_duration || 0) - videoEl.duration) <
        Math.abs((best.video_duration || 0) - videoEl.duration)
          ? m
          : best
      );
    }
    if (!item.video_versions || !item.video_versions.length) throw new Error("No video found");
    return item;
  }

  async function resolve(el) {
    const code = getShortcode(el);

    if (el.tagName === "IMG") {
      const url = bestImageUrl(el);
      if (!url || url.startsWith("blob:") || url.startsWith("data:")) throw new Error("Image URL not available");
      const ext = extFromUrl(url, "jpg");
      const name = code ? `instagram_${clean(code)}_${Date.now() % 100000}` : `instagram_photo_${Date.now()}`;
      return { url, filename: `Instagram/${name}.${ext}` };
    }

    const mediaId = getStoryId() || (code ? shortcodeToId(code) : null);
    if (!mediaId) throw new Error("Could not identify this video");
    const item = await fetchMediaInfo(mediaId);
    const node = pickVideoNode(item, el);
    const url = node.video_versions[0].url; // first entry = highest quality
    const user = item.user && item.user.username ? clean(item.user.username) : "instagram";
    return { url, filename: `Instagram/${user}_${clean(code || mediaId)}.mp4` };
  }

  register({
    name: "Instagram",
    acceptImage: () => true,
    topOffset: () => (location.pathname.startsWith("/stories/") ? 64 : 10),
    resolve
  });
})();
