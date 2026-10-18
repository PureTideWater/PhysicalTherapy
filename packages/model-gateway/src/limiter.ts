/**
 * How many model calls one process makes at once (PRD 14, Operational limits; PRD 16, availability;
 * docs/adr/0055). A call made from a request runs while that request's transaction holds a connection of
 * its pool, for up to two attempts at the call timeout. Without a cap, enough calls at once would hold every
 * connection a task has and leave none for anything else it serves. The cap holds them to a few per process
 * and per practice; a call over it is refused at once (ModelBusyError), never queued behind the others, and
 * the screen offers hand entry or a moment's wait.
 */

export interface CallLimits {
  /** Calls one process makes at once, across every practice. */
  readonly perProcess: number;
  /** Calls one process makes at once for one practice. */
  readonly perPractice: number;
}

/** The web app's limits: well under its pool (10), so the calls in flight never hold more than these of it. */
export const DEFAULT_CALL_LIMITS: CallLimits = { perProcess: 4, perPractice: 2 };

export class CallLimiter {
  private inFlight = 0;
  private readonly byPractice = new Map<string, number>();

  constructor(readonly limits: CallLimits = DEFAULT_CALL_LIMITS) {
    if (!Number.isInteger(limits.perProcess) || !Number.isInteger(limits.perPractice) || limits.perProcess < 1 || limits.perPractice < 1 || limits.perPractice > limits.perProcess) {
      throw new RangeError('call limits are whole numbers of at least one, a practice’s no more than the process’s');
    }
  }

  /** Calls in flight now, in all and for the practice. */
  current(practiceId: string | null): { readonly total: number; readonly practice: number } {
    return { total: this.inFlight, practice: practiceId === null ? 0 : (this.byPractice.get(practiceId) ?? 0) };
  }

  /** A place for one call, released by the function returned (once), or null when the process or the practice is at its cap. */
  tryAcquire(practiceId: string | null): (() => void) | null {
    const practice = practiceId === null ? 0 : (this.byPractice.get(practiceId) ?? 0);
    if (this.inFlight >= this.limits.perProcess || (practiceId !== null && practice >= this.limits.perPractice)) {
      return null;
    }
    this.inFlight += 1;
    if (practiceId !== null) {
      this.byPractice.set(practiceId, practice + 1);
    }
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.inFlight -= 1;
      if (practiceId !== null) {
        const left = (this.byPractice.get(practiceId) ?? 1) - 1;
        if (left === 0) {
          this.byPractice.delete(practiceId);
        } else {
          this.byPractice.set(practiceId, left);
        }
      }
    };
  }
}
