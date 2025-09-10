// ==UserScript==
// @name         YouTube视频音频下载助手
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  从YouTube页面下载视频或提取音频(MP3格式)
// @author       Your name
// @match        https://www.youtube.com/watch*
// @match        https://youtube.com/watch*
// @match        https://m.youtube.com/watch*
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// ==/UserScript==

(function() {
    'use strict';

    let videoInfo = {};
    let downloadPanel = null;

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
        .yt-download-panel {
            position: fixed;
            top: 80px;
            right: 20px;
            width: 350px;
            max-height: 500px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            z-index: 9999;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .yt-panel-header {
            background: linear-gradient(135deg, #ff0000, #cc0000);
            color: white;
            padding: 16px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
        }

        .yt-panel-close {
            background: none;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background-color 0.2s;
        }

        .yt-panel-close:hover {
            background-color: rgba(255,255,255,0.2);
        }

        .yt-panel-content {
            padding: 20px;
            max-height: 400px;
            overflow-y: auto;
        }

        .yt-video-info {
            margin-bottom: 20px;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #ff0000;
        }

        .yt-video-title {
            font-weight: bold;
            margin-bottom: 8px;
            color: #333;
            font-size: 13px;
            line-height: 1.4;
        }

        .yt-video-channel {
            color: #666;
            font-size: 12px;
            margin-bottom: 4px;
        }

        .yt-video-duration {
            color: #888;
            font-size: 11px;
        }

        .yt-download-section {
            margin-bottom: 20px;
        }

        .yt-section-title {
            font-weight: bold;
            margin-bottom: 12px;
            color: #333;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .yt-download-option {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            margin-bottom: 8px;
            background: #f8f9fa;
            border-radius: 6px;
            border: 1px solid #e9ecef;
            transition: all 0.2s;
        }

        .yt-download-option:hover {
            background: #e9ecef;
            border-color: #dee2e6;
        }

        .yt-option-info {
            flex: 1;
        }

        .yt-option-label {
            font-weight: 500;
            color: #333;
            font-size: 13px;
        }

        .yt-option-desc {
            color: #666;
            font-size: 11px;
            margin-top: 2px;
        }

        .yt-download-btn {
            background: #ff0000;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
            min-width: 60px;
        }

        .yt-download-btn:hover {
            background: #cc0000;
            transform: translateY(-1px);
        }

        .yt-download-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
            transform: none;
        }

        .yt-audio-btn {
            background: #28a745;
        }

        .yt-audio-btn:hover {
            background: #218838;
        }

        .yt-status-message {
            padding: 12px;
            margin-bottom: 12px;
            border-radius: 6px;
            font-size: 12px;
            line-height: 1.4;
        }

        .yt-status-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .yt-status-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .yt-status-info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }

        .yt-status-warning {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }

        .yt-external-link {
            display: block;
            width: 100%;
            padding: 12px;
            background: #007bff;
            color: white;
            text-decoration: none;
            text-align: center;
            border-radius: 6px;
            font-weight: 500;
            font-size: 13px;
            margin-top: 12px;
            transition: background-color 0.2s;
        }

        .yt-external-link:hover {
            background: #0056b3;
            color: white;
            text-decoration: none;
        }

        .yt-trigger-btn {
            position: fixed;
            top: 120px;
            right: 20px;
            width: 50px;
            height: 50px;
            background: #ff0000;
            color: white;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            font-size: 18px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9998;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .yt-trigger-btn:hover {
            background: #cc0000;
            transform: scale(1.1);
        }
    `;
    document.head.appendChild(style);

    // 显示状态消息
    function showStatus(message, type = 'info') {
        const panelContent = document.querySelector('.yt-panel-content');
        if (!panelContent) return;

        // 移除旧的状态消息
        const oldStatus = panelContent.querySelector('.yt-status-message');
        if (oldStatus) {
            oldStatus.remove();
        }

        const statusDiv = document.createElement('div');
        statusDiv.className = `yt-status-message yt-status-${type}`;
        statusDiv.textContent = message;

        panelContent.insertBefore(statusDiv, panelContent.firstChild);

        // 3秒后自动移除
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.remove();
            }
        }, 3000);
    }

    // 获取视频信息
    function getVideoInfo() {
        try {
            const url = window.location.href;
            const videoId = new URLSearchParams(new URL(url).search).get('v');
            
            if (!videoId) {
                throw new Error('无法获取视频ID');
            }

            // 获取视频标题
            const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string') ||
                                document.querySelector('h1.title') ||
                                document.querySelector('.watch-main-col h1');
            const title = titleElement ? titleElement.textContent.trim() : '未知标题';

            // 获取频道名称
            const channelElement = document.querySelector('#owner-name a') ||
                                 document.querySelector('.ytd-channel-name a') ||
                                 document.querySelector('#channel-name a');
            const channel = channelElement ? channelElement.textContent.trim() : '未知频道';

            // 获取视频时长
            const durationElement = document.querySelector('.ytp-time-duration') ||
                                  document.querySelector('span.ytd-thumbnail-overlay-time-status-renderer');
            const duration = durationElement ? durationElement.textContent.trim() : '未知时长';

            return {
                videoId,
                title,
                channel,
                duration,
                url
            };
        } catch (error) {
            console.error('获取视频信息失败:', error);
            return null;
        }
    }

    // 获取视频流URL
    function getVideoStreamUrls() {
        try {
            // 尝试从ytInitialPlayerResponse获取视频流信息
            const scripts = document.querySelectorAll('script');
            let playerResponse = null;

            for (let script of scripts) {
                const content = script.textContent;
                if (content.includes('ytInitialPlayerResponse')) {
                    const match = content.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
                    if (match) {
                        try {
                            playerResponse = JSON.parse(match[1]);
                            break;
                        } catch (e) {
                            continue;
                        }
                    }
                }
            }

            if (!playerResponse) {
                throw new Error('无法获取播放器响应数据');
            }

            const streamingData = playerResponse.streamingData;
            if (!streamingData) {
                throw new Error('无法获取流媒体数据');
            }

            const formats = [];
            
            // 获取视频+音频格式
            if (streamingData.formats) {
                streamingData.formats.forEach(format => {
                    if (format.url) {
                        formats.push({
                            url: format.url,
                            quality: format.qualityLabel || format.quality || '未知',
                            mimeType: format.mimeType || 'video/mp4',
                            hasVideo: true,
                            hasAudio: true,
                            filesize: format.contentLength || 0
                        });
                    }
                });
            }

            // 获取自适应格式（分离的视频和音频）
            if (streamingData.adaptiveFormats) {
                streamingData.adaptiveFormats.forEach(format => {
                    if (format.url) {
                        const isVideo = format.mimeType && format.mimeType.startsWith('video/');
                        const isAudio = format.mimeType && format.mimeType.startsWith('audio/');
                        
                        formats.push({
                            url: format.url,
                            quality: format.qualityLabel || format.quality || (isAudio ? '音频' : '未知'),
                            mimeType: format.mimeType || (isAudio ? 'audio/mp4' : 'video/mp4'),
                            hasVideo: isVideo,
                            hasAudio: isAudio,
                            filesize: format.contentLength || 0
                        });
                    }
                });
            }

            return formats;
        } catch (error) {
            console.error('获取视频流URL失败:', error);
            return [];
        }
    }

    // 直接下载视频
    function downloadVideoDirectly(streamUrl, quality, mimeType) {
        try {
            const videoTitle = videoInfo.title.replace(/[\/\\:*?"<>|]/g, '-');
            const extension = mimeType.includes('audio/') ? 'mp3' : 
                            mimeType.includes('webm') ? 'webm' : 'mp4';
            const filename = `YouTube_${videoTitle}_${quality}.${extension}`;

            showStatus(`开始下载: ${quality}`, 'info');

            GM_download({
                url: streamUrl,
                name: filename,
                saveAs: true,
                onload: function() {
                    showStatus(`✅ 下载完成: ${filename}`, 'success');
                },
                onerror: function(error) {
                    showStatus(`❌ 下载失败: ${error.message || '未知错误'}`, 'error');
                    console.error('下载错误:', error);
                },
                onprogress: function(progress) {
                    if (progress.lengthComputable) {
                        const percent = Math.round((progress.loaded / progress.total) * 100);
                        showStatus(`下载进度: ${percent}%`, 'info');
                    }
                }
            });
        } catch (error) {
            showStatus(`❌ 下载出错: ${error.message}`, 'error');
            console.error('下载异常:', error);
        }
    }

    // 使用外部服务下载（备用方案）
    function downloadWithExternalService(videoId, format = 'mp4') {
        const services = {
            y2mate: `https://www.y2mate.com/youtube/${videoId}`,
            savefrom: `https://savefrom.net/1-how-to-download-youtube-video/?url=https://www.youtube.com/watch?v=${videoId}`,
        };

        GM_openInTab(services.y2mate, { active: true });
        showStatus('已打开 Y2mate 下载页面，请选择所需格式进行下载', 'success');
    }

    // 监听视频播放，自动保存功能
    function setupAutoSave() {
        const video = document.querySelector('video');
        if (!video) return;

        let isRecording = false;
        let mediaRecorder = null;
        let recordedChunks = [];

        // 创建自动保存控制按钮
        const autoSaveBtn = document.createElement('button');
        autoSaveBtn.className = 'yt-download-btn';
        autoSaveBtn.style.position = 'fixed';
        autoSaveBtn.style.top = '180px';
        autoSaveBtn.style.right = '20px';
        autoSaveBtn.style.zIndex = '9999';
        autoSaveBtn.textContent = '🔴 开始录制';
        autoSaveBtn.title = '录制当前播放的视频';

        autoSaveBtn.addEventListener('click', () => {
            if (!isRecording) {
                startRecording();
            } else {
                stopRecording();
            }
        });

        function startRecording() {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = video.videoWidth || 1280;
                canvas.height = video.videoHeight || 720;

                const stream = canvas.captureStream(30);
                
                // 添加音频轨道
                if (video.captureStream) {
                    const videoStream = video.captureStream();
                    const audioTracks = videoStream.getAudioTracks();
                    audioTracks.forEach(track => stream.addTrack(track));
                }

                mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'video/webm;codecs=vp9'
                });

                recordedChunks = [];

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        recordedChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    const blob = new Blob(recordedChunks, { type: 'video/webm' });
                    const url = URL.createObjectURL(blob);
                    const videoTitle = videoInfo.title.replace(/[\/\\:*?"<>|]/g, '-');
                    const filename = `YouTube_录制_${videoTitle}.webm`;

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();

                    URL.revokeObjectURL(url);
                    showStatus(`✅ 录制完成: ${filename}`, 'success');
                };

                // 绘制视频帧到canvas
                function drawFrame() {
                    if (isRecording) {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        requestAnimationFrame(drawFrame);
                    }
                }

                mediaRecorder.start();
                isRecording = true;
                autoSaveBtn.textContent = '⏹️ 停止录制';
                autoSaveBtn.style.background = '#dc3545';
                drawFrame();
                showStatus('🔴 开始录制视频...', 'info');

            } catch (error) {
                showStatus(`❌ 录制失败: ${error.message}`, 'error');
                console.error('录制错误:', error);
            }
        }

        function stopRecording() {
            if (mediaRecorder && isRecording) {
                mediaRecorder.stop();
                isRecording = false;
                autoSaveBtn.textContent = '🔴 开始录制';
                autoSaveBtn.style.background = '#ff0000';
                showStatus('⏹️ 录制已停止', 'info');
            }
        }

        document.body.appendChild(autoSaveBtn);
    }

    // 复制视频链接
    function copyVideoLink() {
        const url = videoInfo.url;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                showStatus('✅ 视频链接已复制到剪贴板', 'success');
            }).catch(() => {
                showStatus('❌ 复制失败，请手动复制链接', 'error');
            });
        } else {
            // 降级方案
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showStatus('✅ 视频链接已复制到剪贴板', 'success');
            } catch (err) {
                showStatus('❌ 复制失败，请手动复制链接', 'error');
            }
            document.body.removeChild(textArea);
        }
    }

    // 创建下载面板
    function createDownloadPanel() {
        if (downloadPanel) {
            downloadPanel.remove();
        }

        videoInfo = getVideoInfo();
        if (!videoInfo) {
            console.error('无法获取视频信息');
            return;
        }

        const panel = document.createElement('div');
        panel.className = 'yt-download-panel';

        const header = document.createElement('div');
        header.className = 'yt-panel-header';
        header.innerHTML = `
            <span>📥 YouTube下载助手</span>
            <button class="yt-panel-close">&times;</button>
        `;

        const content = document.createElement('div');
        content.className = 'yt-panel-content';

        // 视频信息
        const videoInfoDiv = document.createElement('div');
        videoInfoDiv.className = 'yt-video-info';
        videoInfoDiv.innerHTML = `
            <div class="yt-video-title">${videoInfo.title}</div>
            <div class="yt-video-channel">📺 ${videoInfo.channel}</div>
            <div class="yt-video-duration">⏱️ ${videoInfo.duration}</div>
        `;
        content.appendChild(videoInfoDiv);

        // 重要提示
        const warningDiv = document.createElement('div');
        warningDiv.className = 'yt-status-message yt-status-warning';
        warningDiv.innerHTML = `
            ⚠️ <strong>重要提示:</strong><br>
            • 请遵守YouTube服务条款<br>
            • 仅供个人学习使用<br>
            • 不得用于商业用途
        `;
        content.appendChild(warningDiv);

        // 获取可用的视频流
        const availableStreams = getVideoStreamUrls();
        
        // 直接下载选项
        const directSection = document.createElement('div');
        directSection.className = 'yt-download-section';
        directSection.innerHTML = `
            <div class="yt-section-title">⚡ 直接下载</div>
        `;

        if (availableStreams.length > 0) {
            // 按质量分组
            const videoStreams = availableStreams.filter(s => s.hasVideo && s.hasAudio);
            const audioStreams = availableStreams.filter(s => s.hasAudio && !s.hasVideo);

            // 视频流（包含音频）
            if (videoStreams.length > 0) {
                videoStreams.slice(0, 3).forEach(stream => {
                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'yt-download-option';
                    optionDiv.innerHTML = `
                        <div class="yt-option-info">
                            <div class="yt-option-label">📹 ${stream.quality} 视频</div>
                            <div class="yt-option-desc">包含音频 • ${(stream.filesize / 1024 / 1024).toFixed(1)}MB</div>
                        </div>
                    `;
                    
                    const downloadBtn = document.createElement('button');
                    downloadBtn.className = 'yt-download-btn';
                    downloadBtn.textContent = '直接下载';
                    downloadBtn.addEventListener('click', () => {
                        downloadVideoDirectly(stream.url, stream.quality, stream.mimeType);
                    });
                    
                    optionDiv.appendChild(downloadBtn);
                    directSection.appendChild(optionDiv);
                });
            }

            // 纯音频流
            if (audioStreams.length > 0) {
                const bestAudio = audioStreams[0];
                const optionDiv = document.createElement('div');
                optionDiv.className = 'yt-download-option';
                optionDiv.innerHTML = `
                    <div class="yt-option-info">
                        <div class="yt-option-label">🎵 ${bestAudio.quality} 音频</div>
                        <div class="yt-option-desc">纯音频文件 • ${(bestAudio.filesize / 1024 / 1024).toFixed(1)}MB</div>
                    </div>
                `;
                
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'yt-download-btn yt-audio-btn';
                downloadBtn.textContent = '直接下载';
                downloadBtn.addEventListener('click', () => {
                    downloadVideoDirectly(bestAudio.url, bestAudio.quality, bestAudio.mimeType);
                });
                
                optionDiv.appendChild(downloadBtn);
                directSection.appendChild(optionDiv);
            }
        } else {
            const noStreamDiv = document.createElement('div');
            noStreamDiv.className = 'yt-status-message yt-status-warning';
            noStreamDiv.textContent = '⚠️ 无法获取直接下载链接，请使用外部服务';
            directSection.appendChild(noStreamDiv);
        }

        content.appendChild(directSection);

        // 外部服务下载选项
        const externalSection = document.createElement('div');
        externalSection.className = 'yt-download-section';
        externalSection.innerHTML = `
            <div class="yt-section-title">🌐 外部服务下载</div>
        `;

        const externalOptions = [
            { label: '高清视频 (MP4)', desc: '1080p/720p 高质量视频', format: 'mp4', quality: 'high' },
            { label: '标清视频 (MP4)', desc: '480p/360p 标准质量', format: 'mp4', quality: 'medium' },
            { label: '高品质音频 (MP3)', desc: '320kbps 高音质', format: 'mp3', quality: 'high' }
        ];

        externalOptions.forEach(option => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'yt-download-option';
            optionDiv.innerHTML = `
                <div class="yt-option-info">
                    <div class="yt-option-label">${option.label}</div>
                    <div class="yt-option-desc">${option.desc}</div>
                </div>
            `;
            
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'yt-download-btn';
            downloadBtn.style.background = '#6c757d';
            downloadBtn.textContent = '外部下载';
            downloadBtn.addEventListener('click', () => {
                downloadWithExternalService(videoInfo.videoId, option.format);
            });
            
            optionDiv.appendChild(downloadBtn);
            externalSection.appendChild(optionDiv);
        });

        content.appendChild(externalSection);

        // 录制功能选项
        const recordSection = document.createElement('div');
        recordSection.className = 'yt-download-section';
        recordSection.innerHTML = `
            <div class="yt-section-title">🔴 实时录制</div>
        `;

        const recordOptionDiv = document.createElement('div');
        recordOptionDiv.className = 'yt-download-option';
        recordOptionDiv.innerHTML = `
            <div class="yt-option-info">
                <div class="yt-option-label">屏幕录制</div>
                <div class="yt-option-desc">录制当前播放的视频内容</div>
            </div>
        `;
        
        const recordBtn = document.createElement('button');
        recordBtn.className = 'yt-download-btn';
        recordBtn.style.background = '#dc3545';
        recordBtn.textContent = '启用录制';
        recordBtn.addEventListener('click', () => {
            setupAutoSave();
            showStatus('✅ 录制功能已启用，请查看右侧录制按钮', 'success');
        });
        
        recordOptionDiv.appendChild(recordBtn);
        recordSection.appendChild(recordOptionDiv);
        content.appendChild(recordSection);

        // 外部工具链接
        const externalLinksDiv = document.createElement('div');
        externalLinksDiv.innerHTML = `
            <a href="https://www.y2mate.com/youtube/${videoInfo.videoId}" target="_blank" class="yt-external-link">
                🔗 使用 Y2mate 在线下载
            </a>
        `;
        content.appendChild(externalLinksDiv);

        // 复制链接按钮
        const copyLinkBtn = document.createElement('button');
        copyLinkBtn.className = 'yt-download-btn';
        copyLinkBtn.style.width = '100%';
        copyLinkBtn.style.marginTop = '12px';
        copyLinkBtn.style.borderRadius = '6px';
        copyLinkBtn.textContent = '📋 复制视频链接';
        copyLinkBtn.addEventListener('click', copyVideoLink);
        content.appendChild(copyLinkBtn);

        panel.appendChild(header);
        panel.appendChild(content);

        // 关闭按钮事件
        header.querySelector('.yt-panel-close').addEventListener('click', () => {
            panel.remove();
            downloadPanel = null;
        });

        document.body.appendChild(panel);
        downloadPanel = panel;

        // 将函数添加到全局作用域
        window.downloadWithExternalService = downloadWithExternalService;

        showStatus('✅ 下载面板已加载', 'success');
    }

    // 创建触发按钮
    function createTriggerButton() {
        // 移除旧按钮
        const oldBtn = document.querySelector('.yt-trigger-btn');
        if (oldBtn) {
            oldBtn.remove();
        }

        const triggerBtn = document.createElement('button');
        triggerBtn.className = 'yt-trigger-btn';
        triggerBtn.innerHTML = '📥';
        triggerBtn.title = 'YouTube下载助手';
        triggerBtn.addEventListener('click', () => {
            if (downloadPanel) {
                downloadPanel.remove();
                downloadPanel = null;
            } else {
                createDownloadPanel();
            }
        });

        document.body.appendChild(triggerBtn);
    }

    // 检查是否为视频页面
    function isVideoPage() {
        return window.location.pathname === '/watch' && window.location.search.includes('v=');
    }

    // 初始化
    async function init() {
        if (!isVideoPage()) {
            console.log('不是视频页面，跳过初始化');
            return;
        }

        try {
            console.log('YouTube下载助手启动...');

            // 等待页面主要内容加载
            await waitForElement('#movie_player', 10000);

            // 等待一下让页面完全加载
            setTimeout(() => {
                createTriggerButton();
                console.log('YouTube下载助手初始化完成');
            }, 2000);

        } catch (error) {
            console.error('初始化失败:', error);
        }
    }

    // 监听页面变化（YouTube是SPA应用）
    let currentUrl = window.location.href;
    const observer = new MutationObserver(() => {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            
            // 移除旧的UI元素
            const oldPanel = document.querySelector('.yt-download-panel');
            const oldBtn = document.querySelector('.yt-trigger-btn');
            if (oldPanel) oldPanel.remove();
            if (oldBtn) oldBtn.remove();
            
            downloadPanel = null;
            
            // 如果是视频页面，重新初始化
            if (isVideoPage()) {
                setTimeout(init, 1000);
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 页面加载完成后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
