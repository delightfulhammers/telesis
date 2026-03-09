const formatError = (err: unknown): string =>
  err instanceof Error ? err.message : "An unexpected error occurred";

const exitWithError = (err: unknown): never => {
  console.error(`Error: ${formatError(err)}`);
  process.exit(1);
};

/**
 * Wraps a CLI action handler (sync or async) so that thrown errors print a
 * clean message instead of exposing a raw stack trace. The .catch guard
 * ensures unhandled rejections are captured even if the caller doesn't await.
 */
export const handleAction =
  <T extends unknown[]>(fn: (...args: T) => void | Promise<void>) =>
  (...args: T): Promise<void> =>
    Promise.resolve(fn(...args)).catch(exitWithError);
