# Drop-in real exports

Put a real export from another extension here and it is smoke-tested automatically
by `tests/conformance.test.ts` — no assertion writing needed.

Use one folder per format. The folder name may be either the **importer id** or the
**concrete result format** (the latter is what you want for session exports, so
Tab Manager Plus and Session Buddy do not share a folder):

```
tests/fixtures/real/
  tab-modifier/          tabee.config.json
  simple-tab-groups/     stg-backup.json
  tab-groups-extension/  tabgroups_rules_20260910.json
  auto-group-tabs-loilo/ auto-group-tabs-export--2026-09-10.json
  tab-manager-plus/      tab-manager-plus-backup-20260910-1200.json
  session-buddy/         session-buddy.json
  workona/               workona.json
  ...
```

For every file the suite asserts:

1. `parseImport` does not throw,
2. a format is detected at all,
3. the detected importer id **or** result format equals the folder name.

To also pin the exact rule mapping, add a curated entry to `tests/fixtures/index.ts`
instead.

Valid folder names (importer ids):

`auto-group`, `tab-modifier`, `simple-tab-groups`, `tab-groups-extension`,
`auto-group-tabs-loilo`, `auto-tab-groups-nitzanpap`, `auto-tab-groups-simple`,
`auto-tab-grouper`, `regex-tab-organizer`, `tabs-manager`, `session`, `html`,
`text-list`, `generic`.

Valid concrete formats for session exports: `tab-manager-plus`,
`tab-session-manager`, `session-buddy`, `toby`, `workona`, `tablerone`, `tab-list`.

Files here are only read by tests. Session exports contain real tab URLs and titles,
so use a throwaway browser profile and dummy tabs if the repo is (or may become)
public.
