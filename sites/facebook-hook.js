// Page-side: collects video links and full-size photo links from Facebook's own data
// (both its API responses and the data embedded in the page).
(() => {
  const B = window.__sdBase;
  if (!B) return;

  const allV = [];
  const allP = [];
  const seenV = new Set();
  const seenP = new Set();
  let outV = [];
  let outP = [];

  const GEN_RE = /^https:\/\/[^\s"]*fbcdn\.net\/[^\s"]*\.mp4(\?|$)/;
  const durOf = (n) => {
    if (typeof n.playable_duration_in_ms === "number") return n.playable_duration_in_ms / 1000;
    if (typeof n.duration_in_ms === "number") return n.duration_in_ms / 1000;
    if (typeof n.length_in_second === "number") return n.length_in_second;
    return null;
  };
  const baseName = (u) => u.split("?")[0].split("/").pop();

  function pushVideo(e, key) {
    if (seenV.has(key)) return;
    seenV.add(key);
    outV.push(e);
    allV.push(e);
  }

  function walk(node, ctx, depth) {
    if (depth > 80 || !node) return;
    if (Array.isArray(node)) { for (const v of node) walk(v, ctx, depth + 1); return; }
    if (typeof node !== "object") return;

    // Remember the nearest enclosing video id / duration for URL fields below it.
    let id = ctx.id;
    let dur = ctx.dur;
    const tn = node.__typename;
    if (typeof node.id === "string" && /^\d{6,}$/.test(node.id) && (!tn || /Video/.test(tn))) id = node.id;
    const nd = durOf(node);
    if (nd) dur = nd;
    const c = id === ctx.id && dur === ctx.dur ? ctx : { id, dur };

    let hd = null;
    let sd = null;
    if (typeof node.browser_native_hd_url === "string") hd = node.browser_native_hd_url;
    if (typeof node.browser_native_sd_url === "string") sd = node.browser_native_sd_url;
    if (!hd && typeof node.playable_url_quality_hd === "string") hd = node.playable_url_quality_hd;
    if (!sd && typeof node.playable_url === "string") sd = node.playable_url;
    if (typeof node.progressive_url === "string") {
      const q = String((node.metadata && node.metadata.quality) || "").toUpperCase();
      if (q === "HD") hd = hd || node.progressive_url;
      else sd = sd || node.progressive_url;
    }
    if (hd || sd) pushVideo({ id: c.id || null, dur: c.dur || null, hd, sd }, `${c.id}|${hd}|${sd}`);

    if (typeof node.uri === "string" && typeof node.width === "number" && node.uri.indexOf("fbcdn.net") > -1) {
      const b = baseName(node.uri);
      const key = `${b}|${node.width}`;
      if (b && !seenP.has(key)) {
        seenP.add(key);
        const e = { base: b, url: node.uri, width: node.width };
        outP.push(e);
        allP.push(e);
      }
    }

    for (const k in node) {
      const v = node[k];
      if (v && typeof v === "object") {
        walk(v, c, depth + 1);
      } else if (typeof v === "string" && v.length > 40 && GEN_RE.test(v) && v.indexOf("bytestart=") === -1 &&
                 /(url|src|uri)$/i.test(k) && !/base|dash|audio|thumb|image|preview|prefetch|manifest/i.test(k)) {
        // Safety net if Facebook renames fields: any plain MP4 link under a video.
        const isHd = /hd/i.test(k);
        pushVideo(
          { id: c.id || null, dur: c.dur || null, hd: isHd ? v : null, sd: isHd ? null : v, generic: true },
          `g|${c.id}|${v}`
        );
      }
    }
  }

  function flush() {
    if (outV.length) { B.emit("fb-videos", outV); outV = []; }
    if (outP.length) { B.emit("fb-photos", outP); outP = []; }
  }

  // API responses can be several JSON objects, one per line.
  function processText(text) {
    if (!text || text.indexOf("fbcdn.net") === -1) return;
    text = text.replace(/^for \(;;\);/, "");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t[0] !== "{") continue;
      try { walk(JSON.parse(t), {}, 0); } catch (_) {}
    }
    flush();
  }

  B.onResponse((u) => /\/api\/graphql/.test(u), (_url, text) => processText(text));

  // Data embedded in the page HTML (the first posts of a page load).
  const seenScripts = new WeakSet();
  function scanScripts() {
    document.querySelectorAll('script[type="application/json"]').forEach((s) => {
      if (seenScripts.has(s)) return;
      const t = s.textContent;
      if (!t || t.length < 50) return;
      if (t.indexOf("fbcdn.net") === -1) { seenScripts.add(s); return; }
      try {
        walk(JSON.parse(t), {}, 0);
        seenScripts.add(s);
      } catch (_) {
        if (document.readyState !== "loading") seenScripts.add(s);
      }
    });
    flush();
  }

  let timer = 0;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(scanScripts, 800); };
  try { new MutationObserver(schedule).observe(document, { childList: true, subtree: true }); } catch (_) {}
  document.addEventListener("DOMContentLoaded", scanScripts);
  window.addEventListener("load", scanScripts);
  scanScripts();

  B.onRequest("rescan", () => { scanScripts(); B.emit("rescan-done", null); });
  B.onRequest("sync", () => {
    if (allV.length) B.emit("fb-videos", allV);
    if (allP.length) B.emit("fb-photos", allP);
  });
})();
