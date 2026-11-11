// Shared helpers used by every site adapter.
(() => {
  const dl = (globalThis.__dl = {});

  dl.clean = (s) => String(s).replace(/[^\w.-]+/g, "_");

  dl.extFromUrl = (url, fallback) => {
    try {
      const m = new URL(url).pathname.match(/\.([a-z0-9]{3,4})$/i);
      return m ? m[1].toLowerCase() : fallback;
    } catch {
      return fallback;
    }
  };

  dl.bestImageUrl = (img) => {
    if (img.srcset) {
      const best = img.srcset
        .split(",")
        .map((s) => s.trim().split(/\s+/))
        .map(([url, w]) => ({ url, w: parseInt(w) || 0 }))
        .sort((a, b) => b.w - a.w)[0];
      if (best && best.url) return best.url;
    }
    return img.currentSrc || img.src;
  };

  // A <video> that points straight at an MP4 (not a blob:) can be saved as-is.
  dl.directVideoUrl = (el) => {
    const s = el.currentSrc || el.src || "";
    return /^https:/.test(s) && /\.mp4/i.test(s) ? s : null;
  };

  dl.bgFetchJson = (url) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "FETCH_JSON", url }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res || !res.ok) return reject(new Error((res && res.error) || "Request failed"));
        resolve(res.data);
      });
    });

  // Data forwarded by the page-side hook (hook-base.js).
  dl.onHookData = (handler) => {
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (e.source !== window || !d || d.__sd !== true) return;
      handler(d.type, d.data);
    });
    window.postMessage({ __sdReq: true, type: "sync" }, "*");
  };
  dl.askHook = (type) => window.postMessage({ __sdReq: true, type }, "*");
  dl.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Last-resort capture: plays the video from the start and records what the
   * page is showing. Works for any playable video, whatever the site does.
   * Returns { stop(), done: Promise<{blob, ext}> }.
   */
  dl.recordVideo = (video, opts = {}) => {
    const capture = video.captureStream || video.mozCaptureStream;
    if (!capture || typeof MediaRecorder === "undefined") {
      throw new Error("Recording is not supported in this browser");
    }
    if (!isFinite(video.duration) || video.duration <= 0) {
      throw new Error("Cannot record a live or unknown-length video");
    }

    const state = { finished: false, recorder: null };
    let resolveDone, rejectDone;
    const done = new Promise((res, rej) => { resolveDone = res; rejectDone = rej; });
    const wasLoop = video.loop;
    let poll = 0;
    let stream = null;

    function cleanup() {
      clearInterval(poll);
      video.loop = wasLoop;
      video.removeEventListener("ended", finish);
      try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    }
    function finish() {
      if (state.finished) return;
      state.finished = true;
      const r = state.recorder;
      if (r && r.state !== "inactive") r.stop();
      else { cleanup(); rejectDone(new Error("Recording stopped before it started")); }
    }

    (async () => {
      try {
        video.loop = false;
        video.currentTime = 0;
        await video.play();
        if (state.finished) { cleanup(); return; }
        stream = capture.call(video);
        const types = [
          "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4",
          "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"
        ];
        const mime = types.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || "";
        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8000000 } : undefined);
        state.recorder = recorder;
        const chunks = [];
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onstop = () => {
          cleanup();
          try { video.pause(); } catch (_) {}
          const type = recorder.mimeType || mime || "video/webm";
          if (!chunks.length) return rejectDone(new Error("Nothing was recorded"));
          resolveDone({ blob: new Blob(chunks, { type }), ext: /mp4/.test(type) ? "mp4" : "webm" });
        };
        recorder.onerror = (e) => { cleanup(); rejectDone((e && e.error) || new Error("Recording failed")); };
        video.addEventListener("ended", finish);
        recorder.start(1000);
        let last = 0;
        poll = setInterval(() => {
          const t = video.currentTime;
          if (opts.onProgress) opts.onProgress(Math.min(1, t / video.duration));
          if (t + 0.5 < last || t >= video.duration - 0.1 || video.ended) finish();
          else if (video.paused) video.play().catch(() => {});
          last = t;
        }, 250);
      } catch (err) {
        cleanup();
        rejectDone(err);
      }
    })();

    return { stop: finish, done };
  };

  dl.register = (adapter) => {
    globalThis.__dlAdapter = adapter;
  };
})();
