# Tab Garden Options Page Implementation Plan

> **Status:** ✅ 已实现（v0.1.11）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated options page with synced domain rules, ignored sites, default automatic-group color, privacy controls, and safe local JSON import/export.

**Architecture:** The options page is presentation-only and sends typed messages to the service worker. `shared.ts` owns pure validation and match precedence, `storage.ts` owns local durable state, `sync.ts` converts Supabase REST rows, and `background.ts` owns Chrome APIs, synchronization, mutations, and reconciliation.

**Tech Stack:** Chrome/Edge Manifest V3, native strict TypeScript, Chrome Storage API, Supabase Auth/PostgREST, Node.js test runner.

---

## File map

- Create `src/options.html`, `src/options.ts`, `src/options.css` for the page markup, interaction, and responsive layout.
- Create `supabase/migrations/002_add_options_sync.sql` for additive schema and RLS work.
- Modify `src/shared.ts` for types, defaults, validation, matching, and portable data.
- Modify `src/storage.ts` for durable rules and ignored sites.
- Modify `src/sync.ts` for authenticated cloud conversion and operations.
- Modify `src/background.ts` for message routing, synchronization, import/export, and reconciliation.
- Modify `src/manifest.json` and `scripts/inject-env.mjs` to register/build the page.
- Modify `tests/shared.test.js` for pure behavior coverage.

### Task 1: Define and test durable domain behavior

**Files:**
- Modify: `src/shared.ts`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write failing tests**

Add tests that an exact `docs.example.com` rule wins over an enabled `example.com` subdomain rule, that an exact ignored site wins over both, and that importing version 1 data rejects `minimumTabs: 1` or unknown `accessToken`.

```js
assert.equal(findMatchingRule("docs.example.com", rules)?.id, "exact");
assert.equal(isIgnoredSite("docs.example.com", ignoredSites), true);
assert.throws(() => parsePortableData({ version: 1, settings: { ...DEFAULT_SETTINGS, minimumTabs: 1 }, rules: [], ignoredSites: [] }));
```

- [ ] **Step 2: Verify red**

Run `npm run build && node --test tests/shared.test.js`; expect failure because the new exports do not exist.

- [ ] **Step 3: Implement the shared model**

Add these types and settings fields to `src/shared.ts`:

```ts
export type MatchScope = "exact" | "domain-and-subdomains";
export interface GroupRule { id: string; title: string; color: GroupColor; domains: string[]; matchScope: MatchScope; enabled: boolean; sortOrder: number; }
export interface IgnoredSite { id: string; domain: string; matchScope: MatchScope; sortOrder: number; }
export interface Settings {
  autoGroupEnabled: boolean; minimumTabs: number; defaultGroupColor: GroupColor;
  cloudSyncEnabled: boolean; syncRulesEnabled: boolean; syncIgnoreListEnabled: boolean;
  lastSuccessfulSyncAt: string | null;
}
```

Set the new defaults to `blue`, `true`, `true`, `true`, and `null` respectively.

- [ ] **Step 4: Implement pure validation/matching**

Implement `normalizeDomainInput`, `matchesDomain`, `findMatchingRule`, `isIgnoredSite`, `parsePortableData`, and `toPortableData`. Normalize URLs/hostnames through existing hostname rules. Exact scope precedes subdomain scope, then lower `sortOrder`. Portable data has exact keys `version`, `settings`, `rules`, and `ignoredSites`; it validates every color, scope, title, domain, duplicate, and count before returning a normalized copy.

- [ ] **Step 5: Verify green and commit**

Run `npm run typecheck && npm run build && node --test tests/shared.test.js`; expect pass.

Commit `src/shared.ts` and `tests/shared.test.js` with:

```text
feat(rules): define durable grouping behavior

Add validated rule, ignore-list, and portable data primitives.
```

### Task 2: Persist the extended local state

**Files:**
- Modify: `src/storage.ts`
- Modify: `src/shared.ts`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write a failing serialization test**

Assert `toPortableData(settings, rules, ignoredSites)` contains no `autoGroups`, `groupId`, `windowId`, token, email, or tab fields.

- [ ] **Step 2: Verify red**

Run `npm run build && node --test tests/shared.test.js`; expect failure until safe serialization is added.

- [ ] **Step 3: Add storage accessors**

Add `groupRules` and `ignoredSites` to `KEYS` and `loadState()`, defaulting to empty arrays. Add `saveGroupRules(groupRules: GroupRule[])` and `saveIgnoredSites(ignoredSites: IgnoredSite[])`, each using only `chrome.storage.local.set` for its named key. Leave existing runtime `autoGroups` and `customGroups` unchanged.

