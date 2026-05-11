# OpenReview Search Source Findings

## Source Locations

- `/home/zhu/workflow/openreview_search` is the richer local source. It includes multi-venue search, SSE progress, and extra venue sources.
- `/home/zhu/code/openreview_search` is an older or simpler local source. The workflow copy should be treated as the reference unless later evidence says otherwise.

## Source Capabilities

- Backend: FastAPI with `/api/venues`, `/api/fetch`, `/api/index`, `/api/search`, `/api/multi-search`, and `/api/skill/latest-topic-search`.
- Data fetch: OpenReview for ICLR, NeurIPS, and ICML; CVF fetcher for CVPR/ICCV; Semantic Scholar fetcher for AAAI.
- Storage: local JSON cache under `storage/papers_data/{venue}_{year}/all_papers.json`.
- Index: ChromaDB vector store under `storage/vector_db/{venue}_{year}`.
- Retrieval: hybrid vector search plus keyword search with reciprocal rank fusion.
- Ranking: optional LLM relevance scoring, with optional Chinese relevance reasons.
- UI: React components for data management, single/multi search, result cards, and local search history.

## Current App Import Pipeline

- `src/components/pdf/PDFUploader.tsx` validates a local PDF file, calls `convertPDFToMarkdown`, then calls `savePaperToLocal`, then `createPaper`.
- `src/services/pdf/mistralOCR.ts` expects a browser `File`, uploads to Mistral, calls OCR, normalizes image references, and returns Markdown plus image blobs as base64 strings.
- `src/services/storage/paperStorage.ts` writes `source.pdf`, `paper.md`, and extracted images under the selected local storage root.
- `src/services/storage/db.ts` creates and reads normal paper records. `getPaperMarkdown` prefers local `paper.md` and falls back to DB `markdown`.

## Integration Implications

- A downloaded search-result PDF can reuse the current OCR pipeline if it is converted to a `File`.
- A browser-only implementation would need to solve OpenReview/CVF/Semantic Scholar access, CORS, long-running indexing, embeddings, and LLM ranking in the client.
- Backend reuse is lower risk for search quality because the source implementation already owns fetch, cache, index, hybrid search, ranking, and SSE progress.
- A backend download proxy may still be needed for robust PDF import if direct browser `fetch(pdf_url)` hits CORS or redirect limitations.
