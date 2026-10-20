const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "..", "port.env")
});

const ASSIGNMENT_STATUSES = ["todo", "in_progress", "done"];
const STAFF_ROLES = ["teacher", "ta"];

const express = require("express");
const pool = require("./db");
const requireAuth = require("./middleware/requireAuth");

const app = express();

// Requests reach us through a proxy (the Vite dev server, Docker, or the host's
// load balancer), so the real client IP is in X-Forwarded-For. Only trust that
// header when it comes from a local/private address, so internet clients can't
// fake their IP to dodge the rate limits. Override with TRUST_PROXY if a host needs it.
app.set("trust proxy", process.env.TRUST_PROXY || "loopback, linklocal, uniquelocal");

app.use(express.json());

app.use("/api/auth", require("./routes/auth"));

// Every /api route registered BELOW this line requires a valid login token.
app.use("/api", requireAuth);

// ---- Membership helpers: is the logged-in user in this course? ----
async function getCourseRole(userId, courseId) {
    const [rows] = await pool.query(
        "SELECT role FROM course_members WHERE user_id = ? AND course_id = ?",
        [userId, courseId]
    );
    return rows.length > 0 ? rows[0].role : null;
}

async function isCourseMember(userId, courseId) {
    return (await getCourseRole(userId, courseId)) !== null;
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
         WHERE assignments.id = ? AND course_members.user_id = ?
           AND (assignments.owner_user_id IS NULL OR assignments.owner_user_id = ?)`,
        [assignmentId, userId, userId],
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
                courses.university,
                course_members.role
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

        // Course assignments + this user's personal tasks in the course,
        // each with THIS user's status (no progress row yet = 'todo').
        const [rows] = await pool.query(
            `
            SELECT
                assignments.id,
                assignments.course_id,
                assignments.title,
                assignments.description,
                assignments.due_date,
                assignments.owner_user_id,
                COALESCE(assignment_progress.status, 'todo') AS status
            FROM assignments
            LEFT JOIN assignment_progress
                ON assignment_progress.assignment_id = assignments.id
               AND assignment_progress.user_id = ?
            WHERE assignments.course_id = ?
              AND (assignments.owner_user_id IS NULL OR assignments.owner_user_id = ?)
            ORDER BY assignments.due_date ASC
            `,
            [req.user.id, req.params.id, req.user.id]
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
                assignments.owner_user_id,
                COALESCE(assignment_progress.status, 'todo') AS status,
                courses.id AS course_id,
                courses.course_code,
                courses.course_name
            FROM course_members
            JOIN courses
                ON course_members.course_id = courses.id
            JOIN assignments
                ON assignments.course_id = courses.id
            LEFT JOIN assignment_progress
                ON assignment_progress.assignment_id = assignments.id
               AND assignment_progress.user_id = course_members.user_id
            WHERE course_members.user_id = ?
              AND (assignments.owner_user_id IS NULL OR assignments.owner_user_id = course_members.user_id)
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


// POST /api/assignments  { course_id, title, description?, due_date, personal? }
// personal defaults to true (a task only you see). Send personal: false to
// post an assignment for the whole course (teachers and TAs only).
app.post("/api/assignments", async (req, res) => {
    try {
        const {
            course_id,
            title,
            description,
            due_date,
            personal
        } = req.body || {};

        if (!course_id || !title || !due_date) {
            return res.status(400).json({
                error: "course_id, title, and due_date are required"
            });
        }

        const role = await getCourseRole(req.user.id, course_id);
        if (!role) {
            return res.status(403).json({ error: "You are not in this course" });
        }

        const courseWide = personal === false;
        if (courseWide && !STAFF_ROLES.includes(role)) {
            return res.status(403).json({
                error: "Only teachers and TAs can post assignments for the whole course"
            });
        }

        const ownerUserId = courseWide ? null : req.user.id;

        const [result] = await pool.query(
            `
            INSERT INTO assignments
            (course_id, title, description, due_date, owner_user_id)
            VALUES (?, ?, ?, ?, ?)
            `,
            [course_id, title, description || null, due_date, ownerUserId]
        );

        res.status(201).json({
            id: result.insertId,
            course_id,
            title,
            description,
            due_date,
            owner_user_id: ownerUserId,
            status: "todo"
        });
    } catch (error) {
        console.error("Error creating assignment:", error);

        res.status(500).json({
            error: "Failed to create assignment"
        });
    }
});

// PATCH /api/assignments/:id/status  { status }
// Changes the status for the logged-in user only.
app.patch("/api/assignments/:id/status", async (req, res) => {
    try {
        const { status } = req.body || {};

        if (!ASSIGNMENT_STATUSES.includes(status)) {
            return res.status(400).json({
                error: `status must be one of: ${ASSIGNMENT_STATUSES.join(", ")}`
            });
        }

        if (!(await canAccessAssignment(req.user.id, req.params.id))) {
            return res.status(404).json({ error: "Assignment not found" });
        }

        // Insert this user's row the first time, update it after that.
        await pool.query(
            `
            INSERT INTO assignment_progress (user_id, assignment_id, status)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE status = ?
            `,
            [req.user.id, req.params.id, status, status]
        );

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