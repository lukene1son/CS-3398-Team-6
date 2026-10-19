const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "..", "port.env")
});

const express = require("express");
const pool = require("./db");
const requireAuth = require("./middleware/requireAuth");

const app = express();

app.use(express.json());

app.use("/api/auth", require("./routes/auth"));

// Every /api route registered BELOW this line requires a valid login token.
app.use("/api", requireAuth);

// ---- Membership helpers: is the logged-in user in this course? ----
async function isCourseMember(userId, courseId) {
    const [rows] = await pool.query(
        "SELECT 1 FROM course_members WHERE user_id = ? AND course_id = ?",
        [userId, courseId]
    );
    return rows.length > 0;
}

async function canAccessChannel(userId, channelId) {
    const [rows] = await pool.query(
        `SELECT 1 FROM channels
         JOIN course_members ON course_members.course_id = channels.course_id
         WHERE channels.id = ? AND course_members.user_id = ?`,
        [channelId, userId]
    );
    return rows.length > 0;
}

async function canAccessAssignment(userId, assignmentId) {
    const [rows] = await pool.query(
        `SELECT 1 FROM assignments
         JOIN course_members ON course_members.course_id = assignments.course_id
         WHERE assignments.id = ? AND course_members.user_id = ?`,
        [assignmentId, userId]
    );
    return rows.length > 0;
}

// GET /api/me  -> the logged-in user's profile (used to restore a session on page load)
app.get("/api/me", async (req, res) => {
    const [rows] = await pool.query(
        "SELECT id, name, email, created_at FROM users WHERE id = ?",
        [req.user.id]
    );
    if (rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
    }
    res.json(rows[0]);
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
        if (!(await isCourseMember(req.user.id, req.params.id))) {
        return res.status(403).json({ error: "You are not in this course" });
        }
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
        if (!(await canAccessChannel(req.user.id, req.params.id))) {
            return res.status(403).json({ error: "You are not in this course" });
        }
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
        const user_id = req.user.id; // author is whoever is logged in, never the request body
        const { content } = req.body || {};

        if (!content) {
            return res.status(400).json({
                error: "content is required"
            });
        }

        if (!(await canAccessChannel(user_id, req.params.id))) {
            return res.status(403).json({ error: "You are not in this course" });
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

app.get("/api/me/courses", async (req, res) => {
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
            [req.user.id]
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
        if (!(await isCourseMember(req.user.id, req.params.id))) {
            return res.status(403).json({ error: "You are not in this course" });
        }
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

app.get("/api/me/assignments", async (req, res) => {
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
            [req.user.id]
        );

        res.json(rows);
    } catch (error) {
        console.error("Error fetching user assignments:", error);

        res.status(500).json({
            error: "Failed to fetch user assignments"
        });
    }
});

app.post("/api/assignments", async (req, res) => {
    try {
        const {
            course_id,
            title,
            description,
            due_date
        } = req.body;

        if (!course_id || !title || !due_date) {
            return res.status(400).json({
                error: "course_id, title, and due_date are required"
            });
        }

        if (!(await isCourseMember(req.user.id, course_id))) {
            return res.status(403).json({ error: "You are not in this course" });
        }

        const [result] = await pool.query(
            `
            INSERT INTO assignments
            (course_id, title, description, due_date)
            VALUES (?, ?, ?, ?)
            `,
            [course_id, title, description || null, due_date]
        );

        res.status(201).json({
            id: result.insertId,
            course_id,
            title,
            description,
            due_date,
            status: "todo"
        });
    } catch (error) {
        console.error("Error creating assignment:", error);

        res.status(500).json({
            error: "Failed to create assignment"
        });
    }
});

app.patch("/api/assignments/:id/status", async (req, res) => {
    try {
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                error: "status is required"
            });
        }
        
        if (!(await canAccessAssignment(req.user.id, req.params.id))) {
            return res.status(404).json({ error: "Assignment not found" });
        }

        const [result] = await pool.query(
            `
            UPDATE assignments
            SET status = ?
            WHERE id = ?
            `,
            [status, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: "Assignment not found"
            });
        }

        res.json({
            id: Number(req.params.id),
            status
        });
    } catch (error) {
        console.error("Error updating assignment status:", error);

        res.status(500).json({
            error: "Failed to update assignment status"
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});