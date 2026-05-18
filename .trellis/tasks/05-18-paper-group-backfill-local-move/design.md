# Paper Group Backfill Moves Local Files Design

## Technical Design

The move operation should live in one service-level function so every UI entry point uses the same consistency contract.

Proposed boundary:

```typescript
movePaperToGroupWithLocalFiles(paperId: number, targetGroupId?: number): Promise<void>
```

Data flow:

1. Load the paper by `paperId`.
2. Resolve and validate the target group name from `targetGroupId`; use `未分类` when `targetGroupId` is `undefined`.
3. If the paper has no `localPath`, update only IndexedDB, preserving legacy compatibility.
4. If the paper has `localPath`, derive the paper folder name from the last path segment and build `targetLocalPath = ${targetGroupName}/${paperFolderName}`.
5. If `targetLocalPath` equals the current `localPath`, return without changing anything except avoiding redundant work.
6. Move the local directory by using the existing File System Access API helper path.
7. After the local move succeeds, update IndexedDB with `groupId`, `localPath`, and `updatedAt`.

Failure contract:

- Local move failure must reject before IndexedDB is updated.
- Missing directory permission should surface as a UI error.
- Missing target group, missing storage root, missing source folder, and invalid local path should surface as UI errors.
- Existing target folder conflict should reject. Auto-merging directories is out of scope because it can silently mix papers.

UI shape:

- MVP: add a per-paper action in `PaperItem` that opens a compact group selector.
- The selector should list `未分类` plus all groups except the current group.
- On success, `Sidebar` reloads data with `loadData(false)`.
- On failure, the UI shows the thrown message with the existing browser alert pattern used elsewhere in `Sidebar.tsx`.

## Compatibility

- Existing imports continue to use `savePaperToLocal(groupName, ...)`.
- Existing readers use `paper.localPath`, so updating `localPath` after the move keeps PDF, markdown, note, images, chat mention, and Idea context loading aligned.
- Legacy records without `localPath` remain database-only moves.

## Rollout / Rollback

- Rollout is a frontend-only change; no backend migration is required.
- Rollback can remove the UI entry point while leaving the service helper unused.
