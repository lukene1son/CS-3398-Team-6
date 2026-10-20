// Makes sure the database exists and is up to date. Safe to run on every start
// (the Dockerfile runs it before `npm start`).
//   - Empty database      -> runs schema.sql + seed.sql
//   - Existing database   -> leaves the data alone
// Either way, `npm run db:migrate` runs next and applies any new migrations.

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", "port.env"), quiet: true });

const mysql = require("mysql2/promise");
const dbConfig = require("../src/dbConfig");

const DB_NAME = process.env.DB_NAME || "buddytech";

if (!/^[a-zA-Z0-9_]+$/.test(DB_NAME)) {
    throw new Error("DB_NAME may only contain letters, numbers, and underscores.");
}

async function ensureDatabase() {
    // Connect without a database first so we can create it (uses SSL settings from dbConfig).
    let connection = await mysql.createConnection(dbConfig({ withDatabase: false }));

    try {
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
        await connection.end();

        connection = await mysql.createConnection({ ...dbConfig(), multipleStatements: true });

        const [rows] = await connection.query("SHOW TABLES LIKE 'users'");
        if (rows.length > 0) {
            console.log(`Database "${DB_NAME}" already initialized.`);
            return;
        }

        console.log(`Database "${DB_NAME}" is empty. Creating tables and seed data...`);
        const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
        const seed = fs.readFileSync(path.join(__dirname, "seed.sql"), "utf8");
        await connection.query(schema);
        await connection.query(seed);
        console.log("Database initialized successfully.");
    } finally {
        await connection.end().catch(() => {});
    }
}

ensureDatabase().catch((error) => {
    console.error("Database setup failed:");
    console.error(error);
    process.exit(1);
});