import fs from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const sql = await fs.readFile(new URL('../src/db_schema.sql', import.meta.url), 'utf8');
const pool = new Pool({
  connectionString,
  max: 1,
  ssl: connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
});

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('GLOBAL FINANCE PostgreSQL schema is ready.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
