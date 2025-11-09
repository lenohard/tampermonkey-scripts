// ==UserScript==
// @name         HN Algolia - Expand Date Range Options
// @namespace    http://tampermonkey.net/
// @version      2.5
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

  const QUICK_ITEM_CLASS = 'hn-algolia-quick-range-item';

  // Inject quick-range styles once so dropdown items feel native
  function injectStyles() {
    if (document.getElementById('hn-algolia-quick-range-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'hn-algolia-quick-range-styles';
    style.textContent = `
      .${QUICK_ITEM_CLASS} {
        background: #fffaf0;
      }

      .${QUICK_ITEM_CLASS} button {
        font-weight: 500;
        color: #7c6953;
      }

      .${QUICK_ITEM_CLASS} button.is-active {
        color: #ff6600;
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

  function syncActiveButton(rootNode) {
    if (!rootNode) {
      return;
    }

    const currentRange = getCurrentUrlRange();

    rootNode.querySelectorAll(`[data-hn-range-days]`).forEach((btn) => {
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

  function findDateDropdownList() {
    const filterContainers = document.querySelectorAll('.SearchFilters_filterContainer');

    for (const container of filterContainers) {
      const label = container.querySelector('.SearchFilters_text');
      if (label && label.textContent.trim().toLowerCase() === 'for') {
        return container.querySelector('.Dropdown_list');
      }
    }

    return null;
  }

  function ensureQuickItems(listNode) {
    if (!listNode || listNode.querySelector(`li.${QUICK_ITEM_CLASS}`)) {
      if (listNode) {
        syncActiveButton(listNode);
      }
      return;
    }

    const fragment = document.createDocumentFragment();

    NEW_DATE_RANGES.forEach((range) => {
      const li = document.createElement('li');
      li.classList.add(QUICK_ITEM_CLASS);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = range.label;
      btn.dataset.days = String(range.days);
      btn.dataset.hnRangeDays = String(range.days);
      btn.setAttribute('aria-pressed', 'false');

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setTimeout(() => updateDateRange(range.days), 50);
      });

      li.appendChild(btn);
      fragment.appendChild(li);
    });

    listNode.insertBefore(fragment, listNode.firstChild);
    syncActiveButton(listNode);
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

  // Create custom date range buttons inside dropdown
  function createCustomButtons() {
    const listNode = findDateDropdownList();

    if (!listNode) {
      console.warn('[HN Algolia] Could not find dropdown list for date filter - retrying later');
      return;
    }

    injectStyles();
    ensureQuickItems(listNode);
    console.log('[HN Algolia] Quick date range options ready inside dropdown');
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
