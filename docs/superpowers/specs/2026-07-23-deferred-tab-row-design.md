# Deferred Reminder Tab Row Design

## Goal

Render each item in the board's deferred reminder section as a compact browser-tab-style row consistent with the existing board tab list.

## Layout

- Keep the existing deferred reminder section and heading.
- Render each reminder as a single row approximately 40 pixels high.
- Show the saved favicon at the left, followed by a single-line title that truncates with an ellipsis.
- Show the reminder state and local due time in `YYYY-MM-DD HH:mm` format after the title.
- Keep compact `打开` and `删除` actions visible at the right at all times.
- Preserve a single-row layout at narrow widths by allowing the title to shrink before status or actions.

## Visual Treatment

- Use a white row background and subtle separators to match the existing board tab rows.
- Reuse the existing 16-pixel tab favicon treatment, including the GitHub contrast background.
- Use garden green for the open action and a light red treatment for delete.
- Keep due status visually distinguishable without using a large pill or a second text line.

## Behavior

- Opening a reminder creates the saved URL in the board's current browser window and then removes that reminder from local storage.
- The background performs creation before deletion so a failed tab creation leaves the reminder available for retry.
- After a successful open, the board refreshes both the reminder list and reminder statistics.
- Deleting a reminder continues to remove it and refresh both the reminder list and statistics.
- This change does not alter reminder storage, scheduling, or notification behavior.

## Validation

- Add a regression contract covering favicon rendering, single-row structure, visible actions, and compact styling.
- Add a regression contract covering successful-open removal and the board refresh after opening.
- Run `npm test`, `npm run typecheck`, `git diff --check`, and `npm run build`.
