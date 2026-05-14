# Code Context

## Current Search Model

Backend storage is keyed by `venue + year`.

* Paper data path: `storage/search/papers_data/<Venue>_<Year>/all_papers.json`.
* Metadata path: `storage/search/papers_data/<Venue>_<Year>/metadata.json`.
* Vector index path: `storage/search/vector_db/<venue>_<year>/`.

`backend/core/fetcher.py` skips fetching when cached data exists unless `force` is true.

`backend/core/indexer.py` skips indexing when the vector index exists unless `force` is true.

`backend/api/routes.py` exposes:

* `GET /api/venues`, including per-year `fetched` and `indexed` status for each venue.
* `POST /api/search`, single `venue + year`.
* `POST /api/multi-search`, multiple `venue + year` pairs or `auto_latest`.

`backend/core/skill_search.py` already contains multi-venue search logic that accepts explicit `venue_year_pairs`.

## Current Frontend Model

`src/components/import/SearchImportTab.tsx` uses `SearchMode = 'single' | 'multi'`.

Single mode searches selected `venue + year`.

Multi mode calls `searchApi.multiSearch` with `auto_latest: true`, so it searches the latest locally available year for every venue.

The UI currently prepares data by selecting a venue first, then a year.

Search history persistence was not found in `src/services/search`, `src/components/import`, or backend search modules.

## Local Data Observed

Existing paper data:

* `NeurIPS_2025`: 5286 papers, fetched at `2026-05-14T15:26:15.435345`.
* `AAAI_2026`: 4149 papers, fetched at `2026-05-14T16:01:41.677830`.

Existing vector indexes:

* `neurips_2025`
* `aaai_2026`

## Design Implication

Year-based search can reuse the current explicit `venue_year_pairs` backend contract. The smallest backend change is likely a year availability endpoint or a derived response shape from `/api/venues`; the largest user-facing change is in `SearchImportTab.tsx`.
