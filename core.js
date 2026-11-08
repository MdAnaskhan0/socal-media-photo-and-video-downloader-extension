// Site-independent part: floating button, hover tracking, download trigger.
(() => {
  const A = globalThis.__dlAdapter;
  if (!A) return;

  const MIN_SIZE = 200; // ignore avatars / tiny thumbnails

  let btn, toastEl;
  let currentMedia = null;
  let hideTimer = 0;
  let rafId = 0;
  let lastX = 0, lastY = 0;
  let busy = false;

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

    document.documentElement.appendChild(btn);
    document.documentElement.appendChild(toastEl);
  }

  let toastTimer = 0;
  function toast(text, isError = false) {
    toastEl.textContent = text;
    toastEl.classList.toggle("error", isError);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
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

  async function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (!currentMedia || !currentMedia.isConnected) {
      toast("Move your mouse over the media and try again", true);
      return;
    }
    busy = true;
    btn.classList.add("busy");
    try {
      const job = await A.resolve(currentMedia);
      await send(job);
      toast("Download started");
    } catch (err) {
      console.error("[Social Downloader]", err);
      toast("Failed: " + err.message, true);
    } finally {
      busy = false;
      btn.classList.remove("busy");
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
