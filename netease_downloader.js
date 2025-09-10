// ==UserScript==
// @name         NetEase Music Download Helper
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Add batch download functionality to NetEase Music with draggable panel and duplicate checking
// @author       Your name
// @match        *://music.163.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      music-api.gdstudio.xyz
// ==/UserScript==

(function() {
    'use strict';

    let lastChecked = null;
    let isDragging = false;
    let startX, startY, initialX, initialY;
    let downloadedSongs = new Set(JSON.parse(GM_getValue('downloadedSongs', '[]')));

    // Wait for the page to be fully loaded
    function waitForElement(selector) {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    // Add CSS styles
    const style = document.createElement('style');
    style.textContent = `
        .song-checkbox {
            margin-right: 5px;
            width: 16px;
            height: 16px;
        }
        .quality-select {
            margin-left: 10px;
            padding: 3px;
            border-radius: 3px;
            border: 1px solid #ccc;
        }
        #download-selected {
            padding: 10px 20px;
            background-color: #c20c0c;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        #download-selected:hover {
            background-color: #a70909;
        }
        .control-panel {
            position: fixed;
            padding: 15px;
            background-color: rgba(255, 255, 255, 0.95);
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: move;
            user-select: none;
        }
        .download-status {
            position: fixed;
            bottom: 80px;
            right: 20px;
            padding: 10px;
            background-color: #333;
            color: white;
            border-radius: 4px;
            z-index: 9999;
        }
        .progress-display {
            font-size: 14px;
            color: #666;
            min-width: 50px;
        }
        .download-success {
            color: #2ecc71 !important;
        }
        .download-failed {
            color: #e74c3c !important;
            position: relative;
        }
        .failed-info {
            display: none;
            position: absolute;
            background: #333;
            color: white;
            padding: 8px;
            border-radius: 4px;
            z-index: 1000;
            white-space: nowrap;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
        }
        .download-failed:hover .failed-info {
            display: block;
        }
        .control-panel {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        .control-button {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            color: white;
        }
        #download-selected {
            background-color: #c20c0c;
        }
        #retry-failed {
            background-color: #e67e22;
        }
        #reset-all {
            background-color: #7f8c8d;
        }
        .control-button:hover {
            opacity: 0.9;
       }
       .range-select-container {
           display: flex;
           align-items: center;
           gap: 5px;
       }
       .range-input {
           width: 40px;
           padding: 3px;
           border-radius: 3px;
           border: 1px solid #ccc;
        }
    `;
    document.head.appendChild(style);

    // Add checkboxes to song rows
    function addCheckboxesToSongs() {
        const songRows = document.querySelectorAll('.m-table tbody tr');
        songRows.forEach((row, index) => {
            if (!row.querySelector('.song-checkbox')) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'song-checkbox';

                // Add shift-click functionality
                checkbox.addEventListener('click', function(e) {
                    if (!lastChecked) {
                        lastChecked = checkbox;
                        return;
                    }

                    if (e.shiftKey) {
                        const checkboxes = Array.from(document.querySelectorAll('.song-checkbox'));
                        const start = checkboxes.indexOf(this);
                        const end = checkboxes.indexOf(lastChecked);

                        checkboxes
                            .slice(Math.min(start, end), Math.max(start, end) + 1)
                            .forEach(cb => cb.checked = lastChecked.checked);
                    }

                    lastChecked = checkbox;
                });

                const firstCell = row.querySelector('td');
                if (firstCell) {
                    firstCell.insertBefore(checkbox, firstCell.firstChild);
                }
            }
        });
    }

    // Show status message
    function showStatus(message) {
        let statusDiv = document.querySelector('.download-status');
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.className = 'download-status';
            document.body.appendChild(statusDiv);
        }
        statusDiv.textContent = message;
        console.log(message);
    }

    // Extract song ID from row
    function extractSongId(row) {
        const playButton = row.querySelector('.ply');
        return playButton?.getAttribute('data-res-id');
    }

    // Reset all selections and colors
    function resetAll() {
        downloadedSongs.clear();
        GM_setValue('downloadedSongs', '[]');
        const checkboxes = document.querySelectorAll('.song-checkbox');
        checkboxes.forEach(checkbox => checkbox.checked = false);

        const titles = document.querySelectorAll('.txt a b');
        titles.forEach(title => {
            title.classList.remove('download-success', 'download-failed');
            const failedInfo = title.querySelector('.failed-info');
            if (failedInfo) {
                failedInfo.remove();
            }
        });

        document.getElementById('progress-display').textContent = '0/0';
        const statusDiv = document.querySelector('.download-status');
        if (statusDiv) statusDiv.remove();
    }

    // Retry failed downloads
    async function retryFailedDownloads() {
        const failedSongs = document.querySelectorAll('.download-failed');
        if (failedSongs.length === 0) {
            showStatus('No failed downloads to retry');
            return;
        }

        failedSongs.forEach(song => {
            const row = song.closest('tr');
            const checkbox = row.querySelector('.song-checkbox');
            if (checkbox) {
                checkbox.checked = true;
            }
        });

        await downloadSelectedSongs(true);
    }

    // Select songs in a given range
    function selectSongRange() {
        const startInput = document.getElementById('range-start');
        const endInput = document.getElementById('range-end');
        const start = parseInt(startInput.value, 10);
        const end = parseInt(endInput.value, 10);

        if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
            showStatus('Invalid range. Please enter valid start and end numbers.');
            return;
        }

        const songRows = document.querySelectorAll('.m-table tbody tr');

        // Check songs in range
        for (let i = start - 1; i < end && i < songRows.length; i++) {
            const row = songRows[i];
            if (row) {
                const checkbox = row.querySelector('.song-checkbox');
                if (checkbox) {
                    checkbox.checked = true;
                }
            }
        }
        showStatus(`Added songs from ${start} to ${end} to selection.`);
        lastChecked = null; // Reset shift-click state to avoid unexpected behavior
    }

    // Download function
    async function downloadSelectedSongs(isRetry = false) {
        const selectedCheckboxes = document.querySelectorAll('.song-checkbox:checked');
        const totalSongs = selectedCheckboxes.length;
        let completedSongs = 0;

        if (totalSongs === 0) {
            showStatus('Please select songs to download');
            return;
        }

        showStatus(`Preparing to download ${totalSongs} songs...`);
        document.getElementById('progress-display').textContent = `0/${totalSongs}`;

        for (const checkbox of selectedCheckboxes) {
            const row = checkbox.closest('tr');
            const songId = extractSongId(row);
            const songName = row.querySelector('.txt a b').getAttribute('title');
            const sanitizedName = songName.replace(/[\/\\]/g, '-');

            // Skip already downloaded songs
            if (downloadedSongs.has(sanitizedName)) {
                const titleElement = row.querySelector('.txt a b');
                if (!titleElement.classList.contains('download-success')) {
                    titleElement.classList.add('download-success');
                    completedSongs++;
                    document.getElementById('progress-display').textContent = `${completedSongs}/${totalSongs}`;
                }
                continue;
            }

            if (!songId) {
                showStatus(`Failed to get ID for song: ${songName}`);
                continue;
            }

            showStatus(`Downloading: ${songName}`);
            console.log(`Attempting to download song ID: ${songId}, Name: ${songName}`);

            try {
                const quality = document.getElementById('quality-select').value;
                const apiUrl = `https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=${songId}&br=${quality}`;

                // Use GM_xmlhttpRequest to fetch the API response
                await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: apiUrl,
                        onload: function(response) {
                            try {
                                const data = JSON.parse(response.responseText);
                                if (data && data.url) {
                                    const cleanUrl = data.url.replace(/\\/g, '');
                                    // Create directory path
                                    console.log(`the url of music is ${cleanUrl}`)
                                    const dirPath = 'netease_music';
                                    // Sanitize filename by replacing '/' with '-'
                                    const sanitizedName = songName.replace(/[\/\\]/g, '-');
                                    GM_download({
                                        url: cleanUrl,
                                        name: `${dirPath}/${sanitizedName}.mp3`,
                                        saveAs: false,
                                        headers: {
                                            "User-Agent": "Mozilla/5.0",
                                        },
                                        onload: function() {
                                            // Update song title color to green
                                            const titleElement = row.querySelector('.txt a b');
                                            titleElement.classList.add('download-success');
                                            completedSongs++;
                                            document.getElementById('progress-display').textContent = `${completedSongs}/${totalSongs}`;
                                            downloadedSongs.add(sanitizedName);
                                            GM_setValue('downloadedSongs', JSON.stringify([...downloadedSongs]));
                                            resolve();
                                        },
                                        onerror: function(error) {
                                            // Update song title color to red
                                            const titleElement = row.querySelector('.txt a b');
                                            titleElement.classList.add('download-failed');
                                            // Add failed info tooltip
                                            const failedInfo = document.createElement('div');
                                            failedInfo.className = 'failed-info';
                                            failedInfo.textContent = `Error: ${error.message || 'Download failed'}`;
                                            titleElement.appendChild(failedInfo);
                                            completedSongs++;
                                            document.getElementById('progress-display').textContent = `${completedSongs}/${totalSongs}`;
                                            reject(error);
                                        }
                                    });
                                } else {
                                    reject(new Error('No download URL found'));
                                }
                            } catch (error) {
                                reject(error);
                            }
                        },
                        onerror: function(error) {
                            reject(error);
                        }
                    });
                });

                await new Promise(resolve => setTimeout(resolve, 1500)); // Increased delay between downloads
            } catch (error) {
                console.error(`Failed to download ${songName}:`, error);
                showStatus(`Failed to download: ${songName}`);
            }
        }

        showStatus('Download complete!');
        setTimeout(() => {
            const statusDiv = document.querySelector('.download-status');
            if (statusDiv) statusDiv.remove();
        }, 3000);
    }

    // Make panel draggable
    function makePanelDraggable(panel) {
        panel.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);

        // Load saved position
        const savedPosition = JSON.parse(GM_getValue('panelPosition', '{"x":20,"y":20}'));
        panel.style.left = `${savedPosition.x}px`;
        panel.style.top = `${savedPosition.y}px`;

        function startDrag(e) {
            if (e.target.closest('button, select')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = parseFloat(panel.style.left) || 0;
            initialY = parseFloat(panel.style.top) || 0;
        }

        function drag(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            panel.style.left = `${initialX + dx}px`;
            panel.style.top = `${initialY + dy}px`;
        }

        function stopDrag() {
            if (!isDragging) return;
            isDragging = false;
            GM_setValue('panelPosition', JSON.stringify({
                x: parseFloat(panel.style.left),
                y: parseFloat(panel.style.top)
            }));
        }
    }

    // Add control panel with quality selector and download button
    function addDownloadButton() {
        if (!document.getElementById('control-panel')) {
            const controlPanel = document.createElement('div');
            controlPanel.id = 'control-panel';
            controlPanel.className = 'control-panel';

            // Create quality selector
            const qualitySelect = document.createElement('select');
            qualitySelect.className = 'quality-select';
            qualitySelect.id = 'quality-select';

            const qualities = [
                { value: '128', text: '128kbps' },
                { value: '192', text: '192kbps' },
                { value: '320', text: '320kbps' },
                { value: '740', text: 'FLAC' },
                { value: '999', text: 'Hi-Res' }
            ];

            qualities.forEach(quality => {
                const option = document.createElement('option');
                option.value = quality.value;
                option.textContent = quality.text;
                if (quality.value === '320') option.selected = true;
                qualitySelect.appendChild(option);
            });

            // Create progress display
            const progressDisplay = document.createElement('span');
            progressDisplay.className = 'progress-display';
            progressDisplay.id = 'progress-display';
            progressDisplay.textContent = '0/0';

            // Create buttons
            const downloadButton = document.createElement('button');
            downloadButton.id = 'download-selected';
            downloadButton.className = 'control-button';
            downloadButton.textContent = 'Download Selected';
            downloadButton.addEventListener('click', () => downloadSelectedSongs(false));

            const retryButton = document.createElement('button');
            retryButton.id = 'retry-failed';
            retryButton.className = 'control-button';
            retryButton.textContent = 'Retry Failed';
            retryButton.addEventListener('click', retryFailedDownloads);

            const resetButton = document.createElement('button');
            resetButton.id = 'reset-all';
            resetButton.className = 'control-button';
            resetButton.textContent = 'Reset All';
            resetButton.addEventListener('click', resetAll);

            // Create range selection elements
            const rangeContainer = document.createElement('div');
            rangeContainer.className = 'range-select-container';

            const startInput = document.createElement('input');
            startInput.type = 'number';
            startInput.id = 'range-start';
            startInput.className = 'range-input';
            startInput.placeholder = 'Start';
            startInput.min = '1';

            const endInput = document.createElement('input');
            endInput.type = 'number';
            endInput.id = 'range-end';
            endInput.className = 'range-input';
            endInput.placeholder = 'End';
            endInput.min = '1';

            const selectRangeButton = document.createElement('button');
            selectRangeButton.id = 'select-range';
            selectRangeButton.className = 'control-button';
            selectRangeButton.textContent = 'Select Range';
            selectRangeButton.style.backgroundColor = '#3498db';
            selectRangeButton.addEventListener('click', selectSongRange);

            rangeContainer.appendChild(startInput);
            rangeContainer.appendChild(document.createTextNode('-'));
            rangeContainer.appendChild(endInput);
            rangeContainer.appendChild(selectRangeButton);

            // Add all elements to control panel
            controlPanel.appendChild(qualitySelect);
            controlPanel.appendChild(progressDisplay);
            controlPanel.appendChild(downloadButton);
            controlPanel.appendChild(retryButton);
            controlPanel.appendChild(resetButton);
            controlPanel.appendChild(rangeContainer);

            document.body.appendChild(controlPanel);
            makePanelDraggable(controlPanel);
        }
    }

    // Initialize
    async function init() {
        await waitForElement('.m-table');
        addCheckboxesToSongs();
        addDownloadButton();

        // Watch for DOM changes
        const observer = new MutationObserver((mutations) => {
            addCheckboxesToSongs();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Start initialization
    init();
})();
