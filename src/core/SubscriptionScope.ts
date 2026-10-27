/** Owns subscriptions for one scene; never clears another owner's listeners. */
export class SubscriptionScope {
  private cleanups: Array<() => void> = [];
  add(unsubscribe: () => void): void {
    this.cleanups.push(unsubscribe);
  }
  dispose(): void {
    const cleanups = this.cleanups;
    this.cleanups = [];
    for (const cleanup of cleanups) cleanup();
  }
}
