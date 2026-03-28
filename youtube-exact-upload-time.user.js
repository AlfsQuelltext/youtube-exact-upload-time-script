// ==UserScript==
// @name         YouTube Exact Upload Time
// @namespace    http://tampermonkey.net/
// @version      1.3
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

    const WATCH_SELECTOR = 'ytd-watch-flexy';
    const INFO_SELECTOR = 'yt-formatted-string#info.ytd-watch-info-text';
    const EXPANDER_SELECTOR = 'ytd-text-inline-expander';
    const MAX_CACHE_SIZE = 100;
    const DATE_PATTERNS = [
        /"(?:uploadDate|publishDate)":"([^"]+T[^"]+)"/,
        /<meta itemprop="uploadDate" content="([^"]+T[^"]+)">/
    ];

    let exactDateTimeIso = null;
    let currentVideoId = null;
    let abortController = null;
    let observedWatchNode = null;
    let observedInfoNode = null;
    let observedExpanderNode = null;
    let watchDomChangeFrameId = 0;
    const dateCache = new Map();

    let cachedFormatter = null;
    let cachedLang = null;

    function formatDate(dateObj) {
        const lang = document.documentElement.lang || navigator.language || 'de-DE';
        if (lang !== cachedLang) {
            cachedLang = lang;
            cachedFormatter = new Intl.DateTimeFormat(lang, {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        }
        const str = cachedFormatter.format(dateObj);
        return lang.startsWith('de') ? str + ' Uhr' : str;
    }

    function disconnectNodeObservers() {
        infoObserver.disconnect();
        expanderObserver.disconnect();
        observedInfoNode = null;
        observedExpanderNode = null;
    }

    function resetState() {
        disconnectNodeObservers();
        if (watchDomChangeFrameId) {
            cancelAnimationFrame(watchDomChangeFrameId);
            watchDomChangeFrameId = 0;
        }
        if (abortController) {
            abortController.abort();
            abortController = null;
        }
        exactDateTimeIso = null;
        currentVideoId = null;
    }

    function extractDateString(html) {
        for (const pattern of DATE_PATTERNS) {
            const match = html.match(pattern);
            if (match?.[1]) return match[1];
        }
        return null;
    }

    function tryExtractDateFromDOM(vid) {
        try {
            const playerResponse = window.ytInitialPlayerResponse;
            const playerVideoId = playerResponse?.videoDetails?.videoId;
            if (playerVideoId !== vid) return null;

            const renderer = playerResponse.microformat?.playerMicroformatRenderer;
            const date = renderer?.uploadDate || renderer?.publishDate;
            if (date?.includes('T')) return date;
        } catch (_) {}

        return null;
    }

    function tryApplyDateFromDOM(vid) {
        const domDate = tryExtractDateFromDOM(vid);
        if (!domDate) return false;

        const normalizedDate = processAndCacheDate(vid, domDate);
        if (!normalizedDate || vid !== currentVideoId) return false;

        exactDateTimeIso = normalizedDate;
        updateUI();
        return true;
    }

    function processAndCacheDate(vid, dateString) {
        if (!dateString) return null;
        const dateObj = new Date(dateString);
        if (Number.isNaN(dateObj.getTime())) return null;
        if (dateCache.size >= MAX_CACHE_SIZE) {
            dateCache.delete(dateCache.keys().next().value);
        }
        dateCache.set(vid, dateString);
        return dateString;
    }

    function hasFilledViewCountRollingNumber() {
        const root = observedWatchNode || document;
        const rollingNumber = root.querySelector('#view-count yt-animated-rolling-number');
        return !!rollingNumber?.querySelector('animated-rolling-character');
    }

    function findDateSpan() {
        const spans = Array.from(observedInfoNode.children).filter((child) => {
            return child.tagName === 'SPAN' && child.textContent.trim().length > 0;
        });

        if (spans.length === 0) return null;

        return hasFilledViewCountRollingNumber() ? spans[0] : (spans[1] || spans[0]);
    }

    function getDateSpan() {
        if (!observedInfoNode) return null;
        return findDateSpan();
    }

    function isDescriptionExpanded() {
        const expander = observedExpanderNode || document.querySelector(EXPANDER_SELECTOR);
        return !expander || expander.hasAttribute('is-expanded');
    }

    function observeInfoNode(infoNode) {
        if (infoNode === observedInfoNode) return;

        infoObserver.disconnect();
        observedInfoNode = infoNode;

        if (observedInfoNode) {
            infoObserver.observe(observedInfoNode, { childList: true, subtree: true, characterData: true });
        }
    }

    function observeExpanderNode(expanderNode) {
        if (expanderNode === observedExpanderNode) return;

        expanderObserver.disconnect();
        observedExpanderNode = expanderNode;

        if (observedExpanderNode) {
            expanderObserver.observe(observedExpanderNode, { attributes: true, attributeFilter: ['is-expanded'] });
        }
    }

    function refreshObservedNodes() {
        const root = observedWatchNode || document;
        observeInfoNode(root.querySelector(INFO_SELECTOR));
        observeExpanderNode(root.querySelector(EXPANDER_SELECTOR));
    }

    function handleWatchDomChange() {
        watchDomChangeFrameId = 0;
        refreshObservedNodes();
        if (!exactDateTimeIso && currentVideoId) {
            tryApplyDateFromDOM(currentVideoId);
        }
        updateUI();
    }

    function scheduleWatchDomChange() {
        if (watchDomChangeFrameId) return;
        watchDomChangeFrameId = requestAnimationFrame(handleWatchDomChange);
    }

    function startRootObserver() {
        if (document.body) {
            rootObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    function stopRootObserver() {
        rootObserver.disconnect();
    }

    function refreshWatchObserver() {
        const watchNode = document.querySelector(WATCH_SELECTOR);
        if (watchNode) {
            stopRootObserver();
        } else {
            startRootObserver();
        }
        if (watchNode === observedWatchNode) return;

        watchObserver.disconnect();
        observedWatchNode = watchNode;
        disconnectNodeObservers();

        if (observedWatchNode) {
            watchObserver.observe(observedWatchNode, { childList: true, subtree: true });
        }

        scheduleWatchDomChange();
    }

    async function fetchDateForVideo(vid) {
        if (!vid || vid !== currentVideoId) return;

        const cached = dateCache.get(vid);
        if (cached) {
            exactDateTimeIso = cached;
            updateUI();
            return;
        }

        if (tryApplyDateFromDOM(vid)) {
            return;
        }

        if (abortController) abortController.abort();
        const controller = new AbortController();
        abortController = controller;

        try {
            const response = await fetch('/watch?v=' + encodeURIComponent(vid), { signal: controller.signal });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const html = await response.text();
            if (vid === currentVideoId) {
                const normalizedDate = processAndCacheDate(vid, extractDateString(html));
                if (normalizedDate) {
                    exactDateTimeIso = normalizedDate;
                    updateUI();
                }
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('[YT-TIME] Error fetching date:', err);
            }
        } finally {
            if (abortController === controller) abortController = null;
        }
    }

    function updateUI() {
        if (!observedInfoNode) return;
        const dateSpan = getDateSpan();
        if (!dateSpan) return;
        const exactDateTimeStr = exactDateTimeIso ? formatDate(new Date(exactDateTimeIso)) : null;

        if (isDescriptionExpanded() && exactDateTimeStr) {
            if (dateSpan.textContent.trim() !== exactDateTimeStr) {
                dateSpan.textContent = exactDateTimeStr;
                dateSpan.style.fontWeight = '500';
                dateSpan.dataset.ytTimeApplied = '1';
            }
        } else if (dateSpan.dataset.ytTimeApplied) {
            dateSpan.style.fontWeight = '';
            delete dateSpan.dataset.ytTimeApplied;
        }
    }

    const infoObserver = new MutationObserver(updateUI);
    const expanderObserver = new MutationObserver(updateUI);
    const watchObserver = new MutationObserver(scheduleWatchDomChange);
    const rootObserver = new MutationObserver(refreshWatchObserver);

    function startObservers() {
        startRootObserver();
        refreshWatchObserver();
    }

    function onNavigate() {
        const vid = new URLSearchParams(window.location.search).get('v');
        if (!vid) {
            resetState();
            return;
        }
        if (vid !== currentVideoId) {
            currentVideoId = vid;
            disconnectNodeObservers();
            exactDateTimeIso = null;
            startRootObserver();
            refreshWatchObserver();
            fetchDateForVideo(vid);
        }
    }

    window.addEventListener('yt-navigate-finish', onNavigate);

    startObservers();

    if (window.location.pathname === '/watch') {
        currentVideoId = new URLSearchParams(window.location.search).get('v');
        if (currentVideoId) {
            fetchDateForVideo(currentVideoId);
        }
    }

})();
