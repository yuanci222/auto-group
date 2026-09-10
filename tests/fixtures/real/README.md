# Drop-in real exports

Put a real export from another extension here and it is smoke-tested automatically
by `tests/conformance.test.ts` — no assertion writing needed.

Use one folder per importer id:

```
tests/fixtures/real/
  tab-modifier/            my-tabee-backup.json
  simple-tab-groups/       stg-backup.json
  tab-manager-plus/        backup-2026.json
  session/                 session-buddy.json
  ...
```

For every file the suite asserts:

1. `parseImport` does not throw,
2. a format is detected at all,
3. the detected importer matches the folder name.

To also pin the exact rule mapping, add a curated entry to `tests/fixtures/index.ts`
instead.

Valid folder names are the importer ids in `src/core/importers/index.ts`:
`auto-group`, `tab-modifier`, `simple-tab-groups`, `tab-groups-extension`,
`auto-group-tabs-loilo`, `auto-tab-groups-nitzanpap`, `auto-tab-groups-simple`,
`auto-tab-grouper`, `regex-tab-organizer`, `tabs-manager`, `session`, `html`,
`text-list`, `generic`.

Files here are only read by tests; keep them free of personal data if the repo is
public.
