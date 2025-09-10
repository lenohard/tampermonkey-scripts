// ==UserScript==
// @name         爱发电音频下载助手
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  从爱发电专辑页面提取音频并提供下载功能
// @author       Your name
// @match        https://afdian.com/album/*
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    let audioList = [];
    let albumTitle = '';
    let parentFolderName = '';

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
        .audio-download-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 400px;
            max-height: 600px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            overflow: hidden;
        }

        .panel-header {
            background: #f5f5f5;
            padding: 15px;
            border-bottom: 1px solid #ddd;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .panel-close {
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #666;
        }

        .panel-content {
            max-height: 500px;
            overflow-y: auto;
            padding: 15px;
        }

        .audio-item {
            margin-bottom: 15px;
            padding: 10px;
            border: 1px solid #eee;
            border-radius: 4px;
            background: #fafafa;
        }

        .audio-title {
            font-weight: bold;
            margin-bottom: 8px;
            color: #333;
        }

        .audio-controls {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .download-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .download-btn:hover {
            background: #0056b3;
        }

        .download-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
        }

        .play-btn {
            background: #28a745;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .play-btn:hover {
            background: #1e7e34;
        }

        .batch-download {
            background: #dc3545;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 15px;
        }

        .batch-download:hover {
            background: #c82333;
        }

        .status-message {
            padding: 10px;
            margin-bottom: 10px;
            border-radius: 4px;
            font-size: 14px;
        }

        .status-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .status-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .status-info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
    `;
    document.head.appendChild(style);

    // 显示状态消息
    function showStatus(message, type = 'info') {
        const statusDiv = document.createElement('div');
        statusDiv.className = `status-message status-${type}`;
        statusDiv.textContent = message;

        const panelContent = document.querySelector('.panel-content');
        if (panelContent) {
            panelContent.insertBefore(statusDiv, panelContent.firstChild);
            setTimeout(() => {
                if (statusDiv.parentNode) {
                    statusDiv.remove();
                }
            }, 3000);
        }
    }

    // 获取父文件夹名称
    function getParentFolderName() {
        try {
            const parentElement = document.querySelector('#app > div.wrapper.app-view > div > section.page-content-w100 > div > div.content-left.max-width-320 > div > section > div.flex-box.flex-center.flex-align-items-center.mt16 > div > div.flex-box.flex-justify-content-center.flex-direction-column.avatar-content.flex-item-1 > div.user-name.flex-box.flex-justify-content-space-between.flex-align-items-center > span > a');
            return parentElement ? parentElement.textContent.trim() : '未知作者';
        } catch (error) {
            console.error('获取父文件夹名称失败:', error);
            return '未知作者';
        }
    }

    // 获取专辑标题
    function getAlbumTitle() {
        try {
            const albumElement = document.querySelector('#app > div.wrapper.app-view > div > section.page-content-w100 > div > div.content-left.max-width-320 > div > section > a');
            return albumElement ? albumElement.textContent.trim() : '未知专辑';
        } catch (error) {
            console.error('获取专辑标题失败:', error);
            return '未知专辑';
        }
    }

    // 提取音频信息
    function extractAudioInfo() {
        audioList = [];
        parentFolderName = getParentFolderName();
        albumTitle = getAlbumTitle();

        try {
            const feedContainer = document.querySelector('.vm-block-feed');
            if (!feedContainer) {
                console.error('未找到音频容器');
                return;
            }

            const feeds = feedContainer.querySelectorAll('.vm-feed');
            console.log(`找到 ${feeds.length} 个音频项目`);

            feeds.forEach((feed, index) => {
                try {
                    // 获取标题
                    const titleElement = feed.querySelector('.title-box.fwb > span');
                    const title = titleElement ? titleElement.textContent.trim() : `音频 ${index + 1}`;

                    // 获取音频元素 - 使用更灵活的查找方式
                    let audioElement = null;
                    
                    // 尝试多种选择器
                    const selectors = [
                        '.vm-audio-player audio',
                        'audio',
                        '[data-v-*] audio', // 匹配带data-v属性的容器内的audio
                        'source[type="audio/mpeg"]', // 直接找source元素
                        'source[src*=".mp3"]'
                    ];

                    for (const selector of selectors) {
                        const element = feed.querySelector(selector);
                        if (element && (element.src || (element.tagName === 'SOURCE' && element.src))) {
                            audioElement = element;
                            break;
                        }
                    }

                    // 如果没找到，尝试在feed的子元素中查找
                    if (!audioElement) {
                        const allAudios = feed.querySelectorAll('audio');
                        if (allAudios.length > 0) {
                            audioElement = allAudios[0];
                        }
                    }

                    // 如果找到音频元素且有src，添加到列表
                    if (audioElement && (audioElement.src || (audioElement.tagName === 'SOURCE' && audioElement.src))) {
                        const audioUrl = audioElement.src || (audioElement.tagName === 'SOURCE' ? audioElement.src : null);
                        if (audioUrl) {
                            audioList.push({
                                title: title,
                                url: audioUrl,
                                element: audioElement,
                                index: index + 1
                            });
                        }
                    } else {
                        console.warn(`第 ${index + 1} 个项目未找到音频元素或src:`, feed.innerHTML);
                    }
                } catch (error) {
                    console.error(`处理第 ${index + 1} 个音频项目时出错:`, error);
                }
            });

            console.log(`成功提取 ${audioList.length} 个音频`);
        } catch (error) {
            console.error('提取音频信息失败:', error);
        }
    }

    // 下载单个音频（同步版本，用于单独下载）
    function downloadAudio(audioInfo) {
        try {
            const sanitizedParentFolder = parentFolderName.replace(/[\/\\:*?"<>|]/g, '-');
            const sanitizedAlbumTitle = albumTitle.replace(/[\/\\:*?"<>|]/g, '-');
            const sanitizedTitle = audioInfo.title.replace(/[\/\\:*?"<>|]/g, '-');
            const filename = `爱发电音频/${sanitizedParentFolder}/${sanitizedAlbumTitle}/${sanitizedTitle}.mp3`;

            showStatus(`开始下载: ${audioInfo.title}`, 'info');

            GM_download({
                url: audioInfo.url,
                name: filename,
                saveAs: false,
                onload: function() {
                    showStatus(`✅ 下载完成: ${audioInfo.title}`, 'success');
                    showStatus(`📁 保存位置: 下载文件夹/爱发电音频/${sanitizedParentFolder}/${sanitizedAlbumTitle}/`, 'info');
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

    // 下载单个音频（异步版本，用于批量下载）
    function downloadAudioAsync(audioInfo) {
        return new Promise((resolve, reject) => {
            try {
                const sanitizedParentFolder = parentFolderName.replace(/[\/\\:*?"<>|]/g, '-');
                const sanitizedAlbumTitle = albumTitle.replace(/[\/\\:*?"<>|]/g, '-');
                const sanitizedTitle = audioInfo.title.replace(/[\/\\:*?"<>|]/g, '-');
                const filename = `爱发电音频/${sanitizedParentFolder}/${sanitizedAlbumTitle}/${sanitizedTitle}.mp3`;

                GM_download({
                    url: audioInfo.url,
                    name: filename,
                    saveAs: false,
                    onload: function() {
                        showStatus(`✅ 下载完成: ${audioInfo.title}`, 'success');
                        resolve();
                    },
                    onerror: function(error) {
                        showStatus(`❌ 下载失败: ${audioInfo.title} - ${error.message}`, 'error');
                        console.error('下载错误详情:', error);
                        resolve(); // 即使失败也继续下一个
                    }
                });
            } catch (error) {
                showStatus(`❌ 下载出错: ${audioInfo.title} - ${error.message}`, 'error');
                console.error('下载异常:', error);
                resolve(); // 即使出错也继续下一个
            }
        });
    }

    // 批量下载所有音频
    async function batchDownload() {
        if (audioList.length === 0) {
            showStatus('❌ 没有找到可下载的音频', 'error');
            return;
        }

        const sanitizedParentFolder = parentFolderName.replace(/[\/\\:*?"<>|]/g, '-');
        const sanitizedAlbumTitle = albumTitle.replace(/[\/\\:*?"<>|]/g, '-');
        showStatus(`🚀 开始批量下载 ${audioList.length} 个音频...`, 'info');
        showStatus(`📁 文件将保存到: 下载文件夹/爱发电音频/${sanitizedParentFolder}/${sanitizedAlbumTitle}/`, 'info');

        for (let i = 0; i < audioList.length; i++) {
            const audioInfo = audioList[i];
            showStatus(`⏬ 正在下载 (${i + 1}/${audioList.length}): ${audioInfo.title}`, 'info');

            // 等待当前下载完成再开始下一个
            await downloadAudioAsync(audioInfo);

            // 下载完成后等待2秒再开始下一个
            if (i < audioList.length - 1) {
                showStatus(`⏳ 等待2秒后下载下一个...`, 'info');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        showStatus(`🎉 所有音频下载完成！`, 'success');
    }

    // 创建下载面板
    function createDownloadPanel() {
        const panel = document.createElement('div');
        panel.className = 'audio-download-panel';

        const header = document.createElement('div');
        header.className = 'panel-header';
        header.innerHTML = `
            <span>音频下载助手 (${parentFolderName} - ${albumTitle})</span>
            <button class="panel-close">&times;</button>
        `;

        const content = document.createElement('div');
        content.className = 'panel-content';

        // 下载路径提示
        const pathInfo = document.createElement('div');
        pathInfo.className = 'status-message status-info';
        pathInfo.innerHTML = `📁 下载路径: 浏览器下载文件夹/爱发电音频/${parentFolderName.replace(/[\/\\:*?"<>|]/g, '-')}/${albumTitle.replace(/[\/\\:*?"<>|]/g, '-')}/`;
        content.appendChild(pathInfo);

        // 批量下载按钮
        const batchBtn = document.createElement('button');
        batchBtn.className = 'batch-download';
        batchBtn.textContent = `🚀 批量下载全部 (${audioList.length} 个音频)`;
        batchBtn.addEventListener('click', batchDownload);
        content.appendChild(batchBtn);

        // 打开下载文件夹按钮
        const openFolderBtn = document.createElement('button');
        openFolderBtn.className = 'batch-download';
        openFolderBtn.style.backgroundColor = '#28a745';
        openFolderBtn.textContent = '📂 打开下载文件夹';
        openFolderBtn.addEventListener('click', () => {
            showStatus('💡 请按 Ctrl+Shift+J 打开开发者工具，然后在控制台输入以下命令:', 'info');
            showStatus('chrome://downloads/ (复制到地址栏打开)', 'info');
        });
        content.appendChild(openFolderBtn);

        // 音频列表
        audioList.forEach((audioInfo, index) => {
            const item = document.createElement('div');
            item.className = 'audio-item';

            const title = document.createElement('div');
            title.className = 'audio-title';
            title.textContent = `${audioInfo.index}. ${audioInfo.title}`;

            const controls = document.createElement('div');
            controls.className = 'audio-controls';

            const playBtn = document.createElement('button');
            playBtn.className = 'play-btn';
            playBtn.textContent = '播放';
            playBtn.addEventListener('click', () => {
                if (audioInfo.element) {
                    audioInfo.element.play();
                }
            });

            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'download-btn';
            downloadBtn.textContent = '下载';
            downloadBtn.addEventListener('click', () => {
                downloadAudio(audioInfo);
            });

            controls.appendChild(playBtn);
            controls.appendChild(downloadBtn);

            item.appendChild(title);
            item.appendChild(controls);
            content.appendChild(item);
        });

        panel.appendChild(header);
        panel.appendChild(content);

        // 关闭按钮事件
        header.querySelector('.panel-close').addEventListener('click', () => {
            panel.remove();
        });

        document.body.appendChild(panel);
    }

    // 自动滚动到页面底部以触发懒加载
    async function scrollToLoadAll() {
        return new Promise((resolve) => {
            let lastHeight = document.body.scrollHeight;
            let scrollCount = 0;
            const maxScrolls = 20; // 最大滚动次数，防止无限循环

            console.log(`初始页面高度: ${lastHeight}px`);

            function scroll() {
                // 滚动到页面底部
                const currentScrollY = window.scrollY;
                const targetScrollY = document.body.scrollHeight;
                console.log(`滚动前位置: ${currentScrollY}px, 滚动到: ${targetScrollY}px`);
                
                window.scrollTo(0, targetScrollY);
                
                setTimeout(() => {
                    const newHeight = document.body.scrollHeight;
                    const currentScroll = window.scrollY;
                    scrollCount++;
                    
                    console.log(`第 ${scrollCount} 次滚动后 - 页面高度: ${newHeight}px, 当前滚动位置: ${currentScroll}px`);
                    
                    // 如果页面高度没有变化或达到最大滚动次数，说明已经加载完成
                    if (newHeight === lastHeight || scrollCount >= maxScrolls) {
                        console.log(`滚动完成，共滚动 ${scrollCount} 次，最终页面高度: ${newHeight}px`);
                        // 滚动回顶部
                        window.scrollTo(0, 0);
                        console.log('已滚动回顶部');
                        resolve();
                    } else {
                        lastHeight = newHeight;
                        console.log(`继续滚动，页面高度增加了 ${newHeight - lastHeight}px`);
                        scroll();
                    }
                }, 1500); // 等待1.5秒让内容加载
            }

            scroll();
        });
    }

    // 初始化
    async function init() {
        try {
            console.log('爱发电音频下载助手启动...');

            // 等待页面加载完成
            await waitForElement('.vm-block-feed', 15000);

            // 自动滚动加载所有内容
            console.log('开始滚动页面以加载所有音频...');
            console.log('当前URL:', window.location.href);
            
            await scrollToLoadAll();

            // 等待一下让最后的音频元素完全加载
            setTimeout(() => {
                console.log('滚动完成，开始提取音频信息...');
                extractAudioInfo();

                if (audioList.length > 0) {
                    console.log(`成功提取 ${audioList.length} 个音频文件`);
                    createDownloadPanel();
                    showStatus(`发现 ${audioList.length} 个音频文件`, 'success');
                } else {
                    console.log('未找到音频文件，检查页面结构...');
                    console.log('音频容器元素:', document.querySelector('.vm-block-feed'));
                    console.log('音频feed元素:', document.querySelectorAll('.vm-feed').length);
                }
            }, 2000);

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
})();


