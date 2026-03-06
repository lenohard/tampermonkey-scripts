// ==UserScript==
// @name         小鹅通音频下载助手
// @namespace    http://tampermonkey.net/
// @version      2.3.1
// @description  小鹅通课程音频下载：支持选集下载、批量下载、描述文件保存
// @author       lenohard
// @match        https://*.xiaoeknow.com/p/course/audio*
// @match        https://*.xiaoecloud.com/p/course/audio*
// @match        https://*.xiaoeknow.com/p/course/ecourse/*
// @match        https://*.xiaoecloud.com/p/course/ecourse/*
// @grant        GM_download
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *.xiaoeknow.com
// @connect      *.xiaoecloud.com
// @connect      *.myqcloud.com
// @connect      *.qcloud.com
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/xiaoecloud-audio-downloader.js
// @downloadURL  https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/xiaoecloud-audio-downloader.js
// ==/UserScript==

(function () {
    'use strict';

    const TARGET_DIR = '小鹅通/八分半/';

    // ─── Helpers ────────────────────────────────────────────────────────────────

    function log(...args) { console.log('[xe-audio]', ...args); }

    function sanitize(name) {
        return (name || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'audio';
    }

    function getPageTitle() {
        const raw = document.title || '';
        return sanitize(raw.replace(/\s*[-–|｜]\s*(小鹅通|xiaoe).*$/i, '').trim());
    }

    /** Parse URL params from current page */
    function getPageParams() {
        const u = new URL(location.href);
        const pathParts = u.pathname.split('/').filter(Boolean);
        // Last path segment is always the resource/course id
        const lastSeg = pathParts.pop() || '';
        // On course overview page: /p/course/ecourse/<course_id>
        // On chapter page:         /p/course/audio/<resource_id>?product_id=<course_id>
        const isCourseOverview = pathParts.includes('ecourse');
        const course_id_from_path = isCourseOverview ? lastSeg : '';
        const product_id = u.searchParams.get('product_id') || u.searchParams.get('pro_id') || course_id_from_path || '';
        const course_id = u.searchParams.get('course_id') || product_id;
        const resource_id = isCourseOverview ? '' : lastSeg;
        // app_id is the subdomain prefix: appXXX.h5.xiaoeknow.com
        const app_id = u.hostname.split('.')[0];
        return { resource_id, product_id, course_id, app_id };
    }

    /** GM_xmlhttpRequest wrapped as Promise */
    function gmPost(url, formData) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url,
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'origin': location.origin,
                    'referer': location.href,
                    'user-agent': navigator.userAgent,
                },
                data: formData,
                onload: (res) => {
                    try { resolve(JSON.parse(res.responseText)); }
                    catch (e) { reject(e); }
                },
                onerror: reject,
            });
        });
    }

    function encodeForm(obj) {
        return Object.entries(obj)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
    }

    // ─── API calls ──────────────────────────────────────────────────────────────

    const BASE = location.origin; // e.g. https://appXXX.h5.xiaoecloud.com

    /** Fetch chapter list for the course */
    async function fetchCatalog(params) {
        const { resource_id, course_id, app_id } = params;
        const form = encodeForm({
            'bizData[app_id]': app_id,
            'bizData[resource_id]': resource_id,
            'bizData[course_id]': course_id,
            'bizData[p_id]': '0',
            'bizData[order]': 'asc',
            'bizData[page]': '1',
            'bizData[page_size]': '200',
            'bizData[is_display_auth_sections]': '0',
        });
        const res = await gmPost(
            `${BASE}/xe.course.business.avoidlogin.e_course.resource_catalog_list.get/1.0.0`,
            form
        );
        if (res.code !== 0) throw new Error(`catalog API error: ${res.msg}`);
        return res.data.list || [];
    }

    /** Fetch chapter description (org_content HTML → plain text) */
    async function fetchDetail(resource_id, product_id) {
        const form = encodeForm({
            'bizData[resource_id]': resource_id,
            'bizData[product_id]': product_id,
        });
        const res = await gmPost(
            `${BASE}/xe.course.business.get.detail/2.0.0`,
            form
        );
        if (res.code !== 0) throw new Error(`detail API error ${res.code}: ${res.msg}`);
        const html = res.data.org_content || '';
        return htmlToText(html);
    }

    /** Strip HTML tags and decode entities to plain text */
    function htmlToText(html) {
        // <br> → newline, <p> closing → newline
        let text = html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '');
        // Decode HTML entities via DOM
        const ta = document.createElement('textarea');
        ta.innerHTML = text;
        text = ta.value;
        // Collapse 3+ newlines to 2
        return text.replace(/\n{3,}/g, '\n\n').trim();
    }

    /** Fetch audio URL for a single resource */
    async function fetchAudioInfo(resource_id, product_id) {
        const form = encodeForm({
            'bizData[resource_id]': resource_id,
            'bizData[product_id]': product_id,
            'bizData[content_app_id]': getPageParams().app_id,
        });
        const res = await gmPost(
            `${BASE}/xe.course.business.audio.info.get/2.0.0`,
            form
        );
        if (res.code !== 0) throw new Error(`audio.info API error ${res.code}: ${res.msg}`);
        return res.data.audio_info || {};
    }

    // ─── Download helpers ────────────────────────────────────────────────────────

    function downloadAudio(url, filename) {
        return new Promise((resolve, reject) => {
            GM_download({
                url,
                name: filename,
                saveAs: false,
                onload: resolve,
                onerror: reject,
            });
        });
    }

    function downloadText(content, filename) {
        // GM_download blocks data:/blob: URIs (not_whitelisted).
        // Anchor-click in Tampermonkey sandbox DOM also won't trigger real downloads.
        // Solution: use unsafeWindow.document (the real page DOM) for anchor click.
        return new Promise((resolve) => {
            try {
                const realDoc = unsafeWindow.document;
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const burl = URL.createObjectURL(blob);
                const a = realDoc.createElement('a');
                a.href = burl;
                a.download = filename;
                a.style.display = 'none';
                realDoc.body.appendChild(a);
                a.click();
                realDoc.body.removeChild(a);
                setTimeout(() => { URL.revokeObjectURL(burl); resolve(); }, 500);
            } catch (e) {
                log('downloadText error:', e);
                resolve();
            }
        });
    }

    // ─── UI ─────────────────────────────────────────────────────────────────────

    const CSS = `
    .xe-panel {
        position: fixed; right: 16px; bottom: 16px;
        width: 320px; max-height: 80vh;
        background: #fff; border: 1px solid #ddd; border-radius: 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,.18);
        display: flex; flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px; z-index: 2147483647;
        overflow: hidden;
    }
    .xe-header {
        padding: 10px 14px 8px;
        background: #1565c0; color: #fff;
        display: flex; align-items: center; justify-content: space-between;
        flex-shrink: 0;
    }
    .xe-header-title { font-weight: 700; font-size: 14px; }
    .xe-header-close { cursor: pointer; font-size: 16px; line-height: 1; opacity: .8; }
    .xe-header-close:hover { opacity: 1; }
    .xe-toolbar {
        padding: 8px 10px; display: flex; gap: 6px; flex-wrap: wrap;
        border-bottom: 1px solid #eee; flex-shrink: 0;
    }
    .xe-btn {
        border: none; border-radius: 5px; padding: 5px 10px;
        font-size: 12px; cursor: pointer; color: #fff; transition: opacity .15s;
    }
    .xe-btn:hover { opacity: .85; }
    .xe-btn:disabled { opacity: .4; cursor: default; }
    .xe-btn-blue   { background: #1976d2; }
    .xe-btn-green  { background: #388e3c; }
    .xe-btn-purple { background: #7b1fa2; }
    .xe-btn-gray   { background: #757575; }
    .xe-btn-orange { background: #e65100; }
    .xe-chapter-list {
        flex: 1; overflow-y: auto; padding: 6px 0;
    }
    .xe-chapter-item {
        display: flex; align-items: flex-start; gap: 8px;
        padding: 6px 12px; cursor: pointer;
        transition: background .1s;
    }
    .xe-chapter-item:hover { background: #f5f5f5; }
    .xe-chapter-item input[type=checkbox] { margin-top: 2px; flex-shrink: 0; cursor: pointer; }
    .xe-chapter-title {
        flex: 1; line-height: 1.4; word-break: break-all; color: #222;
        user-select: none;
    }
    .xe-chapter-title.done   { color: #388e3c; }
    .xe-chapter-title.failed { color: #c62828; }
    .xe-chapter-title.active { color: #1565c0; font-style: italic; }
    .xe-status {
        padding: 6px 12px; font-size: 11px; color: #555;
        border-top: 1px solid #eee; flex-shrink: 0;
        min-height: 28px; word-break: break-all;
    }
    .xe-options {
        padding: 6px 12px; font-size: 12px; border-top: 1px solid #eee;
        flex-shrink: 0; display: flex; gap: 12px; align-items: center;
    }
    .xe-options label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
    `;

    let panelEl, listEl, statusEl;
    let chapters = [];   // { resource_id, title, checked, audioUrl, state: ''|'loading'|'done'|'failed' }
    let isBusy = false;

    function setStatus(msg, color = '#555') {
        if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color; }
        log(msg);
    }

    function renderList() {
        if (!listEl) return;
        listEl.innerHTML = '';
        chapters.forEach((ch, i) => {
            const row = document.createElement('div');
            row.className = 'xe-chapter-item';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = ch.checked;
            cb.id = `xe-ch-${i}`;
            cb.addEventListener('change', () => { chapters[i].checked = cb.checked; });

            const lbl = document.createElement('label');
            lbl.htmlFor = `xe-ch-${i}`;
            lbl.className = 'xe-chapter-title' + (ch.state === 'done' ? ' done' : ch.state === 'failed' ? ' failed' : ch.state === 'loading' ? ' active' : '');
            const prefix = ch.state === 'done' ? '✓ ' : ch.state === 'failed' ? '✗ ' : ch.state === 'loading' ? '⟳ ' : '';
            lbl.textContent = prefix + ch.title;

            row.appendChild(cb);
            row.appendChild(lbl);
            listEl.appendChild(row);
        });
    }

    function updateChapterState(i, state) {
        chapters[i].state = state;
        const lbl = listEl && listEl.querySelectorAll('.xe-chapter-title')[i];
        if (!lbl) return;
        lbl.className = 'xe-chapter-title' + (state === 'done' ? ' done' : state === 'failed' ? ' failed' : state === 'loading' ? ' active' : '');
        const prefix = state === 'done' ? '✓ ' : state === 'failed' ? '✗ ' : state === 'loading' ? '⟳ ' : '';
        lbl.textContent = prefix + chapters[i].title;
    }

    async function loadChapters() {
        if (isBusy) return;
        isBusy = true;
        setStatus('正在获取章节列表…', '#1565c0');
        try {
            const params = getPageParams();
            if (!params.course_id) throw new Error('无法获取 course_id，请刷新页面');
            const list = await fetchCatalog(params);
            chapters = list.map(item => ({
                resource_id: item.resource_id || item.chapter_id,
                title: item.chapter_title || item.resource_title || item.resource_id,
                checked: true,
                audioUrl: '',
                state: '',
            }));
            renderList();
            setStatus(`已加载 ${chapters.length} 个章节，请勾选后点击下载`, '#388e3c');
        } catch (e) {
            setStatus('获取章节失败：' + e.message, '#c62828');
        } finally {
            isBusy = false;
        }
    }

    // mode: 'audio' | 'desc' | 'both'
    async function downloadSelected(mode = 'both') {
        if (isBusy) return;
        const selected = chapters.filter(c => c.checked);
        if (!selected.length) { setStatus('请先勾选章节', '#e65100'); return; }
        isBusy = true;

        const params = getPageParams();
        let doneCount = 0, failCount = 0;

        for (let i = 0; i < chapters.length; i++) {
            const ch = chapters[i];
            if (!ch.checked) continue;

            updateChapterState(i, 'loading');
            setStatus(`(${doneCount + failCount + 1}/${selected.length}) 处理：${ch.title}`, '#1565c0');

            try {
                const needAudio = mode === 'audio' || mode === 'both';
                const needDesc  = mode === 'desc'  || mode === 'both';

                // Fetch audio URL only when needed
                if (needAudio && !ch.audioUrl) {
                    const info = await fetchAudioInfo(ch.resource_id, params.product_id);
                    ch.audioUrl = info.audio_url || '';
                    if (!ch.audioUrl) throw new Error('API 未返回 audio_url');
                }

                // Save .desc — fetch real description from detail API
                if (needDesc) {
                    const descContent = await fetchDetail(ch.resource_id, params.product_id);
                    await downloadText(descContent, `${sanitize(ch.title)}.desc`);
                }

                // Download audio
                if (needAudio) {
                    const extMatch = ch.audioUrl.match(/\.(mp3|m4a|aac|wav|ogg|flac)(\?|$)/i);
                    const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';
                    const audioFile = `${TARGET_DIR}${sanitize(ch.title)}.${ext}`;
                    await downloadAudio(ch.audioUrl, audioFile);
                }

                updateChapterState(i, 'done');
                doneCount++;
            } catch (e) {
                log('Failed:', ch.title, e);
                updateChapterState(i, 'failed');
                failCount++;
            }

            // Small delay to avoid hammering the API
            await new Promise(r => setTimeout(r, 400));
        }

        setStatus(
            `完成：${doneCount} 成功，${failCount} 失败`,
            failCount > 0 ? '#e65100' : '#388e3c'
        );
        isBusy = false;
    }

    function createPanel() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        panelEl = document.createElement('div');
        panelEl.className = 'xe-panel';
        panelEl.innerHTML = `
            <div class="xe-header">
                <span class="xe-header-title">🎵 小鹅通音频下载</span>
                <span class="xe-header-close" title="关闭">✕</span>
            </div>
            <div class="xe-toolbar">
                <button class="xe-btn xe-btn-blue" id="xe-load">加载章节</button>
                <button class="xe-btn xe-btn-green" id="xe-dl-both">下载音频+描述</button>
                <button class="xe-btn xe-btn-green" id="xe-dl-audio">仅下载音频</button>
                <button class="xe-btn xe-btn-purple" id="xe-dl-desc">仅下载描述</button>
                <button class="xe-btn xe-btn-gray" id="xe-sel-all">全选</button>
                <button class="xe-btn xe-btn-gray" id="xe-sel-none">全不选</button>
                <button class="xe-btn xe-btn-orange" id="xe-copy">复制当前链接</button>
            </div>
            <div class="xe-chapter-list" id="xe-chapter-list">
                <div style="padding:16px;color:#999;text-align:center">点击「加载章节」获取列表</div>
            </div>
            <div class="xe-status" id="xe-status">等待操作…</div>
        `;
        document.body.appendChild(panelEl);

        listEl = panelEl.querySelector('#xe-chapter-list');
        statusEl = panelEl.querySelector('#xe-status');

        panelEl.querySelector('.xe-header-close').addEventListener('click', () => {
            panelEl.style.display = 'none';
        });
        panelEl.querySelector('#xe-load').addEventListener('click', loadChapters);
        panelEl.querySelector('#xe-dl-both').addEventListener('click', () => downloadSelected('both'));
        panelEl.querySelector('#xe-dl-audio').addEventListener('click', () => downloadSelected('audio'));
        panelEl.querySelector('#xe-dl-desc').addEventListener('click', () => downloadSelected('desc'));
        panelEl.querySelector('#xe-sel-all').addEventListener('click', () => {
            chapters.forEach(c => c.checked = true);
            renderList();
        });
        panelEl.querySelector('#xe-sel-none').addEventListener('click', () => {
            chapters.forEach(c => c.checked = false);
            renderList();
        });
        panelEl.querySelector('#xe-copy').addEventListener('click', async () => {
            // Try to get current page audio URL via audio.info.get
            try {
                const params = getPageParams();
                const info = await fetchAudioInfo(params.resource_id, params.product_id);
                if (info.audio_url) {
                    GM_setClipboard(info.audio_url);
                    setStatus('已复制当前音频链接 ✓', '#388e3c');
                } else {
                    setStatus('未找到音频链接', '#c62828');
                }
            } catch (e) {
                setStatus('获取失败：' + e.message, '#c62828');
            }
        });
    }

    function init() {
        createPanel();
        log('Panel ready. Params:', getPageParams());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
