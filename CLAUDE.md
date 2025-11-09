# Project Memory

## Privacy Requirements
- `mify-tenant-id-copier.js` must stay private (keep it out of git history/.gitignore already updated); restore a local copy before working on tenant workflows.
- Never check in credentials or tenant data captured by any script.

## Script Inventory
| Script | Version | Notes |
| --- | --- | --- |
| `aifadian.js` | 1.1 | AiFaDian & 四季办公室音频批量下载；auto-update URLs configured. |
| `douban2pp.js` | 0.2 | Douban subject helper linking to axj resources; lightweight, no GM APIs. |
| `hn-algolia-date-ranges-expander.js` | 1.0 | Adds quick range buttons on HN Algolia search; re-created after accidental deletion. |
| `netease_downloader.js` | 0.2 | NetEase Music batch downloader with duplicate checking and draggable UI. |
| `youtube-downloader.js` | 1.0 | YT video/audio downloader panel (GM_download + GM_xmlhttpRequest). |
| `youtube-toggle-controls.js` | 0.2 | Adds toggle button for YT controls visibility. |
| `weixin-audio-downloader.js` | 1.0 | Restored WeChat article audio downloader; auto-update URLs now point to GitHub raw. |
| `mify-tenant-id-copier.js` | private (latest known v1.x) | Keep local-only; add manual updates without committing. |

## Outstanding Tasks
- Rehydrate `mify-tenant-id-copier.js` locally so private workflows work again.
- Recreate/restore `weixin-audio-downloader.js` (lost during filter rewrite) before shipping audio extraction updates.
- Use `gh` for pushes once remote `lenohard/tampermonkey-scripts` exists; set correct origin URL.
