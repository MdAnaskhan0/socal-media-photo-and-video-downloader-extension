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

  // Largest candidate from an <img srcset>, else its current src.
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

  // Fetch JSON through the background script (bypasses page CORS rules).
  dl.bgFetchJson = (url) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "FETCH_JSON", url }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res || !res.ok) return reject(new Error((res && res.error) || "Request failed"));
        resolve(res.data);
      });
    });

  // An adapter describes one website:
  //   name, acceptImage(img), topOffset(), resolve(el) -> {url, filename}
  dl.register = (adapter) => {
    globalThis.__dlAdapter = adapter;
  };
})();
