# Tab Garden Tab Board Design

## Goal

Add a dedicated tab-board page opened from the extension popup. It provides a sticky-note-like visual board for the current browser window, with draggable group cards, vertically arranged tabs, automatic/custom virtual groups, and device-specific synchronized layout preferences. Browser tabs remain ungrouped in Chrome/Edge.

## Board Surface

- The popup remains an entry point for quick actions and exposes an `Open tab board` action.
- The board opens in an extension tab, not in the 390px popup.
- Only the current browser window is managed in the first release.
- Pinned tabs and browser-internal pages are not shown.
- A fixed `Ungrouped` card displays every eligible tab without a virtual board assignment. Dragging a tab into it clears only its virtual assignment.

## Group Cards and Tabs

- Each logical group is a fixed-width card with a colored header and a vertically arranged Edge-style tab list.
- Cards show whether the group is automatic or custom.
- An automatic group derives its stable identity from the normalized site key. A custom group uses a durable UUID; Chrome's transient group ID is neither read nor synchronized.
- Moving a tab into a custom group creates a local virtual assignment. Moving it to an automatic group keeps it eligible for later board-only automatic reconciliation.
- Custom groups may remain as empty cards. Their title, color, logical order, and device-specific layout state synchronize across devices.

## Height and Splitting

- One layout height unit equals the visual height of five tab rows.
- A card with one through five tabs uses one unit (five visible tab rows).
- A card with six through ten tabs uses two units (ten visible tab rows).
- Ten tabs is the maximum per card. The eleventh and later tabs create the second visual card for the same logical group; every additional ten tabs create another segment.
- Segments share group name/color and display an ordinal suffix such as `Work · 2`. They form one inseparable horizontal composite block: a 21-tab group displays `Work`, `Work · 2`, and `Work · 3` left-to-right. Group-level dragging moves the complete composite block; tab ordering remains continuous across segments.

## Layout Algorithm

- Board cards use a fixed-width grid. Desktop uses three lanes; tablet and phone definitions are persisted for future clients with two and one lane respectively.
- Each segment card spans one or two five-row grid units according to its tab count. All segments for a logical group form a horizontal composite block whose outer height is its tallest segment; its internal lower blanks are reserved and are never filled by another group.
- When `autoFill` is enabled, composite blocks are placed in synchronized logical rank order into the topmost, then leftmost, complete grid area that fits the entire block. This is deterministic compact masonry between logical groups, not inside a logical group's segments.
- For example, `A` (height 2), `A · 2` (height 2), and `A · 3` (height 1) form a three-column-by-two-unit composite block. The unit beneath `A · 3` remains reserved. Other logical groups may fill only areas outside that outer block.
- Dragging a composite block displays an insertion target. Dropping it updates the logical group rank, synchronizes that rank, then recomputes composite placement for the active device class.
- When `autoFill` is disabled, composite blocks do not fill gaps after a drag or a height change. Positions are stored independently for `desktop`, `tablet`, and `mobile`; these coordinate layouts do not overwrite one another.
- Even when auto-fill is enabled, every logical group rank is synchronized. Pixel coordinates are never synchronized in auto-fill mode.

## Data and Synchronization

- Add a later numbered migration; never modify previously executed migrations.
- Persist durable custom board groups and board layout records under RLS, owned by `auth.uid() = user_id`.
- Layout records include stable group key, device class, logical rank, auto-fill preference, and optional manual lane/slot position for the whole composite block.
- Synchronize only durable group/layout metadata. Do not synchronize tab IDs, window IDs, native Chrome group IDs, tab URLs/titles, runtime virtual assignments, or sessions.
- Existing privacy/global sync settings gate these board metadata writes. Offline failures preserve the local board state and return retryable status.

## Drag Operations

- Drag tab card: reorder within the destination group, move across groups, or drop into Ungrouped.
- Drag logical group card: change group rank; in manual layout mode, change its device-specific position.
- Automatic and custom card mutation operations are routed through the service worker, which is the only component calling Chrome tab-query APIs or Supabase. It never creates, changes, groups, or ungroups native Chrome tab groups.
- The board UI never accesses Supabase directly and renders all tab/group data through safe DOM APIs.

## Error Handling and Validation

- All board messages return `{ error: string }` on failure.
- Invalid drops leave virtual assignments and local layout untouched and show concise Chinese status.
- Destructive actions, including deleting a durable custom group, require confirmation.
- Unauthenticated board access displays the existing login guidance and hides mutation controls.

## Testing

- Unit tests: segment calculation, composite-block geometry, height unit calculation, deterministic composite placement, virtual-assignment validation, rank changes, device-class isolation, and portable layout validation.
- Manual checks: ungrouped tab movement, custom/automatic virtual group behavior, browser tabs remaining ungrouped, card and tab drag/drop, ten-tab split, horizontal multi-segment blocks, auto-fill on/off, desktop layout persistence, offline fallback, and a second account's isolation.
- Delivery checks: `npm run typecheck`, `npm test`, `git diff --check`, `npm run build`.
