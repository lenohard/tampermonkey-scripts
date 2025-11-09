// ==UserScript==
// @name         微信公众号音频下载助手
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  从微信公众号文章中提取音频并提供下载和合并功能
// @author       Your name
// @match        https://mp.weixin.qq.com/*
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/weixin-audio-downloader.js
// @downloadURL  https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/weixin-audio-downloader.js
// ==/UserScript==

(function() {
    'use strict';

    let audioList = [];
    let articleTitle = '';
    let authorName = '';

    // 等待元素加载
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            function check() {
                const element = document.querySelector(selector);
                if (element) {
                    resolve(element);
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error(`Element ${selector} not found within ${timeout}ms`));
                } else {
                    setTimeout(check, 100);
                }
            }

            check();
        });
    }

    // 添加CSS样式
    const style = document.createElement('style');
    style.textContent = `
        .wx-audio-download-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 450px;
            max-height: 80vh;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .wx-panel-header {
            background: #f5f5f5;
            padding: 15px;
            border-bottom: 1px solid #ddd;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
        }

        .wx-panel-close {
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #666;
        }

        .wx-panel-content {
            max-height: 60vh;
            overflow-y: auto;
            padding: 15px;
        }

        .wx-audio-item {
            margin-bottom: 15px;
            padding: 12px;
            border: 1px solid #eee;
            border-radius: 6px;
            background: #fafafa;
        }

        .wx-audio-title {
            font-weight: bold;
            margin-bottom: 8px;
            color: #333;
            font-size: 13px;
            line-height: 1.4;
        }

        .wx-audio-meta {
            font-size: 12px;
            color: #666;
            margin-bottom: 10px;
        }

        .wx-audio-controls {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }

        .wx-download-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .wx-download-btn:hover {
            background: #0056b3;
        }

        .wx-download-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
        }

        .wx-play-btn {
            background: #28a745;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .wx-play-btn:hover {
            background: #1e7e34;
        }

        .wx-batch-download {
            background: #dc3545;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 10px;
            font-size: 13px;
        }

        .wx-batch-download:hover {
            background: #c82333;
        }

        .wx-merge-download {
            background: #6f42c1;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 15px;
            font-size: 13px;
        }

        .wx-merge-download:hover {
            background: #5a32a3;
        }

        .wx-status-message {
            padding: 10px;
            margin-bottom: 10px;
            border-radius: 4px;
            font-size: 12px;
        }

        .wx-status-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .wx-status-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .wx-status-info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }

        .wx-checkbox {
            margin-right: 8px;
        }

        .wx-select-all {
            margin-bottom: 15px;
            padding: 8px;
            background: #e9ecef;
            border-radius: 4px;
            font-size: 12px;
        }
    `;
    document.head.appendChild(style);

    // 显示状态消息
    function showStatus(message, type = 'info') {
        const statusDiv = document.createElement('div');
        statusDiv.className = `wx-status-message wx-status-${type}`;
        statusDiv.textContent = message;

        const panelContent = document.querySelector('.wx-panel-content');
        if (panelContent) {
            panelContent.insertBefore(statusDiv, panelContent.firstChild);
            setTimeout(() => {
                if (statusDiv.parentNode) {
                    statusDiv.remove();
                }
            }, 4000);
        }
    }

    // 获取文章信息
    function getArticleInfo() {
        try {
            // 获取文章标题
            const titleElement = document.querySelector('#activity-name') ||
                                document.querySelector('.rich_media_title') ||
                                document.querySelector('h1');
            articleTitle = titleElement ? titleElement.textContent.trim() : '未知文章';

            // 获取作者信息
            const authorElement = document.querySelector('#js_name') ||
                                document.querySelector('.rich_media_meta_text') ||
                                document.querySelector('.audio_card_nickname');
            authorName = authorElement ? authorElement.textContent.trim() : '未知作者';

            console.log('文章信息:', { articleTitle, authorName });
        } catch (error) {
            console.error('获取文章信息失败:', error);
            articleTitle = '未知文章';
            authorName = '未知作者';
        }
    }

    // 从页面脚本中提取音频URL
    function extractAudioUrlFromScript() {
        const scripts = document.querySelectorAll('script');
        const audioUrls = [];

        for (const script of scripts) {
            const content = script.textContent;

            // 尝试不同的正则模式
            const patterns = [
                /voice_encode_fileid["':\s]*["']([^"']+)["']/g,
                /["']([^"']*(?:mp3|m4a|wav|ogg|aac)[^"']*)["']/g,
                /url["':\s]*["']([^"']*audio[^"']*)["']/g,
                /src["':\s]*["']([^"']*\.(?:mp3|m4a|wav|ogg|aac)[^"']*)["']/g,
                /fileid["':\s]*["']([^"']+)["']/g
            ];

            patterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    const url = match[1];
                    if (url && url.length > 10 && !audioUrls.includes(url)) {
                        audioUrls.push(url);
                    }
                }
            });
        }

        return audioUrls;
    }

    // 通过微信API构造音频URL
    function constructWeixinAudioUrl(fileid) {
        if (!fileid) return null;

        // 微信音频的可能URL格式
        const baseUrls = [
            `https://res.wx.qq.com/voice/getvoice?mediaid=${fileid}`,
            `https://mp.weixin.qq.com/mp/audio?t=pages/audio_article&scene=153&fileid=${fileid}`,
            `https://mmbiz.qpic.cn/mmbiz_mp3/${fileid}/0?wx_fmt=mp3`
        ];

        return baseUrls;
    }

    // 获取音频真实URL (优化版)
    async function getAudioRealUrl(audioElement, cardElement) {
        return new Promise((resolve) => {
            try {
                // 方法1: 直接从audio元素获取
                let audioUrl = audioElement?.src ||
                              audioElement?.getAttribute('data-src') ||
                              audioElement?.getAttribute('data-url') ||
                              audioElement?.currentSrc;

                if (audioUrl && audioUrl !== 'about:blank' && audioUrl.length > 10) {
                    console.log('从audio元素获取URL:', audioUrl);
                    resolve(audioUrl);
                    return;
                }

                // 方法2: 从卡片元素的data属性获取
                if (cardElement) {
                    const fileid = cardElement.getAttribute('data-fileid') ||
                                  cardElement.getAttribute('data-voice-fileid') ||
                                  cardElement.getAttribute('data-id');

                    if (fileid) {
                        const possibleUrls = constructWeixinAudioUrl(fileid);
                        console.log('从fileid构造URL:', possibleUrls[0]);
                        resolve(possibleUrls[0]);
                        return;
                    }
                }

                // 方法3: 从页面脚本中提取
                const scriptUrls = extractAudioUrlFromScript();
                if (scriptUrls.length > 0) {
                    console.log('从脚本提取URL:', scriptUrls[0]);
                    resolve(scriptUrls[0]);
                    return;
                }

                // 方法4: 尝试无缓存加载 (最后手段)
                if (audioElement) {
                    console.log('尝试通过加载获取URL...');

                    const originalVolume = audioElement.volume;
                    audioElement.volume = 0;
                    audioElement.muted = true;

                    const loadedHandler = () => {
                        audioElement.volume = originalVolume;
                        audioElement.muted = false;
                        audioElement.removeEventListener('loadeddata', loadedHandler);
                        audioElement.removeEventListener('error', errorHandler);

                        const finalUrl = audioElement.src || audioElement.currentSrc;
                        console.log('通过加载获取URL:', finalUrl);
                        resolve(finalUrl || null);
                    };

                    const errorHandler = () => {
                        audioElement.volume = originalVolume;
                        audioElement.muted = false;
                        audioElement.removeEventListener('loadeddata', loadedHandler);
                        audioElement.removeEventListener('error', errorHandler);
                        resolve(null);
                    };

                    audioElement.addEventListener('loadeddata', loadedHandler);
                    audioElement.addEventListener('error', errorHandler);

                    // 强制重新加载
                    audioElement.load();

                    // 2秒超时 (缩短等待时间)
                    setTimeout(() => {
                        audioElement.volume = originalVolume;
                        audioElement.muted = false;
                        audioElement.removeEventListener('loadeddata', loadedHandler);
                        audioElement.removeEventListener('error', errorHandler);
                        resolve(null);
                    }, 2000);
                } else {
                    resolve(null);
                }

            } catch (error) {
                console.error('获取音频URL失败:', error);
                resolve(null);
            }
        });
    }

    // 提取音频信息
    async function extractAudioInfo() {
        audioList = [];
        getArticleInfo();

        try {
            // 查找所有音频卡片
            const audioCards = document.querySelectorAll('.audio_card_bd, .audio_opr_area, .appmsg_audio_area');
            console.log(`找到 ${audioCards.length} 个音频卡片`);

            for (let i = 0; i < audioCards.length; i++) {
                const card = audioCards[i];

                try {
                    // 获取音频标题
                    const titleElement = card.querySelector('.audio_card_title, .appmsg_audio_title') ||
                                       card.querySelector('strong') ||
                                       card.querySelector('[class*="title"]');
                    const title = titleElement ? titleElement.textContent.trim() : `音频 ${i + 1}`;

                    // 获取时长信息
                    const durationElement = card.querySelector('.js_duration, [data-duration]') ||
                                          card.querySelector('[class*="duration"]');
                    const duration = durationElement ?
                                   (durationElement.getAttribute('data-duration') || durationElement.textContent.trim()) :
                                   '未知时长';

                    // 查找音频元素
                    let audioElement = card.querySelector('audio') ||
                                     document.querySelector(`audio[data-index="${i}"]`) ||
                                     document.querySelector('audio');

                    // 如果没有找到audio元素，尝试从全局播放器获取
                    if (!audioElement) {
                        audioElement = document.querySelector('#voice_play_audio, #audio_play_audio, audio');
                    }

                    let audioUrl = null;
                    if (audioElement || card) {
                        audioUrl = await getAudioRealUrl(audioElement, card);
                    }

                    if (audioUrl || title) {
                        audioList.push({
                            title: title,
                            url: audioUrl,
                            duration: duration,
                            element: audioElement,
                            index: i + 1,
                            selected: true // 默认选中
                        });
                        console.log(`提取音频 ${i + 1}:`, { title, audioUrl, duration });
                    }

                } catch (error) {
                    console.error(`处理第 ${i + 1} 个音频卡片时出错:`, error);
                }
            }

            // 如果没有找到音频卡片，尝试直接查找audio元素
            if (audioList.length === 0) {
                const audioElements = document.querySelectorAll('audio');
                console.log(`未找到音频卡片，尝试直接提取audio元素: ${audioElements.length} 个`);

                for (let i = 0; i < audioElements.length; i++) {
                    const audioElement = audioElements[i];
                    const audioUrl = await getAudioRealUrl(audioElement, null);

                    if (audioUrl) {
                        audioList.push({
                            title: `音频 ${i + 1}`,
                            url: audioUrl,
                            duration: '未知时长',
                            element: audioElement,
                            index: i + 1,
                            selected: true
                        });
                    }
                }
            }

            console.log(`成功提取 ${audioList.length} 个音频`);
        } catch (error) {
            console.error('提取音频信息失败:', error);
        }
    }

    // 下载单个音频
    function downloadAudio(audioInfo) {
        if (!audioInfo.url) {
            showStatus(`❌ 无法获取音频URL: ${audioInfo.title}`, 'error');
            return;
        }

        try {
            const sanitizedAuthor = authorName.replace(/[\/\\:*?"<>|]/g, '-');
            const sanitizedTitle = audioInfo.title.replace(/[\/\\:*?"<>|]/g, '-');
            const sanitizedArticle = articleTitle.replace(/[\/\\:*?"<>|]/g, '-');

            const filename = `微信公众号音频/${sanitizedAuthor}/${sanitizedArticle}/${sanitizedTitle}.mp3`;

            showStatus(`开始下载: ${audioInfo.title}`, 'info');

            GM_download({
                url: audioInfo.url,
                name: filename,
                saveAs: false,
                onload: function() {
                    showStatus(`✅ 下载完成: ${audioInfo.title}`, 'success');
                },
                onerror: function(error) {
                    showStatus(`❌ 下载失败: ${audioInfo.title} - ${error.message}`, 'error');
                    console.error('下载错误详情:', error);
                }
            });
        } catch (error) {
            showStatus(`❌ 下载出错: ${audioInfo.title} - ${error.message}`, 'error');
            console.error('下载异常:', error);
        }
    }

    // 批量下载选中的音频
    async function batchDownload() {
        const selectedAudios = audioList.filter(audio => audio.selected && audio.url);

        if (selectedAudios.length === 0) {
            showStatus('❌ 没有选中可下载的音频', 'error');
            return;
        }

        showStatus(`🚀 开始批量下载 ${selectedAudios.length} 个音频...`, 'info');

        for (let i = 0; i < selectedAudios.length; i++) {
            const audioInfo = selectedAudios[i];
            showStatus(`⏬ 正在下载 (${i + 1}/${selectedAudios.length}): ${audioInfo.title}`, 'info');

            downloadAudio(audioInfo);

            // 下载间隔
            if (i < selectedAudios.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        showStatus(`🎉 批量下载任务已开始！`, 'success');
    }

    // 合并下载（生成合并脚本）
    function mergeDownload() {
        const selectedAudios = audioList.filter(audio => audio.selected && audio.url);

        if (selectedAudios.length === 0) {
            showStatus('❌ 没有选中可下载的音频', 'error');
            return;
        }

        if (selectedAudios.length === 1) {
            downloadAudio(selectedAudios[0]);
            return;
        }

        // 生成FFmpeg合并脚本
        const sanitizedAuthor = authorName.replace(/[\/\\:*?"<>|]/g, '-');
        const sanitizedArticle = articleTitle.replace(/[\/\\:*?"<>|]/g, '-');

        let script = `#!/bin/bash
# 微信公众号音频合并脚本
# 文章: ${articleTitle}
# 作者: ${authorName}
# 生成时间: ${new Date().toLocaleString()}

echo "开始下载并合并音频..."
mkdir -p "temp_audio"
cd "temp_audio"

`;

        // 下载每个音频文件
        selectedAudios.forEach((audio, index) => {
            const paddedIndex = String(index + 1).padStart(3, '0');
            script += `echo "下载音频 ${index + 1}/${selectedAudios.length}: ${audio.title}"
curl -L "${audio.url}" -o "${paddedIndex}_${audio.title.replace(/[\/\\:*?"<>|]/g, '-')}.mp3"
`;
        });

        script += `
echo "开始合并音频文件..."
# 创建文件列表，确保文件名被正确引用
find . -name "*.mp3" -type f | sort | sed "s/^file '/file '/" | sed "s/'$//" | while read file; do
    echo "file '$file'" >> filelist.txt
done

# 如果上面的方法有问题，使用更简单的方法
if [ ! -s filelist.txt ]; then
    echo "使用备用方法创建文件列表..."
    for file in *.mp3; do
        if [ -f "$file" ]; then
            echo "file '$file'" >> filelist.txt
        fi
    done
fi

echo "文件列表内容:"
cat filelist.txt

# 使用FFmpeg合并
ffmpeg -f concat -safe 0 -i filelist.txt -c copy "../${sanitizedAuthor}_${sanitizedArticle}_合并版.mp3"

echo "清理临时文件..."
cd ..
rm -rf "temp_audio"

echo "合并完成! 输出文件: ${sanitizedAuthor}_${sanitizedArticle}_合并版.mp3"
`;

        // 下载脚本文件
        const blob = new Blob([script], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `微信公众号音频/${sanitizedAuthor}/${sanitizedArticle}/merge_audio_${sanitizedArticle}.sh`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showStatus(`📝 已生成合并脚本，请下载后在终端运行！需要安装FFmpeg和curl`, 'success');
        showStatus(`💡 运行: chmod +x merge_audio_${sanitizedArticle}.sh && ./merge_audio_${sanitizedArticle}.sh`, 'info');
    }

    // 切换音频选择状态
    function toggleAudioSelection(index, checked) {
        if (audioList[index]) {
            audioList[index].selected = checked;
        }
    }

    // 全选/取消全选
    function toggleSelectAll(checked) {
        audioList.forEach(audio => {
            audio.selected = checked;
        });

        // 更新复选框状态
        const checkboxes = document.querySelectorAll('.wx-audio-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
        });
    }

    // 创建下载面板
    function createDownloadPanel() {
        const panel = document.createElement('div');
        panel.className = 'wx-audio-download-panel';

        const header = document.createElement('div');
        header.className = 'wx-panel-header';
        header.innerHTML = `
            <span>微信音频下载助手 (${authorName})</span>
            <button class="wx-panel-close">&times;</button>
        `;

        const content = document.createElement('div');
        content.className = 'wx-panel-content';

        // 路径提示
        const pathInfo = document.createElement('div');
        pathInfo.className = 'wx-status-message wx-status-info';
        pathInfo.innerHTML = `📁 下载路径: 浏览器下载文件夹/微信公众号音频/${authorName.replace(/[\/\\:*?"<>|]/g, '-')}/`;
        content.appendChild(pathInfo);

        // 全选控制
        const selectAllDiv = document.createElement('div');
        selectAllDiv.className = 'wx-select-all';
        selectAllDiv.innerHTML = `
            <label>
                <input type="checkbox" class="wx-select-all-checkbox" checked>
                全选 (${audioList.length} 个音频)
            </label>
        `;
        content.appendChild(selectAllDiv);

        // 批量下载按钮
        const batchBtn = document.createElement('button');
        batchBtn.className = 'wx-batch-download';
        batchBtn.textContent = `🚀 批量下载选中音频`;
        batchBtn.addEventListener('click', batchDownload);
        content.appendChild(batchBtn);

        // 合并下载按钮
        const mergeBtn = document.createElement('button');
        mergeBtn.className = 'wx-merge-download';
        mergeBtn.textContent = `🔗 生成合并下载脚本`;
        mergeBtn.addEventListener('click', mergeDownload);
        content.appendChild(mergeBtn);

        // 音频列表
        audioList.forEach((audioInfo, index) => {
            const item = document.createElement('div');
            item.className = 'wx-audio-item';

            const title = document.createElement('div');
            title.className = 'wx-audio-title';
            title.innerHTML = `
                <label>
                    <input type="checkbox" class="wx-audio-checkbox wx-checkbox" ${audioInfo.selected ? 'checked' : ''}>
                    ${audioInfo.index}. ${audioInfo.title}
                </label>
            `;

            const meta = document.createElement('div');
            meta.className = 'wx-audio-meta';
            meta.innerHTML = `时长: ${audioInfo.duration} | ${audioInfo.url ? '✅ URL已获取' : '❌ URL未获取'}`;

            const controls = document.createElement('div');
            controls.className = 'wx-audio-controls';

            // 播放按钮
            if (audioInfo.element) {
                const playBtn = document.createElement('button');
                playBtn.className = 'wx-play-btn';
                playBtn.textContent = '播放';
                playBtn.addEventListener('click', () => {
                    audioInfo.element.play();
                });
                controls.appendChild(playBtn);
            }

            // 单独下载按钮
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'wx-download-btn';
            downloadBtn.textContent = '下载';
            downloadBtn.disabled = !audioInfo.url;
            downloadBtn.addEventListener('click', () => {
                downloadAudio(audioInfo);
            });
            controls.appendChild(downloadBtn);

            // 复选框事件
            const checkbox = title.querySelector('.wx-audio-checkbox');
            checkbox.addEventListener('change', (e) => {
                toggleAudioSelection(index, e.target.checked);
            });

            item.appendChild(title);
            item.appendChild(meta);
            item.appendChild(controls);
            content.appendChild(item);
        });

        panel.appendChild(header);
        panel.appendChild(content);

        // 全选复选框事件
        const selectAllCheckbox = selectAllDiv.querySelector('.wx-select-all-checkbox');
        selectAllCheckbox.addEventListener('change', (e) => {
            toggleSelectAll(e.target.checked);
        });

        // 关闭按钮事件
        header.querySelector('.wx-panel-close').addEventListener('click', () => {
            panel.remove();
        });

        document.body.appendChild(panel);
    }

    // 初始化
    async function init() {
        try {
            console.log('微信公众号音频下载助手启动...');

            // 等待页面基本加载完成
            await waitForElement('body', 5000);

            // 等待一段时间让音频组件加载
            await new Promise(resolve => setTimeout(resolve, 2000));

            console.log('开始提取音频信息...');
            await extractAudioInfo();

            if (audioList.length > 0) {
                console.log(`成功找到 ${audioList.length} 个音频文件`);
                createDownloadPanel();
                showStatus(`发现 ${audioList.length} 个音频文件`, 'success');
            } else {
                console.log('未找到音频文件');
                // 仍然创建面板，显示未找到音频的状态
                audioList = []; // 确保数组为空
                createDownloadPanel();
                showStatus('❌ 未找到音频文件，可能需要手动播放音频后重试', 'error');
            }

        } catch (error) {
            console.error('初始化失败:', error);
        }
    }

    // 页面加载完成后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 添加手动刷新功能
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '🔄 刷新音频';
    refreshBtn.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: #007bff;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        z-index: 10000;
        font-size: 12px;
    `;
    refreshBtn.addEventListener('click', () => {
        const existingPanel = document.querySelector('.wx-audio-download-panel');
        if (existingPanel) {
            existingPanel.remove();
        }
        init();
    });
    document.body.appendChild(refreshBtn);

})();
