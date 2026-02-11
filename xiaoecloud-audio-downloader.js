// ==UserScript==
// @name         小鹅通音频下载助手
// @namespace    http://tampermonkey.net/
// @version      1.0.5
// @description  小鹅通课程音频下载与链接复制（单页）
// @author       Your name
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
    const AUDIO_EXT_RE = /\.mp3/i;  // More permissive - just check for .mp3 anywhere
    let latestAudioUrl = '';
    // With GM_* grants, Tampermonkey runs in an isolated world; use unsafeWindow for page hooks.
    const pageWindow = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

    // Debug helper
    function debugLog(...args) {
        console.log('[xe-audio]', ...args);
    }

    function sanitizeFilename(name) {
        const cleaned = name
            .replace(/[\\/:*?"<>|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned || 'audio';
    }

    function getTitle() {
        const titleEl = document.querySelector('span.title.new_title');
        if (!titleEl) {
            return 'audio';
        }
        return sanitizeFilename(titleEl.textContent || '');
    }

    function getDescription() {
        const descEl = document.querySelector('div.xe-preview__content');
        if (!descEl) {
            return '';
        }
        const text = (descEl.innerText || '').trim();
        return text;
    }

    function downloadTextFile(filename, content) {
        if (!content) {
            return;
        }
        const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
        console.log('[xe-audio] saving desc', { filename, bytes: content.length });
        GM_download({
            url: dataUrl,
            name: filename,
            saveAs: false,
            onload: () => {
                console.log('[xe-audio] desc saved', filename);
            },
            onerror: (err) => {
                console.warn('[xe-audio] desc save failed', err);
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename.split('/').pop();
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setStatus('浏览器保存已触发（可能无法保留子目录）');
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        });
    }

    function setStatus(message, isError = false) {
        const status = document.querySelector('.xe-audio-status');
        if (!status) {
            return;
        }
        status.textContent = message;
        status.style.color = isError ? '#c62828' : '#2e7d32';
        console.log('[xe-audio]', message);
    }

    function setAudioUrl(url) {
        if (!url) return;
        if (!AUDIO_EXT_RE.test(url)) {
            return;
        }
        debugLog('Found audio URL:', url);
        if (latestAudioUrl === url) {
            return;
        }
        latestAudioUrl = url;
        setStatus('已捕获音频链接');
    }

    function scanForAudioElements(root = document) {
        const audios = root.querySelectorAll('audio, source');
        debugLog('Scanning for audio elements, found:', audios.length);
        audios.forEach((node) => {
            const src = node.getAttribute('src') || node.src;
            debugLog('Audio element src:', src);
            if (src) {
                setAudioUrl(src);
            }
        });
        const srcNodes = root.querySelectorAll('[src]');
        srcNodes.forEach((node) => {
            const src = node.getAttribute('src');
            if (src) {
                setAudioUrl(src);
            }
        });
    }

    function scanPerformanceEntries() {
        const entries = performance.getEntriesByType('resource');
        entries.forEach((entry) => {
            if (entry && entry.name) {
                setAudioUrl(entry.name);
            }
        });
    }

    function hookNetwork() {
        const originalFetch = pageWindow.fetch;
        if (typeof originalFetch === 'function') {
            pageWindow.fetch = async (...args) => {
                const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
                if (requestUrl) {
                    setAudioUrl(requestUrl);
                }
                return originalFetch.apply(pageWindow, args);
            };
        }

        const originalOpen = pageWindow.XMLHttpRequest?.prototype?.open;
        if (typeof originalOpen === 'function') {
            pageWindow.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                if (url) {
                    setAudioUrl(url);
                }
                return originalOpen.call(this, method, url, ...rest);
            };
        }

        const originalSend = pageWindow.XMLHttpRequest?.prototype?.send;
        if (typeof originalSend === 'function') {
            pageWindow.XMLHttpRequest.prototype.send = function(...args) {
                this.addEventListener('load', () => {
                    if (this.responseURL) {
                        setAudioUrl(this.responseURL);
                    }
                });
                return originalSend.apply(this, args);
            };
        }
    }

    function hookMediaPlayback() {
        // Some pages create <audio> early and only assign src later; observing playback is reliable.
        document.addEventListener('play', (ev) => {
            const el = ev.target;
            if (el && typeof el === 'object' && ('currentSrc' in el || 'src' in el)) {
                setAudioUrl(el.currentSrc || el.src);
            }
        }, true);
    }

    function createPanel() {
        const panel = document.createElement('div');
        panel.className = 'xe-audio-panel';
        panel.innerHTML = `
            <div class="xe-audio-title">小鹅通音频</div>
            <div class="xe-audio-actions">
                <button class="xe-audio-download">下载 MP3</button>
                <button class="xe-audio-desc">下载描述</button>
                <button class="xe-audio-copy">复制链接</button>
            </div>
            <div class="xe-audio-status">等待捕获音频链接…</div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            .xe-audio-panel {
                position: fixed;
                right: 20px;
                bottom: 20px;
                width: 220px;
                background: #ffffff;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.12);
                padding: 12px;
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            .xe-audio-title {
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 8px;
                color: #222;
            }
            .xe-audio-actions {
                display: flex;
                gap: 8px;
                margin-bottom: 8px;
            }
            .xe-audio-actions button {
                flex: 1;
                border: none;
                border-radius: 4px;
                padding: 6px 8px;
                font-size: 12px;
                cursor: pointer;
                color: #fff;
            }
            .xe-audio-download {
                background: #1976d2;
            }
            .xe-audio-desc {
                background: #6f42c1;
            }
            .xe-audio-copy {
                background: #43a047;
            }
            .xe-audio-status {
                font-size: 11px;
                color: #666;
                word-break: break-all;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(panel);

        panel.querySelector('.xe-audio-download').addEventListener('click', () => {
            if (!latestAudioUrl) {
                setStatus('未捕获到 MP3 链接', true);
                return;
            }
            const title = getTitle();
            const filename = `${TARGET_DIR}${title}.mp3`;
            setStatus(`正在下载：${title}.mp3`);
            console.log('[xe-audio] saving mp3', { filename, url: latestAudioUrl });
            GM_download({
                url: latestAudioUrl,
                name: filename,
                saveAs: false,
                onload: () => setStatus('下载完成'),
                onerror: (err) => {
                    console.warn('[xe-audio] mp3 save failed', err);
                    setStatus('下载失败，请重试', true);
                }
            });
        });

        panel.querySelector('.xe-audio-desc').addEventListener('click', () => {
            const title = getTitle();
            const descFilename = `${TARGET_DIR}${title}.desc`;
            const descContent = getDescription();
            if (!descContent) {
                setStatus('未找到描述内容', true);
                return;
            }
            console.log('[xe-audio] desc content preview', descContent.slice(0, 100));
            downloadTextFile(descFilename, descContent);
            setStatus('描述已保存');
        });

        panel.querySelector('.xe-audio-copy').addEventListener('click', () => {
            if (!latestAudioUrl) {
                setStatus('未捕获到 MP3 链接', true);
                return;
            }
            GM_setClipboard(latestAudioUrl);
            setStatus('已复制链接');
        });
    }

    function observeDom() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes') {
                    const node = mutation.target;
                    if (node instanceof Element) {
                        const src = node.getAttribute('src') || node.src;
                        if (src) {
                            setAudioUrl(src);
                        }
                    }
                    return;
                }
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) {
                        return;
                    }
                    scanForAudioElements(node);
                });
            });
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src']
        });
    }

    function init() {
        createPanel();
        hookNetwork();
        hookMediaPlayback();
        scanForAudioElements();
        scanPerformanceEntries();
        observeDom();
        // Keep it robust: src may be updated without node insertion.
        setInterval(scanForAudioElements, 1500);
        setInterval(scanPerformanceEntries, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
