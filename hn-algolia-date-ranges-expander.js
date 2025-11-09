// ==UserScript==
// @name         HN Algolia - Expand Date Range Options
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Add quick date range options (Last 2/3/4 days) to HN Algolia search
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

  // Utility function to calculate date N days ago
  function getDateNDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  // Utility function to format date as MM/DD/YYYY
  function formatDate(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }

  // Handle click on new date range option
  function handleDateRangeClick(days) {
    return function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log(`[HN Algolia] Clicked: Last ${days} days`);

      // Calculate the date range
      const endDate = new Date();
      const startDate = getDateNDaysAgo(days);

      const startFormatted = formatDate(startDate);
      const endFormatted = formatDate(endDate);

      console.log(`[HN Algolia] Date range: ${startFormatted} to ${endFormatted}`);

      // Find and click the "Custom range" button to open the date picker
      const customRangeButton = findCustomRangeButton();
      if (!customRangeButton) {
        console.error('[HN Algolia] Could not find Custom range button');
        return;
      }

      // Click to open custom range dialog
      customRangeButton.click();

      // Wait for dialog to open and fill in dates
      setTimeout(() => {
        fillDatePickerAndSubmit(startFormatted, endFormatted);
      }, 300);
    };
  }

  // Find the custom range button in the dropdown
  function findCustomRangeButton() {
    const listbox = document.querySelector('[role="listbox"]');
    if (!listbox) return null;

    const buttons = listbox.querySelectorAll('button');
    for (const button of buttons) {
      if (button.textContent.trim() === 'Custom range') {
        return button;
      }
    }
    return null;
  }

  // Fill in the date picker and submit
  function fillDatePickerAndSubmit(startDate, endDate) {
    console.log(`[HN Algolia] Attempting to fill date picker with ${startDate} to ${endDate}`);

    // Wait for dialog to be visible
    setTimeout(() => {
      // Try multiple selectors for date inputs
      let inputs = document.querySelectorAll('input[type="date"]');

      if (inputs.length < 2) {
        inputs = document.querySelectorAll('input[placeholder*="date" i]');
      }

      if (inputs.length < 2) {
        inputs = document.querySelectorAll('input[type="text"]');
      }

      console.log(`[HN Algolia] Found ${inputs.length} input fields`);

      if (inputs.length >= 2) {
        // Fill start date
        inputs[0].focus();
        inputs[0].value = startDate;
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));

        // Fill end date
        inputs[1].focus();
        inputs[1].value = endDate;
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));

        console.log(`[HN Algolia] Filled dates: ${startDate} to ${endDate}`);

        // Look for apply/submit button and click it
        setTimeout(() => {
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            const text = btn.textContent.trim().toLowerCase();
            if (text === 'apply' || text === 'ok' || text === 'search' || text === 'submit') {
              console.log(`[HN Algolia] Clicking button: ${text}`);
              btn.click();
              break;
            }
          }
        }, 200);
      } else {
        console.warn('[HN Algolia] Could not find date input fields');
      }
    }, 400);
  }

  // Inject new options into the dropdown
  function injectDateRangeOptions() {
    // Find the listbox (dropdown list)
    const listbox = document.querySelector('[role="listbox"]');
    if (!listbox) {
      console.log('[HN Algolia] Listbox not found');
      return;
    }

    // Check if we've already injected these options to avoid duplicates
    if (listbox.querySelector('[data-hn-custom-range]')) {
      console.log('[HN Algolia] Options already injected, skipping');
      return;
    }

    // Find all list items with role="option"
    const listItems = listbox.querySelectorAll('li[role="option"]');
    console.log(`[HN Algolia] Found ${listItems.length} list items`);

    // Find the custom range list item
    let customRangeItem = null;
    for (const item of listItems) {
      if (item.textContent.includes('Custom range')) {
        customRangeItem = item;
        break;
      }
    }

    if (!customRangeItem) {
      console.warn('[HN Algolia] Could not find Custom range option');
      return;
    }

    console.log('[HN Algolia] Found Custom range option, injecting new options before it');

    // Create and inject new options
    NEW_DATE_RANGES.forEach((range, index) => {
      const li = document.createElement('li');
      li.setAttribute('data-hn-custom-range', 'true');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.setAttribute('tabindex', '1');

      // Copy classes from custom range item
      li.className = customRangeItem.className;

      const button = document.createElement('button');
      button.textContent = range.label;

      button.addEventListener('click', handleDateRangeClick(range.days));

      li.appendChild(button);
      customRangeItem.parentNode.insertBefore(li, customRangeItem);
    });

    console.log('[HN Algolia] Successfully injected new date range options');
  }

  // Observer to detect when dropdown opens/closes
  function observeDropdownChanges() {
    const observerCallback = (mutations) => {
      for (const mutation of mutations) {
        // Check if a listbox was added or modified
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1 && node.getAttribute('role') === 'listbox') {
              console.log('[HN Algolia] Listbox added, injecting options');
              setTimeout(injectDateRangeOptions, 100);
            }
          }

          // Check for modifications to existing listbox
          if (mutation.target.getAttribute && mutation.target.getAttribute('role') === 'listbox') {
            setTimeout(injectDateRangeOptions, 50);
          }
        }

        // Also check for class changes that might indicate dropdown opening
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          if (mutation.target.classList && mutation.target.classList.contains('Dropdown_list--open')) {
            console.log('[HN Algolia] Dropdown opened (class change detected)');
            setTimeout(injectDateRangeOptions, 100);
          }
        }
      }
    };

    const observer = new MutationObserver(observerCallback);

    // Start observing the document for changes
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class']
    });

    console.log('[HN Algolia] Observer started - watching for dropdown changes');
  }

  // Initial setup
  function init() {
    console.log('[HN Algolia] Script initialized');

    // Start observing for dropdown changes
    observeDropdownChanges();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
