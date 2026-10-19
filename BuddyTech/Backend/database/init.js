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

async function runSql(connection, filename) {
  const sql = fs.readFileSync(
    path.join(__dirname, filename),
    "utf8"
  );

  await connection.query(sql);
}

async function initDatabase() {
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

    console.log(`Initializing database: ${DB_NAME}`);

    await runSql(connection, "schema.sql");
    await runSql(connection, "seed.sql");

    console.log("Database initialized successfully.");
  } finally {
    if (connection) {
      await connection.end().catch(() => {});
    }
  }
}

async function verifyDatabase() {
  const connection = await mysql.createConnection({
    ...baseConfig,
    database: DB_NAME,
    multipleStatements: true
  });

  try {
    const sql = fs.readFileSync(
      path.join(__dirname, "verify.sql"),
      "utf8"
    );

    const [results] = await connection.query(sql);

    console.log(`Database verification for: ${DB_NAME}`);

    for (const result of results) {
      if (Array.isArray(result)) {
        console.table(result);
      }
    }
  } finally {
    await connection.end();
  }
}

const command = process.argv[2];

if (command === "--verify") {
  verifyDatabase().catch((error) => {
    console.error("Database verification failed:");
    console.error(error.message);
    process.exit(1);
  });
} else {
  initDatabase().catch((error) => {
    console.error("Database initialization failed:");
    console.error(error.message);
    process.exit(1);
  });
}
