# Resizable Workspace Dialog Design

## Goal

Allow users to resize the local-workspace dialog in both width and height by dragging its lower-right corner, while keeping the dialog usable and inside the viewport.

## Root Cause

The original `.workspace-dialog` did not opt into CSS resizing. After enabling native resizing, the modal dialog still used the browser's `inset: 0` and `margin: auto` centering. Those automatic margins are recalculated while the element grows, so its top-left corner moves and the lower-right handle falls behind the pointer. The resizable dialog must therefore capture its centered position when opened and use that fixed top-left anchor throughout the drag.

## Interaction

- On desktop and tablet widths above 640px, the workspace dialog uses the browser's native lower-right resize handle.
- Users can change both width and height.
- The dialog is centered when opened, then its current top-left corner is fixed so the lower-right handle tracks the pointer one-to-one.
- A minimum width and height keep the name field, actions, and tab list usable.
- Maximum width and height keep the dialog within the viewport with the existing 16px outer margin.
- Closing and reopening the dialog during the same page session preserves the element's resized dimensions.
- Reloading the board restores the default dimensions; resized values are not persisted to extension storage or Supabase.
- The workspace restore dialog keeps its current non-resizable behavior. Only the main `#workspace-dialog` used to create and manage workspaces becomes resizable.

## Layout Behavior

The main workspace dialog receives a dedicated resizable class and named `inline-size` container (`workspace-dialog`) so the shared `.workspace-dialog` styles remain valid for the restore dialog and the responsive toast behavior can use the dialog's actual resized width.

The dialog becomes a bounded vertical layout. Its tab checklist is the flexible scrolling region, so increasing the dialog height reveals more tabs. The saved-workspace list keeps its natural height and does not create a second inner scroller; when the dialog is short, the dialog's own overflow makes the list and actions reachable.

The dialog uses:

- `resize: both`;
- `overflow: auto`, which enables native resizing;
- a safe minimum size;
- viewport-based maximum width and height;
- a default width consistent with the current 620px layout.

After `showModal()`, the board reads the centered rectangle, clamps its top-left coordinates to the 16px viewport margin, stores them as element-scoped CSS variables, and applies a fixed-position anchor class with `margin: 0`. A viewport resize refreshes the anchor and available maximum size. At mobile width the anchor is removed and native centered responsive layout resumes.

At a dialog container width of 520px or less, the validation toast changes from its default right-of-input placement to a static, full-width row with no arrow and no transform. This prevents a 360px-wide resized dialog from hiding the toast in horizontal overflow.

At `max-width: 640px`, native resizing is disabled and the dialog returns to responsive viewport sizing. The mobile toast retains its existing 6px top margin. This prevents a resized desktop size from overflowing a narrow viewport.

## Accessibility

- Existing dialog semantics, focus behavior, keyboard closing, labels, and the workspace-name validation alert remain unchanged.
- The native browser resize affordance is used instead of a custom pointer-only drag implementation.
- All actions remain reachable when the dialog is at its minimum supported size.

## Testing

Add a built-artifact CSS/markup contract that verifies:

- only `#workspace-dialog` has the resizable class;
- the resizable class enables `resize: both` and non-visible overflow;
- minimum and viewport maximum dimensions are present;
- opening occurs before the top-left anchor is captured, and viewport resize refreshes that anchor;
- the anchored state uses fixed coordinates with zero automatic margin and right/bottom viewport bounds;
- the workspace tab list can grow with available dialog height;
- the workspace list has natural height, no independent scroll, and remains reachable through the dialog overflow;
- the main dialog establishes the named container, and its 520px query makes the toast static, full width, and arrow-free;
- the `max-width: 640px` rule disables resizing and restores responsive sizing;
- the restore dialog does not receive the resizable class.

Run `npm test`, `npm run typecheck`, and `git diff --check`. Browser verification must confirm the lower-right handle stays under the pointer while changing width and height, minimum bounds keep controls usable, increased height reveals more tab rows, the saved-workspace list does not create a nested scrollbar, a dialog narrowed to 520px or less shows the toast below the input, and narrow viewport layouts remain inside the viewport.
