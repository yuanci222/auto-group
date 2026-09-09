# Design notes

This document records the research that drove the design, the decisions taken, and the known
limitations. It is the companion to the code, not user documentation (see the README for that).

## 1. Ecosystem research

Twelve-plus tab-grouping extensions were surveyed, including the ones with the largest user bases
and every one with a documented or source-verifiable rule format.

### 1.1 Rule / regex design

| Extension | Users | Matching model |
| --- | --- | --- |
| **Tab Groups Extension** (guokai.dev) | ~100k | `{target, method, value}` triples on URL and title; methods `includes / startsWith / endsWith / equal / regex`; first match by `id` order |
| **Auto-Group Tabs** (loilo, MIT) | ~20k | Chrome match patterns (`github.com/*`, `*://*.host/*`) or `/regex/flags`; first match wins; identity = title + colour |
| **Simple Tab Groups** (Drive4ik, MPL-2.0) | Firefox | `group.catchTabRules`: newline-separated regexes, **no flags**, URL only, first match wins |
| **Tab Modifier → Tabee** (furybee, MIT) | large | `url_fragment` + `detection` (`CONTAINS / STARTS_WITH / ENDS_WITH / EXACT / REGEX`); URL only, no flags; captures live in `tab.url_matcher` (`$n`) / `tab.title_matcher` (`@n`) |
| **Auto Tab Groups** (nitzanpap) | ~1.3k | rich DSL: `*`, `**`, `{capture}`, `title:` prefix, `/regex/`, `!exclude` |
| **Auto Tab Grouper** (diasDominik) | small | domain / `*.domain` / regex map |
| **Regex Tab Organizer** | small | `new RegExp(regex, 'i')` against URL **and** hostname |
| **Tabs Manager – Auto Group and Save** | small | `hostContains / urlContains / titleContains / regexMatches`, AND across types, OR within |
| **Auto Tab Groups** (jackcellphonerepair) | ~1k | plain URL substrings, no regex |
| **Session managers** (Session Buddy, OneTab, Toby, Workona, Tab Manager Plus, Tab Session Manager, Tablerone) | large | no grouping rules at all — sessions/workspaces only |

Key findings:

1. **Per-match dynamic grouping is almost non-existent.** Only nitzanpap (`{capture}`) and Tabs
   Manager (multiple groups per rule) can fan one rule out into many groups. Every other
   extension is 1 rule → 1 group. This is the differentiating feature of this extension.
2. **Title matching is rare.** Only nitzanpap (`title:`), Tabs Manager (`titleContains`) and Tab
   Groups Extension (`titleMatches`) can match the page title. Most match the URL only.
3. **Regex dialects are all JavaScript `RegExp`**, but flags differ wildly: none (Tabee, STG,
   dias), `i` (nitzanpap, Regex Tab Organizer), `iu` (guokai), user-supplied `/…/dgimsuvy` (loilo).
4. **Precedence is first-match-wins everywhere.** Ordering keys differ: array order, object
   insertion order, explicit `priority`, or `id.localeCompare`.
5. **Colour is Chrome's 9-name palette** in every format that has colours at all. Session exports
   mostly have no colour; only TSM (`tabGroups[].color`), Simple Tab Groups (`iconColor`) and Tab
   Manager Plus (`color`) carry it.

### 1.2 Export formats

| Format | Envelope | Notes |
| --- | --- | --- |
| Tabee / Tab Modifier | `{rules, groups, settings}` (1.x), `{settings, rules}` (0.x), flat map (pre-0.10) | group titles carry a trailing `U+200B` |
| Simple Tab Groups | large options object with `groups[]` | `catchTabRules` is a newline-separated **string** |
| Tab Groups Extension | `{meta:{name:'tab-groups-rules'}, 'rule-*': {…}}` | `meta` is the reliable detector |
| Auto-Group Tabs (loilo) | bare array of `{id, title, color, options, matchers}` | zod-validated; replaces on import |
| Auto Tab Groups (nitzanpap) | `{version, exportDate, rules:{id: rule}}` | `rules` is a **map**, not an array |
| Auto Tab Groups (nicjee) | bare array of `{group: {NAME, URL[], COLOR}}` | |
| Auto Tab Grouper | `{domainGroups: {pattern: {…}}}` | no export UI, but the storage shape is stable |
| Session Buddy | `{collections: [{title, folders: [{title, links: [{url, …}]}]}]}` | also CSV and 8 text shapes |
| OneTab | plain text `URL \| Title`, blank line = group | no group names in the export |
| Toby | `{version, lists: [{title, cards: [{url, title}]}]}` | |
| Workona | `{User, Workspaces: [{title, tabs: [{url, title}]}]}` | no re-import into Workona |
| Tab Manager Plus | bare array of `{tabs, windowsInfo, name, color, id}` | sessions, not rules |
| Tab Session Manager | bare array of `{windows:{winId:{tabId:Tab}}, tabGroups:[{title,color}]}` | `windows` is a **map**, not an array |
| Tablerone | `{export: [{title, tabs: [{url, title}]}]}` | closed source; schema recovered from the CRX |

### 1.3 Ordering

No surveyed extension implements the `groups | ungrouped` invariant. Most leave groups wherever
Chrome puts them. This requirement is therefore implemented from first principles.

## 2. Decisions

### 2.1 Technology

