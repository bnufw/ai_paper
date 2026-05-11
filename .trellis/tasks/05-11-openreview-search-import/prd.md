# 添加 OpenReview 搜索论文导入管线

## Goal

Add paper search from the existing `openreview_search` project to this app, then allow selected search results to be downloaded as PDFs, converted to Markdown through the existing Mistral OCR path, saved into the same local paper storage, and opened like uploaded papers.

## Background / Known Context

- Current app is a Vite React single-page app with local IndexedDB metadata and File System Access API storage.
- Current import path already exists for user-selected PDFs: `PDFUploader` calls `convertPDFToMarkdown`, `savePaperToLocal`, and `createPaper`.
- Current local paper folder shape is `{groupName}/{sanitizedTitle}_{timestamp}/source.pdf`, `paper.md`, and optional `images/image_N.png`.
- Current paper DB record stores `title`, `markdown`, optional `groupId`, optional `localPath`, `createdAt`, and `updatedAt`.
- Current app has no backend and `vite.config.ts` has no proxy configuration.
- `/home/zhu/workflow/openreview_search` contains the richer source implementation: FastAPI routes, OpenReview/CVF/Semantic Scholar fetchers, ChromaDB vector indexing, hybrid search, optional LLM scoring, SSE progress, and multi-venue search UI.
- `openreview_search` search results expose `id`, `title`, `authors`, `abstract`, `venue`, `year`, `decision`, `pdf_url`, `forum_url`, `relevance_score`, and `relevance_reason`.
- The downloaded PDF can be represented as a browser `File` or `Blob` and then passed into the current OCR/storage pipeline if the browser can fetch the PDF URL or if a backend provides a download proxy.

## Decisions

- Search architecture: reuse the `openreview_search` backend capability; the current app should add the frontend entry point and import bridge.
- Backend ownership: vendor the necessary backend capability into this project so search, optional PDF proxying, environment variables, and start scripts are maintained here.
- Search data management: current app should provide minimal built-in fetch/index status and actions for venue/year data.
- Import granularity: MVP uses single-paper import from one search result at a time.
- Imported search results should store minimal source metadata for provenance and duplicate detection.
- Duplicate import behavior: if `sourceId` or `pdfUrl` matches an existing local paper, open the existing paper instead of importing again.
- PDF download path: browser direct fetch first, backend proxy fallback on direct fetch failure.
- Search mode scope: MVP supports single venue/year search and one-click multi-venue search across latest indexed years.
- Advanced controls: keep an initially collapsed advanced section with defaults `topK=25`, LLM relevance on, Chinese relevance reason on, bilingual title/abstract off.
- UI entry: replace the upload-only view with an import center that has local upload and search import tabs.
- Group selection: search import uses a global target group selector near the search controls.
- Backend configuration: search backend reads LLM and embedding settings from project-root `.env`; frontend shows health/config errors rather than storing those backend keys.
- Startup workflow: add both one-command startup scripts and separate frontend/backend debug commands.
- Venue/source scope: support all sources currently implemented in the richer `openreview_search` source: NeurIPS, ICML, ICLR, CVPR, ICCV, and AAAI.
- Search backend storage: default cache and vector indexes live under project-local `storage/search/`, gitignored and separate from imported paper storage.
- Search history: do not persist search history in MVP; keep current results in app state only.

## Assumptions

- Search should be an in-app workflow, not a separate app tab.
- Imported papers should appear in the existing sidebar and remain compatible with chat, notes, group notes, domain knowledge, and Idea workflows.
- Search metadata may be useful later, but importing the paper as a normal `Paper` record is the MVP.
- Backend adoption is needed because the source search implementation depends on Python packages, local disk cache, ChromaDB, embedding APIs, long-running jobs, and SSE.

## Open Questions

- None for MVP scope.

## Requirements

- Users can search papers using the `openreview_search` search capability from inside the current app.
- Users can search a specific venue/year.
- Users can search latest indexed years across venues in one action.
- Users can adjust advanced search controls from a collapsed advanced section.
- Users can access search import from the same import center as local PDF upload.
- Users can choose one target group for search-result imports.
- Search backend configuration errors surface clearly in the search UI.
- Developers can start frontend and backend together or separately.
- Search supports all venues/sources already implemented by the source backend.
- Search backend cache/index data remains separate from user-selected imported-paper storage.
- Search history is out of MVP scope.
- Users can see whether selected venue/year data is fetched and indexed.
- Users can trigger fetch and index jobs from the current app with progress/status feedback.
- Search results show enough metadata to choose papers: title, authors, venue/year, abstract, score/reason, PDF link, and source/forum link.
- Users can import a selected search result into an existing group or the uncategorized group.
- Imported search-result papers store optional source metadata: source ID, PDF URL, forum/source URL, venue, year, and authors.
- Import downloads the PDF, runs the existing Mistral OCR conversion, writes `source.pdf`, `paper.md`, and images to local storage, and creates a normal DB paper record.
- Duplicate source results open the existing local paper instead of creating a second copy.
- PDF import first tries direct browser download, then falls back to backend proxy if direct download fails.
- Import progress is visible across download, OCR, local save, and metadata save stages.
- Imported papers can be opened, chatted with, noted, excluded from Idea context, and deleted through existing flows.
- Existing manual PDF upload behavior remains unchanged.

## Acceptance Criteria

- [ ] Search entry is reachable in the existing app without leaving the app.
- [ ] At least one OpenReview-backed search mode works end to end against configured data.
- [ ] A search result can be imported into local storage as a normal paper.
- [ ] Imported paper appears in the sidebar after import and opens in the PDF viewer.
- [ ] Imported paper has Markdown content from Mistral OCR and can be used by chat/note flows.
- [ ] PDF download, OCR, and save failures show actionable errors without creating partial DB records.
- [ ] Existing upload flow still builds and behaves as before.

## Definition of Done

- Build passes with `npm run build`.
- New search/import services have focused unit coverage where practical.
- Manual verification covers search, single import, sidebar refresh, paper open, chat access, and error handling.
- Rollback path is clear: search UI can be hidden/removed without changing existing upload records.

## Out of Scope

- Rewriting the current OCR provider.
- Replacing existing IndexedDB or local file storage.
- Rebuilding the full `openreview_search` data manager UI unless the architecture decision requires it.
- Automatic note generation after import.
- Persisted search history and saved result snapshots.

## Research References

- `research/openreview-source.md`

## Notes

- Keep planning artifacts updated after each resolved design decision.
