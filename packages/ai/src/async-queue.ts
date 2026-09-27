/** Minimal push-based queue exposed as an AsyncIterable. Ends after `end()` once drained. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: ((result: IteratorResult<T>) => void)[] = [];
  private ended = false;

  push(item: T): void {
    if (this.ended) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: item, done: false });
    else this.items.push(item);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const waiter of this.waiters.splice(0))
      waiter({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length > 0) {
          return Promise.resolve({ value: this.items.shift()!, done: false });
        }
        if (this.ended)
          return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
      return: () => {
        this.end();
        this.items = [];
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}
