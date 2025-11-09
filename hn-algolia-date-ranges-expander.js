// ==UserScript==
// @name         HN Algolia - Expand Date Range Options
// @namespace    http://tampermonkey.net/
// @version      1.0
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
    return function() {
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

      // Close current dropdown first
      closeDropdown();

      // Open custom range dialog
      customRangeButton.click();

      // Wait for dialog to open and fill in dates
      setTimeout(() => {
        fillDatePickerAndSubmit(startFormatted, endFormatted);
      }, 500);
    };
  }

  // Find the custom range button in the dropdown
  function findCustomRangeButton() {
    const buttons = document.querySelectorAll('[role="listbox"] button');
    for (const button of buttons) {
      if (button.textContent.trim() === 'Custom range') {
        return button;
      }
    }
    return null;
  }

  // Close the dropdown
  function closeDropdown() {
    // Press Escape to close the dropdown
    const event = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' });
    document.dispatchEvent(event);
  }

  // Fill in the date picker and submit
  function fillDatePickerAndSubmit(startDate, endDate) {
    // Try to find input fields in the date picker
    const inputs = document.querySelectorAll('input[type="text"], input[placeholder*="date" i]');

    if (inputs.length >= 2) {
      // Fill start date
      inputs[0].value = startDate;
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));

      // Fill end date
      inputs[1].value = endDate;
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));

      // Look for apply/submit button and click it
      setTimeout(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent.trim().toLowerCase() === 'apply' ||
              btn.textContent.trim().toLowerCase() === 'ok' ||
              btn.textContent.trim().toLowerCase() === 'search') {
            btn.click();
            break;
          }
        }
      }, 300);
    } else {
      console.warn('[HN Algolia] Could not find date input fields');
    }
  }

  // Inject new options into the dropdown
  function injectDateRangeOptions() {
    // Find the listbox (dropdown list)
    const listbox = document.querySelector('[role="listbox"]');
    if (!listbox) return;

    // Check if we've already injected these options to avoid duplicates
    if (listbox.querySelector('[data-custom-range-2]')) {
      return;
    }

    // Find the custom range list item
    const listItems = listbox.querySelectorAll('[role="option"]');
    let customRangeIndex = -1;

    for (let i = 0; i < listItems.length; i++) {
      if (listItems[i].textContent.includes('Custom range')) {
        customRangeIndex = i;
        break;
      }
    }

    if (customRangeIndex === -1) {
      console.warn('[HN Algolia] Could not find Custom range option');
      return;
    }

    // Get the custom range list item to insert before it
    const customRangeItem = listItems[customRangeIndex];

    // Create and inject new options
    NEW_DATE_RANGES.forEach((range) => {
      const li = document.createElement('li');
      li.id = `custom-date-range-${range.days}`;
      li.setAttribute('data-custom-range-' + range.days, 'true');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.setAttribute('tabindex', '1');

      // Copy the style from existing items
      li.className = customRangeItem.className;

      const button = document.createElement('button');
      button.textContent = range.label;
      button.style.width = '100%';
      button.style.textAlign = 'left';
      button.style.padding = 'inherit';
      button.style.border = 'none';
      button.style.backgroundColor = 'transparent';
      button.style.cursor = 'pointer';
      button.style.fontFamily = 'inherit';
      button.style.fontSize = 'inherit';

      button.addEventListener('click', handleDateRangeClick(range.days));

      li.appendChild(button);
      customRangeItem.parentNode.insertBefore(li, customRangeItem);
    });

    console.log('[HN Algolia] Injected new date range options');
  }

  // Observer to detect when dropdown opens
  function observeDropdownChanges() {
    const observerCallback = (mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target.getAttribute('role') === 'listbox') {
          // Dropdown opened, inject our options
          injectDateRangeOptions();
        }

        // Also check for added nodes (child list items)
        if (mutation.type === 'childList') {
          const listbox = mutation.target.closest('[role="listbox"]');
          if (listbox) {
            injectDateRangeOptions();
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
      attributeFilter: ['class', 'style', 'aria-expanded']
    });

    console.log('[HN Algolia] Date range observer started');
  }

  // Initial injection on page load
  function init() {
    // Try to inject immediately
    setTimeout(injectDateRangeOptions, 1000);

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
