// Creates (or resets) the local database from schema.sql + seed.sql.
// Usage (from BuddyTech/Backend):
//   npm run db:init     -> drop + recreate all tables, then load seed data
//   npm run db:schema   -> drop + recreate all tables, no seed data
//   npm run db:verify   -> print row counts and sanity queries (changes nothing)
//
// WARNING: #### db:init and db:schema DELETE ALL EXISTING DATA. For an existing
// database you want to keep, use `npm run db:migrate` instead. #####

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", "port.env"), quiet: true });

const mysql = require("mysql2/promise");
const dbConfig = require("../src/dbConfig");

const args = process.argv.slice(2);
const VERIFY_ONLY = args.includes("--verify");
const NO_SEED = args.includes("--no-seed");

function readSql(file) {
    return fs.readFileSync(path.join(__dirname, file), "utf8");
}

// Run a .sql file and print every SELECT result as a table.
async function runAndPrint(db, file) {
    // With multiple statements, mysql2 returns one result per statement.
    // SELECTs come back as arrays of rows; USE etc. come back as plain objects.
    const [results] = await db.query(readSql(file));
    for (const result of results) {
        if (Array.isArray(result)) console.table(result);
    }
}

// schema.sql already contains every migration, so record them as applied.
// Otherwise `npm run db:migrate` would try to re-run them on a fresh database.
async function markMigrationsApplied(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
    const dir = path.join(__dirname, "migrations");
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".sql")) : [];
    for (const file of files) {
        await db.query("INSERT IGNORE INTO schema_migrations (name) VALUES (?)", [file]);
    }
}

async function main() {
    // No database selected: schema.sql creates it and switches to it itself.
    const db = await mysql.createConnection({
        ...dbConfig({ withDatabase: false }),
        multipleStatements: true
    });

    try {
        if (VERIFY_ONLY) {
            console.log(`Verifying ${process.env.DB_NAME || "buddytech"} on ${process.env.DB_HOST || "127.0.0.1"}...`);
            await runAndPrint(db, "verify.sql");
            return;
        }

        console.log(`Resetting database on ${process.env.DB_HOST || "127.0.0.1"} (all existing data will be deleted)...`);
        await db.query(readSql("schema.sql"));
        console.log("  schema.sql  done");

        await markMigrationsApplied(db);

        if (!NO_SEED) {
            await db.query(readSql("seed.sql"));
            console.log("  seed.sql    done");
        }

        console.log("Done. Run `npm run db:verify` to check the data.");
    } finally {
        await db.end();
    }
}

main().catch(err => {
    console.error("Database setup failed:", err.message);
    process.exit(1);
});
const mysql = require("mysql2/promise");