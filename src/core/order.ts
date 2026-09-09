/**
 * Tab-strip ordering.
 *
 * The extension keeps a stable, predictable shape:
 *
 *     GroupA | GroupB | GroupC | tabA | tabB | tabC
 *
 * Groups are contiguous on the left (in their existing order, with groups
 * created by the current reconcile appended last), ungrouped tabs sit on the
 * right in their original relative order, and pinned tabs stay pinned at the
 * very front.
 */

export const NO_GROUP = -1;

export interface OrderableTab {
  id: number;
  index: number;
  groupId: number;
  pinned: boolean;
}

export interface OrderOptions {
  /**
   * Groups created during this reconcile. They are placed after every
   * pre-existing group, which is what makes a new GroupD land between GroupC
   * and the first ungrouped tab.
   */
  newGroupIds?: Iterable<number>;
  /** When false the current order is returned untouched. */
  enforceGroupOrder?: boolean;
}

/**
 * Compute the desired tab order for a window. Pure and deterministic, so it is
 * easy to unit test without a browser.
 */
export function computeDesiredOrder(tabs: OrderableTab[], options: OrderOptions = {}): number[] {
  const ordered = [...tabs].sort((a, b) => a.index - b.index);
  if (options.enforceGroupOrder === false) return ordered.map((t) => t.id);

  const newGroups = new Set(options.newGroupIds ?? []);

  const pinned = ordered.filter((t) => t.pinned);
  const rest = ordered.filter((t) => !t.pinned);

  // Rank existing groups by the position of their left-most tab, so the user's
  // manual group order is preserved. New groups get an infinite rank and are
  // tie-broken by their own left-most tab.
  const rank = new Map<number, number>();
  for (const tab of rest) {
    if (tab.groupId === NO_GROUP || newGroups.has(tab.groupId)) continue;
    const current = rank.get(tab.groupId);
    if (current === undefined || tab.index < current) rank.set(tab.groupId, tab.index);
  }
  const maxRank = rank.size ? Math.max(...rank.values()) : -1;

  const rankOf = (tab: OrderableTab): number => {
    if (tab.groupId === NO_GROUP) return Number.POSITIVE_INFINITY;
    if (newGroups.has(tab.groupId)) return maxRank + 1_000_000 + tab.index / 1e6;
    return rank.get(tab.groupId) ?? Number.POSITIVE_INFINITY;
  };

  const grouped = rest
    .filter((t) => t.groupId !== NO_GROUP)
    .sort((a, b) => rankOf(a) - rankOf(b) || a.index - b.index);
  const ungrouped = rest.filter((t) => t.groupId === NO_GROUP);

  return [...pinned, ...grouped, ...ungrouped].map((t) => t.id);
}

/** Index of the first element that differs, or -1 when both arrays match. */
export function firstMismatch(current: readonly number[], desired: readonly number[]): number {
  const len = Math.max(current.length, desired.length);
  for (let i = 0; i < len; i++) {
    if (current[i] !== desired[i]) return i;
  }
  return -1;
}

export interface TabOrderIO {
  /** Current ordered tab ids for the window. */
  getOrder(): Promise<number[]>;
  /** Move a single tab to `index` (Chrome semantics: final position). */
  move(tabId: number, index: number): Promise<void>;
}

export interface ApplyOrderResult {
  moves: number;
  remaining: number[];
}

/**
 * Apply `desired` to a window using single-tab moves. The loop re-reads the
 * real order after every move, so it converges even if the browser's index
 * semantics differ slightly from the naive model.
 */
export async function applyTabOrder(
  desired: readonly number[],
  io: TabOrderIO,
  maxMoves = 500,
): Promise<ApplyOrderResult> {
  let moves = 0;
  let current = await io.getOrder();

  while (moves < maxMoves) {
    const mismatch = firstMismatch(current, desired);
    if (mismatch === -1) return { moves, remaining: current };
    const wanted = desired[mismatch];
    if (wanted === undefined) break;
    if (!current.includes(wanted)) break; // tab disappeared mid-flight
    await io.move(wanted, mismatch);
    moves += 1;
    current = await io.getOrder();
  }
  return { moves, remaining: current };
}
