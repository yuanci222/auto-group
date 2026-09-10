# Test kit: real export fixtures

Goal: create the **same handful of logical rules** in each supported extension,
export the file, and drop it into the matching folder here. That gives the
conformance suite real bytes instead of hand-written samples, and it lets us
check that every format converges on the same canonical rules.

## Conventions

Use these exact group names and colours everywhere, so cross-format assertions
line up:

| Logical group | Colour | Pattern idea |
| --- | --- | --- |
| `News` | orange | `news.ycombinator.com` |
| `Docs` | green | `docs.google.com` |
| `GitHub` | purple | `github.com` |
| `Tickets` | blue | title capture `ticket-(\d+)` |
| `Local` | red | `localhost` / `127.0.0.1` |
| `PDFs` | grey | `.pdf` |

**Privacy:** rule-only exports are low risk. Session exports contain real tab
URLs and titles — use a throwaway browser profile with harmless tabs.

---

## 1. Tabee: Tab Modifier → `tab-modifier/`

Create the groups first (Groups section), then the rules.

Groups: `News` (orange), `Docs` (green), `Issues` (purple), `PDFs` (red).

| # | Name | Detection | URL fragment | Tab → group | Extra |
| --- | --- | --- | --- | --- | --- |
| 1 | News | Contains | `news.ycombinator.com` | News | |
| 2 | Docs | Starts with | `https://docs.google.com/` | Docs | |
| 3 | Issue tracker | Regex | `github\.com/.+/issues/\d+` | Issues | `url_matcher` = `/issues/(\d+)`, tab title `Issue #$1` |
| 4 | PDF | Ends with | `.pdf` | PDFs | |
| 5 | No group rule | Contains | `example.com/no-group` | **(no group)** | |
| 6 | Disabled rule | Contains | `example.com/disabled` | News | toggle it **off** |

Exercises: `CONTAINS` / `STARTS_WITH` / `ENDS_WITH` / `REGEX`, `url_matcher`
captures, `group_id` → group title + colour, the trailing `U+200B` in group
titles, the "no group" fallback, and `is_enabled: false`.

Export: **Settings → Import/Export → Export** → `tabee.config.json`.

---

## 2. Tab Groups Extension (guokai.dev) → `tab-groups-extension/`

| # | ruleName | groupName | colour | matches |
| --- | --- | --- | --- | --- |
| 1 | News | `News` | orange | url: target `hostname`, method `endsWith`, value `news.ycombinator.com` |
| 2 | Docs | `Docs` | green | url: target `href`, method `includes`, value `docs.google.com` |
| 3 | Tickets | `Tickets` | blue | **title**: method `regex`, value `ticket-\d+`, ignoreCase on |
| 4 | Exact | `Exact` | pink | url: target `href`, method `equal`, value `https://example.com/` |
| 5 | Disabled | `News` | orange | url: `includes` `example.com/disabled` — toggle **off** |

Exercises: the `{target, method, value}` triple, `endsWith` / `includes` /
`equal` / `regex`, **title matching**, and `enabled: false`.

Also export the **data** file if the extension offers it
(`tabgroups_data_*.json`). That shape (`meta.name = "tab-groups"`) is *not*
imported today — having it tells us whether we should support it. Put it in the
same folder with a `-data` suffix in the filename.

---

## 3. Auto-Group Tabs (loilo) → `auto-group-tabs-loilo/`

No title matching in this extension; matchers are Chrome match patterns or
`/regex/flags`.

| # | title | colour | matchers | options |
| --- | --- | --- | --- | --- |
| 1 | `GitHub` | purple | `github.com/*` and `*://*.githubusercontent.com/*` | |
| 2 | `Docs` | green | `/^https:\/\/docs\.google\.com\//i` | |
| 3 | `Local` | red | `*://127.0.0.1/*` | |
| 4 | `Strict` | blue | `example.com/*` | `strict` on, `merge` on |

> The plugin rejects `http://localhost:*/**` as an invalid match pattern, so
> `*://127.0.0.1/*` is what actually lands in the export.

Exercises: match pattern without a scheme, `*://*.host/*`, explicit
`/regex/flags`, and the `strict` / `merge` options (we warn about `merge`).

---

## 4. Auto Tab Groups (nitzanpap) → `auto-tab-groups-nitzanpap/`

The `domains` list is the DSL: `*`, `**`, `{capture}`, `title:`, `/regex/`, `!`.

