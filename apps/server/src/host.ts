import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { CountryRecord } from '@capitales/core';
import { countCountries, openDb, seedCountries } from './db.js';
import { createServer, HOST } from './routes.js';

export interface HostOptions {
  /** Where the SQLite file lives. Created if missing. */
  dbPath: string;
  /** Built web assets to serve. Omit to run API-only. */
  staticDir?: string;
  /** 0 asks the OS for a free port — what the desktop shell wants. */
  port?: number;
  /**
   * Countries to load if the database is empty.
   *
   * The desktop app has no terminal to run `npm run seed` from, so it carries
   * its own seed data and plants it on first launch.
   */
  seedIfEmpty?: readonly CountryRecord[];
}

export interface RunningHost {
  server: Server;
  db: DatabaseSync;
  port: number;
  origin: string;
  close: () => Promise<void>;
}

/**
 * Opens the database and starts the HTTP server, resolving once it is actually
 * accepting connections.
 *
 * Everything the desktop shell needs is here rather than in Electron's main
 * process, so the same code path is exercised by `npm run server`.
 */
export async function startHost(options: HostOptions): Promise<RunningHost> {
  mkdirSync(path.dirname(options.dbPath), { recursive: true });

  const db = openDb(options.dbPath);

  if (options.seedIfEmpty && countCountries(db) === 0) {
    seedCountries(db, options.seedIfEmpty);
  }

  const server = createServer(db, { staticDir: options.staticDir });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, HOST, resolve);
  });

  const port = (server.address() as AddressInfo).port;

  return {
    server,
    db,
    port,
    origin: `http://${HOST}:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          db.close();
          resolve();
        });
      }),
  };
}
