import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

export interface BunSqliteOptions {
  readonly?: boolean;
  /** Throw instead of creating the file when it does not exist. */
  fileMustExist?: boolean;
  /** Milliseconds to wait on a locked database before SQLITE_BUSY. Default 5000, like better-sqlite3. */
  timeout?: number;
  // Accepted for better-sqlite3 compatibility, ignored.
  verbose?: unknown;
  nativeBinding?: unknown;
}

type Params = unknown[];

// bun:sqlite cannot bind booleans or undefined, better-sqlite3 callers (TypeORM) pass them.
function bind(params: Params): any[] {
  return params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p === undefined ? null : p));
}

// bun:sqlite returns blobs as Uint8Array, better-sqlite3 returns Buffer.
function toBuffers(rows: Record<string, unknown>[]) {
  for (const row of rows) {
    for (const key in row) {
      const value = row[key];
      if (value instanceof Uint8Array && !Buffer.isBuffer(value)) {
        row[key] = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      }
    }
  }
  return rows;
}

/**
 * A small better-sqlite3 look-alike on top of Bun's built-in `bun:sqlite`.
 * Pass it to TypeORM as `driver` of a `better-sqlite3` data source.
 */
export class BunSqlite {
  private db: Database;
  private statements = new Set<{ finalize(): void }>();
  private isOpen = true;

  constructor(path: string, options: BunSqliteOptions = {}) {
    const { readonly = false, fileMustExist = false, timeout = 5000 } = options;
    if (fileMustExist && path !== ":memory:" && !existsSync(path)) {
      throw new Error("Cannot open database because the file does not exist");
    }
    this.db = new Database(path, { readonly, create: !readonly && !fileMustExist });
    // bun:sqlite has no busy timeout by default, so a locked database fails immediately.
    this.db.run(`PRAGMA busy_timeout = ${Math.trunc(Number(timeout))}`);
  }

  get open() {
    return this.isOpen;
  }

  pragma(source: string, options?: { simple?: boolean }) {
    const rows = this.db.query(`PRAGMA ${source}`).all() as Record<string, unknown>[];
    if (options?.simple) return rows.length ? Object.values(rows[0])[0] : undefined;
    return rows;
  }

  exec(sql: string) {
    this.db.exec(sql);
    return this;
  }

  prepare(sql: string) {
    const stmt = this.db.prepare(sql);
    this.statements.add(stmt);
    return {
      reader: stmt.columnNames.length > 0,
      all: (...params: Params) => toBuffers(stmt.all(...bind(params)) as Record<string, unknown>[]),
      get: (...params: Params) => {
        const row = stmt.get(...bind(params)) as Record<string, unknown> | null;
        return row ? toBuffers([row])[0] : undefined;
      },
      run: (...params: Params) => {
        const { changes, lastInsertRowid } = stmt.run(...bind(params));
        return { changes, lastInsertRowid };
      },
    };
  }

  loadExtension(path: string) {
    this.db.loadExtension(path);
    return this;
  }

  close() {
    // An unfinalized statement keeps the file open (on Windows it cannot be deleted until the process exits).
    for (const stmt of this.statements) stmt.finalize();
    this.statements.clear();
    this.db.close();
    this.isOpen = false;
    return this;
  }
}

export default BunSqlite;
