# Design

## Current Proposed Shape

Use the current app as the user-facing shell and reuse the `openreview_search` backend capability for paper search. Add a typed frontend search client, search UI, and import action that converts one selected search result into the existing local paper format.

## Decisions

- Search is backend-backed, not browser-only.
- Backend code should be brought into this project rather than treated as a mandatory external service.
- Current app should include minimal venue/year fetch/index controls rather than depending on pre-built search indexes.
- Import should process one selected search result at a time for MVP.
- `Paper` should gain optional source metadata fields for imported search results. Existing records stay valid.
- Duplicate detection should check source metadata before starting PDF download or OCR.
- PDF download should try frontend `fetch` first and use a backend proxy fallback only on failure.
- Search UI should support single venue/year mode plus one-click multi-venue mode.
- Advanced search controls should be available but collapsed by default.
- Import center should contain local upload and search import tabs, keeping paper ingestion flows together.
- Search import should have one target group selector applied to all result import actions.
- Search backend secrets should live in backend `.env`, not browser IndexedDB.
- Startup should support both one-command local development and separate frontend/backend debugging.
- Keep the source backend's full venue/source support for MVP.
- Search backend cache and vector indexes should live in project-local gitignored storage, separate from the user paper library.
- Search history should stay in volatile app state for MVP.

## Boundaries

- Search backend owns venue metadata, fetch/index status, hybrid search, optional LLM scoring, and SSE progress.
- Current app owns local storage authorization, PDF OCR conversion, paper DB records, sidebar refresh, and paper reading/chat/note flows.
- Import bridge owns converting a search result into a downloaded `File` and invoking the existing import pipeline.

## Data Flow

1. User opens search UI in current app.
2. Frontend calls the backend for venue/year status.
3. User fetches and indexes missing venue/year data when needed.
4. Frontend calls the backend search endpoint and receives progress/results.
5. User selects a result and target group.
6. Frontend downloads `pdf_url` directly, falling back to a backend proxy when needed.
7. Frontend wraps the PDF as `File`.
8. Existing `convertPDFToMarkdown` runs Mistral OCR.
9. Existing `savePaperToLocal` writes the paper files.
10. Existing `createPaper` creates a normal paper record.
11. App refreshes the sidebar and selects the imported paper.

## Compatibility

- Existing `Paper` records and local folder layout remain unchanged for MVP.
- Source metadata is optional, so existing records and manual upload records remain compatible.
- Duplicate handling avoids repeated OCR work and avoids creating duplicate local paper folders.
- Existing upload flow should share a helper with import to avoid two copies of OCR/save/create logic.

## Risks

- Current app has no backend dependency or dev proxy yet.
- Vendoring backend code introduces Python dependencies and storage directories into a project that is currently frontend-only.
- Direct browser PDF download may fail for some URLs.
- Imported search results may duplicate existing papers unless duplicate detection is added.
- Full data-manager parity would expand scope significantly.

## Rollout / Rollback

Search UI can be gated behind a small app state entry. Removing the entry and search client should leave existing paper storage untouched.
