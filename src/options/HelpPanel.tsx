import styles from './options.module.css';

export function HelpPanel() {
  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.h1}>How it works</h1>
          <p className={styles.subtitle}>
            A quick reference for patterns, dynamic grouping and the tab-strip ordering rule.
          </p>
        </div>
      </div>

      <div className={styles.helpGrid}>
        <div className={`${styles.card} ${styles.helpCard}`}>
          <h3>Dynamic groups (one rule, many groups)</h3>
          <p>
            Set the grouping mode to <strong>One group per match</strong> and give the pattern a
            capture group. Every distinct matched value becomes its own group.
          </p>
          <ul>
            <li>
              Pattern <code className={styles.inline}>ticket-\d+</code> on{' '}
              <code className={styles.inline}>document.title</code> → a group for{' '}
              <code className={styles.inline}>ticket-123</code>, one for{' '}
              <code className={styles.inline}>ticket-456</code>, and so on.
            </li>
            <li>
              Template <code className={styles.inline}>T-$1</code> with capture group{' '}
              <code className={styles.inline}>1</code> names the group from the first capture
              instead of the whole match.
            </li>
            <li>
              Named captures work too: <code className={styles.inline}>{'${name}'}</code>.
            </li>
          </ul>
        </div>

        <div className={`${styles.card} ${styles.helpCard}`}>
          <h3>Ordering</h3>
          <p>
            After grouping, the extension keeps the strip in this shape:
          </p>
          <ul>
            <li>
              <code className={styles.inline}>GroupA | GroupB | GroupC | tabA | tabB | tabC</code>
            </li>
            <li>
              A newly created <code className={styles.inline}>GroupD</code> is inserted between{' '}
              <code className={styles.inline}>GroupC</code> and the first ungrouped tab.
            </li>
            <li>Pinned tabs always stay first.</li>
            <li>Turn it off with “Keep groups on the left” in Settings.</li>
          </ul>
        </div>

        <div className={`${styles.card} ${styles.helpCard}`}>
          <h3>Pattern types</h3>
          <ul>
            <li>
              <strong>Regular expression</strong> — JavaScript syntax. Flags{' '}
              <code className={styles.inline}>i m s u</code>; <code className={styles.inline}>g</code>{' '}
              is added automatically.
            </li>
            <li>
              <strong>Wildcard</strong> — <code className={styles.inline}>*</code> and{' '}
              <code className={styles.inline}>?</code>, anchored to the whole string.
            </li>
            <li>
              <strong>Contains / starts / ends / exact</strong> — plain text, case-insensitive by
              default.
            </li>
            <li>
              <strong>Domain</strong> — matches a hostname, including subdomains.
            </li>
          </ul>
        </div>

        <div className={`${styles.card} ${styles.helpCard}`}>
          <h3>Import compatibility</h3>
          <ul>
            <li>
              <strong>Auto Group</strong> — native backup, lossless.
            </li>
            <li>
              <strong>Tab Modifier / Tabee</strong> — 0.x, 1.x and the pre-0.10 map;{' '}
              <code className={styles.inline}>url_fragment</code> +{' '}
              <code className={styles.inline}>detection</code>,{' '}
              <code className={styles.inline}>group_id</code>,{' '}
              <code className={styles.inline}>url_matcher</code> /{' '}
              <code className={styles.inline}>title_matcher</code> captures.
            </li>
            <li>
              <strong>Simple Tab Groups</strong> — <code className={styles.inline}>catchTabRules</code>{' '}
              become regex rules.
            </li>
            <li>
              <strong>Tab Groups Extension</strong> (guokai.dev) —{' '}
              <code className={styles.inline}>urlMatches</code> /{' '}
              <code className={styles.inline}>titleMatches</code> triples.
            </li>
            <li>
              <strong>Auto-Group Tabs</strong> (loilo) — Chrome match patterns and{' '}
              <code className={styles.inline}>/regex/flags</code>.
            </li>
            <li>
              <strong>Auto Tab Groups</strong> (nitzanpap) —{' '}
              <code className={styles.inline}>{'{capture}'}</code> wildcards,{' '}
              <code className={styles.inline}>title:</code> prefixes and regexes.
            </li>
            <li>
              <strong>Auto Tab Groups</strong> (NAME/URL/COLOR), <strong>Auto Tab Grouper</strong>,{' '}
              <strong>Regex Tab Organizer</strong>, <strong>Tabs Manager</strong>.
            </li>
            <li>
              <strong>Session exports</strong> — Tab Manager Plus, Tab Session Manager, Session
              Buddy, Toby, Workona, Tablerone, OneTab text and bookmark HTML. These carry no rules,
              so hostname-based rules are generated, disabled, for you to review.
            </li>
          </ul>
          <p style={{ marginTop: 10, fontSize: 12 }}>
            Names are used only to describe format compatibility. Auto Group is independent and not
            affiliated with or endorsed by those extensions, and contains none of their code.
          </p>
        </div>
      </div>

      <div className={`${styles.card} ${styles.helpCard}`} style={{ marginTop: 14 }}>
        <h3>Permissions</h3>
        <p>
          <code className={styles.inline}>tabs</code> to read titles and URLs and to move tabs,{' '}
          <code className={styles.inline}>tabGroups</code> to create and name groups, and{' '}
          <code className={styles.inline}>storage</code> to keep your rules. No host permissions, no
          content scripts, no network requests — everything runs locally.
        </p>
      </div>
    </div>
  );
}
