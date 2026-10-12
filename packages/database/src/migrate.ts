import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from './index.js';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const connection = createDatabase(url, 1);
try { await migrate(connection.db, { migrationsFolder: './drizzle' }); } finally { await connection.close(); }
