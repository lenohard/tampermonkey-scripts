# HN Algolia Date Range UI tweaks

## Request
- Improve `hn-algolia-date-ranges-expander.js` quick range buttons so they match Algolia UI and sit inline with the native range selector.
- Keep palette consistent with HN colors, reuse `.SearchFilters_filters` row, highlight active range.

## Plan / Notes
1. Inject CSS classes for compact inline segmented control (HN palette, hover, active states).
2. Move custom button group inside `.SearchFilters_filters` so it appears on the main filter row.
3. Detect currently applied date range via `dateStart/dateEnd` params and toggle `is-active` class.
4. Refactor button creation to add classes and rely on styles instead of inline event styling.

## Progress
- 2025-02-14: Initial analysis, awaiting implementation.
- 2025-02-14: Implemented inline quick range group w/ HN styling + active state sync.
- 2025-02-14: Reworked quick ranges to live inside the date dropdown (native list items, state sync, new styles).
