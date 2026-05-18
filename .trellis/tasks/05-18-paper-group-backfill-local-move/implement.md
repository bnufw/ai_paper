# Paper Group Backfill Moves Local Files Implementation Plan

## Implementation Checklist

- [x] Read frontend pre-development guidelines before code edits.
- [x] Add local directory movement through the existing `renameDirectory` helper.
- [x] Update `movePaperToGroup` to validate the target group, move local files before IndexedDB update, and persist the new `localPath`.
- [x] Add a `GroupList` / `PaperItem` UI control for moving one paper to another group.
- [x] Wire the move handler through `Sidebar` and refresh data after success.
- [x] Add spec coverage for the local file sync contract; no automated test harness exists in this repo.
- [x] Run `npm run build`.

## Validation

- `npm run build` passes.
- `git diff --check` passes.
- Manual browser check:
  - Move a paper from one named group to another named group.
  - Move a paper to `未分类`.
  - Open the moved paper PDF and note.
  - Confirm the old local folder is removed and the new local folder contains the same files.

Manual browser check remains pending in this headless session.

## Review Gates

- Confirm planning artifacts before `task.py start`.
- Confirm no silent database-only move for records with valid `localPath`.
