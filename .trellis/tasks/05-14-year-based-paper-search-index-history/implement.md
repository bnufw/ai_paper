# Implementation Checklist

## Backend

* [x] Extend `VenueStatus` response data from `GET /api/venues` with cached metadata fields.
* [x] Keep `fetched` and `indexed` fields backward-compatible.

## Frontend Types And API

* [x] Update `src/services/search/types.ts` for optional venue-year metadata.
* [x] Keep `searchApi.multiSearch` contract and use explicit `venues` with `auto_latest: false`.

## Search History

* [x] Add a small search history storage helper using `db.settings`.
* [x] Store latest 10 search snapshots.
* [x] Support list, save, delete one, and clear all.

## Search Import UI

* [x] Refactor `SearchImportTab.tsx` to remove single/multi mode toggle.
* [x] Add multi-select search year selector from existing local data years.
* [x] Default-select local `2025` and `2026` search years when available.
* [x] Show selected-years venue availability with default selected indexed venues.
* [x] Submit explicit selected venue-year pairs from selected years and venues.
* [x] Treat any multi-search venue failure as whole-search failure.
* [x] Globally sort results and cap visible papers to `topK`.
* [x] Save completed searches to history.
* [x] Restore saved snapshots without new search requests.
* [x] Refactor data preparation area to year-first status rows.
* [x] Hide re-fetch and rebuild actions for already ready data.

## Validation

* [x] `npm run build`
* [x] `python -m compileall backend`
* [x] Direct `list_venues()` check confirms cached metadata is returned for local data years.
* [ ] Manual browser check:
  * Search year control only shows local-data years.
  * Default selected years are `2025` and `2026` when local data exists.
  * Selecting years shows available venues.
  * Indexed venues are selected by default.
  * Fetched-only venues are visible and unselected by default.
  * Search returns at most global `topK` visible papers.
  * Search history survives refresh and restores without network search.
  * Already fetched/indexed rows do not show re-fetch/rebuild actions.

## Review Gates

* PRD decisions reviewed before `task.py start`.
* No implementation starts until task is activated.
