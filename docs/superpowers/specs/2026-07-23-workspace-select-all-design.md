# Workspace Tab Select-All Design

## Goal

Add a `全选` checkbox beside the workspace-name field so users can select or clear every currently listed tab before saving a local workspace.

## Interaction

- Place the checkbox to the right of the workspace-name input in the main local-workspace dialog.
- Every time the dialog opens and its tab list is rendered, all tabs and the `全选` checkbox are selected by default.
- Clearing `全选` clears every tab checkbox; selecting it selects every tab checkbox.
- When users change individual tab checkboxes, `全选` becomes checked when all tabs are selected, unchecked when none are selected, and indeterminate when only some are selected.
- If there are no selectable tabs, disable `全选` and leave it unchecked and not indeterminate.
- At narrow dialog widths, allow the control row to wrap without overlapping the validation Toast or tab list.

## Scope

- Modify only the workspace dialog markup, styling, interaction code, and regression tests.
- Do not change workspace storage, background messages, restore behavior, permissions, or synchronization.
- Keep existing save behavior: only checked tab inputs are included in the workspace snapshot.

## Testing

Add a built-artifact contract covering the checkbox markup and label, default state synchronization, select/clear-all behavior, individual-change synchronization, empty-list disabling, and responsive layout. Run `npm test`, `npm run typecheck`, and `git diff --check`.
