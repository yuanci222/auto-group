// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createRule } from '../core/rules';
import type { DraftRulesStore } from '../ui/useRuleSet';
import { RulesPanel } from './RulesPanel';

function makeDraft(patch: Partial<DraftRulesStore> = {}): DraftRulesStore {
  return {
    rules: [createRule({ pattern: 'ticket-(\\d+)', target: 'title', groupMode: 'perMatch' })],
    ready: true,
    dirty: false,
    saved: false,
    saving: false,
    addRule: vi.fn(),
    replaceRule: vi.fn(),
    removeRule: vi.fn(),
    toggleRule: vi.fn(),
    discard: vi.fn(),
    save: vi.fn(async () => undefined),
    ...patch,
  };
}

describe('RulesPanel draft behaviour', () => {
  it('shows no save bar when the draft matches storage', () => {
    render(<RulesPanel draft={makeDraft()} tabs={[]} />);
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('stages a toggle instead of writing immediately', async () => {
    const draft = makeDraft();
    const user = userEvent.setup();
    render(<RulesPanel draft={draft} tabs={[]} />);
    await user.click(screen.getByRole('checkbox', { name: /Enable/ }));
    expect(draft.toggleRule).toHaveBeenCalledWith(draft.rules[0]!.id, false);
    expect(draft.save).not.toHaveBeenCalled();
  });

  it('stages a new example instead of applying it', async () => {
    const draft = makeDraft({ rules: [] });
    const user = userEvent.setup();
    render(<RulesPanel draft={draft} tabs={[]} />);
    await user.click(screen.getByRole('button', { name: 'Browse examples' }));
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0]!);
    expect(draft.addRule).toHaveBeenCalledTimes(1);
    expect(draft.save).not.toHaveBeenCalled();
  });

  it('shows the save bar and saves on demand when dirty', async () => {
    const draft = makeDraft({ dirty: true });
    const user = userEvent.setup();
    render(<RulesPanel draft={draft} tabs={[]} />);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(draft.save).toHaveBeenCalledTimes(1);
  });

  it('can discard the draft', async () => {
    const draft = makeDraft({ dirty: true });
    const user = userEvent.setup();
    render(<RulesPanel draft={draft} tabs={[]} />);
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(draft.discard).toHaveBeenCalledTimes(1);
  });

  it('shows the fading Saved state after a save', () => {
    render(<RulesPanel draft={makeDraft({ saved: true, dirty: false })} tabs={[]} />);
    expect(screen.getByText('✓ Saved')).toBeInTheDocument();
  });
});
