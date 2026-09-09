// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../core/types';
import { App } from './App';

type Listener = (changes: unknown, area: string) => void;

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

function installChromeMock(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  const storageListeners = new Set<Listener>();
  const read = (key: string) =>
    store[key] === undefined ? undefined : sortKeys(JSON.parse(JSON.stringify(store[key])));
  const area = {
    get: async (keys?: unknown) => {
      if (keys === undefined) return Object.fromEntries(Object.keys(store).map((k) => [k, read(k)]));
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
      for (const listener of storageListeners) listener(changes, 'local');
    },
    remove: async (key: string) => {
      delete store[key];
    },
  };
  const event = () => ({
    addListener: vi.fn(),
    removeListener: vi.fn(),
  });
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: area,
      session: area,
      onChanged: {
        addListener: (l: Listener) => storageListeners.add(l),
        removeListener: (l: Listener) => storageListeners.delete(l),
      },
    },
    tabs: {
      query: async () => [],
      onCreated: event(),
      onRemoved: event(),
      onUpdated: event(),
      onMoved: event(),
      onAttached: event(),
      onDetached: event(),
    },
    runtime: {
      sendMessage: async () => ({ ok: true, kind: 'pong' }),
      onMessage: event(),
    },
  };
}

describe('options App — save flow', () => {
  beforeEach(() => {
    installChromeMock({
      ruleset: { version: 1, rules: [], settings: { ...DEFAULT_SETTINGS } },
    });
  });

  it('shows Unsaved changes then Saved after pressing Save', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Wait for the empty state.
    await screen.findByRole('button', { name: 'Browse examples' });
    await user.click(screen.getByRole('button', { name: 'Browse examples' }));
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0]!);

    expect(await screen.findByText('Unsaved changes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('✓ Saved')).toBeInTheDocument());
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });
});
