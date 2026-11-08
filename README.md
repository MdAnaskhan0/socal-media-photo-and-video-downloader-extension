# Social Media Downloader (Instagram, Facebook, X/Twitter)

Hover over a photo or video and a download button appears in its top-right
corner. Click it and the file is saved to `Downloads/Instagram/`,
`Downloads/Facebook/` or `Downloads/Twitter/`.

Works in Chrome, Edge, Brave and Firefox 121+.

## Install (Chrome / Edge / Brave)
1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Open one of the sites (logged in) and hover over a photo or video.

## Install (Firefox)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `manifest.json` in this folder.
3. Open `about:addons` > Social Media Downloader > **Permissions** and allow
   access to instagram.com, facebook.com and x.com / twitter.com.
4. Reload the site tabs.
Temporary add-ons are removed when Firefox restarts. To keep it, sign it as an
unlisted add-on at addons.mozilla.org, or use Developer Edition / Nightly with
`xpinstall.signatures.required` set to false.

## Files
- `manifest.json`  – config (Manifest V3, Chrome + Firefox)
- `common.js`      – shared helpers
- `core.js`        – floating button, hover detection, download trigger
- `sites/instagram.js`, `sites/twitter.js`, `sites/facebook.js` – one adapter per site
- `background.js`  – saves files, fetches tweet data
- `styles.css`     – button and toast styling

## How each site works
- **Instagram:** photos from the image itself; videos via Instagram's media-info
  endpoint using your session (videos play from `blob:` URLs that can't be saved).
- **X / Twitter:** photos are requested at original size (`name=orig`); videos and
  GIFs via X's public tweet endpoint, picking the highest-bitrate MP4.
- **Facebook:** photos are saved at the size shown on screen; videos are found by
  reading the video page's embedded data for the HD (else SD) MP4 link.

## Limitations
- Only content your account can already see. Protected/private tweets, private
  Facebook videos, and age-restricted tweets may fail.
- Facebook is the most fragile: it changes its page format often and may need
  updates to the patterns in `sites/facebook.js`.
- Story highlights (Instagram) are not supported for video.
- Use only for content you own or have permission to save. Downloading others'
  content may violate each platform's Terms of Use and copyright law.
