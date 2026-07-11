# Protect private script from git history

## Request
- Ensure `mify-tenant-id-copier.js` never leaves the repo when syncing to GitHub
- Update project docs if needed

## Plan
1. Add explicit ignore entry for `mify-tenant-id-copier.js`
2. Verify `git status` hides the file when unstaged changes exist
3. Coordinate next steps/commit with user

## Progress
- [x] Added rule to `.gitignore` so the private script stays local
- [ ] Confirm with user whether an additional cleanup commit is needed
