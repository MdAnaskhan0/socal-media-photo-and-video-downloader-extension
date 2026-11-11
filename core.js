// Site-independent part: floating button, hover tracking, download trigger.
(() => {
  const A = globalThis.__dlAdapter;
  if (!A) return;
  const dl = globalThis.__dl;

  const MIN_SIZE = 200; // ignore avatars / tiny thumbnails

  let btn, toastEl;
  let currentMedia = null;
  let hideTimer = 0;
  let rafId = 0;
  let lastX = 0, lastY = 0;
  let busy = false;
  let recording = null;

  /* ---------- UI ---------- */
  function createUI() {
    btn = document.createElement("button");
    btn.id = "igdl-btn";
    btn.type = "button";
    btn.title = "Download";
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>';
    btn.addEventListener("click", onClick, true);
    btn.addEventListener("mousedown", (e) => e.stopPropagation(), true);
    btn.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    btn.addEventListener("mouseleave", scheduleHide);

    toastEl = document.createElement("div");
    toastEl.id = "igdl-toast";
    toastEl.addEventListener("click", () => { if (recording) recording.stop(); });

    document.documentElement.appendChild(btn);
    document.documentElement.appendChild(toastEl);
  }

  let toastTimer = 0;
  function toast(text, isError = false, sticky = false, action = false) {
    toastEl.textContent = text;
    toastEl.classList.toggle("error", isError);
    toastEl.classList.toggle("action", action);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3500);
  }

  /* ---------- Hover tracking ---------- */
  function findMediaAt(x, y) {
    const stack = document.elementsFromPoint(x, y);
    let img = null;
    for (const el of stack) {
      if (el.tagName !== "VIDEO" && el.tagName !== "IMG") continue;
      const r = el.getBoundingClientRect();
      if (r.width < MIN_SIZE || r.height < MIN_SIZE) continue;
      if (el.tagName === "VIDEO") return el; // prefer video over poster images
      if (!img && (!A.acceptImage || A.acceptImage(el))) img = el;
    }
    // Videos with pointer-events:none are skipped by elementsFromPoint: check their boxes.
    for (const v of document.querySelectorAll("video")) {
      const r = v.getBoundingClientRect();
      if (r.width >= MIN_SIZE && r.height >= MIN_SIZE &&
          x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return v;
    }
    return img;
  }

  function place(el) {
    const r = el.getBoundingClientRect();
    const topOffset = A.topOffset ? A.topOffset() : 10;
    const top = Math.max(r.top, 0) + topOffset;
    const right = Math.min(r.right, window.innerWidth);
    btn.style.top = top + "px";
    btn.style.left = right - 40 - 10 + "px";
    btn.classList.add("show");
  }

  function update() {
    const media = findMediaAt(lastX, lastY);
    if (media) {
      currentMedia = media;
      clearTimeout(hideTimer);
      place(media);
    } else {
      scheduleHide();
    }
  }

  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      update();
    });
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => btn.classList.remove("show"), 400);
  }

  /* ---------- Download ---------- */
  function send(job) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "DOWNLOAD", ...job }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res || !res.ok) return reject(new Error((res && res.error) || "Download failed"));
        resolve(res);
      });
    });
  }

  function saveBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // Fallback: play the video and record it (works for any playable video).
  async function runRecording(el, job) {
    btn.classList.remove("busy");
    btn.classList.add("recording");
    const label = (p) => `Recording ${Math.round(p * 100)}% — don't pause. Click here to stop & save`;
    toast(label(0), false, true, true);
    recording = dl.recordVideo(el, { onProgress: (p) => toast(label(p), false, true, true) });
    try {
      const { blob, ext } = await recording.done;
      const base = (job.filename || "video.mp4").replace(/\.\w+$/, "").replace(/[\\/]/g, "_");
      saveBlob(blob, `${base}.${ext}`);
      toast("Recording saved");
    } finally {
      recording = null;
      btn.classList.remove("recording");
    }
  }

  async function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (recording) { recording.stop(); return; }
    if (busy) return;
    const el = currentMedia;
    if (!el || !el.isConnected) {
      toast("Move your mouse over the media and try again", true);
      return;
    }
    busy = true;
    btn.classList.add("busy");
    try {
      const job = await A.resolve(el);
      if (job.record) {
        console.warn("[Social Downloader] no direct link, recording instead");
        await runRecording(el, job);
        return;
      }
      try {
        await send(job);
        toast("Download started");
      } catch (err) {
        if (el.tagName === "VIDEO" && job.recordOnFail) {
          console.warn("[Social Downloader] download failed (" + err.message + "), recording instead");
          await runRecording(el, job);
        } else {
          throw err;
        }
      }
    } catch (err) {
      console.error("[Social Downloader]", err);
      toast("Failed: " + err.message, true);
    } finally {
      busy = false;
      btn.classList.remove("busy", "recording");
    }
  }

  /* ---------- Init ---------- */
  createUI();
  document.addEventListener(
    "mousemove",
    (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (e.target === btn || btn.contains(e.target)) return;
      schedule();
    },
    { passive: true }
  );
  window.addEventListener("scroll", schedule, true);
  document.addEventListener("mouseleave", scheduleHide);
})();
