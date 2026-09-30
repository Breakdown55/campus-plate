import { createClient, type Client, type InValue } from '@libsql/client';

let client: Client | undefined;
let schemaReady: Promise<void> | undefined;

function getClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error('TURSO_DATABASE_URL is required.');
    if (!url.startsWith('file:') && !process.env.TURSO_AUTH_TOKEN)
      throw new Error('TURSO_AUTH_TOKEN is required for a hosted database.');
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}

class Statement {
  constructor(private sql: string, private args: InValue[] = []) {}
  bind(...args: InValue[]) { return new Statement(this.sql, args); }
  async first<T>() {
    const result = await getClient().execute({ sql: this.sql, args: this.args });
    return (result.rows[0] as T | undefined) ?? null;
  }
  async all<T = Record<string, unknown>>() {
    const result = await getClient().execute({ sql: this.sql, args: this.args });
    return { results: result.rows as T[] };
  }
  async run() {
    const result = await getClient().execute({ sql: this.sql, args: this.args });
    return { meta: { last_row_id: Number(result.lastInsertRowid ?? 0) } };
  }
}

export type Database = { prepare(sql: string): Statement };
export function database(): Database {
  return { prepare: sql => new Statement(sql) };
}

export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getClient();
      for (const sql of [
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('student','club','admin')),
          club_name TEXT,
          approved INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY,
          club_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          food TEXT NOT NULL,
          location TEXT NOT NULL,
          starts_at TEXT NOT NULL,
          ends_at TEXT NOT NULL,
          details TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS rsvps (
          event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          PRIMARY KEY(event_id, user_id)
        )`,
      ]) await db.execute(sql);
    })().catch(error => { schemaReady = undefined; throw error; });
  }
  return schemaReady;
}
