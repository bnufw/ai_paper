# Implementation Plan

## Steps

1. Preserve unrelated search import layout edits.
2. Update `src/services/storage/db.ts` so `Conversation` supports `groupId` and Dexie indexes group conversations.
3. Update `src/hooks/useChat.ts` to support paper and group scopes, remove domain-knowledge logic, and build group context from group papers.
4. Update `src/components/chat/ChatPanel.tsx` to accept group scope and append group chat replies to group notes.
5. Update `src/App.tsx`, `src/components/layout/Sidebar.tsx`, and `src/components/layout/GroupList.tsx` to add group chat selection and remove domain-knowledge UI.
6. Remove active domain-knowledge helpers from `src/services/storage/fileSystem.ts` and Idea generator context from `src/services/idea/workflowStorage.ts`.
7. Delete orphaned domain-knowledge component/service/prompt files if no active imports remain.

## Validation

- Type-check/build is the right verification target for this change.
- Manual behavior checks should cover paper chat, group chat, group note append, and Idea generation context.
- Validation commands are intentionally not run unless requested.

## Risk points

- Large groups can exceed model context limits.
- Dexie schema changes require careful version ordering.
- Group note append depends on existing File System Access permission.
