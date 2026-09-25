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

app.get("/api/courses/:id/channels", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM channels WHERE course_id = ?",
            [req.params.id]
        );

        res.json(rows);
    } catch (error) {
        console.error("Error fetching channels:", error);

        res.status(500).json({
            error: "Failed to fetch channels"
        });
    }
});

app.get("/api/channels/:id/messages", async (req, res) => {
    try {
        const [rows] = await pool.query(
            `
            SELECT
                messages.id,
                messages.channel_id,
                messages.user_id,
                users.name AS user_name,
                messages.content,
                messages.created_at
            FROM messages
            JOIN users ON messages.user_id = users.id
            WHERE messages.channel_id = ?
            ORDER BY messages.created_at ASC
            `,
            [req.params.id]
        );

        res.json(rows);
    } catch (error) {
        console.error("Error fetching messages:", error);

        res.status(500).json({
            error: "Failed to fetch messages"
        });
    }
});

app.post("/api/channels/:id/messages", async (req, res) => {
    try {
        const { user_id, content } = req.body;

        if (!user_id || !content) {
            return res.status(400).json({
                error: "user_id and content are required"
            });
        }

        const [result] = await pool.query(
            `
            INSERT INTO messages (channel_id, user_id, content)
            VALUES (?, ?, ?)
            `,
            [req.params.id, user_id, content]
        );

        res.status(201).json({
            id: result.insertId,
            channel_id: Number(req.params.id),
            user_id,
            content
        });
    } catch (error) {
        console.error("Error creating message:", error);

        res.status(500).json({
            error: "Failed to create message"
        });
    }
});

app.get("/api/users/:id/courses", async (req, res) => {
    try {
        const [rows] = await pool.query(
            `
            SELECT
                courses.id,
                courses.course_code,
                courses.course_name,
                courses.professor,
                courses.university
            FROM course_members
            JOIN courses
                ON course_members.course_id = courses.id
            WHERE course_members.user_id = ?
            `,
            [req.params.id]
        );

        res.json(rows);
    } catch (error) {
        console.error("Error fetching user courses:", error);

        res.status(500).json({
            error: "Failed to fetch user courses"
        });
    }
});

app.get("/api/courses/:id/assignments", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date ASC",
            [req.params.id]
        );

        res.json(rows);
    } catch (error) {
        console.error("Error fetching assignments:", error);

        res.status(500).json({
            error: "Failed to fetch assignments"
        });
    }
});

app.get("/api/users/:id/assignments", async (req, res) => {
    try {
        const [rows] = await pool.query(
            `
            SELECT
                assignments.id,
                assignments.title,
                assignments.description,
                assignments.due_date,
                assignments.status,
                courses.id AS course_id,
                courses.course_code,
                courses.course_name
            FROM course_members
            JOIN courses
                ON course_members.course_id = courses.id
            JOIN assignments
                ON assignments.course_id = courses.id
            WHERE course_members.user_id = ?
            ORDER BY assignments.due_date ASC
            `,
            [req.params.id]
        );

        res.json(rows);
    } catch (error) {
        console.error("Error fetching user assignments:", error);

        res.status(500).json({
            error: "Failed to fetch user assignments"
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});