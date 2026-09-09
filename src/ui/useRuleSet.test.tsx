// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRule } from '../core/rules';
import { DEFAULT_SETTINGS } from '../core/types';
import { useDraftRules, useRuleSet } from './useRuleSet';

/** Chrome returns storage objects with their keys sorted alphabetically. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function installChromeMock(initial: Record<string, unknown> = {}): Record<string, unknown> {
  const store: Record<string, unknown> = { ...initial };
  const listeners = new Set<(changes: unknown, area: string) => void>();
  const area = {
    get: async (keys?: unknown) => {
      const read = (key: string) =>
        store[key] === undefined ? undefined : sortKeys(JSON.parse(JSON.stringify(store[key])));
      if (keys === undefined) {
        return Object.fromEntries(Object.keys(store).map((k) => [k, read(k)]));
      }
      if (typeof keys === 'string') return { [keys]: read(keys) };
      if (Array.isArray(keys)) return Object.fromEntries(keys.map((k) => [k, read(k)]));
      return Object.fromEntries(Object.keys(store).map((k) => [k, read(k)]));
    },
    set: async (items: Record<string, unknown>) => {
      const changes: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(items)) {
        const stored = JSON.parse(JSON.stringify(value));
        changes[key] = { oldValue: store[key], newValue: sortKeys(stored) };
        store[key] = stored;
      }
      for (const listener of listeners) listener(changes, 'local');
    },
    remove: async (key: string) => {
      delete store[key];
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: area,
      session: area,
      onChanged: {
        addListener: (l: (changes: unknown, area: string) => void) => listeners.add(l),
        removeListener: (l: (changes: unknown, area: string) => void) => listeners.delete(l),
      },
    },
  };
  return store;
}

function Harness() {
  const store = useRuleSet();
  const draft = useDraftRules(store);
  if (!draft.ready) return <span>loading</span>;
  return (
    <div>
      <span data-testid="dirty">{String(draft.dirty)}</span>
      <span data-testid="saved">{String(draft.saved)}</span>
      <button type="button" onClick={() => draft.toggleRule(draft.rules[0]!.id, false)}>
        toggle
      </button>
      <button type="button" onClick={() => void draft.save()}>
        save
      </button>
    </div>
  );
}

describe('useDraftRules', () => {
  beforeEach(() => {
    installChromeMock({
      ruleset: {
        version: 1,
        rules: [
          createRule({ id: 'r1', pattern: 'ticket-(\\d+)', target: 'title', groupMode: 'perMatch' }),
        ],
        settings: { ...DEFAULT_SETTINGS },
      },
    });
  });

  it('flips from dirty to saved after pressing save', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('dirty')).toHaveTextContent('false'));

    await user.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('dirty')).toHaveTextContent('true');

    await user.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(screen.getByTestId('saved')).toHaveTextContent('true'));
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');
  });
});
