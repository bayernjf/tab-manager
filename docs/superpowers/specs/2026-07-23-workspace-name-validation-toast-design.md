# Workspace Name Validation Toast Design

## Goal

Replace the board-wide workspace-name error with a clear validation toast beside the workspace name field. Empty and duplicate names must receive distinct Chinese messages before a workspace is saved.

## Scope

- Validate the name used by the existing local-workspace save flow.
- Show validation feedback next to the name field inside the existing workspace dialog.
- Reject duplicate names in both the board UI and the background message handler.
- Preserve existing workspace selection, storage, restore, and delete behavior.
- Do not change Supabase synchronization or store workspace snapshots remotely.

## Name Rules

1. Trim leading and trailing whitespace before validation and persistence.
2. An empty trimmed name is invalid and shows `请输入工作区名称`.
3. Duplicate comparison uses the trimmed name and ignores English letter case.
4. A duplicate name shows `该工作区名称已存在`.
5. A valid unique name continues through the existing save flow.

The comparison rule means `Work`, `work`, and ` work ` identify the same workspace name.

## Board Interaction

The workspace name input and its validation toast form one positioned field container. The toast appears beside the input when space allows and below it at narrow widths. It uses `role="alert"` so assistive technology announces the message.

When validation fails:

- the toast displays the specific validation message;
- the input receives an invalid visual state and `aria-invalid="true"`;
- focus moves to the name input;
- the existing board-wide status region is not used for these name errors;
- the dialog remains open and no save message is sent for a client-detectable error.

When the user edits the name, closes the workspace dialog, or successfully saves, the toast and invalid state are cleared. Other failures, including invalid selected tabs or runtime/storage errors, continue to use the existing board-wide status region.

The toast remains visible until the user edits the field or the dialog is closed. It does not disappear on a timer.

## Background Enforcement

The `save-workspace` handler trims the incoming title and compares it against stored workspace titles using the same case-insensitive rule before appending a snapshot. This protects the storage invariant when the UI state is stale or another caller sends the message directly.

The background returns distinct Chinese errors for an empty title and a duplicate title. Existing invalid-tab validation remains separate. The board maps the two name errors to the nearby toast; unrelated errors continue to the global status region.

## Accessibility and Styling

- Associate the toast with the input through `aria-describedby`.
- Set and clear `aria-invalid` with the visual error state.
- Use the existing board palette with a restrained red border, pale red toast background, and readable error text.
- Do not cover the checkbox list or saved-workspace controls.
- Ensure the placement adapts to the current dialog width and narrow viewports.

## Testing

Add regression coverage before implementation for:

- the field-adjacent alert markup and invalid-state styling contract;
- the empty-name message and absence of a save request;
- duplicate detection after trimming and case normalization;
- background rejection of duplicate workspace names;
- successful unique-name saving with the trimmed title;
- clearing the validation toast when the user edits the name.

Run `npm test`, `npm run typecheck`, and `git diff --check` after implementation. Browser verification should confirm the toast position, focus behavior, narrow-width wrapping, and that other workspace errors still use the existing status region.
