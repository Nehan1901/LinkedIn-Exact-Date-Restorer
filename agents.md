# AGENTS.md — LinkedIn Exact Date Restorer

## Project overview
A Manifest V3 Chrome/Firefox extension that replaces LinkedIn's vague relative
timestamps ("3 weeks ago", "1 month ago") with exact dates on job listings,
feed posts, comments, and connection requests.

## How it works (read before touching any file)
LinkedIn's frontend fetches data via its internal Voyager API
(`/api/voyager/...`). Responses include exact epoch timestamps in fields like
`listedAt`, `createdAt`, `postedAt`, `publishedAt`. The extension intercepts
these fetch/XHR calls in a page-world script, caches the timestamps keyed by
entity URN, then a MutationObserver watches the DOM for relative-date text
nodes and replaces them using the cached values.

Two-script architecture is required because Manifest V3 content scripts run in
an isolated world and cannot intercept page-level fetch calls directly.

## File structure
```
/
├── manifest.json          # MV3 manifest
├── src/
│   ├── injected.js        # Runs in PAGE world — intercepts fetch/XHR, caches timestamps
│   ├── content.js         # Runs in ISOLATED world — injects injected.js, runs MutationObserver
│   └── popup.js           # Minimal settings: date format toggle (relative vs absolute)
├── popup.html             # Single toggle UI, no frameworks
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── AGENTS.md
```

## Stack constraints — follow exactly
- Manifest V3 only. No MV2 patterns (no `background.persistent`, no `browser_action`).
- Vanilla JS only. No TypeScript, no React, no bundler, no npm, no node_modules.
- No external CDN scripts. Zero network calls from the extension itself.
- No jQuery. No lodash. No utility libraries of any kind.
- Use `async/await` — never `.then()` chains.
- Use `const`/`let` — never `var`.
- Arrow functions preferred. Named functions only for recursion or event handlers that need `removeEventListener`.

## manifest.json rules
- `"manifest_version": 3`
- Content script must declare `"world": "ISOLATED"` (default, but be explicit).
- `injected.js` is injected programmatically via `chrome.scripting.executeScript`
  with `world: "MAIN"` — it is NOT listed under `content_scripts`.
- Permissions needed: `"scripting"`, `"storage"`, `"activeTab"`.
- Host permissions: `"https://www.linkedin.com/*"`
- Do NOT request `"webRequest"` or `"declarativeNetRequest"` — not needed.

## injected.js rules (PAGE world)
- Wraps native `fetch` and `XMLHttpRequest` to intercept Voyager API responses.
- Parses JSON responses and extracts any field matching: `listedAt`, `createdAt`,
  `postedAt`, `publishedAt`, `firstPublishedAt`. Values are Unix epoch ms (numbers).
- Stores extracted timestamps in `window.__ldTimestamps` as `{ [urn: string]: number }`.
- URN keys look like `"urn:li:fsd_jobPostingCard:(12345,JOBS_SEARCH)"` — extract
  the numeric ID portion as the key for robustness.
- Dispatches a `CustomEvent('ld:timestamps', { detail: { urn, ts } })` on
  `document` for each new timestamp found, so content.js can receive it across
  the world boundary.
- Must restore original fetch/XHR if the extension is disabled (use try/finally).
- Never log to console in production code paths — use a `DEBUG` flag constant.

## content.js rules (ISOLATED world)
- On `document_start`, inject `injected.js` into the page world using:
  `chrome.scripting.executeScript({ target: { tabId }, files: ['src/injected.js'], world: 'MAIN' })`
- Listen for `ld:timestamps` CustomEvents on `document` to receive timestamp data.
- Run a `MutationObserver` on `document.body` with `{ childList: true, subtree: true }`.
- On each mutation, call `replaceRelativeDates()` which:
  1. Queries all elements matching `[data-ld-processed]` — skip those already done.
  2. Finds text nodes whose content matches the relative-date regex (see below).
  3. Replaces the text with the formatted absolute date if a cached timestamp exists.
  4. Marks processed nodes with `data-ld-processed="true"` to avoid reprocessing.
- Relative-date regex: `/\b(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/i`
  Also handle: `"just now"`, `"moments ago"`, `"yesterday"`.
- Date format default: `"MMM D, YYYY"` (e.g. "Apr 3, 2025"). Use `Intl.DateTimeFormat`
  — never import a date library.
- Read user's format preference from `chrome.storage.sync` on init.

## popup.html / popup.js rules
- Single toggle: "Show exact dates" (on by default).
- One format selector: "Apr 3, 2025" vs "2025-04-03" (ISO).
- Save to `chrome.storage.sync`. No other settings.
- No CSS frameworks. Inline styles or a single `<style>` block only.
- Popup must be under 300px wide, 150px tall.

## Coding patterns to always follow
```js
// Timestamp formatting — always use this helper, never inline
function formatDate(epochMs, format = 'long') {
  const opts = format === 'iso'
    ? { year: 'numeric', month: '2-digit', day: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' };
  return new Intl.DateTimeFormat('en-US', opts).format(new Date(epochMs));
}

// Cross-world messaging — always use CustomEvent, never postMessage
document.dispatchEvent(new CustomEvent('ld:timestamps', { detail: { urn, ts } }));
document.addEventListener('ld:timestamps', (e) => { /* handle in content.js */ });

// Storage reads — always await, always provide defaults
const { format = 'long', enabled = true } = await chrome.storage.sync.get(['format', 'enabled']);
```

## What NOT to build
- Do not add any analytics, telemetry, or remote logging.
- Do not store any user data beyond the two settings (format, enabled).
- Do not try to intercept LinkedIn's WebSocket traffic — not needed.
- Do not modify LinkedIn's DOM structure — only replace text node content.
- Do not add UI beyond the popup toggle and format selector.
- Do not handle LinkedIn Recruiter or Sales Navigator — standard linkedin.com only.

## LinkedIn DOM patterns (as of April 2026)
Relative dates appear in these selectors — check these first in MutationObserver:
- Job listings: `.job-search-card__listdate`, `.jobs-unified-top-card__posted-date`
- Feed posts: `.feed-shared-actor__sub-description span[aria-hidden]`
- Comments: `.comments-comment-meta__data`
- Connection requests: `.invitation-card__subtitle`
These selectors change frequently. The regex fallback on text nodes is the
reliable path — selector matching is a fast-path optimization only.

## Testing checklist (run before marking any task done)
- [ ] Extension loads in chrome://extensions without errors
- [ ] No console errors on linkedin.com/jobs
- [ ] Relative dates replaced on initial page load
- [ ] Relative dates replaced after LinkedIn's SPA navigation (clicking between jobs)
- [ ] Toggle off in popup stops replacement
- [ ] ISO format toggle changes output correctly
- [ ] No visual layout shifts caused by longer date strings

## Task prompt template
When asking Codex to implement something, use this format:

```
Task: [one sentence]
File: src/[filename].js
Input: [what the function receives]
Output: [what it returns or does to the DOM]
Constraint: [one rule if relevant]
```