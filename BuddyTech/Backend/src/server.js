const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "..", "port.env")
});

const ASSIGNMENT_STATUSES = ["todo", "in_progress", "done"];
const STAFF_ROLES = ["teacher", "ta"];
// Course-wide assignments: STAFF_ROLES can post them, only these can edit or delete them.
const ASSIGNMENT_EDIT_ROLES = ["teacher"];

const express = require("express");
const pool = require("./db");
const requireAuth = require("./middleware/requireAuth");
const http = require("http");
const { initRealtime, emitTo } = require("./realtime");
const { verifySession, touchSession } = require("./sessions");
const { messageLimiter } = require("./middleware/rateLimits");
const loginAttempts = require("./routes/loginAttempts");

const app = express();

// Requests reach us through a proxy (the Vite dev server, Docker, or the host's
// load balancer), so the real client IP is in X-Forwarded-For. Only trust that
// header when it comes from a local/private address, so internet clients can't
// fake their IP to dodge the rate limits. Override with TRUST_PROXY if a host needs it.
app.set("trust proxy", process.env.TRUST_PROXY || "loopback, linklocal, uniquelocal");

app.use(express.json());

// Above the auth router on purpose: the waiting device polls every few seconds,
// which would use up authIpLimiter's shared budget. These routes have their own limiters.
app.use("/api/auth/login-attempts", loginAttempts.publicRouter);
app.use("/api/auth", require("./routes/auth"));

// Google sends the browser here with no login token, so this one route is public.
const googleCalendarRouter = require("./routes/googleCalendar");
app.get("/api/auth/google/callback", googleCalendarRouter.callback);

// Every /api route registered BELOW this line requires a valid login token.
app.use("/api", requireAuth);

// Chat spam limit: 15 messages per 30 seconds per user, across all three kinds of chat.
// Registered before the routers so it runs first; it calls next() while under the limit.
app.post(
    ["/api/channels/:id/messages", "/api/study-groups/:id/messages", "/api/me/direct-messages/:userId"],
    messageLimiter
);

// Authenticated AI study helpers.
app.use("/api/ai", require("./routes/ai"));

const friendsRouter = require("./routes/friends");
app.use("/api", friendsRouter);
const studyGroupsRouter = require("./routes/studyGroups");
app.use("/api", googleCalendarRouter);
app.use("/api", studyGroupsRouter);
app.use("/api", require("./routes/directMessages"));
app.use("/api", require("./routes/notifications"));
const resourcesRouter = require("./routes/resources");
app.use("/api", resourcesRouter);
app.use("/api", require("./routes/userSettings"));
app.use("/api", require("./routes/search"));
app.use("/api", require("./routes/spaces"));
app.use("/api", loginAttempts.meRouter);
app.use("/api", require("./routes/account"));

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

