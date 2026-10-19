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

    const [tables] = await connection.query(
      "SHOW TABLES LIKE 'users'"
    );

    if (tables.length > 0) {
      console.log(`Database "${DB_NAME}" already initialized.`);
      return;
    }

    console.log(`Initializing database: ${DB_NAME}`);

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
  console.error(error.message);
  process.exit(1);
});
