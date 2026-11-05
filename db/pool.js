const { Pool } = require("pg");
const { databaseOptions } = require('../config');

const pool = new Pool(databaseOptions());
pool.on('error', error => {
    console.error(JSON.stringify({ event: 'database_pool_error', code: error.code || 'UNKNOWN' }));
});

module.exports = pool;
