# Tab Workflow Design

## Goal

Extend Tab Garden from a visual current-tab organizer into a practical workflow tool: find tabs quickly, identify their source window, clean duplicates, save restorable workspaces, and defer tabs without reopening them automatically.

## Scope and delivery order

1. Search, filter, source-window labels, and tab activation.
2. Exact-URL duplicate detection with a reviewed batch-close action.
3. Local workspace snapshots with preview-before-restore.
4. Local deferred-tab reminders plus read-only cleanup statistics.

Each phase must be independently usable and tested before the next phase begins.

## Shared data rules

- Runtime browser tab state remains derived from `chrome.tabs` and is never synced.
- Workspace snapshots and deferred-tab records contain title and URL, so they remain in `chrome.storage.local` and must not be uploaded to Supabase.
- Stable settings, grouping rules, custom group metadata, and layout metadata keep their existing sync behavior.
- Window and tab identifiers remain runtime-only. They may help an immediate action but must not be saved into a workspace or deferred-tab record.

## Phase 1: find and locate tabs

The board receives a search query and optional filters for board group and source window. Matching is case-insensitive across title, full URL, and normalized hostname. Each rendered tab receives a compact source-window label and preserves the existing click-to-activate behavior. The browser's native tab strip is not styled or modified.

Empty searches show the current board unchanged. A non-empty search preserves all logical groups but hides non-matching tab rows; groups with no visible rows show a concise empty-search state.

## Phase 2: duplicate review

Duplicate candidates are tabs whose normalized full URLs are exactly equal. The board presents each candidate set with one retained tab and the tabs proposed for closing. No tab is closed until the user confirms the explicit review action. Domain-only similarity is a browsing filter, not a closing rule.

The batch action tolerates a tab being closed externally between review and confirmation: missing tabs are skipped, while remaining valid candidates are closed.

## Phase 3: local workspaces

A workspace snapshot records a user-supplied name and an ordered list of `{ title, url }` entries. Saving is available from selected eligible HTTP(S) tabs. Restoring opens a preview that lists the pages to be opened and requires explicit confirmation before creating new tabs in the current normal browser window.

Invalid, unsupported, or missing snapshot URLs are shown as unavailable in the preview and are not opened. Restoring never closes existing tabs.

## Phase 4: deferred tabs and cleanup statistics

Deferring a tab records its title, URL, favicon URL when available, and a due timestamp locally, then closes the current browser tab only after the record is saved. When due, the item appears in a dedicated board reminder section. The user can open, reschedule, or delete it; it never opens automatically.

Statistics display current eligible-tab count, exact-URL duplicate count, due deferred-item count, and a clearly labeled long-unvisited candidate count when Chrome data is available. Statistics are advisory and never close or archive pages without confirmation.

## Validation

- Add pure-function tests for query matching, duplicate grouping, workspace snapshot validation, restore preview construction, deferred-record validation, and due-state calculation.
- Validate Chrome message inputs before any browser mutation.
- Test each destructive action using review/confirmation flows and stale-tab handling.
- Manually verify multiple-window behavior, search, duplicate confirmation, workspace preview/restore, and due reminders in Chrome.
