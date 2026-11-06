const fs = require('node:fs');
const path = require('node:path');

function validateEnvironment(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL must be a PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL');
  if (!env.API_KEY) throw new Error('API_KEY is required');
  if (env.SCHEDULER_API_KEY !== undefined) {
    if (env.SCHEDULER_API_KEY.length < 32 || env.SCHEDULER_API_KEY !== env.SCHEDULER_API_KEY.trim()) {
      throw new Error('SCHEDULER_API_KEY must contain at least 32 characters with no surrounding whitespace');
    }
    if (env.SCHEDULER_API_KEY === env.API_KEY) throw new Error('SCHEDULER_API_KEY must differ from API_KEY');
  }
  if (env.NODE_ENV === 'production' && env.API_KEY.length < 32) throw new Error('Production API_KEY must contain at least 32 characters');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  return { port };
}

function databaseOptions(env = process.env) {
  // Public Supabase root CA supplied by the owner from the project dashboard.
  // Ship it with the backend so local and Render connections use the same trust.
  const ca = env.DATABASE_CA_CERT
    ? env.DATABASE_CA_CERT.replace(/\\n/g, '\n')
    : fs.readFileSync(path.join(__dirname, 'db/certs/supabase-prod-ca-2021.crt'), 'utf8');
  let connectionString = env.DATABASE_URL;
  if (connectionString) {
    const url = new URL(connectionString);
    // Prevent URL options from replacing the verified TLS configuration.
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
    connectionString = url.toString();
  }
  return { connectionString,
    ssl: { rejectUnauthorized: true, ca },
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, max: 5,
    statement_timeout: 15000, idle_in_transaction_session_timeout: 20000 };
}
module.exports = { validateEnvironment, databaseOptions };