| # | name | colour | domains | priority |
| --- | --- | --- | --- | --- |
| 1 | `Example` | blue | `*.example.com`, `title:Widget`, `/^https:\/\/intranet\.example\.com\//` | 1 |
| 2 | `AWS` | orange | `{accountId}-*.{region}.console.aws.amazon.com` | 5 |
| 3 | `Exclusions` | grey | `!mail.google.com`, `example.org` | 1 |

The priority field has a minimum of **1**, so that is the lowest value the UI
accepts.

Exercises: wildcard subdomain, `title:` prefix, inline regex, the `{capture}`
DSL (→ our per-match groups), non-zero priority, and negation (we skip it and
warn).

---

## 5. Session Buddy → `session-buddy/`

Not rules — just content, so the `collections → folders → links` shape is real.

1. Open ~8 harmless tabs (example.com, en.wikipedia.org, github.com,
   news.ycombinator.com, a YouTube search page…).
2. **Save all tabs** as a collection named `Test Kit`.
3. Add two folders inside it: `Docs` and `News`, move a couple of tabs into each.
4. Export JSON.

Exercises: `collections[].folders[].links[]`, folder titles → group names.

> **What we actually captured:** exporting the *current window* produces a flat
> `[{ title, url }]` array, which our parser correctly classifies as `tab-list`
> (one disabled "group every site by domain" rule), not `session-buddy`. That
> file lives in `tab-list/`. To exercise the `session-buddy` collection shape you
> have to **save the session as a collection first**, then export the collection.

---

## 6. Workona → `workona/`

1. Create a workspace named `Test Workspace` with 3–4 tabs.
2. Add one link resource too.
3. **Settings → Export data → JSON**.

Exercises: capitalised `Workspaces` key, `tabs` vs `resources`.

---

## 7. Tab Manager Plus → `tab-manager-plus/`

1. Open a few tabs, save the window as a session named `Test Session`.
2. **Export/Backup sessions** → `tab-manager-plus-backup-*.json`.

Exercises: bare array of sessions, `name` → group rule.

---

## 8. Tab Session Manager → `tab-session-manager/`

1. Enable **save tab groups** in settings.
2. Create a tab group named `Work` with 2–3 tabs.
3. Save the session as `Test Session`.
4. Export sessions.

Exercises: `windows` as a keyed map, `tabGroups[].title` + `.color`.

---

## 9. Toby → `toby/`

1. Create a collection named `Test Collection` with 3 tabs.
2. **Export → JSON**.

Exercises: `{version, lists:[{title, cards:[…]}]}`.

---

## 10. Tablerone → `tablerone/`

1. Save the window as a session and give it a name.
2. Export — the download is a **`.txt`** file containing JSON.

Exercises: `{export:[…]}` and the non-`.json` extension.

---

## 11. Simple Tab Groups (Firefox) → `simple-tab-groups/`

Firefox only. Create three groups:

| group | colour | catchTabRules |
| --- | --- | --- |
| `GitHub` | blue | `^https?://(.*\.)?github\.com/.*` + newline + `^https?://gist\.github\.com/.*` |
| `News` | orange | `news\.ycombinator\.com` |
| `NoRules` | green | *(leave empty, keep 1–2 tabs in it)* |

Then **Settings → Backup → Create backup**.

Exercises: newline-separated regex string, multi-pattern group, `iconColor`
mapping, and the no-`catchTabRules` fallback.

---

## 12. Auto Tab Groups (jackcellphonerepair) → `auto-tab-groups-simple/`

| NAME | URL list | COLOR |
| --- | --- | --- |
| `News` | `news.ycombinator.com` | orange |
| `Docs` | `docs.google.com`, `drive.google.com` | green |

Export → `AutoTabGroups_YYYY-MM-DD.json`.

Exercises: `NAME` / `URL[]` / `COLOR`, multi-URL OR.

---

## 13. OneTab → `text-list/`

Send a few tabs to OneTab (twice, so there are two groups), then
**Options → Export/Import URLs** and save the text as `.txt`.

Exercises: `URL | Title` lines with blank-line group separators.

---

## Minimum useful set

If you only want to install three: **Tabee (#1)**, **Auto-Group Tabs (#3)** and
**Tab Groups Extension (#2)**. Those cover the most complex format, the
home-grown match-pattern/regex compiler, and the widest-used `{target, method,
value}` schema.

## Then what

Drop the files into the matching folder and run:

```bash
pnpm test:compat
```

The suite asserts each file parses, is detected, and matches its folder. Hand
the files over and we can also pin the exact rule mappings and fix whatever
does not line up.
