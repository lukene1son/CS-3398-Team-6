require("dotenv").config({
    path: "./src/port.env"
});

const express = require("express");
const pool = require("./db");

// console.log(pool);
// console.log(typeof pool.query);

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

app.get("/api/courses", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM courses");
        res.json(rows);
    } catch (error) {
        console.error("Error fetching courses:", error);

        res.status(500).json({
            error: "Failed to fetch courses"
        });
    }
});

app.get("/api/courses/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM courses WHERE id = ?",
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Course not found"
            });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error fetching course:", error);

        res.status(500).json({
            error: "Failed to fetch course"
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});