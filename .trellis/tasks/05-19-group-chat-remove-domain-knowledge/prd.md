# Remove domain knowledge and add group chat

## Goal

Remove the group domain-knowledge feature and replace the group-level value path with group chat:

- Each paper group exposes a group chat entry.
- Group chat uses all papers in that group as AI context.
- Assistant replies from group chat can be recorded into the group note.
- Existing search import layout edits are preserved because they are outside this task.

## Requirements

- Remove domain-knowledge UI entry points from group actions.
- Remove domain-knowledge chat behavior, including `@领域知识` detection and context injection.
- Remove domain-knowledge storage helpers and Idea generator context usage.
- Add a group chat action for every regular paper group.
- Selecting group chat opens the existing chat panel in group scope rather than paper scope.
- Group chat context includes markdown from all papers in the selected group.
- Empty groups should produce a clear user-facing error instead of sending an empty context.
- Paper chat behavior must remain compatible with existing conversations, cache usage, paper mentions, editing, clearing, renaming, deleting, and exporting.
- Group chat conversations must be stored separately from paper conversations.
- Group chat assistant messages can be appended to the selected group's `group_note.md`.
- Existing group note modal and paper note behavior remain unchanged.

## Acceptance Criteria

- [ ] Search import layout files remain untouched by this task.
- [ ] Group rows show a group chat action and no domain-knowledge action.
- [ ] Domain-knowledge modal/service imports are removed from active code paths.
- [ ] Paper chat still loads by `paperId`; group chat loads by `groupId`.
- [ ] Group chat sends all available group paper markdown as context.
- [ ] Group chat conversations persist under `conversations.groupId`.
- [ ] Group chat "add to note" appends to the target group's `group_note.md`.
- [ ] Idea generation context uses paper notes and user research direction only.

## Notes

- Scope is limited to removing domain-knowledge behavior and adding group chat.
- No migration is required for existing `domain_knowledge.md` files; feature code stops reading and writing them.
