# Tab Garden Options Page Design

## Goal

Add a dedicated Manifest V3 options page for account and sync controls, durable domain grouping rules, ignored websites, default automatic-group color, local import/export, and privacy-oriented sync controls. The popup remains focused on current-window tab actions and manual custom groups.

## Information Architecture

The options page uses persistent left navigation with six sections:

1. Account and sync status
2. Domain grouping rules
3. Ignored websites
4. Default appearance
5. Import and export
6. Advanced sync and privacy

The account section shows the signed-in email, last successful sync time, current sync result, a manual sync action, and sign-out. It redirects unauthenticated users to the existing popup login flow instead of duplicating authentication forms.

## Data Model

### Local state

`chrome.storage.local` will persist these user preferences in addition to the current `Settings` fields:

- `defaultGroupColor`
- `cloudSyncEnabled`
- `syncRulesEnabled`
- `syncIgnoreListEnabled`
- `lastSuccessfulSyncAt`

Grouping rules and ignored websites are also kept locally so grouping works offline and when cloud synchronization is disabled.

### Supabase

The existing `group_rules` table becomes the cloud source for durable domain rules. A new numbered migration will:

- extend `user_settings` with the new settings fields;
- add `public.ignored_sites` for stable domains and exact/subdomain match scope;
- enable RLS and apply owner-only policies using `auth.uid() = user_id`;
- add user and ordering indexes;
- preserve the existing `001` migration unchanged.

No Chrome tab ID, window ID, native group ID, session token, email, active tab list, or automatic-group runtime mapping is synchronized.

## Rule Semantics

- Rules have a title, color, enabled flag, stable domains, match scope, and order.
- Exact-domain rules match only their listed host. Domain-and-subdomain rules match the listed host and all its subdomains.
- The first enabled matching rule wins. Exact matches are evaluated before domain-and-subdomain matches.
- The ignored-site list takes precedence over every automatic setting and rule. Matching tabs are not changed, and any existing automatically managed group for that site is dissolved.
- A matched rule produces an automatically managed Chrome group with the rule title and color. An unmatched eligible site follows the current automatic grouping behavior and uses `defaultGroupColor`.
- User-created native groups and extension-created manual custom groups remain untouched.

## Synchronization

- Authentication restore, sign-in, and the manual sync command run synchronization.
- The global cloud-sync toggle disables all database reads and writes.
- Rule and ignored-site toggles independently control their corresponding database reads and writes; disabled categories remain local.
- For an enabled category, existing cloud records overwrite local records during restore/manual sync. If no cloud records exist, local records initialize the cloud state.
- Local writes happen before enabled cloud writes. A cloud failure preserves local data, leaves a visible retryable error, and does not disrupt tab management.
- A successful cloud operation updates `lastSuccessfulSyncAt`.

## Import and Export

- Export creates a versioned local JSON download containing settings, rules, and ignored sites.
- Export never includes Supabase tokens, user identifiers, email addresses, browser tab state, or Chrome group IDs.
- Import accepts only the documented schema version and validates domains, match scopes, colors, boolean fields, string lengths, and record count limits before changing storage.
- A confirmed valid import replaces the respective local settings, rules, and ignored sites. Enabled synchronization then writes those categories to Supabase.
- An invalid or cancelled import writes nothing.

## Components and Message Boundaries

- `options.html`, `options.ts`, and `options.css` render the options UI.
- `manifest.json` registers the page with `options_ui`.
- `background.ts` owns all Chrome APIs, authentication, Supabase REST calls, storage persistence, validation results, import/export data generation, and reconciliation.
- `sync.ts` contains database row conversion and REST operations.
- `storage.ts` contains local persistence.
- `shared.ts` contains shared types, defaults, domain normalization, pure matching functions, and import/export schema validation helpers.
- The options page sends typed messages only; it neither accesses Supabase nor manages tokens.

## Error Handling

- Every background message returns errors as `{ error: string }`.
- The options page displays concise Simplified Chinese status messages without exposing tokens or raw server payloads.
- Offline and Supabase failures keep local settings and rules usable.
- Destructive UI actions (delete rule, delete ignored site, replace data through import) require explicit user confirmation.

## Validation

Automated tests will cover hostname normalization, exact and subdomain rule precedence, ignored-site precedence, default-color selection, import/export validation, and serialized data excluding sensitive/runtime fields.

Manual validation will cover unauthenticated access, account display, sign-in/sign-out, sync toggle behavior, rule and blacklist reconciliation, offline saving/retry, account isolation, import rejection without writes, valid import, and safe export contents.

Before delivery, run:

```bash
npm run typecheck
npm test
git diff --check
```