- [ ] **Step 4: Verify green and commit**

Run `npm run typecheck && npm run build && node --test tests/shared.test.js`; expect pass.

Commit `src/storage.ts`, `src/shared.ts`, and `tests/shared.test.js` with:

```text
feat(storage): persist options page state

Store durable rules and ignored sites separately from runtime tab state.
```

### Task 3: Add the schema and Supabase synchronization boundary

**Files:**
- Create: `supabase/migrations/002_add_options_sync.sql`
- Modify: `src/sync.ts`
- Modify: `src/shared.ts`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write an additive migration**

Add the four new settings columns to `public.user_settings`: `default_group_color`, `cloud_sync_enabled`, `sync_rules_enabled`, and `sync_ignore_list_enabled`. Add `match_scope` to `public.group_rules` with the two accepted values. Create `public.ignored_sites` with `id`, `user_id`, `domain`, `match_scope`, `sort_order`, timestamps, and a unique `(user_id, domain, match_scope)` constraint. Add user/order indexes, `set_updated_at` trigger, RLS, four owner-only policies using the exact `auth.uid() = user_id` pattern from `001`, revoke anon access, and grant authenticated CRUD. Do not modify `001`.

- [ ] **Step 2: Write failing row-conversion tests**

Test that snake_case rows map to the extended camelCase settings, rules, and ignored-site types, and malformed color/scope values throw before storage is changed.

- [ ] **Step 3: Verify red**

Run `npm run build && node --test tests/shared.test.js`; expect converter-related test failures.

- [ ] **Step 4: Implement authenticated category operations**

Extend the existing settings select/upsert and add `fetchGroupRules`, `replaceGroupRules`, `fetchIgnoredSites`, and `replaceIgnoredSites` in `src/sync.ts`. Replacements delete only the authenticated user's rows using an encoded `user_id` filter, then insert only already validated values. The sync orchestrator must skip all REST calls if cloud sync is disabled and skip a category if its category setting is disabled.

- [ ] **Step 5: Verify green and commit**

Run `npm run typecheck && npm test`; expect pass.

Commit migration, sync, shared conversions, and tests with:

```text
feat(sync): synchronize options data

Add owner-scoped cloud storage for rules, ignored sites, and extended settings.
```

### Task 4: Apply rule decisions during automatic grouping

**Files:**
- Modify: `src/shared.ts`
- Modify: `src/background.ts`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write failing decision tests**

Test that `resolveAutoGroup` returns `ignore` for an ignored match, returns the matched rule's title/color, and falls back to `siteTitle(siteKey)` plus `defaultGroupColor`.

- [ ] **Step 2: Verify red**

Run `npm run build && node --test tests/shared.test.js`; expect missing-helper failures.

- [ ] **Step 3: Implement the decision helper**

```ts
export type AutoGroupDecision = { kind: "ignore" } | { kind: "group"; title: string; color: GroupColor; siteKey: string };
export function resolveAutoGroup(siteKey: string, settings: Settings, rules: GroupRule[], ignoredSites: IgnoredSite[]): AutoGroupDecision {
  if (isIgnoredSite(siteKey, ignoredSites)) return { kind: "ignore" };
  const rule = findMatchingRule(siteKey, rules);
  return rule ? { kind: "group", title: rule.title, color: rule.color, siteKey } :
    { kind: "group", title: siteTitle(siteKey), color: settings.defaultGroupColor, siteKey };
}
```

- [ ] **Step 4: Integrate the helper in `reconcileWindow`**

Load local rules/ignored sites; exclude ignored tabs from candidates; dissolve previously managed automatic groups that become ignored; use the decision title/color in `chrome.tabGroups.update`. Preserve threshold, HTTP(S), pinned-tab, non-managed-group protection, debounce, and runtime group records.

- [ ] **Step 5: Verify green and commit**

Run `npm run typecheck && npm test`; expect pass.

Commit background, shared, and tests with:

```text
feat(tabs): apply synced domain rules

Honor ignored sites and rule-defined automatic group presentation.
```

### Task 5: Add options messages, synchronization, and data transfer

**Files:**
- Modify: `src/background.ts`
- Modify: `src/storage.ts`
- Modify: `src/shared.ts`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write failing import and export tests**

Cover duplicate ignored sites, bad domains/colors/scopes, unknown portable-data keys, valid version 1 input, invalid import with no mutation, and exported data lacking account/session/runtime fields.

- [ ] **Step 2: Verify red**

Run `npm run build && node --test tests/shared.test.js`; expect failure until background-facing import validation and mapping exists.

- [ ] **Step 3: Extend the typed background message union**

