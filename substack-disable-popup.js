// ==UserScript==
// @name         Disable Substack Text Selection Popup
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Hides the Substack text selection popup (share/tweet/restack buttons) using CSS.
// @author       Senaca
// @match        *://*.substack.com/*
// @updateURL    https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/substack-disable-popup.js
// @downloadURL  https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/substack-disable-popup.js
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // Substack's popup menu usually has a class like "_popoverButtons_<hash>"
    // We use an attribute selector to match any class containing "_popoverButtons_"
    // to be more robust against random hash changes.
    const css = `
        div[class*="_popoverButtons_"] {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }
    `;

    GM_addStyle(css);
    
    console.log('Substack Text Selection Popup disabled via CSS.');
})();
