require("dotenv").config({
    path: "./src/port.env"
});

const express = require("express");
const pool = require("./db");

console.log(pool);
console.log(typeof pool.query);

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.send("BuddyTech backend is running!");
});

app.get("/test-db", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT 1 AS result");

        res.json({
            connected: true,
            result: rows
        });
    }
    catch (error) {
        console.error("Database error:", error);

        res.status(500).json({
            connected: false,
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});