Add `get-options-state`, `sync-now`, `save-options-settings`, `create-group-rule`, `update-group-rule`, `delete-group-rule`, `create-ignored-site`, `delete-ignored-site`, `export-options-data`, and `import-options-data`. The state response contains only user display information, settings, rules, ignored sites, and non-sensitive sync status.

- [ ] **Step 4: Implement local-first operations**

Every operation validates via `shared.ts`, persists local state, conditionally uses the `sync.ts` category operation, updates `lastSuccessfulSyncAt` only on success, and calls `reconcileAllWindows`. `sync-now` reads/writes only enabled categories. `import-options-data` must first return a validated preview and mutate only when a second message includes `confirmed: true`; it then replaces only portable categories and syncs enabled categories.

- [ ] **Step 5: Verify green and commit**

Run `npm run typecheck && npm test && git diff --check`; expect pass.

Commit `src/background.ts`, `src/shared.ts`, `src/storage.ts`, and tests with:

```text
feat(options): expose settings management API

Provide validated local-first rule, privacy, sync, and portable data operations.
```

### Task 6: Register and build the options page

**Files:**
- Create: `src/options.html`
- Create: `src/options.ts`
- Create: `src/options.css`
- Modify: `src/manifest.json`
- Modify: `scripts/inject-env.mjs`

- [ ] **Step 1: Register and copy the page**

Add this Manifest V3 configuration without adding browser permissions:

```json
"options_ui": { "page": "options.html", "open_in_tab": true }
```

Update `scripts/inject-env.mjs` only if its static asset list is explicit, so `options.html`, `options.css`, and the compiled `options.js` are present in `dist/`.

- [ ] **Step 2: Write accessible markup**

Create left-navigation buttons and matching panels for Account and sync, Domain grouping rules, Ignored websites, Default appearance, Import and export, and Advanced sync and privacy. Include the account email/status/manual sync/sign-out; rule title/domain/scope/color/enabled editor and list; ignored-site editor/list; default color selector; export button and JSON file input; and all three privacy toggles. Use Simplified Chinese text, exact form types, `aria-live` status, and no user-data `innerHTML`.

- [ ] **Step 3: Implement the options client**

Use typed `$<T>()` and `send<T>()` helpers. On load request `get-options-state`; render lists via `replaceChildren()` and DOM APIs; route navigation selection to panels; and wire every form to the matching background message. Use `window.confirm` for delete and destructive import confirmation.

- [ ] **Step 4: Implement JSON browser transfer**

Export with a returned portable object, `Blob`, `URL.createObjectURL`, a temporary download anchor, and URL revocation. Import with `File.text()`, parse to a preview request, then make the second confirmed message only after user confirmation.

- [ ] **Step 5: Add responsive styling**

Create a desktop left-sidebar/content layout that stacks on narrow screens, matches popup styling, keeps native focus outlines, and works at 320px with no clipped form controls or horizontal page overflow.

- [ ] **Step 6: Verify green and commit**

Run `npm run build && test -f dist/options.html && test -f dist/options.js && test -f dist/options.css && npm test`; expect pass.

Commit page files, manifest, and build script with:

```text
feat(options): add settings management page

Provide a dedicated interface for account, rules, privacy, and data tools.
```

### Task 7: Complete acceptance verification

**Files:**
- Modify: `README.md` only if its documented setup/features need an update.
- Test: `tests/shared.test.js`

- [ ] **Step 1: Run final automated verification**

Run `npm run typecheck`, then `npm test`, then `git diff --check`; expect all commands to exit 0.

- [ ] **Step 2: Build and manually test the extension**

Run `npm run build`, reload `dist/` in Chrome/Edge, and verify unauthenticated access, login/logout, manual sync, all privacy switches, exact/subdomain precedence, blacklist ungrouping, default color, offline local save/retry, separate-user data isolation, invalid import no-write, valid confirmed import, and export without email/tokens/runtime IDs.

- [ ] **Step 3: Update README only when needed**

If README needs a setup or feature change, commit it separately:

```text
docs(options): explain settings page setup

Document the options page and required Supabase migration.
```

Otherwise do not create a documentation commit.

## Plan self-review

- Spec coverage: Tasks 1–2 implement durable local data and safe portable data; Task 3 implements the RLS-protected cloud model; Task 4 changes runtime grouping; Task 5 provides message/sync behavior; Task 6 delivers the interface; Task 7 covers automated and manual acceptance criteria.
- Placeholder scan: no deferred or unspecified validation remains; every mutation boundary and validation command is named.
- Type consistency: `MatchScope`, `GroupRule`, `IgnoredSite`, `Settings`, `PortableData`, `resolveAutoGroup`, and options message names are consistent across tasks.
