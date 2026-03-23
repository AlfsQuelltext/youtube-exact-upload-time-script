# YouTube Exact Upload Time

A Tampermonkey/Violentmonkey script that replaces the default upload date in the YouTube description box with the **exact publication date and time** (down to the minute).

## Installation

1. Install a userscript manager browser extension like [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. **[Click here to install the script](https://raw.githubusercontent.com/AlfsQuelltext/youtube-exact-upload-time-script/main/youtube-exact-upload-time.user.js)**.
3. Open any YouTube video and expand the description.

## How it works

To keep the UI clean, the script only triggers when the full date is supposed to be shown (usually when you click "...more" to expand the description). It reads the hidden `uploadDate` / `publishDate` meta tags from the video's source code, formats it to your local timezone, and injects it natively into the YouTube DOM.