// Applies new schema changes to an EXISTING database without deleting any data.
// Usage (from BuddyTech/Backend):  npm run db:migrate
//
// - Runs every database/migrations/*.sql file, in filename order, that hasn't run yet.
// - Remembers what it ran in a `schema_migrations` table, so it's safe to run again.
// - To change the schema later: add the next file (002_..., 003_...) AND update schema.sql
//   so fresh databases from `npm run db:init` match.

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", "port.env"), quiet: true });

const mysql = require("mysql2/promise");
const dbConfig = require("../src/dbConfig");

// Errors meaning "this change is already in the database" (e.g. created by a newer schema.sql).
const ALREADY_APPLIED = new Set(["ER_DUP_FIELDNAME", "ER_TABLE_EXISTS_ERROR", "ER_DUP_KEYNAME"]);

async function main() {
    const db = await mysql.createConnection({ ...dbConfig(), multipleStatements: true });
    console.log(`Migrating ${process.env.DB_NAME} on ${process.env.DB_HOST}...`);

    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
        const [rows] = await db.query("SELECT name FROM schema_migrations");
        const done = new Set(rows.map(r => r.name));

        const dir = path.join(__dirname, "migrations");
        const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
        let applied = 0;

        for (const file of files) {
            if (done.has(file)) continue;
            const sql = fs.readFileSync(path.join(dir, file), "utf8");
            try {
                await db.query(sql);
                console.log(`  applied  ${file}`);
            } catch (err) {
                if (!ALREADY_APPLIED.has(err.code)) throw new Error(`${file}: ${err.message}`);
                console.log(`  skipped  ${file} (already in the database)`);
            }
            await db.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
            applied++;
        }
        console.log(applied ? "Done." : "Already up to date.");
    } finally {
        await db.end();
    }
}

main().catch(err => {
    console.error("Migration failed:", err.message);
    process.exit(1);
});
