# Implementation Plan

## Checklist

- [x] Resolve architecture decision for search backend ownership.
- [x] Resolve whether backend code is vendored into this project or treated as an external service.
- [x] Resolve whether current app manages fetch/index or depends on a prepared backend.
- [x] Resolve import granularity and UX for single versus batch import.
- [x] Resolve source metadata persistence.
- [x] Resolve duplicate handling.
- [x] Resolve PDF download path.
- [x] Resolve search mode scope.
- [x] Resolve advanced search controls and defaults.
- [x] Resolve UI entry placement.
- [x] Resolve group selection behavior.
- [x] Resolve backend API key and environment configuration.
- [x] Resolve development startup workflow.
- [x] Resolve supported venue/source scope.
- [x] Resolve backend cache/vector-index storage location.
- [x] Resolve search history persistence.
- [x] Load frontend implementation guidelines before code edits.
- [x] Extract a shared paper import helper from `PDFUploader` logic.
- [x] Add typed search API client and SSE parsing for the chosen backend contract.
- [x] Add search UI entry and result list consistent with the current app layout.
- [x] Add import action with group selection and progress.
- [x] Refresh paper list and select imported paper after success.
- [x] Add error handling for download, OCR, local storage, and DB creation.
- [x] Validate build and backend syntax.

## Validation

- `npm run build` passes.
- `python -m compileall backend` passes.
- Manual end-to-end search/import still requires configured backend keys and indexed venue data.

## Review Gates

- Planning gate: `prd.md`, `design.md`, and `implement.md` reflect resolved scope before `task.py start`.
- Pre-code gate: read relevant frontend specs and cross-layer/code-reuse thinking guides.
