import pg from 'pg';

const { Pool } = pg;

let pool;

function resolveConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.NEON_DATABASE_URL ||
    ''
  );
}

export function getPool() {
  const rawConnectionString = resolveConnectionString();
  if (!rawConnectionString) {
    throw new Error('Database connection URL is not configured');
  }

  // Use the standard WHATWG URL parser and explicitly request full certificate
  // and hostname verification for Neon. Do not set rejectUnauthorized:false:
  // that disables TLS certificate verification.
  let connectionString = rawConnectionString;
  try {
    const parsed = new URL(rawConnectionString);
    if (parsed.hostname === 'neon.tech' || parsed.hostname.endsWith('.neon.tech')) {
      parsed.searchParams.set('sslmode', 'verify-full');
      connectionString = parsed.toString();
    }
  } catch {
    throw new Error('Database connection URL is invalid');
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return pool;
}

export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
