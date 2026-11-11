// Runs inside the PAGE (world: MAIN). Watches the site's own network responses
// so the extension can read the real photo/video links the site already loaded.
(() => {
  if (window.__sdBase) return;
  const handlers = [];
  const requests = {};

  const base = {
    onResponse(match, fn) { handlers.push({ match, fn }); },
    onRequest(type, fn) { (requests[type] = requests[type] || []).push(fn); },
    emit(type, data) { window.postMessage({ __sd: true, type, data }, "*"); }
  };
  Object.defineProperty(window, "__sdBase", { value: base });

  // Requests coming from the extension's content script.
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.__sdReq !== true) return;
    (requests[d.type] || []).forEach((fn) => { try { fn(d.data); } catch (_) {} });
  });

  const dispatch = (url, text) => {
    for (const h of handlers) {
      try { if (h.match(url)) h.fn(url, text); } catch (_) {}
    }
  };
  const wanted = (url) => handlers.some((h) => { try { return h.match(url); } catch (_) { return false; } });

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      p.then((res) => {
        try {
          const url = res.url || "";
          if (wanted(url)) res.clone().text().then((t) => dispatch(url, t)).catch(() => {});
        } catch (_) {}
      }).catch(() => {});
      return p;
    };
  }

  const urls = new WeakMap();
  const xo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, ...rest) {
    try { urls.set(this, String(u)); } catch (_) {}
    return xo.call(this, m, u, ...rest);
  };
  const xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...a) {
    this.addEventListener("load", () => {
      try {
        const url = urls.get(this) || "";
        if (!wanted(url)) return;
        const rt = this.responseType;
        if (rt === "" || rt === "text") dispatch(url, this.responseText);
        else if (rt === "json" && this.response) dispatch(url, JSON.stringify(this.response));
      } catch (_) {}
    });
    return xs.apply(this, a);
  };
})();
