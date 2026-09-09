import { createRule } from '../core/rules';
import type { Rule } from '../core/types';

/**
 * Ready-made rules the user can load with one click from the Rules panel.
 * They mirror the patterns people most often ask for.
 */
export interface ExampleRule {
  label: string;
  description: string;
  build: () => Rule;
}

export const EXAMPLE_RULES: ExampleRule[] = [
  {
    label: 'Ticket IDs → one group per ticket',
    description:
      'Matches `ticket-123` in document.title and gives every ticket its own group, named after the match.',
    build: () =>
      createRule({
        name: 'Tickets by ID',
        pattern: 'ticket-(\\d+)',
        target: 'title',
        mode: 'regex',
        flags: 'i',
        groupMode: 'perMatch',
        template: 'ticket-$1',
        color: 'blue',
        priority: 10,
      }),
  },
  {
    label: 'GitHub repos → one group per repo',
    description: 'One group per `owner/repo`, extracted from the URL.',
    build: () =>
      createRule({
        name: 'GitHub repos',
        pattern: '^https?://github\\.com/([^/]+/[^/]+)',
        target: 'url',
        mode: 'regex',
        flags: 'i',
        groupMode: 'perMatch',
        template: 'GH: $1',
        captureGroup: 1,
        color: 'purple',
      }),
  },
  {
    label: 'Jira issues → one group per project',
    description: 'Groups `PROJ-123` style keys by project key.',
    build: () =>
      createRule({
        name: 'Jira by project',
        pattern: '\\b([A-Z][A-Z0-9]+)-\\d+\\b',
        target: 'both',
        mode: 'regex',
        flags: '',
        groupMode: 'perMatch',
        template: '$1',
        captureGroup: 1,
        color: 'orange',
      }),
  },
  {
    label: 'Group by site (all tabs)',
    description:
      'One group per hostname for every http(s) tab. Disabled by default — enable it when you want everything grouped.',
    build: () =>
      createRule({
        name: 'Group every site by domain',
        enabled: false,
        pattern: '^https?://(?:[^/@]*@)?(?:www\\.)?([^/:?#]+)',
        target: 'url',
        mode: 'regex',
        flags: 'i',
        groupMode: 'perMatch',
        template: '$1',
        captureGroup: 1,
        color: 'cyan',
      }),
  },
  {
    label: 'Docs & reference → one group',
    description: 'Fixed group for developer documentation sites.',
    build: () =>
      createRule({
        name: 'Docs',
        pattern: 'developer\\.mozilla\\.org|docs\\.|/documentation/|readthedocs',
        target: 'url',
        mode: 'regex',
        flags: 'i',
        groupMode: 'fixed',
        title: 'Docs',
        color: 'green',
      }),
  },
];
