// ==UserScript==
// @name         Disable Substack Text Selection Popup
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Hides the Substack text selection popup (share/tweet/restack buttons) using CSS.
// @author       Senaca
// @match        *://*.substack.com/*
// @updateURL    https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/substack-disable-popup.js
// @downloadURL  https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/substack-disable-popup.js
// @grant        GM_addStyle
// @run-at       document_start
// ==/UserScript==

(function() {
    'use strict';

    // Aggressive CSS to hide various forms of the selection popup
    const css = `
        div[class*="SelectionToolbar"],
        div[class*="popover"],
        div[class*="_popoverButtons_"],
        .selection-menu {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }
    `;

    GM_addStyle(css);
    
    console.log('Substack Text Selection Popup disabled via CSS (Aggressive Mode).');
})();
