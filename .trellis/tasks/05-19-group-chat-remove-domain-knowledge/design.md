# Design

## Boundaries

The change spans the sidebar group UI, main app selection state, reusable chat panel, chat hook, IndexedDB schema, filesystem group-note helpers, and Idea workflow context collection.

## Data flow

Group action -> App selection state -> ChatPanel scope -> useChat scope -> Dexie conversations/messages -> Gemini request -> assistant message -> optional group note append.

Paper chat keeps the existing flow:

Paper selection -> ChatPanel with `paperId` and `localPath` -> useChat paper scope -> paper markdown and cache path -> paper note append.

Group chat uses the new flow:

Group selection -> ChatPanel with `groupId` and `groupName` -> useChat group scope -> load papers by `groupId` -> concatenate markdown context -> no paper cache -> group note append.

## Storage contract

`Conversation` supports exactly one active scope:

- Paper conversation: `paperId` set, `groupId` absent.
- Group conversation: `groupId` set, `paperId` absent.

Dexie adds a new version with a `groupId` index on `conversations`. Existing paper conversations remain valid because `paperId` stays indexed and optional fields are tolerated by IndexedDB.

## UI contract

`ChatPanel` accepts a discriminated mode through optional props:

- `paperId`, `localPath`, `onNoteUpdated` for paper chat.
- `groupId`, `groupName`, `onGroupNoteUpdated` for group chat.

The existing message UI, conversation list, slash commands, image support, and paper mention popup remain shared.

## Domain-knowledge removal

Active domain-knowledge entry points are removed:

- Group action button and modal import.
- `useChat` domain-knowledge import, mention pattern, and context injection.
- File-system domain-knowledge helpers.
- Idea generator context section and local loader.

Domain-knowledge files already present on disk are left untouched.

## Trade-offs

Group chat does not use Gemini cached content because the context combines multiple papers and changes when group membership changes. This keeps behavior simple and avoids stale multi-paper caches.

Group chat includes all group papers. This follows the requested product behavior, with the risk that very large groups can exceed model context limits.

Existing search import layout changes are unrelated to this task and stay in place.
