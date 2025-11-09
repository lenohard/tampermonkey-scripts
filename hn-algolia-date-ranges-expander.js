// ==UserScript==
// @name         HN Algolia - Expand Date Range Options
// @namespace    http://tampermonkey.net/
// @version      2.4
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

  // Inject quick-range styles once so buttons match Algolia UI
  function injectStyles() {
    if (document.getElementById('hn-algolia-quick-range-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'hn-algolia-quick-range-styles';
    style.textContent = `
      .hn-algolia-quick-range-wrapper {
        display: inline-flex;
        align-items: center;
      }

      .hn-algolia-quick-range-group {
        display: inline-flex;
        border: 1px solid #d8d8d8;
        border-radius: 4px;
        overflow: hidden;
        background: #f6f6ef;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      }

      .hn-algolia-quick-range-btn {
        border: 0;
        background: transparent;
        padding: 4px 12px;
        font-size: 12px;
        color: #7c6953;
        cursor: pointer;
        line-height: 1.4;
        transition: background 0.15s ease, color 0.15s ease;
      }

      .hn-algolia-quick-range-btn + .hn-algolia-quick-range-btn {
        border-left: 1px solid #e0d9c8;
      }

      .hn-algolia-quick-range-btn:hover,
      .hn-algolia-quick-range-btn:focus-visible {
        background: #fff6dd;
        color: #5b432a;
        outline: none;
      }

      .hn-algolia-quick-range-btn.is-active {
        background: #ff6600;
        color: #fff;
        font-weight: 600;
      }
    `;

    document.head.appendChild(style);
  }

  function getCurrentUrlRange() {
    const params = new URLSearchParams(window.location.search);
    const dateRange = params.get('dateRange');
    const dateStart = parseInt(params.get('dateStart') || '', 10);
    const dateEnd = parseInt(params.get('dateEnd') || '', 10);

    if (Number.isNaN(dateStart) || Number.isNaN(dateEnd)) {
      return null;
    }

    return { dateRange, dateStart, dateEnd };
  }

  function isRangeActive(days, currentRange) {
    if (!currentRange || currentRange.dateRange !== 'custom') {
      return false;
    }

    const toleranceSeconds = 60; // absorb rounding differences
    const expectedStart = getTimestampNDaysAgo(days);
    const expectedEnd = getTodayTimestamp();

    return (
      Math.abs(currentRange.dateStart - expectedStart) <= toleranceSeconds &&
      Math.abs(currentRange.dateEnd - expectedEnd) <= toleranceSeconds
    );
  }

  function syncActiveButton(buttonGroup) {
    if (!buttonGroup) {
      return;
    }

    const currentRange = getCurrentUrlRange();

    buttonGroup.querySelectorAll('.hn-algolia-quick-range-btn').forEach((btn) => {
      const days = parseInt(btn.dataset.days || '', 10);
      if (Number.isNaN(days)) {
        return;
      }

      const active = isRangeActive(days, currentRange);

      if (active) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }

      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
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

    injectStyles();

    // Find the filters row so we can append inline
    const filtersRow = document.querySelector('.SearchFilters_filters');

    if (!filtersRow) {
      console.warn('[HN Algolia] Could not find .SearchFilters_filters - retrying later');
      return;
    }

    // If buttons already exist, just sync state
    const existingGroup = document.getElementById('hn-algolia-custom-dates');
    if (existingGroup) {
      console.log('[HN Algolia] Buttons already exist, syncing state only');
      syncActiveButton(existingGroup);
      return;
    }

    // Wrapper matches existing filter containers for consistent spacing
    const wrapper = document.createElement('span');
    wrapper.id = 'hn-algolia-custom-dates-wrapper';
    wrapper.classList.add('SearchFilters_filterContainer', 'hn-algolia-quick-range-wrapper');

    // Create a wrapper div for our custom buttons
    const buttonGroup = document.createElement('div');
    buttonGroup.id = 'hn-algolia-custom-dates';
    buttonGroup.classList.add('hn-algolia-quick-range-group');
    buttonGroup.setAttribute('role', 'group');
    buttonGroup.setAttribute('aria-label', 'Quick date ranges');

    // Create buttons for each date range
    NEW_DATE_RANGES.forEach((range) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = range.label;
      btn.dataset.days = String(range.days);
      btn.classList.add('hn-algolia-quick-range-btn');
      btn.setAttribute('aria-pressed', 'false');

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setTimeout(() => {
          updateDateRange(range.days);
        }, 80);
      });

      buttonGroup.appendChild(btn);
    });

    wrapper.appendChild(buttonGroup);
    filtersRow.appendChild(wrapper);

    syncActiveButton(buttonGroup);

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
