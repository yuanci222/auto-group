// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createRule } from '../core/rules';
import type { TabInfo } from '../core/types';
import { RuleEditor } from './RuleEditor';

const rule = createRule({
  name: 'Tickets',
  pattern: 'ticket-(\\d+)',
  target: 'title',
  mode: 'regex',
  groupMode: 'perMatch',
  template: 'ticket-$1',
});

const tabs: TabInfo[] = [
  { id: 1, windowId: 1, index: 0, title: 'Fix ticket-123', url: 'https://x/1', pinned: false, groupId: -1 },
  { id: 2, windowId: 1, index: 1, title: 'Unrelated page', url: 'https://x/2', pinned: false, groupId: -1 },
];

describe('RuleEditor', () => {
  it('renders the rule and previews matching open tabs', () => {
    render(<RuleEditor rule={rule} tabs={tabs} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByDisplayValue('ticket-(\\d+)')).toBeInTheDocument();
    expect(screen.getByText('Fix ticket-123')).toBeInTheDocument();
    // The match text and the resulting group title are both "ticket-123".
    expect(screen.getAllByText('ticket-123').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Unrelated page')).not.toBeInTheDocument();
  });

  it('updates the live sample tester as you type', async () => {
    const user = userEvent.setup();
    render(<RuleEditor rule={rule} tabs={[]} onSave={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText('Paste a sample title or URL…');
    await user.type(input, 'see ticket-999');
    expect(await screen.findByText(/Matches: ticket-999/)).toBeInTheDocument();
  });

  it('shows an error for an invalid regex and disables saving', async () => {
    const user = userEvent.setup();
    render(<RuleEditor rule={rule} tabs={[]} onSave={vi.fn()} onCancel={vi.fn()} />);
    const pattern = screen.getByDisplayValue('ticket-(\\d+)');
    await user.clear(pattern);
    await user.type(pattern, '(');
    expect(await screen.findByText(/Invalid regular expression/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('saves the edited rule', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<RuleEditor rule={rule} tabs={[]} onSave={onSave} onCancel={vi.fn()} />);
    const name = screen.getByDisplayValue('Tickets');
    await user.clear(name);
    await user.type(name, 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed' }));
  });

  it('labels the match target consistently', () => {
    render(<RuleEditor rule={rule} tabs={[]} onSave={vi.fn()} onCancel={vi.fn()} />);
    const select = screen.getByLabelText('Match against');
    expect(within(select).getByRole('option', { name: 'Title' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Title or URL' })).toBeInTheDocument();
  });

  it('controls the regex i flag with the Ignore case checkbox', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<RuleEditor rule={rule} tabs={[]} onSave={onSave} onCancel={vi.fn()} />);
    const checkbox = screen.getByLabelText('Ignore case');
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ match: expect.objectContaining({ flags: '' }) }),
    );
  });
});
