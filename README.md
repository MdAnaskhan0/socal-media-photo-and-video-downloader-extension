# Social Media Downloader (Instagram, Facebook, X/Twitter)

Hover over a photo or video and a download button appears in its top-right
corner. Click it and the file is saved to `Downloads/Instagram/`,
`Downloads/Facebook/` or `Downloads/Twitter/`.

Works in Chrome / Edge / Brave (111+) and Firefox 128+.

## Install (Chrome / Edge / Brave)
1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. **Reload any open Instagram / Facebook / X tabs (F5)**, log in, and hover over media.

## Install (Firefox)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `manifest.json`.
3. Open `about:addons` > Social Media Downloader > **Permissions** and allow
   access to instagram.com, facebook.com and x.com / twitter.com.
4. Reload the site tabs (F5).
Temporary add-ons are removed when Firefox restarts. To keep it, sign it as an
unlisted add-on at addons.mozilla.org, or use Developer Edition / Nightly with
`xpinstall.signatures.required` set to false.

## How it works
- **Instagram:** photos from the image; videos via Instagram's media-info
  endpoint using your session.
- **X / Twitter and Facebook:** a small script inside the page (`hook-base.js` +
  `sites/*-hook.js`) reads the data each site already loads for you (feed and
  API responses, plus data embedded in the page). That data contains the real
  MP4 links and full-size photo links, so anything you can see can be saved.
  If a link fails, the extension automatically retries alternatives
  (other quality, original-size photo, etc.).

## Videos that have no direct link (automatic fallback)
If a site gives no downloadable file link (or the link fails), the extension
switches to **recording mode**: it plays the video from the start and records
it. The button turns red and a message shows progress. Don't pause the video.
Click the message (or the red button) to stop early and save what has been
recorded. The result is saved as `.mp4` (Chrome 126+) or `.webm`, at the
quality being played. It takes as long as the video lasts. Live streams cannot
be recorded this way.

## If something doesn't download
- Reload the tab (F5) so the page-side script is active from the start, scroll
  or play the video for a second, then click again.
- Open DevTools (F12) > Console and look for `[Social Downloader]` messages.
- Facebook videos that only exist as separate video/audio streams (no single
  MP4) cannot be saved by any simple extension.
- Instagram story highlights: videos not supported.

## Files
- `manifest.json`, `background.js` (saves files with fallbacks), `core.js`
  (button/hover), `common.js`, `styles.css`
- `hook-base.js` – page-side network watcher
- `sites/instagram.js`, `sites/twitter.js`, `sites/twitter-hook.js`,
  `sites/facebook.js`, `sites/facebook-hook.js`

## Notes
Only content your account can see. Use only for content you own or have
permission to save; downloading others' content may violate each platform's
Terms of Use and copyright law.
