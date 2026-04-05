/** View interface for the TUI. Each view is a full-screen render function. */

import type { Screen } from "./screen.js";
import type { KeyEvent } from "./keys.js";
import type { TelesisDaemonEvent } from "../daemon/types.js";

export interface View {
  readonly name: string;
  readonly render: (screen: Screen, startRow: number, endRow: number) => void;
  readonly onKey: (key: KeyEvent) => boolean; // true = handled by this view
  readonly onEvent?: (event: TelesisDaemonEvent) => void;
}
