import { useMemo, useRef, useState } from 'react';
import { EXPORT_OPTIONS, exportRuleSet, type ExportFormat } from '../core/exporters';
import { mergeImport, parseImport, type ParseOutcome } from '../core/importers';
import { downloadText, readFile } from '../ui/components';
import type { RuleSetStore } from '../ui/useRuleSet';
import styles from './options.module.css';

export function TransferPanel({
  store,
  notify,
}: {
  store: RuleSetStore;
  notify: (message: string, error?: boolean) => void;
}) {
  const [format, setFormat] = useState<ExportFormat>('native');
  const [importText, setImportText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [includeSettings, setIncludeSettings] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const ruleSet = store.ruleSet;
  const exported = useMemo(
    () => (ruleSet ? exportRuleSet(ruleSet, format) : ''),
    [ruleSet, format],
  );

  const parsed: ParseOutcome | null = useMemo(
    () => (importText.trim() ? parseImport(importText) : null),
    [importText],
  );

  const preview = useMemo(() => {
    if (!ruleSet || !parsed?.result || parsed.result.rules.length === 0) return null;
    return mergeImport(ruleSet, parsed.result, { includeSettings });
  }, [ruleSet, parsed, includeSettings]);

  const loadFile = async (file: File) => {
    try {
      const text = await readFile(file);
      setImportText(text);
      setFileName(file.name);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not read file', true);
    }
  };

  const doImport = async () => {
    if (!preview) return;
    await store.save(preview.ruleSet);
    notify(
      `Imported ${preview.added.length} rule(s)` +
        (preview.duplicates.length ? `, skipped ${preview.duplicates.length} duplicate(s)` : ''),
    );
    setImportText('');
    setFileName(null);
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.h1}>Import &amp; export</h1>
          <p className={styles.subtitle}>
            Importing always <strong>merges</strong>: your existing rules are never overwritten.
            Duplicates are skipped. Recognised rule formats include Auto Group, Tab Modifier /
            Tabee, Simple Tab Groups, Tab Groups Extension, Auto-Group Tabs (loilo), Auto Tab Groups
            (nitzanpap), Auto Tab Grouper, Regex Tab Organizer and Tabs Manager. Session exports
            from Tab Manager Plus, Tab Session Manager, Session Buddy, Toby, Workona, Tablerone,
            OneTab and bookmark HTML are converted into starter rules.
          </p>
        </div>
      </div>

      <div className={styles.card} style={{ padding: 18, marginBottom: 18 }}>
        <div className={styles.sectionTitle}>Export</div>
        <div className={styles.toolbar}>
          <select
            className={styles.select}
            style={{ maxWidth: 300 }}
            value={format}
            onChange={(event) => setFormat(event.target.value as ExportFormat)}
          >
            {EXPORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <span className={styles.hint}>
            {EXPORT_OPTIONS.find((option) => option.id === format)?.description}
          </span>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              void navigator.clipboard.writeText(exported);
              notify('Copied to clipboard');
            }}
          >
            Copy
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => {
              const extension = EXPORT_OPTIONS.find((option) => option.id === format)?.extension ?? 'json';
              downloadText(
                `auto-group-rules.${extension}`,
                exported,
                extension === 'md' ? 'text/markdown' : 'application/json',
              );
            }}
          >
            Download
          </button>
        </div>
        <textarea
          className={styles.textarea}
          style={{ minHeight: 220 }}
          readOnly
          value={exported}
        />
      </div>

      <div className={styles.card} style={{ padding: 18 }}>
        <div className={styles.sectionTitle}>Import (merge)</div>
        <div
          className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) void loadFile(file);
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {fileName ? `Loaded ${fileName}` : 'Drop a rules or session file here'}
          </div>
          <div className={styles.hint}>or click to choose a file (.json, .txt, .md, .html)</div>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.txt,.md,.html,application/json,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
            }}
          />
        </div>

        <div className={styles.field} style={{ marginTop: 14 }}>
          <label className={styles.label} htmlFor="import-text">
            …or paste the file contents
          </label>
          <textarea
            id="import-text"
            className={styles.textarea}
            placeholder='{"rules":[…]}, a Tabee config, a Simple Tab Groups backup, or just a list of URLs'
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setFileName(null);
            }}
          />
        </div>

        <div className={styles.checkboxRow}>
          <input
            id="import-settings"
            type="checkbox"
            checked={includeSettings}
            onChange={(event) => setIncludeSettings(event.target.checked)}
          />
          <label htmlFor="import-settings">
            Also import settings (master switch, colours, debounce) — off by default
          </label>
        </div>

        {parsed ? (
          <div style={{ marginTop: 8 }}>
            {parsed.guesses.length ? (
              <div className={styles.chipRow} style={{ marginBottom: 8 }}>
                {parsed.guesses.map((guess) => (
                  <span key={guess.format} className={styles.badge}>
                    {guess.label} · {Math.round(guess.confidence * 100)}%
                  </span>
                ))}
              </div>
            ) : null}

            {parsed.result ? (
              <>
                <div className={styles.statRow}>
                  <div className={styles.stat}>
                    <strong>{parsed.result.rules.length}</strong> rules found
                  </div>
                  {preview ? (
                    <>
                      <div className={styles.stat}>
                        <strong>{preview.added.length}</strong> will be added
                      </div>
                      <div className={styles.stat}>
                        <strong>{preview.duplicates.length}</strong> duplicates skipped
                      </div>
                    </>
                  ) : null}
                  {parsed.result.stats.skipped ? (
                    <div className={styles.stat}>
                      <strong>{parsed.result.stats.skipped}</strong> unsupported
                    </div>
                  ) : null}
                </div>

                {parsed.result.warnings.map((warning) => (
                  <div key={warning} className={styles.warn}>
                    ⚠ {warning}
                  </div>
                ))}

                {preview?.warnings.map((warning) => (
                  <div key={warning} className={styles.warn}>
                    ⚠ {warning}
                  </div>
                ))}

                {preview && preview.added.length ? (
                  <div className={styles.preview} style={{ marginTop: 10 }}>
                    <div className={`${styles.previewRow} ${styles.previewHead}`}>
                      <span>New rule</span>
                      <span>Pattern</span>
                      <span>Group</span>
                    </div>
                    {preview.added.slice(0, 10).map((rule) => (
                      <div key={rule.id} className={styles.previewRow}>
                        <span className={styles.truncate}>{rule.name}</span>
                        <span className={`${styles.truncate} ${styles.mono}`}>
                          {rule.match.pattern}
                        </span>
                        <span className={styles.truncate}>
                          {rule.group.mode === 'fixed' ? rule.group.title : rule.group.template}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ marginTop: 12 }}
                  disabled={!preview || preview.added.length === 0}
                  onClick={() => void doImport()}
                >
                  Import {preview?.added.length ?? 0} rule(s) (merge)
                </button>
              </>
            ) : (
              parsed.errors.map((message) => (
                <div key={message} className={styles.error}>
                  {message}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
