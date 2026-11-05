require('dotenv').config({ quiet: true });
const { validateEnvironment } = require('./config');

function start() {
  const { port } = validateEnvironment();
  const pool = require('./db/pool');
  const { createApp } = require('./app');
  const server = createApp({ pool }).listen(port, '0.0.0.0', () => {
    console.log(JSON.stringify({ event: 'server_started', port }));
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 25000);
    deadline.unref();
    server.close(async () => {
      try { await pool.end(); clearTimeout(deadline); }
      catch { process.exitCode = 1; }
    });
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}
if (require.main === module) {
  try { start(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { start };
