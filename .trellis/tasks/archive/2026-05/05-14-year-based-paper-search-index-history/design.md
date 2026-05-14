# Design

## Technical Design

### Scope

Change the search-import experience from venue-first search to year-first search.

Keep existing paper fetching, indexing, PDF import, and backend storage layout.

### Backend

Reuse existing `venue + year` storage.

Extend `GET /api/venues` status entries with optional metadata needed by the year-first UI:

* `total_papers`
* `fetch_date`
* `file_size_mb`

Keep the existing shape backward-compatible by preserving `fetched` and `indexed`.

Keep `/api/search` for compatibility, but the updated UI should use `/api/multi-search` with:

* `auto_latest: false`
* explicit `venues: [{ venue, year }]` for every selected local venue-year pair

When any selected venue fails in the multi-search response, the frontend treats the whole search as failed and does not save a history entry.

### Frontend

Update `SearchImportTab.tsx` around the current search-import flow.

Search area:

* Remove `SearchMode = 'single' | 'multi'`.
* Add a multi-select search-year control derived from local data years in `venues[].status`.
* Default-select locally available `2025` and `2026`, falling back to recent local data years when needed.
* Display venues available in the selected years.
* Default-select venues that have `indexed: true` in at least one selected year.
* Display fetched-only venues as visible but unselected.
* Allow manual venue selection and deselection.
* Call `searchApi.multiSearch` with explicit selected venue-year pairs from the selected years and venues.
* Sort returned papers by `relevance_score` and cap visible results to global `topK`.

Data preparation area:

* Use year-first layout.
* For the selected preparation year, show every supported venue with fetched/indexed status.
* Missing data can be fetched and indexed for the first time.
* Already fetched data does not show a re-fetch action.
* Already indexed data does not show a rebuild action.

Search history:

* Store history in browser IndexedDB through the existing Dexie `settings` table under a search-specific key.
* Keep the latest 10 records.
* Save query, selected years, selected venues, search settings, summary, created time, and visible result list.
* Clicking a record restores the saved snapshot without issuing a new request.
* Support deleting one record and clearing all records.

### Data Flow

1. `GET /api/venues` loads supported venues and local availability.
2. Frontend derives search years from status keys that have at least one fetched venue.
3. Selecting one or more years derives available venue rows.
4. Search submits all selected local venue-year pairs through `/api/multi-search`.
5. Frontend rejects responses with failures.
6. Frontend globally sorts and caps visible papers.
7. Frontend persists a history snapshot in IndexedDB.

### Compatibility

Existing backend endpoints remain available.

Existing imported paper metadata remains unchanged.

Existing local `storage/search/papers_data` and `storage/search/vector_db` folders remain valid.

## Rollout / Rollback

Rollback is limited to reverting frontend changes and the optional `/api/venues` metadata extension. Existing paper data and vector indexes are not migrated.
