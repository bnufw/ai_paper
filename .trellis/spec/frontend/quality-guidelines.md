# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

---

## Forbidden Patterns

<!-- Patterns that should never be used and why -->

(To be filled by the team)

---

## Required Patterns

<!-- Patterns that must always be used -->

(To be filled by the team)

---

## Testing Requirements

<!-- What level of testing is expected -->

(To be filled by the team)

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)

---

## Scenario: Search API Response Compatibility

### 1. Scope / Trigger

- Trigger: Search import spans frontend UI, frontend service clients, and backend paper-search APIs.
- Apply when changing `src/services/search/*`, `src/components/import/*`, or backend search response formats.

### 2. Signatures

- `searchApi.search(params, onProgress?, signal?) -> Promise<SearchResult>`
- `searchApi.multiSearch(params, onProgress?, signal?) -> Promise<MultiSearchResult>`
- Backend endpoints:
  - `POST /api/search`
  - `POST /api/multi-search`

### 3. Contracts

- Successful backend responses may be either:
  - SSE with `content-type: text/event-stream`, `event: progress`, and final `event: result`.
  - Direct JSON with `content-type: application/json` and the final result object.
- Error responses use non-2xx HTTP status and should expose `detail` when available.
- Venue metadata from `GET /api/venues` is the source of truth for fetched/indexed years:
  - `status[year].fetched`
  - `status[year].indexed`

### 4. Validation & Error Matrix

- Non-2xx response -> throw `detail` or HTTP status text.
- SSE response without final `result` event -> throw "search service returned no result".
- Direct JSON 2xx response -> return the parsed JSON result.
- Venue with indexed years -> default selection should prefer the latest indexed year.
- Venue with fetched but unindexed years -> default selection should prefer the latest fetched year.
- Venue with no status years -> default selection may fall back to the newest selectable calendar year.

### 5. Good/Base/Bad Cases

- Good: Backend streams progress and a final result event; UI updates progress and renders results.
- Base: Backend returns only JSON; UI still renders results.
- Bad: UI assumes SSE-only parsing and discards valid JSON results.

### 6. Tests Required

- Unit or integration test for direct JSON search response parsing.
- Unit or integration test for SSE result parsing.
- Component-level test or manual check that a venue with `2025` indexed and `2026` unprepared defaults to `2025`.
- Manual check through Vite proxy: `POST /api/search` returns results from the active backend.

### 7. Wrong vs Correct

#### Wrong

```typescript
const reader = response.body?.getReader()
// Assumes every 2xx search response is SSE.
```

#### Correct

```typescript
const contentType = response.headers.get('content-type') || ''
if (!contentType.toLowerCase().includes('text/event-stream')) {
  return response.json() as Promise<T>
}
```
