# Deferred Reminder Shortcuts Design

## Goal

Replace free-text reminder entry with configurable shortcut times that let a user defer a board tab in two clicks.

## Behavior

- Settings default to 1, 3, and 5 minutes; users may add, edit, remove, and order times, with a maximum of five entries.
- Hovering a board row reveals `◷`. Clicking it opens a compact anchored menu containing the configured options in the stored order.
- Choosing an option computes `now + minutes`, saves the local reminder, then closes the source tab through the existing safe defer flow.
- The menu offers `自定义时间…`, using a native `datetime-local` control and explicit confirmation. Invalid or past time is rejected.
- Shortcut settings are stable preferences and may use the existing settings sync policy. Deferred tab records remain local-only.

## UI

- The options page receives a “快捷提醒时间” setting row with small minute inputs and delete controls; inputs are 1–10080 minutes and at most five.
- The board menu is transient, closes on choice, Escape, or click outside, and does not alter the row layout before it is opened.

## Validation

- Pure tests validate normalization, defaulting, uniqueness, bounds, and the five-item cap.
- Built-file tests cover the options controls and board menu message flow.
- Existing defer behavior remains the only code path that closes a tab.
