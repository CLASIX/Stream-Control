/**
 * A tiny typed pub/sub emitter used by platform connectors.
 *
 * Connectors extend this class so they can emit `message` and `status`
 * events without pulling in a dependency. `on()` returns an unsubscribe
 * function, which keeps the React layer clean (store it in an array,
 * call all of them on unmount).
 */
type Handler<T = unknown> = (payload: T) => void;

export class Emitter {
  private handlers = new Map<string, Set<Handler>>();

  /** Register a handler for `event`. Returns a function that removes it. */
  on<T = unknown>(event: string, handler: Handler<T>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler);
    return () => {
      set!.delete(handler as Handler);
    };
  }

  /** Emit `event` to all registered handlers. */
  protected emit<T = unknown>(event: string, payload: T): void {
    this.handlers.get(event)?.forEach((h) => (h as Handler<T>)(payload));
  }

  /** Remove every listener. Called on disconnect. */
  protected removeAllListeners(): void {
    this.handlers.clear();
  }
}
