import { describe, expect, it } from 'vitest';
import { applyTabOrder, computeDesiredOrder, firstMismatch, NO_GROUP, type OrderableTab } from './order';

function t(id: number, index: number, groupId = NO_GROUP, pinned = false): OrderableTab {
  return { id, index, groupId, pinned };
}

describe('computeDesiredOrder', () => {
  it('keeps groups contiguous on the left and ungrouped on the right', () => {
    // A | tab1 | B | tab2 | A   (interleaved)
    const tabs = [t(1, 0, 10), t(2, 1), t(3, 2, 11), t(4, 3), t(5, 4, 10)];
    expect(computeDesiredOrder(tabs)).toEqual([1, 5, 3, 2, 4]);
  });

  it('places a new group after existing groups and before ungrouped tabs', () => {
    // A | B | tab1 | new(D tabs currently ungrouped at the end)
    const tabs = [t(1, 0, 10), t(2, 1, 11), t(3, 2), t(4, 3), t(5, 4, 12)];
    // 12 is the newly created group
    expect(computeDesiredOrder(tabs, { newGroupIds: [12] })).toEqual([1, 2, 5, 3, 4]);
  });

  it('preserves the existing group order when no new group is created', () => {
    const tabs = [t(1, 0, 11), t(2, 1, 10), t(3, 2), t(4, 3)];
    expect(computeDesiredOrder(tabs)).toEqual([1, 2, 3, 4]);
  });

  it('keeps pinned tabs first', () => {
    const tabs = [t(1, 0, 10), t(2, 1, NO_GROUP, true), t(3, 2), t(4, 3)];
    expect(computeDesiredOrder(tabs)).toEqual([2, 1, 3, 4]);
  });

  it('is a no-op when enforcement is disabled', () => {
    const tabs = [t(1, 0, 10), t(2, 1), t(3, 2, 10)];
    expect(computeDesiredOrder(tabs, { enforceGroupOrder: false })).toEqual([1, 2, 3]);
  });

  it('produces the canonical GroupA|GroupB|GroupC|tabA|tabB|tabC shape', () => {
    const tabs = [
      t(1, 0, 100),
      t(2, 1, 101),
      t(3, 2, 102),
      t(4, 3),
      t(5, 4),
      t(6, 5),
    ];
    expect(computeDesiredOrder(tabs)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('applyTabOrder', () => {
  function makeIO(initial: number[]) {
    let order = [...initial];
    return {
      state: () => order,
      io: {
        getOrder: async () => [...order],
        move: async (id: number, index: number) => {
          const from = order.indexOf(id);
          if (from === -1) return;
          order.splice(from, 1);
          order.splice(Math.max(0, Math.min(index, order.length)), 0, id);
        },
      },
    };
  }

  it('reorders using the minimum number of moves', async () => {
    const { io, state } = makeIO([1, 2, 3, 4, 5]);
    const result = await applyTabOrder([1, 5, 3, 2, 4], io);
    expect(state()).toEqual([1, 5, 3, 2, 4]);
    expect(result.moves).toBeGreaterThan(0);
    expect(result.moves).toBeLessThanOrEqual(4);
  });

  it('does nothing when already ordered', async () => {
    const { io } = makeIO([1, 2, 3]);
    expect((await applyTabOrder([1, 2, 3], io)).moves).toBe(0);
  });

  it('stops gracefully when a tab disappears', async () => {
    const { io } = makeIO([1, 2]);
    const result = await applyTabOrder([1, 2, 3], io);
    expect(result.remaining).toEqual([1, 2]);
  });
});

describe('firstMismatch', () => {
  it('finds the first differing index', () => {
    expect(firstMismatch([1, 2, 3], [1, 2, 3])).toBe(-1);
    expect(firstMismatch([1, 2, 3], [1, 9, 3])).toBe(1);
    expect(firstMismatch([1], [1, 2])).toBe(1);
  });
});
