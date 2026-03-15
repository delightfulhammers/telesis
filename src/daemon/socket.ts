import { createServer, type Server, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { unlinkSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import type { EventBus } from "./bus.js";
import {
  MAX_SOCKET_MESSAGE_SIZE,
  type SocketRequest,
  type SocketResponse,
  type SocketBroadcast,
  type TelesisDaemonEvent,
} from "./types.js";

const SOCKET_FILENAME = "daemon.sock";

/** Socket path for a given project root */
export const socketPath = (rootDir: string): string =>
  join(rootDir, ".telesis", SOCKET_FILENAME);

interface ClientState {
  readonly id: string;
  readonly socket: Socket;
  subscribed: boolean;
  buffer: string;
}

export interface DaemonSocketServer {
  /** Close the server and all client connections */
  readonly close: () => Promise<void>;
  /** Broadcast an event to all subscribed clients */
  readonly broadcast: (event: TelesisDaemonEvent) => void;
  /** Number of connected clients */
  readonly clientCount: () => number;
}

interface StatusInfo {
  readonly pid: number;
  readonly uptimeMs: number;
  readonly eventCount: number;
  readonly clientCount: number;
}

/** Start the Unix socket server */
export const startSocketServer = (
  rootDir: string,
  bus: EventBus,
  getStatus: () => StatusInfo,
  onStop: () => void,
): Promise<DaemonSocketServer> => {
  const path = socketPath(rootDir);
  const clients = new Map<string, ClientState>();
  let server: Server | null = null;

  // Clean up stale socket file
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      // best-effort
    }
  }

  const send = (
    socket: Socket,
    msg: SocketResponse | SocketBroadcast,
  ): void => {
    const data = JSON.stringify(msg) + "\n";
    if (Buffer.byteLength(data) > MAX_SOCKET_MESSAGE_SIZE) {
      console.error("Warning: socket message exceeds 64KB limit, dropping");
      return;
    }
    try {
      socket.write(data);
    } catch {
      // client may have disconnected
    }
  };

  const handleCommand = async (
    client: ClientState,
    req: SocketRequest,
  ): Promise<void> => {
    switch (req.command) {
      case "ping":
        send(client.socket, { id: req.id, ok: true, data: "pong" });
        break;

      case "status":
        send(client.socket, {
          id: req.id,
          ok: true,
          data: await getStatus(),
        });
        break;

      case "subscribe":
        client.subscribed = true;
        send(client.socket, { id: req.id, ok: true });
        break;

      case "unsubscribe":
        client.subscribed = false;
        send(client.socket, { id: req.id, ok: true });
        break;

      case "stop":
        send(client.socket, { id: req.id, ok: true });
        onStop();
        break;

      default:
        send(client.socket, {
          id: req.id,
          ok: false,
          error: `unknown command: ${req.command}`,
        });
    }
  };

  const handleData = (client: ClientState, chunk: Buffer): void => {
    client.buffer += chunk.toString("utf-8");

    // Process complete NDJSON lines first (before size check)
    let newlineIdx: number;
    while ((newlineIdx = client.buffer.indexOf("\n")) !== -1) {
      const line = client.buffer.slice(0, newlineIdx).trim();
      client.buffer = client.buffer.slice(newlineIdx + 1);

      if (line.length === 0) continue;

      try {
        const req = JSON.parse(line) as SocketRequest;
        if (typeof req.id === "string" && typeof req.command === "string") {
          handleCommand(client, req);
        }
      } catch {
        // malformed JSON — ignore
      }
    }

    // Enforce buffer limit on remaining incomplete data
    if (client.buffer.length > MAX_SOCKET_MESSAGE_SIZE) {
      client.buffer = "";
    }
  };

  const broadcastEvent = (event: TelesisDaemonEvent): void => {
    const msg: SocketBroadcast = { broadcast: true, event };
    for (const client of clients.values()) {
      if (client.subscribed) {
        send(client.socket, msg);
      }
    }
  };

  return new Promise((resolve, reject) => {
    server = createServer((socket) => {
      const clientId = randomUUID();
      const client: ClientState = {
        id: clientId,
        socket,
        subscribed: false,
        buffer: "",
      };
      clients.set(clientId, client);

      socket.on("data", (chunk) => handleData(client, chunk));
      socket.on("close", () => {
        clients.delete(clientId);
      });
      socket.on("error", () => {
        clients.delete(clientId);
      });
    });

    server.on("error", reject);

    server.listen(path, () => {
      // Restrict socket access to owning user (auth deferred — TDD-008 scope boundary)
      try {
        chmodSync(path, 0o600);
      } catch {
        // best-effort — non-fatal if chmod fails
      }

      resolve({
        close: () =>
          new Promise<void>((res) => {
            for (const client of clients.values()) {
              try {
                client.socket.destroy();
              } catch {
                // best-effort
              }
            }
            clients.clear();

            if (server) {
              server.close(() => {
                try {
                  unlinkSync(path);
                } catch {
                  // best-effort
                }
                res();
              });
              server = null;
            } else {
              res();
            }
          }),

        broadcast: broadcastEvent,

        clientCount: () => clients.size,
      });
    });
  });
};
