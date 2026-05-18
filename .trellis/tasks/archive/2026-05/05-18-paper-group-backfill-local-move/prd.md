# brainstorm: Paper group backfill moves local files

## Goal

Allow an existing paper that was assigned to the wrong group to be moved from the web UI into the correct group, while keeping the IndexedDB record and the local filesystem directory in sync.

## Background / Known Context

- Papers are stored local-first: metadata lives in IndexedDB `PaperReaderDB`, and paper files live under the selected File System Access API root directory.
- README documents the local layout as `{groupName}/{paperTitle}_{timestamp}/source.pdf`, `paper.md`, optional `note.md`, and `images/`.
- `src/services/storage/db.ts` has `movePaperToGroup(paperId, groupId?)`, but it only updates `papers.groupId` and `updatedAt`.
- `src/services/storage/paperStorage.ts` can save, read, and delete paper directories, but it does not currently expose a paper-directory move helper.
- `src/services/storage/fileSystem.ts` already has `renameDirectory(rootHandle, oldPath, newPath)`, implemented as copy directory, then remove old directory.
- `src/components/layout/GroupList.tsx` renders paper items by group but exposes no move UI.

## Assumptions

- "Backfill" means correcting a saved paper's group after import, not re-importing the paper from search or OCR.
- Moving to "Uncategorized" should place local files under the existing `未分类/` directory, matching current import behavior.
- If local filesystem migration fails, the database group should stay unchanged so the visible group does not drift from the actual file path.

## Open Questions

- None.

## Requirements

- Add a user-facing way to move an existing paper from one group to another group, including `未分类`.
- Use a per-paper "Move to group" menu as the MVP interaction.
- When a paper with `localPath` is moved, move the whole local paper directory to the target group directory.
- Update the paper's `groupId`, `localPath`, and `updatedAt` only after the local directory move succeeds.
- Preserve the existing paper folder name and all contained files, including `source.pdf`, `paper.md`, `note.md`, and `images/`.
- Refresh the sidebar list after a move without losing unrelated application state.
- Surface a clear failure message if directory permission is missing, the source folder is missing, or the target move fails.

## Acceptance Criteria

- [ ] Moving a paper from group A to group B updates `papers.groupId` and changes `localPath` from `A/<paperFolder>` to `B/<paperFolder>`.
- [ ] Moving a paper from a group to `未分类` updates `groupId` to `undefined` and changes `localPath` to `未分类/<paperFolder>`.
- [ ] Moving a paper with `note.md` and `images/` keeps those files readable from the new location.
- [ ] A failed local directory move leaves the existing `groupId` and `localPath` unchanged.
- [ ] The selected paper still opens after a successful move.
- [ ] `npm run build` passes.

## Definition of Done

- Tests added or updated where practical for path calculation and move behavior.
- Build or type-check is green.
- PRD, design, and implementation plan stay aligned with shipped behavior.

## Out of Scope

- Re-running OCR or re-importing the paper.
- Bulk moving many papers in one operation unless selected as the MVP interaction.
- Renaming group directories and migrating every paper under a renamed group.
- Cross-root moves between different selected storage directories.

## Decision

**Context**: The current sidebar renders papers inside groups but has no existing move interaction. Mis-grouped papers need a low-risk correction path that also keeps local files aligned.

**Decision**: Use a per-paper move menu for MVP. Drag-and-drop and bulk move stay out of scope.

**Consequences**: The first implementation stays small and explicit. Moving many papers takes more clicks, but directory migration risk stays contained to one paper per operation.

## Research References

- Repo inspection only; no external research needed for this task.
