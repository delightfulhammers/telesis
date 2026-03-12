import { createConnection, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { socketPath } from "./socket.js";
import type {
  SocketRequest,
  SocketResponse,
  SocketBroadcast,
  SocketMessage,
  TelesisDaemonEvent,
} from "./types.js";

interface PendingRequest {
  readonly resolve: (response: SocketResponse) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export interface DaemonClient {
  /** Send a command and wait for a response */
  readonly sendCommand: (
    command: SocketRequest["command"],
  ) => Promise<SocketResponse>;
  /** Register a handler for broadcast events */
  readonly onEvent: (handler: (event: TelesisDaemonEvent) => void) => void;
  /** Disconnect from the daemon */
  readonly disconnect: () => void;
  /** Whether the client is connected */
  readonly isConnected: () => boolean;
}

/** Connect to the daemon's Unix socket */
export const connect = (rootDir: string): Promise<DaemonClient> => {
  const path = socketPath(rootDir);
  const pending = new Map<string, PendingRequest>();
  const eventHandlers: ((event: TelesisDaemonEvent) => void)[] = [];
  let socket: Socket | null = null;
  let buffer = "";
  let connected = false;
  let settled = false;

  const processLine = (line: string): void => {
    try {
      const msg = JSON.parse(line) as SocketMessage;

      if ("broadcast" in msg && msg.broadcast) {
        const broadcast = msg as SocketBroadcast;
        for (const handler of eventHandlers) {
          handler(broadcast.event);
        }
      } else {
        const response = msg as SocketResponse;
        const req = pending.get(response.id);
        if (req) {
          clearTimeout(req.timer);
          pending.delete(response.id);
          req.resolve(response);
        }
      }
    } catch {
      // malformed JSON — ignore
    }
  };

  return new Promise((resolve, reject) => {
    socket = createConnection(path);

    socket.on("connect", () => {
      connected = true;
      settled = true;
      resolve({
        sendCommand: (command) => {
          const id = randomUUID();
          const req: SocketRequest = { id, command };

          return new Promise<SocketResponse>((res, rej) => {
            const timer = setTimeout(() => {
              if (pending.has(id)) {
                pending.delete(id);
                rej(new Error(`command "${command}" timed out`));
              }
            }, 5000);

            pending.set(id, { resolve: res, reject: rej, timer });
            socket!.write(JSON.stringify(req) + "\n");
          });
        },

        onEvent: (handler) => {
          eventHandlers.push(handler);
        },

        disconnect: () => {
          connected = false;
          if (socket) {
            socket.destroy();
            socket = null;
          }
          for (const [, req] of pending) {
            clearTimeout(req.timer);
            req.reject(new Error("disconnected"));
          }
          pending.clear();
        },

        isConnected: () => connected,
      });
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf-8");

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (line.length > 0) processLine(line);
      }
    });

    socket.on("close", () => {
      connected = false;
    });

    socket.on("error", (err) => {
      connected = false;
      if (!settled) {
        settled = true;
        reject(
          new Error(
            `could not connect to daemon (is it running?): ${err.message}`,
          ),
        );
      }
    });
  });
};
