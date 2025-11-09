// ==UserScript==
// @name         HN Algolia - Expand Date Range Options
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Add quick date range buttons (Last 2/3/4 days) to HN Algolia search
// @author       You
// @match        https://hn.algolia.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/hn-algolia-date-ranges-expander.js
// @downloadURL  https://raw.githubusercontent.com/lenohard/tampermonkey-scripts/main/hn-algolia-date-ranges-expander.js
// ==/UserScript==

(function() {
  'use strict';

  // Configuration for new date range options
  const NEW_DATE_RANGES = [
    { label: 'Last 2 days', days: 2 },
    { label: 'Last 3 days', days: 3 },
    { label: 'Last 4 days', days: 4 }
  ];

  // Get Unix timestamp for N days ago
  function getTimestampNDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(0, 0, 0, 0); // Start of day
    return Math.floor(date.getTime() / 1000);
  }

  // Get Unix timestamp for today (end of day)
  function getTodayTimestamp() {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return Math.floor(date.getTime() / 1000);
  }

  // Update URL with new date range parameters
  function updateDateRange(days) {
    console.log(`[HN Algolia] Applying: Last ${days} days`);

    const dateStart = getTimestampNDaysAgo(days);
    const dateEnd = getTodayTimestamp();

    // Get current URL
    const url = new URL(window.location);

    // Update parameters
    url.searchParams.set('dateStart', dateStart);
    url.searchParams.set('dateEnd', dateEnd);
    url.searchParams.set('dateRange', 'custom');
    url.searchParams.set('page', '0'); // Reset to first page

    console.log(`[HN Algolia] New URL: ${url.toString()}`);

    // Navigate to new URL
    window.location.href = url.toString();
  }

  // Create custom date range buttons
  function createCustomButtons() {
    console.log('[HN Algolia] Creating custom date range buttons');

    // Check if buttons already exist
    if (document.getElementById('hn-algolia-custom-dates')) {
      console.log('[HN Algolia] Buttons already exist, skipping');
      return;
    }

    // Find the dropdown button by looking for the SearchFilters_menuButton class
    let dropdownButton = document.querySelector('button.SearchFilters_menuButton');

    if (!dropdownButton) {
      console.warn('[HN Algolia] Could not find SearchFilters_menuButton - retrying later');
      return;
    }

    console.log('[HN Algolia] Found dropdown button with class: SearchFilters_menuButton');

    // Get the parent container
    const container = dropdownButton.parentElement;

    // Create a wrapper div for our custom buttons
    const buttonGroup = document.createElement('div');
    buttonGroup.id = 'hn-algolia-custom-dates';
    buttonGroup.style.cssText = `
      display: flex;
      gap: 8px;
      margin-left: 12px;
      flex-wrap: wrap;
      align-items: center;
    `;

    // Create buttons for each date range
    NEW_DATE_RANGES.forEach((range) => {
      const btn = document.createElement('button');
      btn.textContent = range.label;
      btn.style.cssText = `
        padding: 8px 16px;
        border: 1px solid #d0d0d0;
        border-radius: 5px;
        background: #ffffff;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.15s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        white-space: nowrap;
      `;

      btn.addEventListener('mouseover', () => {
        btn.style.backgroundColor = '#f5f5f5';
        btn.style.borderColor = '#888';
        btn.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
      });

      btn.addEventListener('mouseout', () => {
        btn.style.backgroundColor = '#ffffff';
        btn.style.borderColor = '#d0d0d0';
        btn.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
      });

      btn.addEventListener('active', () => {
        btn.style.backgroundColor = '#e8e8e8';
        btn.style.transform = 'scale(0.98)';
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.style.opacity = '0.7';
        setTimeout(() => {
          updateDateRange(range.days);
        }, 100);
      });

      buttonGroup.appendChild(btn);
    });

    // Insert after the dropdown button's parent
    container.parentNode.insertBefore(buttonGroup, container.nextSibling);

    console.log('[HN Algolia] Custom date range buttons created successfully');
  }

  // Wait for page to be ready and create buttons
  function init() {
    console.log('[HN Algolia] Script initialized');

    // Try to create buttons immediately
    createCustomButtons();

    // Also try again after delays in case page wasn't ready
    setTimeout(createCustomButtons, 500);
    setTimeout(createCustomButtons, 1000);
    setTimeout(createCustomButtons, 2000);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
