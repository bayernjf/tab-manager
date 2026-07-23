# New Tab Board Design

## Goal

Let an authenticated user choose whether a browser-created new tab opens the Tab Garden board, without preventing the browser's native new-tab page when the setting is disabled.

## Approach

Do not add `chrome_url_overrides.newtab` to the manifest. Chrome does not allow that override to be changed at runtime, so it cannot support a real on/off setting.

Instead, the service worker listens for `chrome.tabs.onCreated`. When `openBoardOnNewTab` is enabled and the created tab is a browser new-tab URL (`chrome://newtab/` in either `url` or `pendingUrl`), it replaces that tab's URL with the extension's `board.html`. When disabled, and for every other created tab, it does nothing. This covers the new-tab `+` button and keyboard shortcuts that create a new tab.

## Settings and Sync

`Settings` gains `openBoardOnNewTab`, defaulting to `false`. It is persisted locally and stored in `user_settings.open_board_on_new_tab`, so it follows the existing cloud-sync setting rules. A new numbered migration adds the non-null boolean column with a `false` default.

The existing settings parsing, validation, Supabase row conversion, and portable import/export data all include the new setting. Older remote rows and older local settings use `false` during migration.

## User Interface

The Options page's "高级同步与隐私" panel gets a "新标签页" card with a checkbox labelled "新标签页打开看板" and concise explanatory copy. Saving this control uses the existing settings-save flow and reports the existing success/error status.

The popup remains unchanged: it keeps its compact scope and only reflects the setting through normal settings synchronization.

## Error Handling and Privacy

The service worker reads the local setting for each created tab. If local storage cannot be read, or if the tab is not a browser new-tab page, it leaves the tab untouched. It does not upload tab IDs, URLs, titles, or the runtime event. Only the boolean preference is synchronized.

## Verification

Unit tests cover the default/validation/sync conversion path and recognition of Chrome new-tab URLs. Manual verification covers enabled and disabled behavior for the `+` button, keyboard new-tab shortcut, a regular link opening a tab, and an extension-created board tab.
