// ==UserScript==
// @name         YouTube Exact Upload Time
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Replaces the default upload date in the YouTube description box with the exact publication date and time (down to the minute).
// @author       AlfsQuelltext
// @match        *://*.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @updateURL    https://raw.githubusercontent.com/AlfsQuelltext/youtube-exact-upload-time-script/main/youtube-exact-upload-time.user.js
// @downloadURL  https://raw.githubusercontent.com/AlfsQuelltext/youtube-exact-upload-time-script/main/youtube-exact-upload-time.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
  
    let exactDateTimeStr = null;
    let currentVideoId = null;
    let isFetching = false;

    let observedNode = null;

    const regexDate = /(\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{2,4})|(\d{1,2}\.?\s*[a-zäöüß]+\s*\d{4})|([a-zäöüß]+\s*\d{1,2},?\s*\d{4})/i;

    async function fetchDateFromServer(vid) {
        if (!vid || isFetching) return;
        isFetching = true;
        exactDateTimeStr = null; // Altes Datum löschen, um falsche Anzeigen zu vermeiden

        try {
            const response = await fetch('/watch?v=' + vid);
            const html = await response.text();

            const match = html.match(/<meta itemprop="uploadDate" content="([^"]+)">/) ||
                          html.match(/"(?:uploadDate|publishDate)":"([^"]+)"/);

            if (match && match[1]) {
                const dateObj = new Date(match[1]);

                if (!isNaN(dateObj)) {
                    const userLang = document.documentElement.lang || navigator.language || 'de-DE';

                    exactDateTimeStr = dateObj.toLocaleString(userLang, {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    if (userLang.startsWith('de')) {
                        exactDateTimeStr += ' Uhr';
                    }

                    updateUI();
                }
            }
        } catch (err) {
            console.error("[YT-TIME] Fehler beim Herunterladen des Datums:", err);
        }

        isFetching = false;
    }

    function updateUI() {
        if (!exactDateTimeStr || !observedNode) return;

        const spans = observedNode.querySelectorAll('span.yt-formatted-string');

        for (let span of spans) {
            const text = span.textContent.trim();

            if (text === exactDateTimeStr) break;

            if (text.length > 0 && regexDate.test(text)) {
                span.textContent = exactDateTimeStr;
                span.style.fontWeight = "500";
                break;
            }
        }
    }

    const antiFlickerObserver = new MutationObserver(() => {
        updateUI();
    });

    setInterval(() => {
        if (!window.location.pathname.includes('/watch')) return;

        const infoContainer = document.querySelector('yt-formatted-string#info.ytd-watch-info-text');

        if (infoContainer && infoContainer !== observedNode) {
            if (observedNode) antiFlickerObserver.disconnect();

            antiFlickerObserver.observe(infoContainer, { childList: true, subtree: true, characterData: true });
            observedNode = infoContainer;

            updateUI();
        }
    }, 500);

    window.addEventListener('yt-navigate-finish', () => {
        const params = new URLSearchParams(window.location.search);
        const vid = params.get('v');

        if (vid && vid !== currentVideoId) {
            currentVideoId = vid;
            fetchDateFromServer(vid);
        }
    });

    if (window.location.pathname.includes('/watch')) {
        const params = new URLSearchParams(window.location.search);
        currentVideoId = params.get('v');
        if (currentVideoId) fetchDateFromServer(currentVideoId);
    }

})();
