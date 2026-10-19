const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env")
});

const DB_NAME = process.env.DB_NAME || "buddytech";

if (!/^[a-zA-Z0-9_]+$/.test(DB_NAME)) {
  throw new Error("DB_NAME may only contain letters, numbers, and underscores.");
}

const baseConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || ""
};

const REQUIRED_TABLES = [
  "users",
  "courses",
  "course_members",
  "channels",
  "messages",
  "assignments"
];

async function ensureDatabase() {
  let connection;

  try {
    connection = await mysql.createConnection({
      ...baseConfig,
      multipleStatements: true
    });

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``
    );

    await connection.end();

    connection = await mysql.createConnection({
      ...baseConfig,
      database: DB_NAME,
      multipleStatements: true
    });

    const [rows] = await connection.query("SHOW TABLES");

    const existingTables = new Set(
      rows.map(row => Object.values(row)[0])
    );

    const databaseComplete = REQUIRED_TABLES.every(
      table => existingTables.has(table)
    );

    if (databaseComplete) {
      console.log(`Database "${DB_NAME}" already initialized.`);
      return;
    }

    console.log(`Database "${DB_NAME}" is incomplete. Rebuilding schema...`);

    const schema = fs.readFileSync(
      path.join(__dirname, "schema.sql"),
      "utf8"
    );

    const seed = fs.readFileSync(
      path.join(__dirname, "seed.sql"),
      "utf8"
    );

    await connection.query(schema);
    await connection.query(seed);

    console.log("Database initialized successfully.");
  } finally {
    if (connection) {
      await connection.end().catch(() => {});
    }
  }
}

ensureDatabase().catch((error) => {
  console.error("Database setup failed:");
  console.error(error);
  process.exit(1);
});
