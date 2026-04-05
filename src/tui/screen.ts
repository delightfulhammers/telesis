/** Low-level terminal I/O: raw mode, ANSI cursor control, screen clearing. */

import { parseKey } from "./keys.js";
import type { KeyEvent } from "./keys.js";

const ESC = "\x1b[";

export interface Screen {
  readonly rows: number;
  readonly cols: number;
  readonly enterRawMode: () => void;
  readonly exitRawMode: () => void;
  readonly onKey: (handler: (key: KeyEvent) => void) => void;
  readonly clear: () => void;
  readonly hideCursor: () => void;
  readonly showCursor: () => void;
  readonly moveTo: (row: number, col: number) => void;
  readonly write: (text: string) => void;
  readonly writeLine: (row: number, text: string) => void;
  readonly destroy: () => void;
}

/** Create a Screen bound to process.stdout/stdin. */
export const createScreen = (): Screen => {
  let keyHandler: ((key: KeyEvent) => void) | null = null;
  let rawMode = false;

  const dataHandler = (data: Buffer): void => {
    if (keyHandler) keyHandler(parseKey(data));
  };

  const rows = (): number => process.stdout.rows ?? 24;
  const cols = (): number => process.stdout.columns ?? 80;

  return {
    get rows() {
      return rows();
    },
    get cols() {
      return cols();
    },

    enterRawMode: () => {
      if (process.stdin.isTTY && !rawMode) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", dataHandler);
        rawMode = true;
      }
    },

    exitRawMode: () => {
      if (rawMode) {
        process.stdin.removeListener("data", dataHandler);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        rawMode = false;
      }
    },

    onKey: (handler) => {
      keyHandler = handler;
    },

    clear: () => {
      process.stdout.write(`${ESC}2J${ESC}H`);
    },

    hideCursor: () => {
      process.stdout.write(`${ESC}?25l`);
    },

    showCursor: () => {
      process.stdout.write(`${ESC}?25h`);
    },

    moveTo: (row, col) => {
      process.stdout.write(`${ESC}${row + 1};${col + 1}H`);
    },

    write: (text) => {
      process.stdout.write(text);
    },

    writeLine: (row, text) => {
      process.stdout.write(`${ESC}${row + 1};1H${ESC}2K${text}`);
    },

    destroy: () => {
      if (rawMode) {
        process.stdin.removeListener("data", dataHandler);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        rawMode = false;
      }
      process.stdout.write(`${ESC}?25h`); // show cursor
    },
  };
};