- **React + TypeScript + Vite 8**, built with `@crxjs/vite-plugin` (v2). CRXJS is the mature Vite
  scaffold for MV3: it rewrites manifest paths, bundles the service worker as an ES module, and
  gives HMR for extension pages. Writing a bespoke multi-entry Rollup config was possible but would
  have been re-inventing this.
- **CSS modules, not styled-components.** The UI is an options page and a popup; CSS modules keep
  the bundle small and avoid a runtime CSS-in-JS dependency.
- **Vitest + Testing Library** for unit/component tests, plus a bespoke **real-Chrome E2E** script
  for the behaviour that cannot be unit tested (see §4).
- **pnpm**, with the store and npm cache pinned inside the workspace (`.npmrc`) so the build is
  reproducible in sandboxed environments.

### 2.2 Canonical model

A single `Rule` type is the intersection of every surveyed format:

- `match.mode` covers every comparator seen in the wild (`regex`, `wildcard`, `contains`,
  `startsWith`, `endsWith`, `exact`, `domain`);
- `match.patterns[]` models the OR lists several formats use;
- `match.capturePattern` + `captureTarget` model Tabee's split between `url_fragment` (detection)
  and `url_matcher` / `title_matcher` (captures);
- `group.mode` is the extension point for dynamic grouping: `fixed`, `perMatch`, `template`;
- `source.raw` preserves the original imported object so exports can round-trip unknown fields.

### 2.3 Dynamic grouping semantics

For a `perMatch` rule the group **identity is the resolved title**, not the raw match. Two
different matched values that interpolate to the same title share a group; this matches how every
other extension keys groups (by title/colour) and keeps `fixed` and `perMatch` consistent.

The first match in a title is used when a single title contains several candidate matches. A tab
can only belong to one group, and picking the first is the only deterministic choice.

### 2.4 Safety rails

The reconciler deliberately errs on the side of not touching things:

- `onlyUngrouped` (default on): tabs in user-created groups are never moved. Tabs in groups the
  extension created are still corrected when their title/URL changes.
- Manual-move overrides: a `tabs.onUpdated` event with a `groupId` change that we did not cause is
  recorded in `chrome.storage.session` keyed by tab id + content signature. The tab is skipped
  until its title/URL changes.
- Ownership by title: group ids are not stable across browser restarts, so ownership is persisted
  as a set of normalised group titles. A user rename therefore silently releases ownership.
- Pinned tabs are skipped by default.
- Pinned/other failures are caught per action so one failure cannot abort a reconcile.

### 2.5 Import merge strategy

`mergeImport` computes a semantic key per rule — `(mode, target, sorted patterns, group mode,
group title/template)` — and skips incoming rules whose key already exists. Existing rules are
never mutated. Colliding ids on genuinely different rules are regenerated. Settings are only
applied when the user explicitly opts in, so importing a stranger's file cannot change the master
switch or colours.

### 2.6 Reconciler and ordering

```
event → mark window dirty → debounce → reconcileWindow
  read tabs + groups + owned titles + overrides
  planWindow(...)                       // pure
  for each action: chrome.tabs.group    // minimal calls
  computeDesiredOrder(...)              // pure: pinned | grouped | ungrouped
  applyTabOrder(...)                    // greedy single-tab moves, re-reads after each
```

`computeDesiredOrder` ranks existing groups by the position of their left-most tab (preserving the
user's manual group order) and ranks groups created in the current pass *after* every existing
group. That single rule produces the required behaviour: a new `GroupD` is inserted between the
last existing group and the first ungrouped tab.

`applyTabOrder` re-reads the real order after every move, so it converges regardless of Chrome's
exact index semantics, and it stops if a tab disappears mid-flight.

## 3. Testing

- **67 unit/component tests** cover the matcher (all modes, flags, captures, templates), the
  planner (dynamic grouping, ownership, overrides, priority, colour rotation), the ordering
  algorithm (including the `GroupA|GroupB|GroupC|tabA|tabB|tabC` shape), every importer and the
  merge strategy, and the rule editor UI.
- **`pnpm e2e`** launches a real Chrome for Testing instance with the built extension, seeds a
  rule, opens tabs whose titles contain `ticket-123` / `ticket-456`, then `ticket-789`, and asserts:
  per-match groups are created, groups stay contiguous on the left, and the new group lands after
  the existing groups and before the ungrouped tabs. This is the only test that exercises Chrome's
  real `tabs.group` / `tabs.move` / `tabGroups.update` semantics.

## 4. Known limitations / future work

- **Anti-ReDoS guards.** Imported regexes are compiled as-is. A malicious or careless pattern can
  be slow. A `backtracksBadly()` probe plus a slow-pattern quarantine (as nitzanpap implements) is
  the natural next step.
- **`strict` / ungroup semantics.** Auto-Group Tabs' `strict` mode removes a tab from its group
  when the URL stops matching. This extension only re-assigns; it does not ungroup on mismatch.
- **Cross-window merge.** loilo's `merge` and guokai's `oneGroupInAll` reuse a group across
  windows. This extension is per-window by design.
- **AND conditions.** Tabs Manager combines `hostContains` AND `urlContains` AND `titleContains`.
  Those are imported as OR with a warning, because the canonical model is OR-based.
- **Storage.** Rules live in `chrome.storage.local`; there is no sync or cloud backup. Export is
  the sharing mechanism.
