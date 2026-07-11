## Request

- Improve the UI of the quick date range buttons injected by `hn-algolia-date-ranges-expander.js`.
- Keep the buttons on the same line as the native range selectors, reuse the Algolia palette, and highlight the active range based on URL parameters.

## Notes

- Insert after `.SearchFilters_filters` so the buttons share the existing flex row.
- Use CSS classes via an injected `<style>` block; avoid inline hover styles.
- Active state should reflect the current `dateStart`/`dateEnd` combo when it matches a quick range.

## Plan

1. Inspect current script structure and determine reliable container insertion.
2. Refactor button creation to add semantic classes and shared styles.
3. Sync active state on render and during clicks, ensuring navigation resets to page 0.