// Moves my read marker for a course channel up to messageId (never backwards).
// True only if it moved. UPDATE-then-INSERT, so affectedRows is exact
// (the same approach as markConversationRead in routes/directMessages.js).
async function markChannelRead(userId, channelId, messageId) {
    const [updated] = await pool.query(
        `UPDATE channel_reads SET last_read_message_id = ?
         WHERE user_id = ? AND channel_id = ? AND last_read_message_id < ?`,
        [messageId, userId, channelId, messageId]
    );
    if (updated.affectedRows > 0) return true;
    const [inserted] = await pool.query(
        "INSERT IGNORE INTO channel_reads (user_id, channel_id, last_read_message_id) VALUES (?, ?, ?)",
        [userId, channelId, messageId]
    );
    return inserted.affectedRows > 0;
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

// Added to the SELECT of the two assignment lists, for the hover cards and the Assignments page:
// how it counts (grading, extra_credit) and how many files and links it has (uses
// idx_resources_assignment). extra_credit comes back as 0 or 1 (MySQL's BOOLEAN is a TINYINT).

const ATTACHMENT_COUNTS = `
    assignments.grading,
    assignments.extra_credit,
    (SELECT COUNT(*) FROM course_resources
      WHERE course_resources.assignment_id = assignments.id AND course_resources.type = 'file') AS file_count,
    (SELECT COUNT(*) FROM course_resources
      WHERE course_resources.assignment_id = assignments.id AND course_resources.type = 'link') AS link_count`;

// ---- Assignment input checks ----
// Every field is type-checked, not just "present": mysql2 expands an object or array
// passed to a "?" into SQL (`key` = 'value' pairs, or a list), so a JSON body with
// { "title": { ... } } must never reach a query.
const MAX_ASSIGNMENT_TITLE = 255;
const MAX_DESCRIPTION = 5000;
const MAX_DETAILS = 20000;
// "2026-05-01 23:59:00" or "2026-05-01T23:59" (wall-clock time, as the frontend sends it).
const DUE_DATE_FORMAT = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
const GRADING = ["graded", "participation"]; // assignments.grading (course assignments only)

function toId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// Reads title, due_date, description, details, grading, extra_credit from a request body.
// partial = true (editing): only the fields that were sent; otherwise title and due_date
// are required. Returns { fields } with clean values, or { error }.
function readAssignmentFields(body, partial) {
    const fields = {};
    if (!partial || body.title !== undefined) {
        const title = typeof body.title === "string" ? body.title.trim() : "";
        if (!title || title.length > MAX_ASSIGNMENT_TITLE) {
            return { error: `title is required (${MAX_ASSIGNMENT_TITLE} characters max)` };
        }
        fields.title = title;
    }
    if (!partial || body.due_date !== undefined) {
        if (typeof body.due_date !== "string" || !DUE_DATE_FORMAT.test(body.due_date)) {
            return { error: "due_date is required, like 2026-05-01 23:59:00" };
        }
        fields.due_date = body.due_date;
    }
    for (const [name, max] of [["description", MAX_DESCRIPTION], ["details", MAX_DETAILS]]) {
        const value = body[name];
        if (value === undefined) continue;
        if (value !== null && typeof value !== "string") return { error: `${name} must be text` };
        const text = value === null ? "" : value.trim();
        if (text.length > max) return { error: `${name} must be ${max} characters or fewer` };
        fields[name] = text || null; // empty clears it
    }
    if (body.grading !== undefined) {
        if (body.grading !== null && !GRADING.includes(body.grading)) {
            return { error: `grading must be one of: ${GRADING.join(", ")}` };
        }
        fields.grading = body.grading;
    }
    if (body.extra_credit !== undefined) {
        if (typeof body.extra_credit !== "boolean") return { error: "extra_credit must be true or false" };
        fields.extra_credit = body.extra_credit;
    }
    return { fields };
}

// The assignment as the logged-in user sees it (with their status), or undefined.
// Callers check access first.
async function getAssignmentRow(userId, assignmentId) {
    const [rows] = await pool.query(
        `SELECT assignments.id, assignments.course_id, assignments.title,
                assignments.description, assignments.details,
                assignments.grading, assignments.extra_credit,
                DATE_FORMAT(assignments.due_date, '%Y-%m-%dT%H:%i:%s') AS due_date,
                assignments.owner_user_id,
                COALESCE(assignment_progress.status, 'todo') AS status
         FROM assignments
         LEFT JOIN assignment_progress
             ON assignment_progress.assignment_id = assignments.id
            AND assignment_progress.user_id = ?
         WHERE assignments.id = ?`,
        [userId, assignmentId]
    );
    return rows[0];
}

// Can this user edit or delete the assignment? A personal task: only its owner.
// A course-wide one: ASSIGNMENT_EDIT_ROLES of its course. `db` lets a caller run this
// inside its own transaction. Returns { assignment } or { status, error }; 404 when
// they can't see it at all, so ids can't be probed.
async function checkAssignmentManager(userId, assignmentId, db = pool, lock = "") {
    const [rows] = await db.query(
        `SELECT course_id, owner_user_id FROM assignments WHERE id = ? ${lock}`,
        [assignmentId]
    );
    const assignment = rows[0];
    const role = assignment ? await getCourseRole(userId, assignment.course_id) : null;
    const visible = role && (assignment.owner_user_id === null || assignment.owner_user_id === userId);
    if (!visible) return { status: 404, error: "Assignment not found" };
    if (assignment.owner_user_id === null && !ASSIGNMENT_EDIT_ROLES.includes(role)) {
        return { status: 403, error: "Only teachers can change or delete course assignments" };
    }
    return { assignment };
}

// GET /api/me  -> the logged-in user's profile (used to restore a session on page load)
app.get("/api/me", async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name, email, created_at, avatar_color,
                    avatar_stored_name IS NOT NULL AS has_avatar
             FROM users WHERE id = ?`,
            [req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ ...rows[0], has_avatar: Boolean(rows[0].has_avatar) });
    } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).json({ error: "Failed to fetch user profile" });
    }
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
        const [rows] = await pool.query(
            `SELECT courses.id, courses.course_code, courses.course_name, courses.professor, courses.university
             FROM courses
             JOIN course_members ON course_members.course_id = courses.id
             WHERE course_members.user_id = ?`,
            [req.user.id]
        );
        res.json(rows);
    } catch (error) {
        console.error("Error fetching courses:", error);
        res.status(500).json({ error: "Failed to fetch courses" });
    }
});

app.get("/api/courses/:id", async (req, res) => {
    try {
        if (!(await isCourseMember(req.user.id, req.params.id))) {
            return res.status(403).json({ error: "You are not in this course" });
        }
        const [rows] = await pool.query(
            `SELECT id, course_code, course_name, professor, university, join_code
             FROM courses WHERE id = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Course not found" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error fetching course:", error);
        res.status(500).json({ error: "Failed to fetch course" });
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

// GET /api/courses/:id/members
// Everyone in a course, for the Chat header's member strip. Only people in the
// course can see who else is in it. Names and roles only, never emails.
app.get("/api/courses/:id/members", async (req, res) => {
    try {
        if (!(await isCourseMember(req.user.id, req.params.id))) {
            return res.status(403).json({ error: "You are not in this course" });
        }
        const [rows] = await pool.query(
            `
            SELECT users.id, users.name, users.avatar_color, users.avatar_stored_name IS NOT NULL AS has_avatar, course_members.role
            FROM course_members
            JOIN users ON users.id = course_members.user_id
            WHERE course_members.course_id = ?
            ORDER BY FIELD(course_members.role, 'teacher', 'ta', 'student'), users.name ASC
            `,
            [req.params.id]
        );
        res.json(rows);
    } catch (error) {
        console.error("Error fetching course members:", error);
        res.status(500).json({ error: "Failed to fetch course members" });
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
                users.avatar_color,
                users.avatar_stored_name IS NOT NULL AS has_avatar,
                -- 'teacher' or 'ta' for the course's staff (the chat badges them); NULL otherwise.
                IF(course_members.role IN ('teacher', 'ta'), course_members.role, NULL) AS user_role,
                messages.content,
                messages.created_at
            FROM messages
            JOIN users ON messages.user_id = users.id
            JOIN channels ON channels.id = messages.channel_id
            LEFT JOIN course_members
                ON course_members.course_id = channels.course_id
               AND course_members.user_id = messages.user_id
            WHERE messages.channel_id = ?
            ORDER BY messages.created_at ASC
            `,
            [req.params.id]
        );

        // Opening a channel marks it read up to its newest message (the last row,
        // since they're oldest-first). Only ping the bell if the marker really moved.
        if (rows.length > 0 && (await markChannelRead(req.user.id, Number(req.params.id), rows[rows.length - 1].id))) {
            emitTo(`user:${req.user.id}`, "channel-unread-changed", {});
        }

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
        const rawContent = (req.body || {}).content;

        if (typeof rawContent !== "string" || !rawContent.trim()) {
            return res.status(400).json({
                error: "content is required"
            });
        }
        const content = rawContent.trim();
        if (content.length > 4000) {
            return res.status(400).json({
                error: "Message cannot exceed 4000 characters"
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
        emitTo(`channel:${Number(req.params.id)}`, "channel-message", { channel_id: Number(req.params.id) });

        // Also tell the course's other members, wherever they are in the app, so their bell updates.
        const [members] = await pool.query(
            `SELECT course_members.user_id FROM channels
             JOIN course_members ON course_members.course_id = channels.course_id
             WHERE channels.id = ? AND course_members.user_id <> ?`,
            [req.params.id, user_id]
        );
        members.forEach((member) => emitTo(`user:${member.user_id}`, "channel-unread-changed", {}));

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
                courses.join_code,
                course_members.role,
                course_members.color,
                (SELECT COUNT(*) FROM channels WHERE channels.course_id = courses.id) AS channel_count,
                (SELECT COUNT(*) FROM course_members AS cm WHERE cm.course_id = courses.id) AS member_count,
                (SELECT COUNT(*) FROM study_groups
                    JOIN study_group_members ON study_group_members.group_id = study_groups.id
                    WHERE study_groups.course_id = courses.id
                      AND study_group_members.user_id = ?) AS group_count
            FROM course_members
            JOIN courses
                ON course_members.course_id = courses.id
            WHERE course_members.user_id = ?
            -- Order joined. The default colours go by position in this list, so it must be stable.
            ORDER BY course_members.id
            `,
            // Two placeholders: one for group_count, one for the WHERE.
            [req.user.id, req.user.id]
        );

        res.json(rows);
    } catch (error) {
        console.error("Error fetching user courses:", error);

        res.status(500).json({
            error: "Failed to fetch user courses"
        });
    }
});

