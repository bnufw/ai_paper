# Fix empty idea history detail

## Goal

Idea history entries that point to existing workflow output files should open with visible Markdown content. A missing or empty `best_idea.md` must not hide readable candidate idea files under `ideas/`.

## Background / Known Context

- The sidebar lists completed Idea sessions from IndexedDB via `getAllIdeaSessions()`.
- Clicking a history item sets `currentIdeaSession`, then `useIdeaChat()` reads files from `session.localPath`.
- `useIdeaChat()` currently reads `best_idea.md`, `ideas/*.md`, and saved chat messages together.
- Current loading logic returns early when `best_idea.md` is missing or empty, so `ideas/idea_*.md` content is never committed to state even when candidate files exist.

## Requirements

- Opening a completed Idea history session must display available Idea Markdown content from local storage.
- If `best_idea.md` is present and non-empty, keep showing it by default.
- If `best_idea.md` is absent or empty but candidate idea files exist, show the first candidate idea by default and keep all candidate options selectable.
- If no readable Idea content exists, show the existing empty/error state.
- Keep the fix scoped to Idea history/detail loading and viewer selection behavior.

## Acceptance Criteria

- [ ] A session with `best_idea.md` opens on Best Idea as before.
- [ ] A session with `ideas/idea_*.md` files and no readable `best_idea.md` opens with the first candidate idea visible.
- [ ] Candidate idea files are still sorted by numeric index.
- [ ] Chat context can be prepared from candidate ideas when Best Idea is unavailable.
- [ ] `npm run build` passes.

## Notes

- Lightweight task; PRD-only planning is sufficient.
