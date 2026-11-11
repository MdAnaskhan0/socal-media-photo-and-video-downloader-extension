// Background script: saves files (trying fallback links) and fetches tweet data.
const ALLOWED_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net|fbsbx\.com|twimg\.com)$/i;

function allowed(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

function extFor(url, fallback) {
  try {
    const u = new URL(url);
    const f = u.searchParams.get("format");
    if (f) return f === "jpeg" ? "jpg" : f;
    const m = u.pathname.match(/\.([a-z0-9]{3,4})$/i);
    return m ? m[1].toLowerCase() : fallback;
  } catch {
    return fallback;
  }
}

// Start one download and report quickly whether the server accepted it.
function attempt(url, filenameTemplate, defaultExt) {
  const filename = filenameTemplate.replace("{ext}", extFor(url, defaultExt || "jpg"));
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, filename, conflictAction: "uniquify", saveAs: false },
      (id) => {
        if (chrome.runtime.lastError || id === undefined) {
          return reject(new Error((chrome.runtime.lastError && chrome.runtime.lastError.message) || "Download failed"));
        }
        let done = false;
        let timer = 0;
        const finish = (fn, arg) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          chrome.downloads.onChanged.removeListener(onChanged);
          fn(arg);
        };
        const fail = (reason) => {
          chrome.downloads.erase({ id }, () => {});
          finish(reject, new Error(reason || "interrupted"));
        };
        const onChanged = (d) => {
          if (d.id !== id || !d.state) return;
          if (d.state.current === "interrupted") fail(d.error && d.error.current);
          else if (d.state.current === "complete") finish(resolve, id);
        };
        chrome.downloads.onChanged.addListener(onChanged);
        // If it hasn't failed within 3s it is downloading fine (big videos keep going).
        timer = setTimeout(() => {
          chrome.downloads.search({ id }, (items) => {
            const it = items && items[0];
            if (it && it.state === "interrupted") fail(it.error);
            else finish(resolve, id);
          });
        }, 3000);
      }
    );
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === "DOWNLOAD") {
    const urls = (msg.urls || [msg.url]).filter(Boolean).filter(allowed);
    if (!urls.length) {
      sendResponse({ ok: false, error: "No downloadable link found" });
      return;
    }
    (async () => {
      let lastErr;
      for (const u of urls) {
        try {
          const id = await attempt(u, msg.filename, msg.ext);
          sendResponse({ ok: true, id });
          return;
        } catch (e) {
          lastErr = e; // try the next fallback link
        }
      }
      sendResponse({ ok: false, error: String((lastErr && lastErr.message) || lastErr) });
    })();
    return true;
  }

  if (msg.type === "FETCH_JSON") {
    if (!/^https:\/\/cdn\.syndication\.twimg\.com\//.test(msg.url)) {
      sendResponse({ ok: false, error: "URL not allowed" });
      return;
    }
    fetch(msg.url, { credentials: "omit" })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
});
