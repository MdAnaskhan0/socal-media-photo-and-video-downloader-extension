// Background script: saves files and fetches data that content scripts can't (CORS).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === "DOWNLOAD") {
    chrome.downloads.download(
      {
        url: msg.url,
        filename: msg.filename, // relative to the Downloads folder
        conflictAction: "uniquify",
        saveAs: false
      },
      (id) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, id });
        }
      }
    );
    return true;
  }

  if (msg.type === "FETCH_JSON") {
    // Only allow the public tweet endpoint used by the X adapter.
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
