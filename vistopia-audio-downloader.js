// ==UserScript==
// @name         Vistopia音频下载助手
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  从vistopia.com.cn专辑页面提取音频并提供批量下载功能
// @author       Your name
// @match        https://www.vistopia.com.cn/detail/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      vod.volcengineapi.com
// @connect      vod2.vistopia.com.cn
// @connect      www.vistopia.com.cn
// @connect      *.vistopia.com.cn
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/vistopia-audio-downloader.js
// @downloadURL  https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/vistopia-audio-downloader.js
// ==/UserScript==

(function() {
    'use strict';

    let audioList = [];
    let contentTitle = '';
    let contentId = '';
    let apiToken = '';

    // Extract content_id from URL like /detail/394
    function getContentId() {
        const match = window.location.pathname.match(/\/detail\/(\d+)/);
        return match ? match[1] : '';
    }

    // Extract api_token from the 'user' cookie
    function getApiToken() {
        try {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [name, ...valueParts] = cookie.trim().split('=');
                if (name === 'user') {
                    const value = decodeURIComponent(valueParts.join('='));
                    const userData = JSON.parse(value);
                    return userData.token || '';
                }
            }
        } catch (e) {
            console.error('解析user cookie失败:', e);
        }
        return '';
    }

    // Get content title from page
    function getContentTitle() {
        const el = document.querySelector('.header-box .title');
        return el ? el.textContent.trim() : '未知专辑';
    }

    // Fetch article list via API
    function fetchArticleList() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://www.vistopia.com.cn/api/v1/content/article_list?api_token=${apiToken}&content_id=${contentId}&count=1001`,
                headers: {
                    'Accept': 'application/json',
                    'Referer': `https://www.vistopia.com.cn/detail/${contentId}`
                },
                onload: function(resp) {
                    try {
                        const data = JSON.parse(resp.responseText);
                        if (data.status === 'success') {
                            resolve(data.data.article_list || []);
                        } else {
                            reject(new Error('API返回失败: ' + resp.responseText));
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject
            });
        });
    }

    // Get play token for a single article
    function fetchPlayToken(articleId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://www.vistopia.com.cn/api/v2/services/play-token?api_token=${apiToken}&article_id=${articleId}`,
                headers: {
                    'Accept': 'application/json',
                    'Referer': `https://www.vistopia.com.cn/detail/${contentId}`
                },
                onload: function(resp) {
                    try {
                        const data = JSON.parse(resp.responseText);
                        if (data.status === 'success') {
                            resolve(data.data);
                        } else {
                            reject(new Error('获取play token失败: ' + resp.responseText));
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject
            });
        });
    }

    // Decode play_token (base64) and extract the volcengine pre-signed URL
    function decodePlayToken(playToken) {
        try {
            const decoded = JSON.parse(atob(playToken));
            // decoded.GetPlayInfoToken is the pre-signed volcengine URL query string
            return decoded.GetPlayInfoToken;
        } catch (e) {
            console.error('解码play_token失败:', e);
            return null;
        }
    }

    // Fetch actual download URL from volcengine
    function fetchDownloadUrl(playToken) {
        return new Promise((resolve, reject) => {
            const queryString = decodePlayToken(playToken);
            if (!queryString) {
                reject(new Error('无法解码play_token'));
                return;
            }

            const url = `https://vod.volcengineapi.com/?${queryString}&PlayConfig=${encodeURIComponent('{"PlayDomain":"vod2.vistopia.com.cn"}')}&NeedThumbs=0&NeedBarrageMask=0&Ssl=1`;

            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'Accept': '*/*',
                    'Origin': 'https://www.vistopia.com.cn',
                    'Referer': 'https://www.vistopia.com.cn/'
                },
                onload: function(resp) {
                    try {
                        const data = JSON.parse(resp.responseText);
                        const playInfo = data.Result?.PlayInfoList?.[0];
                        if (playInfo && playInfo.MainPlayUrl) {
                            resolve(playInfo.MainPlayUrl);
                        } else {
                            reject(new Error('未找到下载地址'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject
            });
        });
    }

    // Sanitize filename
    function sanitize(str) {
        return str.replace(/[\/\\:*?"<>|]/g, '-').trim();
    }

    // Parse chapter groupings from the DOM
    // Returns: [{ chapterName: string, articleTitles: string[] }, ...]
    function parseChaptersFromDOM() {
        const chapters = [];
        // Each chapter is a <div> containing a <section class="catalog-theme"> followed by a <ul>
        const catalogContainers = document.querySelectorAll('section.catalog-theme');
        catalogContainers.forEach((section) => {
            const nameEl = section.querySelector('.mmm');
            const chapterName = nameEl ? nameEl.textContent.trim() : '';
            // The <ul> with episodes is the next sibling of the section's parent or the section itself
            const parent = section.parentElement;
            const ul = parent ? parent.querySelector('ul') : null;
            const titles = [];
            if (ul) {
                ul.querySelectorAll('.infoplayer_title').forEach(el => {
                    titles.push(el.textContent.trim());
                });
            }
            if (chapterName) {
                chapters.push({ chapterName, articleTitles: titles });
            }
        });
        return chapters;
    }

    // Build a mapping from article title -> { chapterFolder, filename }
    // chapterFolder: "{chapterIndex} {chapterName}"
    // filename: prepend index only if not all episodes in the chapter already start with arabic numbers
    function buildChapterMapping(chapters) {
        const mapping = {}; // title -> { chapterFolder, filename }
        const chapterPadLen = String(chapters.length).length;

        chapters.forEach((chapter, chapterIdx) => {
            const chapterPrefix = String(chapterIdx + 1).padStart(chapterPadLen, '0');
            const chapterFolder = sanitize(`${chapterPrefix} ${chapter.chapterName}`);
            const titles = chapter.articleTitles;
            const total = titles.length;
            const padLen = String(total).length;

            // Check if ALL episodes in this chapter already start with arabic numbers
            const allStartWithNumber = titles.length > 0 && titles.every(t => /^\d/.test(t));

            titles.forEach((title, epIdx) => {
                let filename;
                if (allStartWithNumber) {
                    filename = `${sanitize(title)}.mp3`;
                } else {
                    const prefix = String(epIdx + 1).padStart(padLen, '0');
                    filename = `${prefix} ${sanitize(title)}.mp3`;
                }
                mapping[title] = { chapterFolder, filename };
            });
        });

        return mapping;
    }

    // Store chapter mapping globally
    let chapterMapping = {};

    // Build filename for articles without chapter info (fallback)
    function buildFilename(title, index, total) {
        const padLen = String(total).length;
        const prefix = String(index + 1).padStart(padLen, '0');
        return `${prefix} ${sanitize(title)}.mp3`;
    }

    // Download a single audio
    async function downloadSingle(item, statusEl, index, total) {
        try {
            statusEl.textContent = '获取播放token...';
            const tokenData = await fetchPlayToken(item.article_id);

            statusEl.textContent = '获取下载地址...';
            const downloadUrl = await fetchDownloadUrl(tokenData.play_token);

            const folder = sanitize(contentTitle);
            let fullPath;

            // Use chapter mapping if available
            const mapped = chapterMapping[item.title];
            if (mapped) {
                fullPath = `vistopia/${folder}/${mapped.chapterFolder}/${mapped.filename}`;
            } else {
                // Fallback: flat structure with global index
                const filename = buildFilename(item.title, index, total);
                fullPath = `vistopia/${folder}/${filename}`;
            }

            statusEl.textContent = '下载中...';

            return new Promise((resolve) => {
                GM_download({
                    url: downloadUrl,
                    name: fullPath,
                    saveAs: false,
                    headers: {
                        'Referer': 'https://www.vistopia.com.cn/'
                    },
                    onload: function() {
                        statusEl.textContent = '已完成';
                        statusEl.style.color = '#28a745';
                        resolve(true);
                    },
                    onerror: function(err) {
                        statusEl.textContent = '下载失败: ' + (err.error || err.message || '未知错误');
                        statusEl.style.color = '#dc3545';
                        console.error('下载失败:', item.title, err);
                        resolve(false);
                    }
                });
            });
        } catch (e) {
            statusEl.textContent = '错误: ' + e.message;
            statusEl.style.color = '#dc3545';
            console.error('处理失败:', item.title, e);
            return false;
        }
    }

    // CSS
    const style = document.createElement('style');
    style.textContent = `
        .vdl-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 420px;
            max-height: 80vh;
            background: #fff;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .vdl-header {
            background: #f5f5f5;
            padding: 12px 15px;
            border-bottom: 1px solid #ddd;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 8px 8px 0 0;
            cursor: move;
        }
        .vdl-header-title {
            font-weight: bold;
            font-size: 14px;
            color: #333;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .vdl-close {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #666;
            padding: 0 0 0 10px;
            line-height: 1;
        }
        .vdl-toolbar {
            padding: 10px 15px;
            border-bottom: 1px solid #eee;
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }
        .vdl-btn {
            padding: 6px 14px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            color: #fff;
            white-space: nowrap;
        }
        .vdl-btn-primary { background: #007bff; }
        .vdl-btn-primary:hover { background: #0056b3; }
        .vdl-btn-danger { background: #dc3545; }
        .vdl-btn-danger:hover { background: #c82333; }
        .vdl-btn-success { background: #28a745; }
        .vdl-btn-success:hover { background: #1e7e34; }
        .vdl-btn:disabled { background: #6c757d; cursor: not-allowed; }
        .vdl-select-info {
            font-size: 12px;
            color: #666;
            margin-left: auto;
        }
        .vdl-range-row {
            padding: 6px 15px;
            border-bottom: 1px solid #eee;
            display: flex;
            gap: 6px;
            align-items: center;
            font-size: 12px;
            color: #555;
        }
        .vdl-range-input {
            width: 50px;
            padding: 3px 6px;
            border: 1px solid #ccc;
            border-radius: 3px;
            font-size: 12px;
            text-align: center;
        }
        .vdl-range-input:focus {
            outline: none;
            border-color: #007bff;
        }
        .vdl-btn-sm {
            padding: 3px 10px;
            font-size: 11px;
        }
        .vdl-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px 15px;
        }
        .vdl-item {
            display: flex;
            align-items: center;
            padding: 8px;
            border: 1px solid #eee;
            border-radius: 4px;
            margin-bottom: 6px;
            background: #fafafa;
            gap: 10px;
        }
        .vdl-item:hover { background: #f0f0f0; }
        .vdl-item input[type="checkbox"] {
            flex-shrink: 0;
            width: 16px;
            height: 16px;
            cursor: pointer;
        }
        .vdl-item-info {
            flex: 1;
            min-width: 0;
        }
        .vdl-item-title {
            font-size: 13px;
            color: #333;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .vdl-item-meta {
            font-size: 11px;
            color: #999;
            margin-top: 2px;
        }
        .vdl-item-status {
            font-size: 11px;
            color: #666;
            flex-shrink: 0;
            min-width: 80px;
            text-align: right;
        }
        .vdl-item-dl {
            flex-shrink: 0;
        }
        .vdl-toggle-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 99998;
            background: #007bff;
            color: #fff;
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            font-size: 22px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .vdl-toggle-btn:hover { background: #0056b3; }
        .vdl-chapter {
            margin-bottom: 2px;
        }
        .vdl-chapter-header {
            display: flex;
            align-items: center;
            padding: 7px 8px;
            background: #e9ecef;
            border-radius: 4px;
            cursor: pointer;
            gap: 8px;
            user-select: none;
        }
        .vdl-chapter-header:hover { background: #dee2e6; }
        .vdl-chapter-arrow {
            font-size: 10px;
            transition: transform 0.15s;
            flex-shrink: 0;
            width: 14px;
            text-align: center;
        }
        .vdl-chapter-arrow.collapsed { transform: rotate(-90deg); }
        .vdl-chapter-header input[type="checkbox"] {
            flex-shrink: 0;
            width: 16px;
            height: 16px;
            cursor: pointer;
        }
        .vdl-chapter-name {
            font-size: 13px;
            font-weight: 600;
            color: #333;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .vdl-chapter-count {
            font-size: 11px;
            color: #888;
            flex-shrink: 0;
        }
        .vdl-chapter-items {
            padding-left: 10px;
        }
        .vdl-chapter-items.collapsed {
            display: none;
        }
    `;
    document.head.appendChild(style);

    // Build the panel UI
    function createPanel(articles) {
        // Remove existing
        document.querySelector('.vdl-panel')?.remove();
        document.querySelector('.vdl-toggle-btn')?.remove();

        const panel = document.createElement('div');
        panel.className = 'vdl-panel';

        // Header
        const header = document.createElement('div');
        header.className = 'vdl-header';
        header.innerHTML = `
            <span class="vdl-header-title">${contentTitle} (${articles.length}集)</span>
            <button class="vdl-close">&times;</button>
        `;
        panel.appendChild(header);

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'vdl-toolbar';

        const selectAllBtn = document.createElement('button');
        selectAllBtn.className = 'vdl-btn vdl-btn-primary';
        selectAllBtn.textContent = '全选';

        const deselectAllBtn = document.createElement('button');
        deselectAllBtn.className = 'vdl-btn vdl-btn-primary';
        deselectAllBtn.textContent = '取消全选';

        const batchBtn = document.createElement('button');
        batchBtn.className = 'vdl-btn vdl-btn-danger';
        batchBtn.textContent = '下载选中';

        const selectInfo = document.createElement('span');
        selectInfo.className = 'vdl-select-info';
        selectInfo.textContent = '已选 0 项';

        toolbar.append(selectAllBtn, deselectAllBtn, batchBtn, selectInfo);
        panel.appendChild(toolbar);

        // Range selection row
        const rangeRow = document.createElement('div');
        rangeRow.className = 'vdl-range-row';

        const rangeLabel = document.createElement('span');
        rangeLabel.textContent = '范围选择:';

        const rangeFrom = document.createElement('input');
        rangeFrom.className = 'vdl-range-input';
        rangeFrom.type = 'number';
        rangeFrom.min = '1';
        rangeFrom.max = String(articles.length);
        rangeFrom.placeholder = '起';

        const rangeSep = document.createElement('span');
        rangeSep.textContent = '–';

        const rangeTo = document.createElement('input');
        rangeTo.className = 'vdl-range-input';
        rangeTo.type = 'number';
        rangeTo.min = '1';
        rangeTo.max = String(articles.length);
        rangeTo.placeholder = '止';

        const rangeSelectBtn = document.createElement('button');
        rangeSelectBtn.className = 'vdl-btn vdl-btn-primary vdl-btn-sm';
        rangeSelectBtn.textContent = '选择';

        const rangeHint = document.createElement('span');
        rangeHint.style.color = '#999';
        rangeHint.textContent = `(1-${articles.length})`;

        rangeRow.append(rangeLabel, rangeFrom, rangeSep, rangeTo, rangeSelectBtn, rangeHint);
        panel.appendChild(rangeRow);

        // Range select handler
        rangeSelectBtn.addEventListener('click', () => {
            const from = parseInt(rangeFrom.value, 10);
            const to = parseInt(rangeTo.value, 10);
            if (isNaN(from) || isNaN(to) || from < 1 || to < 1 || from > articles.length || to > articles.length) {
                alert(`请输入 1-${articles.length} 之间的有效范围`);
                return;
            }
            const lo = Math.min(from, to) - 1;
            const hi = Math.max(from, to) - 1;
            items.forEach(i => { i.cb.checked = false; });
            for (let j = lo; j <= hi; j++) {
                items[j].cb.checked = true;
            }
            syncAllChapterCbs();
            updateSelectInfo();
        });

        // List
        const list = document.createElement('div');
        list.className = 'vdl-list';

        const items = [];
        const totalCount = articles.length;

        // Group articles by chapter using parsed DOM chapters
        const chapters = parseChaptersFromDOM();
        const hasChapters = chapters.length > 0;

        if (hasChapters) {
            // Build a title -> article lookup (API data has article_id etc.)
            const titleToArticle = {};
            articles.forEach((a, i) => { titleToArticle[a.title] = { article: a, globalIdx: i }; });

            const chapterPadLen = String(chapters.length).length;
            chapters.forEach((chapter, chapterIdx) => {
                const chapterDiv = document.createElement('div');
                chapterDiv.className = 'vdl-chapter';

                const chapterPrefix = String(chapterIdx + 1).padStart(chapterPadLen, '0');
                const chapterLabel = `${chapterPrefix} ${chapter.chapterName}`;

                // Chapter header
                const chapterHeader = document.createElement('div');
                chapterHeader.className = 'vdl-chapter-header';

                const arrow = document.createElement('span');
                arrow.className = 'vdl-chapter-arrow';
                arrow.textContent = '▼';

                const chapterCb = document.createElement('input');
                chapterCb.type = 'checkbox';

                const chapterName = document.createElement('span');
                chapterName.className = 'vdl-chapter-name';
                chapterName.textContent = chapterLabel;

                const chapterCount = document.createElement('span');
                chapterCount.className = 'vdl-chapter-count';
                chapterCount.textContent = `${chapter.articleTitles.length}集`;

                chapterHeader.append(arrow, chapterCb, chapterName, chapterCount);
                chapterDiv.appendChild(chapterHeader);

                // Episode list under this chapter
                const chapterItems = document.createElement('div');
                chapterItems.className = 'vdl-chapter-items';

                const chapterEpItems = []; // track items in this chapter

                chapter.articleTitles.forEach((title, epIdx) => {
                    const match = titleToArticle[title];
                    if (!match) return;
                    const { article, globalIdx } = match;

                    const item = document.createElement('div');
                    item.className = 'vdl-item';

                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.dataset.index = globalIdx;

                    const info = document.createElement('div');
                    info.className = 'vdl-item-info';
                    // Show the filename that will be used for download
                    const mapped = chapterMapping[title];
                    const displayTitle = mapped ? mapped.filename.replace(/\.mp3$/, '') : article.title;
                    info.innerHTML = `
                        <div class="vdl-item-title">${displayTitle}</div>
                        <div class="vdl-item-meta">${article.duration_str || ''}</div>
                    `;

                    const status = document.createElement('span');
                    status.className = 'vdl-item-status';
                    status.textContent = '';

                    const dlBtn = document.createElement('button');
                    dlBtn.className = 'vdl-btn vdl-btn-success vdl-item-dl';
                    dlBtn.textContent = '下载';
                    dlBtn.addEventListener('click', async () => {
                        dlBtn.disabled = true;
                        await downloadSingle(article, status, globalIdx, totalCount);
                        dlBtn.disabled = false;
                    });

                    item.append(cb, info, status, dlBtn);
                    chapterItems.appendChild(item);
                    const itemObj = { cb, status, article, idx: globalIdx };
                    items.push(itemObj);
                    chapterEpItems.push(itemObj);
                });

                chapterDiv.appendChild(chapterItems);
                list.appendChild(chapterDiv);

                // Chapter checkbox toggles all episodes in this chapter
                chapterCb.addEventListener('change', () => {
                    chapterEpItems.forEach(i => { i.cb.checked = chapterCb.checked; });
                    updateSelectInfo();
                });
                // Stop click on checkbox from toggling collapse
                chapterCb.addEventListener('click', (e) => { e.stopPropagation(); });

                // Update chapter checkbox state when individual episodes change
                const syncChapterCb = () => {
                    const allChecked = chapterEpItems.length > 0 && chapterEpItems.every(i => i.cb.checked);
                    const someChecked = chapterEpItems.some(i => i.cb.checked);
                    chapterCb.checked = allChecked;
                    chapterCb.indeterminate = !allChecked && someChecked;
                };
                chapterEpItems.forEach(i => i.cb.addEventListener('change', syncChapterCb));

                // Toggle collapse on header click
                chapterHeader.addEventListener('click', (e) => {
                    if (e.target === chapterCb) return;
                    const collapsed = chapterItems.classList.toggle('collapsed');
                    arrow.classList.toggle('collapsed', collapsed);
                });
            });
        } else {
            // Flat list fallback (no chapters)
            articles.forEach((article, idx) => {
                const item = document.createElement('div');
                item.className = 'vdl-item';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.dataset.index = idx;

                const info = document.createElement('div');
                info.className = 'vdl-item-info';
                info.innerHTML = `
                    <div class="vdl-item-title">${article.title}</div>
                    <div class="vdl-item-meta">${article.duration_str || ''}</div>
                `;

                const status = document.createElement('span');
                status.className = 'vdl-item-status';
                status.textContent = '';

                const dlBtn = document.createElement('button');
                dlBtn.className = 'vdl-btn vdl-btn-success vdl-item-dl';
                dlBtn.textContent = '下载';
                dlBtn.addEventListener('click', async () => {
                    dlBtn.disabled = true;
                    await downloadSingle(article, status, idx, totalCount);
                    dlBtn.disabled = false;
                });

                item.append(cb, info, status, dlBtn);
                list.appendChild(item);
                items.push({ cb, status, article, idx });
            });
        }

        panel.appendChild(list);
        document.body.appendChild(panel);

        // Update select count
        function updateSelectInfo() {
            const count = items.filter(i => i.cb.checked).length;
            selectInfo.textContent = `已选 ${count} 项`;
        }
        items.forEach(i => i.cb.addEventListener('change', updateSelectInfo));

        // Select all / deselect (also sync chapter checkboxes)
        function syncAllChapterCbs() {
            list.querySelectorAll('.vdl-chapter').forEach(chapterDiv => {
                const chapterCb = chapterDiv.querySelector('.vdl-chapter-header input[type="checkbox"]');
                const epCbs = chapterDiv.querySelectorAll('.vdl-chapter-items input[type="checkbox"]');
                if (!chapterCb || epCbs.length === 0) return;
                const allChecked = Array.from(epCbs).every(cb => cb.checked);
                const someChecked = Array.from(epCbs).some(cb => cb.checked);
                chapterCb.checked = allChecked;
                chapterCb.indeterminate = !allChecked && someChecked;
            });
        }
        selectAllBtn.addEventListener('click', () => {
            items.forEach(i => { i.cb.checked = true; });
            syncAllChapterCbs();
            updateSelectInfo();
        });
        deselectAllBtn.addEventListener('click', () => {
            items.forEach(i => { i.cb.checked = false; });
            syncAllChapterCbs();
            updateSelectInfo();
        });

        // Batch download
        batchBtn.addEventListener('click', async () => {
            const selected = items.filter(i => i.cb.checked);
            if (selected.length === 0) {
                alert('请先选择要下载的音频');
                return;
            }
            batchBtn.disabled = true;
            batchBtn.textContent = `下载中 (0/${selected.length})`;

            for (let i = 0; i < selected.length; i++) {
                const { article, status, idx } = selected[i];
                batchBtn.textContent = `下载中 (${i + 1}/${selected.length})`;
                await downloadSingle(article, status, idx, totalCount);
                // Small delay between downloads to avoid rate limiting
                if (i < selected.length - 1) {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            batchBtn.disabled = false;
            batchBtn.textContent = '下载选中';
        });

        // Close button
        header.querySelector('.vdl-close').addEventListener('click', () => {
            panel.style.display = 'none';
            toggleBtn.style.display = 'flex';
        });

        // Make header draggable
        let isDragging = false, startX, startY, startLeft, startTop;
        header.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('vdl-close')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            panel.style.right = 'auto';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panel.style.left = (startLeft + e.clientX - startX) + 'px';
            panel.style.top = (startTop + e.clientY - startY) + 'px';
        });
        document.addEventListener('mouseup', () => { isDragging = false; });

        // Toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'vdl-toggle-btn';
        toggleBtn.textContent = '⬇';
        toggleBtn.title = '打开音频下载面板';
        toggleBtn.style.display = 'none';
        toggleBtn.addEventListener('click', () => {
            panel.style.display = 'flex';
            toggleBtn.style.display = 'none';
        });
        document.body.appendChild(toggleBtn);
    }

    // Init
    async function init() {
        contentId = getContentId();
        apiToken = getApiToken();
        contentTitle = getContentTitle();

        if (!contentId) {
            console.error('[Vistopia DL] 无法获取content_id');
            return;
        }
        if (!apiToken) {
            console.error('[Vistopia DL] 未登录或无法获取api_token');
            return;
        }

        console.log(`[Vistopia DL] content_id=${contentId}, title=${contentTitle}`);

        try {
            const articles = await fetchArticleList();
            audioList = articles;
            console.log(`[Vistopia DL] 获取到 ${articles.length} 个音频`);

            // Parse chapter groupings from DOM
            const chapters = parseChaptersFromDOM();
            if (chapters.length > 0) {
                chapterMapping = buildChapterMapping(chapters);
                console.log(`[Vistopia DL] 解析到 ${chapters.length} 个章节:`, chapters.map(c => c.chapterName));
            } else {
                console.log('[Vistopia DL] 未找到章节分组，使用扁平结构');
            }

            if (articles.length > 0) {
                createPanel(articles);
            } else {
                console.warn('[Vistopia DL] 未找到音频列表');
            }
        } catch (e) {
            console.error('[Vistopia DL] 获取音频列表失败:', e);
        }
    }

    // Wait for page to settle then init
    setTimeout(init, 2000);
})();
