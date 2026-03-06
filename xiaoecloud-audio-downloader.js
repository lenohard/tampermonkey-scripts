// ==UserScript==
// @name         小鹅通音频下载助手
// @namespace    http://tampermonkey.net/
// @version      1.1.2
// @description  小鹅通课程音频下载与链接复制（单页）
// @author       Your name
// @match        https://*.xiaoeknow.com/p/course/audio*
// @match        https://*.xiaoecloud.com/p/course/audio*
// @grant        GM_download
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-start
// @connect      *
// @updateURL    https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/xiaoecloud-audio-downloader.js
// @downloadURL  https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/xiaoecloud-audio-downloader.js
// ==/UserScript==

(function() {
    'use strict';

    const TARGET_DIR = '小鹅通/八分半/';
    // Audio URLs: CDN links that may be .mp3 / .m4a / .aac, or opaque CDN URLs with no extension
    const AUDIO_URL_RE = /\.(mp3|m4a|aac|wav|ogg|flac)(\?|$)/i;
    // Keys in API JSON responses that may hold audio URLs
    const AUDIO_JSON_KEYS = ['audio_url', 'media_url', 'resource_url', 'url', 'play_url', 'src'];

    let latestAudioUrl = '';
    let latestDescContent = '';

    // With GM_* grants, Tampermonkey runs in an isolated world; use unsafeWindow for page hooks.
    const pageWindow = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

    function debugLog(...args) {
        console.log('[xe-audio]', ...args);
    }

    function sanitizeFilename(name) {
        return (name || '')
            .replace(/[\\/:*?"<>|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || 'audio';
    }

    function getTitle() {
        // Page title is the most reliable: set server-side in <title>
        const raw = document.title || '';
        // Strip trailing site name like " - 小鹅通" if present
        const clean = raw.replace(/\s*[-–|｜]\s*(小鹅通|xiaoe).*$/i, '').trim();
        return sanitizeFilename(clean) || 'audio';
    }

    // Recursively scan a parsed JSON object for audio URL values
    function extractAudioUrlFromJson(obj, depth = 0) {
        if (depth > 8 || !obj || typeof obj !== 'object') return null;
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const found = extractAudioUrlFromJson(item, depth + 1);
                if (found) return found;
            }
            return null;
        }
        for (const key of AUDIO_JSON_KEYS) {
            const val = obj[key];
            if (typeof val === 'string' && val.startsWith('http')) {
                if (AUDIO_URL_RE.test(val) || val.includes('cdn.xiaoeknow.com') || val.includes('cdn.xet.tech')) {
                    debugLog('Found audio URL via JSON key', key, val);
                    return val;
                }
            }
        }
        for (const val of Object.values(obj)) {
            if (val && typeof val === 'object') {
                const found = extractAudioUrlFromJson(val, depth + 1);
                if (found) return found;
            }
        }
        return null;
    }

    // Extract description text from API JSON response
    function extractDescFromJson(obj, depth = 0) {
        if (depth > 8 || !obj || typeof obj !== 'object') return null;
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const found = extractDescFromJson(item, depth + 1);
                if (found) return found;
            }
            return null;
        }
        // Common keys for description/content
        for (const key of ['description', 'content', 'intro', 'summary', 'detail']) {
            const val = obj[key];
            if (typeof val === 'string' && val.length > 10) {
                return val;
            }
        }
        for (const val of Object.values(obj)) {
            if (val && typeof val === 'object') {
                const found = extractDescFromJson(val, depth + 1);
                if (found) return found;
            }
        }
        return null;
    }

    function tryParseJsonResponse(text) {
        try {
            return JSON.parse(text);
        } catch (_) {
            return null;
        }
    }

    function setStatus(message, isError = false) {
        const status = document.querySelector('.xe-audio-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? '#c62828' : '#2e7d32';
        debugLog(message);
    }

    function setAudioUrl(url) {
        if (!url || typeof url !== 'string') return;
        if (!url.startsWith('http')) return;
        if (!(AUDIO_URL_RE.test(url) || url.includes('cdn.xiaoeknow.com') || url.includes('cdn.xet.tech'))) return;
        // Avoid non-audio CDN resources (images, JS, CSS)
        if (/\.(jpg|jpeg|png|gif|webp|svg|css|js|ico|woff|ttf)(\?|$)/i.test(url)) return;
        if (latestAudioUrl === url) return;
        debugLog('Captured audio URL:', url);
        latestAudioUrl = url;
        setStatus('已捕获音频链接 ✓');
    }

    function handleJsonPayload(jsonObj) {
        if (!jsonObj) return;
        const audioUrl = extractAudioUrlFromJson(jsonObj);
        if (audioUrl) setAudioUrl(audioUrl);
        const desc = extractDescFromJson(jsonObj);
        if (desc && !latestDescContent) {
            latestDescContent = desc;
            debugLog('Captured description, length:', desc.length);
        }
    }

    function hookNetwork() {
        // --- Hook fetch ---
        const originalFetch = pageWindow.fetch;
        if (typeof originalFetch === 'function') {
            pageWindow.fetch = async function(...args) {
                const response = await originalFetch.apply(pageWindow, args);
                // Clone so the page can still consume the response
                try {
                    const clone = response.clone();
                    clone.text().then(text => {
                        const json = tryParseJsonResponse(text);
                        handleJsonPayload(json);
                    }).catch(() => {});
                } catch (_) {}
                return response;
            };
            debugLog('fetch hooked');
        }

        // --- Hook XHR ---
        const OrigXHR = pageWindow.XMLHttpRequest;
        if (OrigXHR) {
            const origOpen = OrigXHR.prototype.open;
            const origSend = OrigXHR.prototype.send;

            OrigXHR.prototype.open = function(method, url, ...rest) {
                this._xe_url = url;
                return origOpen.call(this, method, url, ...rest);
            };

            OrigXHR.prototype.send = function(...args) {
                this.addEventListener('load', function() {
                    try {
                        const ct = this.getResponseHeader('content-type') || '';
                        if (ct.includes('json') || ct.includes('text')) {
                            const json = tryParseJsonResponse(this.responseText);
                            handleJsonPayload(json);
                        }
                    } catch (_) {}
                });
                return origSend.apply(this, args);
            };
            debugLog('XHR hooked');
        }
    }

    function hookMediaPlayback() {
        // Catch audio elements starting playback
        document.addEventListener('play', (ev) => {
            const el = ev.target;
            if (el && (el.tagName === 'AUDIO' || el.tagName === 'VIDEO')) {
                const src = el.currentSrc || el.src;
                if (src) {
                    debugLog('Media play event, src:', src);
                    // For audio elements, accept any http src
                    if (src.startsWith('http') && !/\.(jpg|jpeg|png|gif|webp|svg|css|js)(\?|$)/i.test(src)) {
                        latestAudioUrl = src;
                        setStatus('已捕获音频链接（播放事件）✓');
                    }
                }
            }
        }, true);
    }

    function scanAudioElements(root = document) {
        const nodes = root.querySelectorAll('audio, audio source');
        nodes.forEach(node => {
            const src = node.currentSrc || node.getAttribute('src') || node.src;
            if (src && src.startsWith('http')) {
                debugLog('Found audio element:', src);
                latestAudioUrl = src;
                setStatus('已捕获音频链接（DOM元素）✓');
            }
        });
    }

    function observeDom() {
        const observer = new MutationObserver(() => {
            scanAudioElements();
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    function downloadTextFile(filename, content) {
        if (!content) return;
        const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
        GM_download({
            url: dataUrl,
            name: filename,
            saveAs: false,
            onload: () => debugLog('desc saved', filename),
            onerror: (err) => {
                debugLog('desc GM_download failed, using blob fallback', err);
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename.split('/').pop();
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        });
    }

    function createPanel() {
        const style = document.createElement('style');
        style.textContent = `
            .xe-audio-panel {
                position: fixed;
                right: 20px;
                bottom: 20px;
                width: 230px;
                background: #ffffff;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.15);
                padding: 12px;
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                font-size: 13px;
            }
            .xe-audio-panel-title {
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 8px;
                color: #222;
            }
            .xe-audio-actions {
                display: flex;
                gap: 6px;
                margin-bottom: 8px;
                flex-wrap: wrap;
            }
            .xe-audio-actions button {
                flex: 1;
                min-width: 60px;
                border: none;
                border-radius: 4px;
                padding: 6px 4px;
                font-size: 12px;
                cursor: pointer;
                color: #fff;
                transition: opacity 0.15s;
            }
            .xe-audio-actions button:hover { opacity: 0.85; }
            .xe-btn-dl  { background: #1976d2; }
            .xe-btn-desc{ background: #6f42c1; }
            .xe-btn-copy{ background: #43a047; }
            .xe-audio-status {
                font-size: 11px;
                color: #666;
                word-break: break-all;
                min-height: 16px;
            }
        `;
        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.className = 'xe-audio-panel';
        panel.innerHTML = `
            <div class="xe-audio-panel-title">🎵 小鹅通音频</div>
            <div class="xe-audio-actions">
                <button class="xe-btn-dl">下载 MP3</button>
                <button class="xe-btn-desc">下载描述</button>
                <button class="xe-btn-copy">复制链接</button>
            </div>
            <div class="xe-audio-status">等待捕获音频链接…</div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('.xe-btn-dl').addEventListener('click', () => {
            if (!latestAudioUrl) {
                setStatus('未捕获到音频链接，请先播放音频', true);
                return;
            }
            const title = getTitle();
            // Detect extension from URL; default to mp3
            const extMatch = latestAudioUrl.match(/\.(mp3|m4a|aac|wav|ogg|flac)(\?|$)/i);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';
            const filename = `${TARGET_DIR}${title}.${ext}`;
            setStatus(`正在下载：${title}.${ext}`);
            debugLog('Downloading', { filename, url: latestAudioUrl });
            GM_download({
                url: latestAudioUrl,
                name: filename,
                saveAs: false,
                onload: () => setStatus('下载完成 ✓'),
                onerror: (err) => {
                    debugLog('mp3 download failed', err);
                    setStatus('下载失败，请重试', true);
                }
            });
        });

        panel.querySelector('.xe-btn-desc').addEventListener('click', () => {
            // Try DOM first, then cached API response
            const domDesc = (() => {
                const selectors = [
                    '.xe-preview__content',
                    '.course-detail__desc',
                    '.lesson-detail__content',
                    '[class*="detail"] [class*="content"]',
                    '[class*="desc"]',
                ];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        const text = (el.innerText || '').trim();
                        if (text.length > 5) return text;
                    }
                }
                return '';
            })();

            const content = domDesc || latestDescContent;
            if (!content) {
                setStatus('未找到描述内容，请等待页面加载完成', true);
                return;
            }
            const title = getTitle();
            const filename = `${TARGET_DIR}${title}.desc`;
            downloadTextFile(filename, content);
            setStatus('描述已保存 ✓');
        });

        panel.querySelector('.xe-btn-copy').addEventListener('click', () => {
            if (!latestAudioUrl) {
                setStatus('未捕获到音频链接，请先播放音频', true);
                return;
            }
            GM_setClipboard(latestAudioUrl);
            setStatus('已复制链接 ✓');
        });
    }

    function init() {
        hookNetwork();
        hookMediaPlayback();
        createPanel();
        scanAudioElements();
        observeDom();
        // Periodic DOM scan in case audio element appears late
        const scanTimer = setInterval(() => {
            scanAudioElements();
            if (latestAudioUrl) clearInterval(scanTimer);
        }, 1500);
        setTimeout(() => clearInterval(scanTimer), 30000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
