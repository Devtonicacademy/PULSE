/**
 * Who is typing in a moment's discussion. Pure bookkeeping, no network: the transport (Firestore,
 * other tabs) feeds it snapshots, the UI asks who is active.
 *
 * Each typist keeps a small record that changes every few seconds while they type and is removed
 * when they stop. Instead of trusting anyone's clock, a person counts as typing when their record
 * last *changed* less than TYPING_TTL_MS ago by our own clock.
 */
export const TYPING_TTL_MS = 6000;
/** How often a typist refreshes their record while the keys keep moving */
export const TYPING_REFRESH_MS = 2500;

export interface TypingEntry {
  userId: string;
  userName: string;
  /** Any value that changes whenever the typist's record is refreshed (a timestamp, a counter) */
  stamp: number | string;
}

interface Seen {
  userName: string;
  stamp: number | string;
  seenAt: number;
}

export class TypingTracker {
  private seen = new Map<string, Seen>();

  /** Replace what is known with the latest full snapshot of typing records */
  observe(entries: TypingEntry[], now: number) {
    const present = new Set<string>();
    for (const entry of entries) {
      present.add(entry.userId);
      const before = this.seen.get(entry.userId);
      if (!before || before.stamp !== entry.stamp) {
        this.seen.set(entry.userId, { userName: entry.userName, stamp: entry.stamp, seenAt: now });
      }
    }
    for (const userId of [...this.seen.keys()]) if (!present.has(userId)) this.seen.delete(userId);
  }

  /** People other than `selfId` whose record changed within the TTL, oldest typist first */
  active(selfId: string, now: number, ttl = TYPING_TTL_MS): { userId: string; userName: string }[] {
    return [...this.seen.entries()]
      .filter(([userId, s]) => userId !== selfId && now - s.seenAt <= ttl)
      .sort((a, b) => a[1].seenAt - b[1].seenAt)
      .map(([userId, s]) => ({ userId, userName: s.userName }));
  }

  clear() {
    this.seen.clear();
  }
}

/** "Ada is typing…", "Ada and Bo are typing…", "Ada, Bo and 2 others are typing…" */
export function typingLabel(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} and ${others} other${others === 1 ? '' : 's'} are typing…`;
}
