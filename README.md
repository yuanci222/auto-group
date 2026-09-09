# Auto Group

A Chrome (Manifest V3) extension that groups tabs automatically with regex rules.

Two things set it apart from other tab groupers:

- **One group per matched value.** A single rule in *per-match* mode turns every distinct match
  into its own group — pattern `ticket-\d+` on `document.title` gives `ticket-123`, `ticket-456`
  and `ticket-789` three separate groups.
- **`groups | ungrouped` ordering.** Groups stay contiguous on the left, ungrouped tabs on the
  right, and a new group is inserted after the existing groups and before the first ungrouped tab:

```
GroupA | GroupB | GroupC | ticket-123 | ticket-456 | tabA | tabB
```

Everything runs locally: no host permissions, no content scripts, no network requests.

## Features

| Requirement | How it works |
| --- | --- |
| **Regex matching** | JavaScript regex with flags, plus `wildcard`, `contains`, `startsWith`, `endsWith`, `exact` and `domain` modes. Match against `document.title`, the URL, or both. Multiple alternative patterns per rule. |
| **Dynamic matching on `document.title`** | A rule in *per-match* mode with pattern `ticket-\d+` creates a distinct group for every matched value. Use a title template (`ticket-$1`) and capture groups / named captures to name the groups. |
| **Import / export, merge on import** | Import auto-detects the file format and **merges** — existing rules are never overwritten and semantic duplicates are skipped. Export as the native JSON, as a Tabee / Tab Modifier config, or as a Markdown table. |
| **Stable tab-strip order** | After grouping, groups are kept contiguous on the left and ungrouped tabs on the right. A newly created `GroupD` lands **after the other groups and before the first ungrouped tab**. Pinned tabs stay first. |

## Install (load the built extension)

```bash
pnpm install
pnpm build          # type-checks, then writes dist/
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and choose the `dist/` folder in this repo

Click the toolbar icon for a quick “Run rules on this window”, or open the options page to manage
rules, test patterns, and import/export.

> Chrome's branded builds ignore `--load-extension` on the command line, so the `chrome://extensions`
> flow above (or Chrome for Testing) is the supported way to load it.

## Development

```bash
pnpm dev            # Vite dev server with HMR for the extension pages
pnpm test           # Vitest unit tests (67)
pnpm test:watch     # watch mode
pnpm typecheck      # tsc --noEmit
pnpm e2e            # real-Chrome end-to-end test (needs Chrome for Testing)
pnpm build          # production build into dist/
```

`pnpm e2e` drives a headless Chrome through the DevTools protocol, loads `dist/`, seeds a rule,
opens tabs and asserts the grouping and ordering behaviour. It looks for Chrome for Testing at
`.cache/browsers/...` (install with
`npx @puppeteer/browsers install chrome@stable --path .cache/browsers`) and honours `CHROME_PATH`.

## Rule model

```ts
interface Rule {
  name: string;
  enabled: boolean;
  match: {
    pattern: string;          // regex source, or glob / plain text depending on `mode`
    patterns?: string[];      // additional alternatives (OR)
    target: 'title' | 'url' | 'both';
    mode: 'regex' | 'wildcard' | 'contains' | 'startsWith' | 'endsWith' | 'exact' | 'domain';
    flags?: string;           // i m s u (g is added automatically)
    capturePattern?: string;  // second regex used only for $1 templating
    captureTarget?: 'title' | 'url';
  };
  group: {
    mode: 'perMatch' | 'fixed' | 'template';
    title?: string;           // for fixed groups
    template?: string;        // $0, $1, ${name}
    captureGroup?: number | string;
    color?: GroupColor;
  };
  priority: number;
}
```

`perMatch` is the mode that makes dynamic groups work. With `fixed`, every matching tab joins the
one group named `title` (existing groups with the same title are reused). With `template`, one
shared group gets a title interpolated from the match.

## Import / export compatibility

Import auto-detects the format and **merges** into the current ruleset. Duplicates (same target,
mode, pattern and group) are skipped rather than overwritten.

| Source | Format | Imported as |
| --- | --- | --- |
| Auto Group | native `{version, rules, settings}` | lossless |
| Tab Modifier / Tabee | 0.x `{settings, rules}`, 1.x `{rules, groups, settings}`, pre-0.10 flat map | `url_fragment` + `detection` → rules; `group_id` → group title/colour; `url_matcher` / `title_matcher` → capture patterns |
| Simple Tab Groups | `{groups: [{catchTabRules, …}]}` | newline-separated regexes → one rule per group |
| Tab Groups Extension (guokai.dev) | `{meta:{name:'tab-groups-rules'}, 'rule-*': {…}}` | `urlMatches` / `titleMatches` triples → rules |
| Auto-Group Tabs (loilo) | `[{title, color, matchers, options}]` | match patterns and `/regex/flags` → rules |
| Auto Tab Groups (nitzanpap) | `{version, exportDate, rules:{…}}` | `{capture}`, `*`, `**`, `title:` and `/regex/` DSL → rules (dynamic groups for captures) |
| Auto Tab Groups (jackcellphonerepair) | `[{group: {NAME, URL[], COLOR}}]` | substring rules |
| Auto Tab Grouper (diasDominik) | `{domainGroups: {…}}` | domain / regex rules |
| Regex Tab Organizer | `{rules: [{regex, groupName, color}]}` | regex rules against title + URL |
| Tabs Manager – Auto Group and Save | `{customRules: [{groups: [{match: {…}}]}]}` | per-condition rules (AND flattened to OR, with a warning) |
| Session exports | Tab Manager Plus, Tab Session Manager, Session Buddy, Toby, Workona, Tablerone | named groups → disabled `domain` rules; flat lists → one disabled “group every site by domain” rule |
| OneTab / bookmarks | plain text, HTML | disabled “group every site by domain” rule |

Session formats carry no rules, so generated rules are **disabled** for you to review before they
fire.

## Trademarks & compatibility

This is an independent implementation. To help you migrate, it can read and write file formats
produced by other tab and session managers. It does **not** include, bundle, copy or reuse any of
their source code, icons or artwork — the importers were written from the published formats and
field names, which are functional interoperability details. The automated tests use original
sample data.

Product names such as Tab Modifier, Tabee, Simple Tab Groups, Tab Manager Plus, Tab Session
Manager, Session Buddy, OneTab, Toby, Workona, Tablerone, Tab Groups Extension, Auto-Group Tabs,
Auto Tab Groups, Auto Tab Grouper, Regex Tab Organizer and Tabs Manager are trademarks or product
names of their respective owners. They are used here only to describe format compatibility
(nominative use). This project is not affiliated with, sponsored by or endorsed by any of them.

## Permissions

| Permission | Why |
| --- | --- |
| `tabs` | read tab titles/URLs and move tabs |
| `tabGroups` | create, name and colour groups |
| `storage` | keep your rules locally |

No host permissions, no content scripts, no network access.

## Docs

- [`docs/DESIGN.md`](docs/DESIGN.md) — ecosystem research, format notes and design decisions.

## Credits

Research, design and implementation were produced with **Deepseek Harness** running the
`deepseek-v4.1-flash-expires-on-0910` model.