app.patch("/api/me/courses/:id/color", async (req, res) => {
    const courseId = toId(req.params.id);
    const color = req.body?.color;
    if (!courseId) return res.status(400).json({ error: "Invalid course ID" });
    if (typeof color !== "string" || color.length !== 7 || !/^#[0-9a-f]{6}$/i.test(color)) {
        return res.status(400).json({ error: "Class color must use #RRGGBB format" });
    }

    try {
        const [result] = await pool.execute(
            "UPDATE course_members SET color = ? WHERE course_id = ? AND user_id = ? AND role = 'student'",
            [color, courseId, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(403).json({ error: "Only enrolled students can set a class color" });
        }
        res.json({ color });
    } catch (error) {
        console.error("Error saving class color:", error);
        res.status(500).json({ error: "Failed to save class color" });
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
                DATE_FORMAT(assignments.due_date, '%Y-%m-%dT%H:%i:%s') AS due_date,
                assignments.owner_user_id,
                COALESCE(assignment_progress.status, 'todo') AS status,
                ${ATTACHMENT_COUNTS}
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
                DATE_FORMAT(assignments.due_date, '%Y-%m-%dT%H:%i:%s') AS due_date,
                assignments.owner_user_id,
                COALESCE(assignment_progress.status, 'todo') AS status,
                DATE_FORMAT(assignment_progress.completed_at, '%Y-%m-%dT%H:%i:%sZ') AS completed_at,
                courses.id AS course_id,
                courses.course_code,
                courses.course_name,
                ${ATTACHMENT_COUNTS}
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


// POST /api/assignments  { course_id, title, description?, details?, grading?, extra_credit?, due_date, personal? }
// grading ('graded' | 'participation', default 'graded') and extra_credit (default false)
// only apply to course assignments.
// personal defaults to true (a task only you see). Send personal: false to
// post an assignment for the whole course (teachers and TAs only).
app.post("/api/assignments", async (req, res) => {
    try {
        const body = req.body || {};
        const course_id = toId(body.course_id);
        if (!course_id) {
            return res.status(400).json({ error: "course_id is required" });
        }
        const { fields, error } = readAssignmentFields(body, false);
        if (error) return res.status(400).json({ error });
        const { title, due_date } = fields;
        const description = fields.description ?? null;
        const details = fields.details ?? null;

        const role = await getCourseRole(req.user.id, course_id);
        if (!role) {
            return res.status(403).json({ error: "You are not in this course" });
        }

        const courseWide = body.personal === false;
        if (courseWide && !STAFF_ROLES.includes(role)) {
            return res.status(403).json({
                error: "Only teachers and TAs can post assignments for the whole course"
            });
        }

        const ownerUserId = courseWide ? null : req.user.id;
        // How it counts is for course assignments; a personal task has none.
        const grading = courseWide ? fields.grading ?? "graded" : null;
        const extraCredit = courseWide ? fields.extra_credit ?? false : false;

        const [result] = await pool.query(
            `
            INSERT INTO assignments
            (course_id, title, description, details, grading, extra_credit, due_date, owner_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [course_id, title, description, details, grading, extraCredit, due_date, ownerUserId]
        );

        // Push it to Google Calendar in the background. Not awaited, so the
        // response never waits on Google.
        googleCalendarRouter.syncNewAssignment(result.insertId);

        res.status(201).json({
            id: result.insertId,
            course_id,
            title,
            description,
            details,
            grading,
            extra_credit: extraCredit ? 1 : 0,
            due_date,
            owner_user_id: ownerUserId,
            status: "todo",
            file_count: 0,
            link_count: 0
        });
    } catch (error) {
        console.error("Error creating assignment:", error);

        res.status(500).json({
            error: "Failed to create assignment"
        });
    }
});

// GET /api/assignments/:id
// One assignment with its details and attached files/links (an assignment page or
// popup). Anyone who can see it: members of its course, and only the owner for a
// personal task.
app.get("/api/assignments/:id", async (req, res) => {
    try {
        const id = toId(req.params.id);
        if (!id || !(await canAccessAssignment(req.user.id, id))) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        const assignment = await getAssignmentRow(req.user.id, id);
        res.json({ ...assignment, resources: await resourcesRouter.listAssignmentResources(id) });
    } catch (error) {
        console.error("Error fetching assignment:", error);
        res.status(500).json({ error: "Failed to fetch assignment" });
    }
});

// PATCH /api/assignments/:id  { title?, description?, details?, grading?, extra_credit?, due_date? }
// Only the fields sent are changed. Course-wide: teachers only. Personal: its owner.
app.patch("/api/assignments/:id", async (req, res) => {
    try {
        const id = toId(req.params.id);
        if (!id) return res.status(404).json({ error: "Assignment not found" });

        const { fields, error } = readAssignmentFields(req.body || {}, true);
        if (error) return res.status(400).json({ error });
        const columns = Object.keys(fields);
        if (columns.length === 0) {
            return res.status(400).json({ error: "Send at least one of: title, description, details, grading, extra_credit, due_date" });
        }

        const check = await checkAssignmentManager(req.user.id, id);
        if (check.error) return res.status(check.status).json({ error: check.error });
        // A personal task has no grading: ignore those two if sent.
        if (check.assignment.owner_user_id !== null) {
            delete fields.grading;
            delete fields.extra_credit;
            columns.splice(0, columns.length, ...Object.keys(fields));
            if (columns.length === 0) return res.json(await getAssignmentRow(req.user.id, id));
        }

        // Column names come only from readAssignmentFields' fixed list, never from the
        // request, so building the SET list is safe; the values are still placeholders.
        await pool.query(
            `UPDATE assignments SET ${columns.map(c => `${c} = ?`).join(", ")} WHERE id = ?`,
            [...columns.map(c => fields[c]), id]
        );
        res.json(await getAssignmentRow(req.user.id, id));
    } catch (error) {
        console.error("Error updating assignment:", error);
        res.status(500).json({ error: "Failed to update assignment" });
    }
});

// DELETE /api/assignments/:id
// Course-wide: teachers only. Personal: its owner. Its attached files and links go too
// (ON DELETE CASCADE, migration 025), so AI features can't find material for an
// assignment that's gone. The database removes the rows; this removes the files on disk.
app.delete("/api/assignments/:id", async (req, res) => {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: "Assignment not found" });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // FOR UPDATE holds the assignment until commit, so a file uploaded to it at the
        // same moment either lands first (and is in the list below) or fails its INSERT.
        const check = await checkAssignmentManager(req.user.id, id, conn, "FOR UPDATE");
        if (check.error) {
            await conn.rollback();
            return res.status(check.status).json({ error: check.error });
        }

        const [files] = await conn.query(
            "SELECT stored_name FROM course_resources WHERE assignment_id = ? AND stored_name IS NOT NULL",
            [id]
        );
        await conn.query("DELETE FROM assignments WHERE id = ?", [id]);
        await conn.commit();

        // Only after the commit: had the DELETE failed, the files would still be needed.
        resourcesRouter.removeUploads(files.map(f => f.stored_name));
        res.json({ id, deleted: true, files_deleted: files.length });
    } catch (error) {
        await conn.rollback().catch(() => {});
        console.error("Error deleting assignment:", error);
        res.status(500).json({ error: "Failed to delete assignment" });
    } finally {
        conn.release();
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

        // toId: MySQL would read "1abc" as 1, so only plain ids get through.
        const id = toId(req.params.id);
        if (!id || !(await canAccessAssignment(req.user.id, id))) {
            return res.status(404).json({ error: "Assignment not found" });
        }

        // Insert this user's row the first time, update it after that.
        // completed_at: set when it becomes 'done', kept if it was already done,
        // cleared if it goes back to 'todo'/'in_progress'.
        await pool.query(
            `
            INSERT INTO assignment_progress (user_id, assignment_id, status, completed_at)
            VALUES (?, ?, ?, IF(? = 'done', UTC_TIMESTAMP(), NULL))
            ON DUPLICATE KEY UPDATE
                completed_at = CASE
                    WHEN ? <> 'done' THEN NULL
                    WHEN status = 'done' THEN completed_at
                    ELSE UTC_TIMESTAMP()
                END,
                status = ?
            `,
            [req.user.id, id, status, status, status, status]
        );

        res.json({
            id,
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

// Express and Socket.IO share one HTTP server (see realtime.js).
const server = http.createServer(app);
initRealtime(server, {
    canAccessChannel,
    getGroupAccess: studyGroupsRouter.getGroupAccess,
    verifySession,
    touchSession,
    // Who sees someone's "Active now": their study partners and their study groups' members.
    getPresenceWatchers: async (userId) => {
        const [friendIds, coMemberIds] = await Promise.all([
            friendsRouter.getFriendIds(userId),
            studyGroupsRouter.getCoMemberIds(userId),
        ]);
        return [...new Set([...friendIds, ...coMemberIds])];
    },
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
