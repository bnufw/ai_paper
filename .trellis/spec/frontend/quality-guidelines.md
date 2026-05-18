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
- Local `2025` and `2026` years -> default search-year selection should include both years.
- Fetched-only venue-year pairs -> visible for manual selection but excluded from default venue selection.
- Venue with no local status for selected years -> excluded from searchable venue options.
- Multi-search `auto_latest` should choose the latest locally searchable year per venue from fetched years, because keyword fallback supports fetched data even without a vector index.

### 5. Good/Base/Bad Cases

- Good: Backend streams progress and a final result event; UI updates progress and renders results.
- Base: Backend returns only JSON; UI still renders results.
- Bad: UI assumes SSE-only parsing and discards valid JSON results.

### 6. Tests Required

- Unit or integration test for direct JSON search response parsing.
- Unit or integration test for SSE result parsing.
- Component-level test or manual check that local `2025` and `2026` are selected by default when present.
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

## Scenario: Year-First Search Import And Search History

### 1. Scope / Trigger

- Trigger: Search import UI derives searchable years from backend venue status and persists search snapshots locally.
- Apply when changing `GET /api/venues`, `src/services/search/*`, or `src/components/import/SearchImportTab.tsx`.

### 2. Signatures

- `GET /api/venues -> Venue[]`
- `Venue.status[year] -> { fetched, indexed, total_papers?, fetch_date?, file_size_mb? }`
- `searchApi.multiSearch({ research_description, auto_latest: false, venues, top_k, ... }) -> Promise<MultiSearchResult>`
- Search history storage key: `settings["search_history_records"]`

### 3. Contracts

- Search-year options come only from local venue status years where at least one venue has `fetched` or `indexed`.
- Search years are multi-selectable like venues.
- Local `2025` and `2026` are selected by default when available; otherwise default to the most recent local data years.
- Search submits explicit `{ venue, year }` pairs with `auto_latest: false` for selected years and selected venues.
- Indexed venues are selected by default when they have an indexed status in at least one selected year.
- Fetched-only venue-year pairs are visible but unselected by default.
- Visible results are globally sorted by `relevance_score` and capped to the UI `topK`.
- History snapshots store only the visible result list and keep the latest 10 records.
- Restoring a history snapshot updates UI state and results without issuing a new search request.

### 4. Validation & Error Matrix

- No local data years -> disable search button.
- Selected years and venues that produce no local venue-year pairs -> disable search button.
- `MultiSearchResult.failures.length > 0` -> show a search error and do not save history.
- Multi-year failures should include the failed `year` when available so repeated venue names remain distinguishable.
- Existing fetched data -> hide re-fetch action in the UI.
- Existing indexed data -> hide rebuild action in the UI.
- Malformed search history JSON -> return an empty history list.

### 5. Good/Base/Bad Cases

- Good: `GET /api/venues` returns `NeurIPS 2025` and `AAAI 2026`; the search selector lists `2026` and `2025`, both years are selected by default, and search submits both local venue-year pairs.
- Base: A venue is fetched but unindexed; it is visible, unselected, and can be manually selected for keyword fallback.
- Bad: UI calls `multiSearch` with `auto_latest: true`, mixing years after the user selected a specific year.

### 6. Tests Required

- Type-check/build after changing the venue status contract.
- Manual or automated check that search years exclude years with no local data.
- Manual or automated check that local `2025` and `2026` are selected by default when present.
- Manual or automated check that selected years and venues produce only explicit local venue-year pairs.
- Manual or automated check that restored history does not call `/api/multi-search`.
- Manual or automated check that visible results never exceed `topK`.
- Backend check that `GET /api/venues` preserves `fetched` and `indexed` while adding optional metadata.

### 7. Wrong vs Correct

#### Wrong

```typescript
await searchApi.multiSearch({
  research_description: query,
  auto_latest: true,
  top_k: topK
})
```

#### Correct

```typescript
await searchApi.multiSearch({
  research_description: query,
  auto_latest: false,
  venues: selectedVenueYearPairs,
  top_k: topK
})
```

## Scenario: Paper Group Move And Local File Sync

### 1. Scope / Trigger

- Trigger: Paper group changes affect both IndexedDB metadata and File System Access API directories.
- Apply when changing `src/services/storage/db.ts`, `src/services/storage/fileSystem.ts`, `src/services/storage/paperStorage.ts`, or group/paper move UI in `src/components/layout/*`.

### 2. Signatures

- `movePaperToGroup(paperId: number, groupId?: number) -> Promise<void>`
- `Paper.groupId?: number`
- `Paper.localPath?: string`
- Local paper directory layout: `{groupName}/{paperFolder}/source.pdf`, `paper.md`, optional `note.md`, optional `images/`.
- Uncategorized physical group name: `未分类`; uncategorized IndexedDB value: `groupId === undefined`.

### 3. Contracts

- A move for a paper with `localPath` must move the whole local paper directory before updating IndexedDB.
- The paper folder name is the final path segment of `localPath`; moving preserves that folder name.
- After a successful local move, update `groupId`, `localPath`, and `updatedAt` together.
- Moving to `undefined` stores files under `未分类/<paperFolder>` and stores `groupId` as `undefined`.
- Moving a legacy paper without `localPath` may update IndexedDB only, but the target group must still be validated.
- Directory move helpers must reject target directory conflicts before copying, because recursive copy with `{ create: true }` can silently merge folders.

### 4. Validation & Error Matrix

- Missing paper id -> throw `论文不存在`.
- Missing target group id -> throw `目标分组不存在`.
- Missing storage root for a paper with `localPath` -> throw `未配置存储目录`.
- Invalid `localPath` with no paper folder segment -> throw `论文本地路径无效`.
- Existing target directory -> throw a conflict error and leave IndexedDB unchanged.
- File System Access API permission or source-folder failure -> leave IndexedDB unchanged and surface the error to UI.

### 5. Good/Base/Bad Cases

- Good: Moving from `A/paper_123` to group `B` copies the full directory to `B/paper_123`, removes `A/paper_123`, then updates `groupId` and `localPath`.
- Base: Moving a legacy DB-only paper validates the target group and updates only `groupId`.
- Bad: Updating `papers.groupId` first and then trying to move files; a filesystem failure leaves UI metadata pointing to a path that still lives in the old group.
- Bad: Copying into an existing target directory; files from two papers can be merged under one folder.

### 6. Tests Required

- Type-check/build after changing this flow.
- Manual or automated check that successful move changes `localPath` to the target group path.
- Manual or automated check that `note.md` and `images/` remain readable after move.
- Manual or automated check that target directory conflict leaves `groupId` and `localPath` unchanged.
- Manual browser check that a selected paper still opens after being moved.

### 7. Wrong vs Correct

#### Wrong

```typescript
await db.papers.update(paperId, { groupId })
await renameDirectory(rootHandle, oldPath, newPath)
```

#### Correct

```typescript
await renameDirectory(rootHandle, oldPath, newPath)
await db.papers.update(paperId, {
  groupId,
  localPath: newPath,
  updatedAt: new Date()
})
```
