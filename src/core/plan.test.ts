import { describe, expect, it } from 'vitest';
import { planWindow, tabSignature, type GroupInfo } from './plan';
import { createRule } from './rules';
import { DEFAULT_SETTINGS, type Rule, type Settings, type TabInfo } from './types';

function tab(partial: Partial<TabInfo> & { id: number }): TabInfo {
  return {
    windowId: 1,
    index: partial.id,
    pinned: false,
    groupId: -1,
    ...partial,
  };
}

function group(id: number, title: string): GroupInfo {
  return { id, windowId: 1, title, color: 'blue', collapsed: false };
}

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

const ticketRule: Rule = createRule({
  pattern: 'ticket-(\\d+)',
  target: 'title',
  mode: 'regex',
  groupMode: 'perMatch',
  template: 'ticket-$1',
  priority: 10,
});

describe('planWindow dynamic grouping', () => {
  it('creates one group per distinct matched value', () => {
    const plan = planWindow({
      tabs: [
        tab({ id: 1, title: 'ticket-123 opened' }),
        tab({ id: 2, title: 'another ticket-123' }),
        tab({ id: 3, title: 'ticket-456' }),
      ],
      rules: [ticketRule],
      settings: settings(),
      groups: [],
      ownedGroupIds: [],
    });
    expect(plan.createGroups.map((g) => g.title).sort()).toEqual(['ticket-123', 'ticket-456']);
    expect(plan.actions).toHaveLength(3);
    expect(plan.actions.filter((a) => a.newGroupKey === 'ticket-123')).toHaveLength(2);
  });

  it('reuses an existing group with the same title', () => {
    const plan = planWindow({
      tabs: [tab({ id: 1, title: 'ticket-123' })],
      rules: [ticketRule],
      settings: settings(),
      groups: [group(50, 'ticket-123')],
      ownedGroupIds: [50],
    });
    expect(plan.createGroups).toHaveLength(0);
    expect(plan.actions[0]).toMatchObject({ existingGroupId: 50, tabId: 1 });
  });

  it('skips tabs already in the target group', () => {
    const plan = planWindow({
      tabs: [tab({ id: 1, title: 'ticket-123', groupId: 50 })],
      rules: [ticketRule],
      settings: settings(),
      groups: [group(50, 'ticket-123')],
      ownedGroupIds: [50],
    });
    expect(plan.actions).toHaveLength(0);
  });
});

describe('planWindow safeguards', () => {
  it('leaves tabs in user-created groups alone by default', () => {
    const plan = planWindow({
      tabs: [tab({ id: 1, title: 'ticket-123', groupId: 99 })],
      rules: [ticketRule],
      settings: settings(),
      groups: [group(99, 'My manual group')],
      ownedGroupIds: [],
    });
    expect(plan.actions).toHaveLength(0);
  });

  it('regroups tabs in groups the extension owns', () => {
    const plan = planWindow({
      tabs: [tab({ id: 1, title: 'ticket-456', groupId: 50 })],
      rules: [ticketRule],
      settings: settings(),
      groups: [group(50, 'ticket-123')],
      ownedGroupIds: [50],
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]?.newGroupKey).toBe('ticket-456');
  });

  it('respects manual overrides until the tab content changes', () => {
    const tabA = tab({ id: 1, title: 'ticket-123' });
    const plan = planWindow({
      tabs: [tabA],
      rules: [ticketRule],
      settings: settings(),
      groups: [],
      ownedGroupIds: [],
      overrides: new Map([[1, tabSignature(tabA)]]),
    });
    expect(plan.actions).toHaveLength(0);

    const changed = { ...tabA, title: 'ticket-999' };
    const plan2 = planWindow({
      tabs: [changed],
      rules: [ticketRule],
      settings: settings(),
      groups: [],
      ownedGroupIds: [],
      overrides: new Map([[1, tabSignature(tabA)]]),
    });
    expect(plan2.actions).toHaveLength(1);
  });

  it('ignores pinned tabs when configured', () => {
    const plan = planWindow({
      tabs: [tab({ id: 1, title: 'ticket-123', pinned: true })],
      rules: [ticketRule],
      settings: settings({ ignorePinned: true }),
      groups: [],
      ownedGroupIds: [],
    });
    expect(plan.actions).toHaveLength(0);
  });

  it('does nothing when disabled', () => {
    const plan = planWindow({
      tabs: [tab({ id: 1, title: 'ticket-123' })],
      rules: [ticketRule],
      settings: settings({ enabled: false }),
      groups: [],
      ownedGroupIds: [],
    });
    expect(plan.actions).toHaveLength(0);
  });
});

describe('rule evaluation order', () => {
  it('picks the highest priority match', () => {
    const low = createRule({ pattern: 'ticket', target: 'title', groupMode: 'fixed', title: 'Low', priority: 1 });
    const high = createRule({ pattern: 'ticket-\\d+', target: 'title', groupMode: 'fixed', title: 'High', priority: 5 });
    const plan = planWindow({
      tabs: [tab({ id: 1, title: 'ticket-123' })],
      rules: [low, high],
      settings: settings({ evaluation: 'priority' }),
      groups: [],
      ownedGroupIds: [],
    });
    expect(plan.actions[0]?.title).toBe('High');
  });

  it('picks the first rule in file order for firstMatch', () => {
    const first = createRule({ pattern: 'ticket', target: 'title', groupMode: 'fixed', title: 'First', priority: 1 });
    const second = createRule({ pattern: 'ticket-\\d+', target: 'title', groupMode: 'fixed', title: 'Second', priority: 5 });
    const plan = planWindow({
      tabs: [tab({ id: 1, title: 'ticket-123' })],
      rules: [first, second],
      settings: settings({ evaluation: 'firstMatch' }),
      groups: [],
      ownedGroupIds: [],
    });
    expect(plan.actions[0]?.title).toBe('First');
  });
});

describe('colors', () => {
  it('rotates the palette for dynamic groups', () => {
    const plan = planWindow({
      tabs: [
        tab({ id: 1, title: 'ticket-1' }),
        tab({ id: 2, title: 'ticket-2' }),
      ],
      rules: [ticketRule],
      settings: settings({ defaultColors: ['red', 'green'] }),
      groups: [],
      ownedGroupIds: [],
    });
    expect(plan.createGroups.map((g) => g.color)).toEqual(['red', 'green']);
  });

  it('honours an explicit rule colour', () => {
    const rule = createRule({
      pattern: 'ticket-\\d+',
      target: 'title',
      groupMode: 'perMatch',
      color: 'purple',
    });
    const plan = planWindow({
      tabs: [tab({ id: 1, title: 'ticket-1' })],
      rules: [rule],
      settings: settings(),
      groups: [],
      ownedGroupIds: [],
    });
    expect(plan.createGroups[0]?.color).toBe('purple');
  });
});
