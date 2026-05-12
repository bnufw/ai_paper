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
- Search result `pdf_url` may be empty for sources that only expose a paper/detail page; import may fall back to a trusted `forum_url` when the backend PDF proxy can resolve it to a real PDF.
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
- Multi-search `auto_latest` should choose the latest locally searchable year per venue from fetched years, because keyword fallback supports fetched data even without a vector index.

### 5. Good/Base/Bad Cases

- Good: Backend streams progress and a final result event; UI updates progress and renders results.
- Base: Backend returns only JSON; UI still renders results.
- Bad: UI assumes SSE-only parsing and discards valid JSON results.

### 6. Tests Required

- Unit or integration test for direct JSON search response parsing.
- Unit or integration test for SSE result parsing.
- Component-level test or manual check that a venue with `2025` indexed and `2026` unprepared defaults to `2025`.
- Manual check through Vite proxy: `POST /api/search` returns results from the active backend.
- Backend check that `POST /api/multi-search` auto-latest includes venues with fetched-but-unindexed local data.
- Manual or automated check that an import source with only a trusted detail-page URL resolves through `/api/download-pdf`.

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

## Scenario: Idea Session File Loading Fallback

### 1. Scope / Trigger

- Trigger: Idea history/detail code loads generated files from File System Access API handles.
- Apply when changing `src/hooks/useIdeaChat.ts`, `src/components/idea/*`, or `src/services/idea/workflowStorage.ts`.

### 2. Signatures

- `useIdeaChat(session: IdeaSession | null)` exposes `bestIdea`, `allIdeas`, `currentIdeaSlug`, and `contextReady`.
- `readBestIdea(sessionDir) -> Promise<string | null>` reads `best_idea.md`.
- `readAllIdeas(sessionDir) -> Promise<IdeaEntry[]>` reads `ideas/idea_{index}_{slug}.md` and sorts by numeric index.

### 3. Contracts

- `best_idea.md` is optional for viewing a session.
- Candidate idea files under `ideas/` are valid display content even when `best_idea.md` is absent or empty.
- Default selection should be `best_idea` only when it has non-whitespace content; otherwise select the first non-empty candidate idea.
- Chat context may be built from Best Idea, candidate ideas, or both.

### 4. Validation & Error Matrix

- No session -> clear Idea state.
- Missing directory permission -> `contextReady: false` with an access error.
- Missing or empty `best_idea.md` plus readable candidate ideas -> `contextReady: true`.
- Missing or empty `best_idea.md` plus no readable candidate ideas -> `contextReady: false` with an empty-content error.

### 5. Good/Base/Bad Cases

- Good: Session has `best_idea.md` and candidates; UI opens Best Idea and keeps candidates selectable.
- Base: Session has only candidate files; UI opens the first readable candidate and prepares chat context.
- Bad: Loader returns early after `readBestIdea()` returns `null`, leaving existing candidate files invisible.

### 6. Tests Required

- Type-check/build after any change to this flow.
- Manual or automated regression for a session with candidates but no readable `best_idea.md`.
- Manual or automated regression for a session with readable `best_idea.md`.

### 7. Wrong vs Correct

#### Wrong

```typescript
if (!bestIdea) {
  setState(prev => ({ ...prev, contextReady: false }))
  return
}
```

#### Correct

```typescript
const readableBestIdea = bestIdea?.trim() ? bestIdea : null
const readableIdeas = allIdeas.filter(idea => idea.content.trim())
if (!readableBestIdea && readableIdeas.length === 0) {
  setState(prev => ({ ...prev, contextReady: false }))
  return
}
```
