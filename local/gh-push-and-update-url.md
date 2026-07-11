# Sync repo via gh & add update URLs

## Request
- Use GitHub CLI to push/manage this repo going forward
- Ensure each public script advertises the correct `@updateURL`/`@downloadURL` pointing at GitHub raw files so Tampermonkey auto-updates work

## Plan
1. Confirm repo + remote state and needed scripts
2. Add/update metadata headers to include the canonical raw URLs
3. Stage/commit with gh and push to origin

## Progress
- [x] Documented task and plan
- [x] Added update/download URLs (including restored WeChat + HN scripts) and documented inventory
- [x] Committed the changes and pushed `main` to newly created `lenohard/tampermonkey-scripts` via `gh`

## Commits
- `accdfda` – Add auto-update URLs across scripts + script inventory docs
