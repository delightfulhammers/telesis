/** ANSI escape code helpers for terminal coloring. */

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

export const bold = (s: string): string => `${ESC}1m${s}${RESET}`;
export const dim = (s: string): string => `${ESC}2m${s}${RESET}`;
export const italic = (s: string): string => `${ESC}3m${s}${RESET}`;
export const underline = (s: string): string => `${ESC}4m${s}${RESET}`;
export const inverse = (s: string): string => `${ESC}7m${s}${RESET}`;

export const red = (s: string): string => `${ESC}31m${s}${RESET}`;
export const green = (s: string): string => `${ESC}32m${s}${RESET}`;
export const yellow = (s: string): string => `${ESC}33m${s}${RESET}`;
export const blue = (s: string): string => `${ESC}34m${s}${RESET}`;
export const magenta = (s: string): string => `${ESC}35m${s}${RESET}`;
export const cyan = (s: string): string => `${ESC}36m${s}${RESET}`;
export const white = (s: string): string => `${ESC}37m${s}${RESET}`;
export const gray = (s: string): string => `${ESC}90m${s}${RESET}`;

export const bgBlue = (s: string): string => `${ESC}44m${s}${RESET}`;
export const bgGray = (s: string): string => `${ESC}100m${s}${RESET}`;

/** Strip all ANSI escape sequences from a string (for length calculation). */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");

/** Pad/truncate a string to exactly `width` visible characters. */
export const fitWidth = (s: string, width: number): string => {
  const visible = stripAnsi(s);
  if (visible.length > width) {
    // Truncate — need to walk through keeping ANSI codes
    let count = 0;
    let result = "";
    let i = 0;
    while (i < s.length && count < width - 1) {
      if (s[i] === "\x1b") {
        const end = s.indexOf("m", i);
        if (end !== -1) {
          result += s.slice(i, end + 1);
          i = end + 1;
          continue;
        }
      }
      result += s[i];
      count++;
      i++;
    }
    return result + "…" + RESET;
  }
  return s + " ".repeat(width - visible.length);
};
