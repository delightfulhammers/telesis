import { Subject, type Observable, type Subscription } from "rxjs";
import { filter } from "rxjs/operators";
import type { EventType, TelesisDaemonEvent } from "./types.js";

/** Event bus — the central nervous system of the daemon */
export interface EventBus {
  /** Publish an event to all subscribers */
  readonly publish: (event: TelesisDaemonEvent) => void;
  /** Subscribe to all events */
  readonly subscribe: (
    handler: (event: TelesisDaemonEvent) => void,
  ) => Subscription;
  /** Subscribe to events of a specific type */
  readonly ofType: <T extends EventType>(
    type: T,
    handler: (event: Extract<TelesisDaemonEvent, { readonly type: T }>) => void,
  ) => Subscription;
  /** Observable of all events (for advanced composition) */
  readonly events$: Observable<TelesisDaemonEvent>;
  /** Complete the subject and clean up */
  readonly dispose: () => void;
  /** Whether the bus has been disposed */
  readonly isDisposed: () => boolean;
}

/** Create a new event bus backed by an RxJS Subject */
export const createBus = (): EventBus => {
  const subject = new Subject<TelesisDaemonEvent>();
  let disposed = false;

  return {
    publish: (event) => {
      if (!disposed) {
        subject.next(event);
      }
    },

    subscribe: (handler) => subject.subscribe({ next: handler }),

    ofType: <T extends EventType>(
      type: T,
      handler: (
        event: Extract<TelesisDaemonEvent, { readonly type: T }>,
      ) => void,
    ) =>
      subject
        .pipe(
          filter(
            (e): e is Extract<TelesisDaemonEvent, { readonly type: T }> =>
              e.type === type,
          ),
        )
        .subscribe({ next: handler }),

    events$: subject.asObservable(),

    dispose: () => {
      if (!disposed) {
        disposed = true;
        subject.complete();
      }
    },

    isDisposed: () => disposed,
  };
};
