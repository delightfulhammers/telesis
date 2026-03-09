/**
 * Wraps a CLI action handler so that thrown errors print a clean message
 * (just the Error.message) instead of exposing a raw stack trace.
 */
export const handleAction =
  <T extends unknown[]>(fn: (...args: T) => void) =>
  (...args: T): void => {
    try {
      fn(...args);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  };
