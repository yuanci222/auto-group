import { createRule } from '../core/rules';
import type { Rule } from '../core/types';

/**
 * Ready-made rules the user can load with one click from the Rules panel.
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
      'One group per ticket id found in the tab title. If a PRD doc, a Jira issue and a Figma file all contain `ticket-123`, they end up in the same group. Swap `ticket` for your own key, e.g. `PRD-\\d+`.',
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
  {
    label: 'Local development → one group',
    description: 'Fixed group for localhost, .local and .internal hosts.',
    build: () =>
      createRule({
        name: 'Local',
        pattern: 'localhost|127\\.0\\.0\\.1|\\.local\\b|\\.internal\\b',
        target: 'url',
        mode: 'regex',
        flags: 'i',
        groupMode: 'fixed',
        title: 'Local',
        color: 'orange',
      }),
  },
];
