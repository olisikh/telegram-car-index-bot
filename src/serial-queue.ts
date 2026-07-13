export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this.tail.then(job, job);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
