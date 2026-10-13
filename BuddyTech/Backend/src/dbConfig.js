// Shared MySQL connection settings, read from port.env.
// Used by src/db.js (the app) and database/init.js (db:init / db:verify).

const fs = require("fs");
const path = require("path");

function sslConfig() {
    const mode = (process.env.DB_SSL || "").toUpperCase();
    if (mode === "DISABLED" || mode === "FALSE") return undefined;
    // SSL is on if DB_SSL is set OR a CA certificate is provided.
    if (!mode && !process.env.DB_SSL_CA) return undefined;

    // Cloud databases (e.g. DigitalOcean) require SSL.
    // Best: download the CA certificate from the provider and set DB_SSL_CA to its path.
    if (process.env.DB_SSL_CA) {
        const caPath = path.resolve(__dirname, "..", process.env.DB_SSL_CA);
        return { ca: fs.readFileSync(caPath), rejectUnauthorized: true };
    }

    // No CA file: the connection is still encrypted, but the server's certificate isn't verified.
    return { rejectUnauthorized: false };
}

function dbConfig({ withDatabase = true } = {}) {
    const config = {
        host: process.env.DB_HOST || "127.0.0.1",
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        ssl: sslConfig()
    };
    if (withDatabase) config.database = process.env.DB_NAME || "buddytech";
    return config;
}

module.exports = dbConfig;
