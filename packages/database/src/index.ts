import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema.js';

export interface DatabaseConnection {
  db: PostgresJsDatabase<typeof schema>;
  sql: Sql;
  close(): Promise<void>;
  check(): Promise<void>;
}

function serializeTimestamp(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    try {
      return Date.prototype.toISOString.call(value);
    } catch {
      // Fall through to parsing for supported string/number-like values.
    }
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new TypeError('Invalid timestamp value');
  return parsed.toISOString();
}

export function createDatabase(databaseUrl: string, max = 10): DatabaseConnection {
  const sql = postgres(databaseUrl, {
    max, idle_timeout: 20, connect_timeout: 10, prepare: false,
  });
  const db = drizzle(sql, { schema });
  // Drizzle installs transparent PostgreSQL date serializers during setup.
  // Restore a realm-independent serializer for outbound date parameters after
  // initialization so worker/test realms cannot pass raw Date objects to the
  // wire encoder. Drizzle's result parsers remain unchanged.
  for (const oid of [1082, 1114, 1184]) sql.options.serializers[oid] = serializeTimestamp;
  return {
    db, sql,
    async close() { await sql.end({ timeout: 5 }); },
    async check() { await sql`select 1`; },
  };
}
export * from './schema.js';
