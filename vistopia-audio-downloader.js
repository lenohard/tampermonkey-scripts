// ==UserScript==
// @name         Vistopia音频下载助手
// @namespace    http://tampermonkey.net/
// @version      1.1
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

    // Build filename with zero-padded index if title doesn't start with digits
    function buildFilename(title, index, total) {
        const padLen = String(total).length;
        const prefix = String(index + 1).padStart(padLen, '0');
        const clean = sanitize(title);
        // If title already starts with digits (e.g. "01 Intro", "1. Foo"), keep as-is
        if (/^\d/.test(clean)) {
            return clean + '.mp3';
        }
        return `${prefix} ${clean}.mp3`;
    }

    // Download a single audio
    async function downloadSingle(item, statusEl, index, total) {
        try {
            statusEl.textContent = '获取播放token...';
            const tokenData = await fetchPlayToken(item.article_id);

            statusEl.textContent = '获取下载地址...';
            const downloadUrl = await fetchDownloadUrl(tokenData.play_token);

            const folder = sanitize(contentTitle);
            const filename = buildFilename(item.title, index, total);
            const fullPath = `vistopia/${folder}/${filename}`;

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

        // List
        const list = document.createElement('div');
        list.className = 'vdl-list';

        const items = [];
        const totalCount = articles.length;
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
                await downloadSingle(article, status, idx, articles.length);
                dlBtn.disabled = false;
            });

            item.append(cb, info, status, dlBtn);
            list.appendChild(item);
            items.push({ cb, status, article, idx });
        });

        panel.appendChild(list);
        document.body.appendChild(panel);

        // Update select count
        function updateSelectInfo() {
            const count = items.filter(i => i.cb.checked).length;
            selectInfo.textContent = `已选 ${count} 项`;
        }
        items.forEach(i => i.cb.addEventListener('change', updateSelectInfo));

        // Select all / deselect
        selectAllBtn.addEventListener('click', () => {
            items.forEach(i => { i.cb.checked = true; });
            updateSelectInfo();
        });
        deselectAllBtn.addEventListener('click', () => {
            items.forEach(i => { i.cb.checked = false; });
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
