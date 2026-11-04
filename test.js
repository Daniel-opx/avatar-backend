require("dotenv").config();

const pool = require("./db/pool");

async function testConnection() {
    try {
        const result = await pool.query("SELECT NOW()");

        console.log("SUCCESS: Connected to PostgreSQL!");
        console.log(result.rows[0]);
    } catch (error) {
        console.error("CONNECTION FAILED:");
        console.error(error.message);
    } finally {
        await pool.end();
    }
}

testConnection();