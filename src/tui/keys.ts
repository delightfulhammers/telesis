/** Key event parsing from raw stdin bytes. */

export interface KeyEvent {
  readonly name: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly raw: Buffer;
}

/** Parse raw stdin data into a KeyEvent. */
export const parseKey = (data: Buffer): KeyEvent => {
  const raw = data;

  // Ctrl+C
  if (data.length === 1 && data[0] === 0x03) {
    return { name: "c", ctrl: true, shift: false, raw };
  }

  // Ctrl+L
  if (data.length === 1 && data[0] === 0x0c) {
    return { name: "l", ctrl: true, shift: false, raw };
  }

  // Ctrl+Q
  if (data.length === 1 && data[0] === 0x11) {
    return { name: "q", ctrl: true, shift: false, raw };
  }

  // Enter
  if (data.length === 1 && (data[0] === 0x0d || data[0] === 0x0a)) {
    return { name: "enter", ctrl: false, shift: false, raw };
  }

  // Escape
  if (data.length === 1 && data[0] === 0x1b) {
    return { name: "escape", ctrl: false, shift: false, raw };
  }

  // Tab
  if (data.length === 1 && data[0] === 0x09) {
    return { name: "tab", ctrl: false, shift: false, raw };
  }

  // Backspace
  if (data.length === 1 && data[0] === 0x7f) {
    return { name: "backspace", ctrl: false, shift: false, raw };
  }

  // Arrow keys and other escape sequences
  if (data.length >= 3 && data[0] === 0x1b && data[1] === 0x5b) {
    const code = data[2];
    switch (code) {
      case 0x41:
        return { name: "up", ctrl: false, shift: false, raw };
      case 0x42:
        return { name: "down", ctrl: false, shift: false, raw };
      case 0x43:
        return { name: "right", ctrl: false, shift: false, raw };
      case 0x44:
        return { name: "left", ctrl: false, shift: false, raw };
      case 0x48:
        return { name: "home", ctrl: false, shift: false, raw };
      case 0x46:
        return { name: "end", ctrl: false, shift: false, raw };
    }

    // Page up: ESC [ 5 ~
    if (data.length >= 4 && data[2] === 0x35 && data[3] === 0x7e) {
      return { name: "pageup", ctrl: false, shift: false, raw };
    }
    // Page down: ESC [ 6 ~
    if (data.length >= 4 && data[2] === 0x36 && data[3] === 0x7e) {
      return { name: "pagedown", ctrl: false, shift: false, raw };
    }
  }

  // Printable ASCII
  if (data.length === 1 && data[0] >= 0x20 && data[0] <= 0x7e) {
    const char = String.fromCharCode(data[0]);
    return { name: char, ctrl: false, shift: char !== char.toLowerCase(), raw };
  }

  // Unknown
  return { name: "unknown", ctrl: false, shift: false, raw };
};
