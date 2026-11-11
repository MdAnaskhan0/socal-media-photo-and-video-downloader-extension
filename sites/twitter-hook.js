// Page-side: collects media info (incl. every video MP4 link) from X's API responses.
(() => {
  const B = window.__sdBase;
  if (!B) return;
  const store = new Map(); // tweet id -> media items
  const GEN_RE = /^https:\/\/video\.twimg\.com\/[^\s"]+\.mp4/;

  const countVariants = (items) => (items ? items.reduce((n, i) => n + i.variants.length, 0) : -1);

  function save(id, items) {
    // Keep the richest version seen (a later response may carry the video links).
    if (countVariants(items) > countVariants(store.get(id))) {
      store.set(id, items);
      B.emit("tweet-media", { id, items });
    }
  }

  function walk(node, depth, ctxId, found) {
    if (depth > 45 || !node) return;
    if (Array.isArray(node)) { for (const v of node) walk(v, depth + 1, ctxId, found); return; }
    if (typeof node !== "object") return;

    const legacy = node.legacy && typeof node.legacy === "object" ? node.legacy : node;
    let id = ctxId;
    const cand = node.rest_id || legacy.id_str;
    if (typeof cand === "string" && /^\d+$/.test(cand)) id = cand;

    const media = (legacy.extended_entities && legacy.extended_entities.media) ||
                  (legacy.entities && legacy.entities.media);
    if (id && Array.isArray(media)) {
      save(String(id), media.map((m) => ({
        type: m.type,
        dur: m.video_info && m.video_info.duration_millis ? m.video_info.duration_millis / 1000 : null,
        variants: ((m.video_info && m.video_info.variants) || [])
          .filter((v) => v.content_type === "video/mp4" && v.url)
          .map((v) => ({ url: v.url, bitrate: v.bitrate || 0 }))
      })));
    }

    for (const k in node) {
      const v = node[k];
      if (v && typeof v === "object") walk(v, depth + 1, id, found);
      else if (id && typeof v === "string" && GEN_RE.test(v)) {
        // Safety net if X renames fields: any twimg MP4 link under a tweet.
        const dims = v.match(/\/(\d+)x(\d+)\//);
        (found[id] = found[id] || new Map()).set(v, dims ? dims[1] * dims[2] : 0);
      }
    }
  }

  B.onResponse(
    (u) => /\/i\/api\/(graphql|2|1\.1)\//.test(u),
    (_url, text) => {
      try {
        const found = {};
        walk(JSON.parse(text), 0, null, found);
        for (const id in found) {
          const have = store.get(id);
          if (countVariants(have) > 0) continue;
          const variants = [...found[id]].map(([url, bitrate]) => ({ url, bitrate }));
          save(id, [{ type: "video", dur: null, variants }]);
        }
      } catch (_) {}
    }
  );

  B.onRequest("sync", () => {
    store.forEach((items, id) => B.emit("tweet-media", { id, items }));
  });
})();
