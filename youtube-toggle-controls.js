// ==UserScript==
// @name         YouTube Toggle Controls
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Toggle YouTube video controls visibility
// @author       Your Name
// @match        https://www.youtube.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/youtube-toggle-controls.js
// @downloadURL  https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/youtube-toggle-controls.js
// ==/UserScript==

(function () {
    'use strict';

    // Function to toggle the visibility of the controls
    function toggleControls() {
        const controls = document.querySelector('.ytp-chrome-bottom');
        if (controls) {
            if (controls.style.display === 'none') {
                controls.style.display = '';
            } else {
                controls.style.display = 'none';
            }
        }
    }

function createToggleButton() {
    const button = document.createElement('button');
    button.textContent = 'Toggle Controls'; // Use textContent
    button.style.marginLeft = '10px';
    button.style.padding = '5px 10px';
    button.style.backgroundColor = '#FFEB3B';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';

    button.addEventListener('click', toggleControls);

    const titleElement = document.querySelector('#title > h1');
    if (titleElement) {
        titleElement.appendChild(button);
    }
}

    // Wait for the page to load
    window.addEventListener('load', function () {
        // Wait for the video title to be available
        const observer = new MutationObserver(function (mutations) {
            const titleElement = document.querySelector('#title > h1');
            if (titleElement) {
                createToggleButton();
                observer.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
})();
