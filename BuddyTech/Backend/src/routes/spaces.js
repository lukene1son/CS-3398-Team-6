const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { spaceCreateLimiter, spaceJoinLimiter, spaceDeleteLimiter } = require("../middleware/rateLimits");
const { emitTo, closeRooms } = require("../realtime");
const resourcesRouter = require("./resources");           // .removeUploads
const googleCalendarRouter = require("./googleCalendar"); // .removeCalendarEvents

const router = express.Router();

// Create a Study Space, or join one with its code. A "space" is a row in `courses`.
// Every route here runs after requireAuth, so req.user.id is the signed-in user.

const MAX_CODE_LENGTH = 50;   // courses.course_code is VARCHAR(50)
const MAX_TEXT_LENGTH = 255;  // course_name, professor and university are VARCHAR(255)
const JOIN_CODE_LENGTH = 8;
// No 0/O, 1/I/L: codes get read out loud and typed by hand.
const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newJoinCode() {
    let code = "";
    for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
        code += JOIN_CODE_ALPHABET[crypto.randomInt(JOIN_CODE_ALPHABET.length)];
    }
    return code;
}

// What the user typed -> what's stored: "abcd-2345" and " ABCD 2345 " both become "ABCD2345".
const normalizeCode = (value) => (typeof value === "string" ? value : "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Trims and collapses spaces. Anything that isn't a string is not valid.
const cleanText = (value) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : null);

function toId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// Only a space's administrators (teacher, TA) see its join code, so students can't share it.
const ADMIN_ROLES = ["teacher", "ta"];
const forRole = (course, role) => (ADMIN_ROLES.includes(role) ? course : { ...course, join_code: null });

// POST /api/courses  { course_code, course_name, professor?, university? }
// Makes the space, adds the creator as its teacher (the "Administrator" badge: they can post
// course-wide assignments), and gives it a #general channel so there's somewhere to chat.
// -> 201 { id, course_code, course_name, professor, university, role, join_code }
router.post("/courses", spaceCreateLimiter, async (req, res) => {
    const body = req.body || {};
    const courseCode = cleanText(body.course_code);
    const courseName = cleanText(body.course_name);
    const professor = body.professor == null || body.professor === "" ? "" : cleanText(body.professor);
    const university = body.university == null || body.university === "" ? "" : cleanText(body.university);

    if (!courseCode || !courseName) {
        return res.status(400).json({ error: "A course code and a space name are required" });
    }
    if (professor === null || university === null) {
        return res.status(400).json({ error: "Professor and university must be text" });
    }
    if (courseCode.length > MAX_CODE_LENGTH) {
        return res.status(400).json({ error: `Course code can be up to ${MAX_CODE_LENGTH} characters` });
    }
    if (courseName.length > MAX_TEXT_LENGTH || professor.length > MAX_TEXT_LENGTH || university.length > MAX_TEXT_LENGTH) {
        return res.status(400).json({ error: `Names can be up to ${MAX_TEXT_LENGTH} characters` });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // A random code can collide with an existing one (the column is UNIQUE), so try a few times.
        let courseId = null;
        let joinCode = null;
        for (let attempt = 0; attempt < 5 && courseId === null; attempt++) {
            joinCode = newJoinCode();
            try {
                const [result] = await connection.query(
                    `INSERT INTO courses (course_code, course_name, professor, university, join_code)
                     VALUES (?, ?, ?, ?, ?)`,
                    [courseCode, courseName, professor || null, university || null, joinCode]
                );
                courseId = result.insertId;
            } catch (error) {
                if (error.code !== "ER_DUP_ENTRY") throw error;
            }
        }
        if (courseId === null) throw new Error("Could not make a unique join code");

        await connection.query(
            "INSERT INTO course_members (user_id, course_id, role) VALUES (?, ?, 'teacher')",
            [req.user.id, courseId]
        );
        await connection.query("INSERT INTO channels (course_id, name) VALUES (?, 'general')", [courseId]);
        await connection.commit();

        res.status(201).json({
            id: courseId,
            course_code: courseCode,
            course_name: courseName,
            professor: professor || null,
            university: university || null,
            role: "teacher",
            join_code: joinCode,
        });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        console.error("Error creating space:", error);
        res.status(500).json({ error: "Failed to create the space" });
    } finally {
        if (connection) connection.release();
    }
});

// POST /api/courses/join  { code }
// -> 201 { ...course, role, joined: true } when you were added (as a student),
//    200 { ...course, role, joined: false } when you were already in it.
// A wrong code is 404. Wrong guesses are rate-limited per user (spaceJoinLimiter).
router.post("/courses/join", spaceJoinLimiter, async (req, res) => {
    const code = normalizeCode(req.body && req.body.code);
    if (code.length < 4) {
        return res.status(400).json({ error: "Enter the space's join code" });
    }

    try {
        const [courses] = await pool.query(
            `SELECT id, course_code, course_name, professor, university, join_code
             FROM courses WHERE join_code = ?`,
            [code]
        );
        if (courses.length === 0) {
            return res.status(404).json({ error: "No space found with that code. Check it and try again." });
        }
        const course = courses[0];

        const [existing] = await pool.query(
            "SELECT role FROM course_members WHERE user_id = ? AND course_id = ?",
            [req.user.id, course.id]
        );
        if (existing.length > 0) {
            return res.status(200).json({ ...forRole(course, existing[0].role), role: existing[0].role, joined: false });
        }

        try {
            await pool.query(
                "INSERT INTO course_members (user_id, course_id, role) VALUES (?, ?, 'student')",
                [req.user.id, course.id]
            );
        } catch (error) {
            // Two requests at the same moment: the other one added them first. Same as already in.
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(200).json({ ...forRole(course, "student"), role: "student", joined: false });
            }
            throw error;
        }
        res.status(201).json({ ...forRole(course, "student"), role: "student", joined: true });
    } catch (error) {
        console.error("Error joining space:", error);
        res.status(500).json({ error: "Failed to join the space" });
    }
});

// ---------- Password check before deleting a space ----------
// The Delete Space window asks for the teacher's password. 3 wrong ones in a row lock
// DELETING SPACES (nothing else) for 48 hours. The count and the lock live in the users
// table (migration 028), so closing the window or reloading can't reset them.
// A right password gets a short-lived verify token, which DELETE /api/courses/:id requires:
// skipping the window and calling DELETE directly doesn't work.

const MAX_DELETE_TRIES = 3;
const DELETE_LOCK_HOURS = 48;
const VERIFY_MINUTES = 5;

// Its own secret, so a verify token can never pass as a login token (or the other way round).
const verifySecret = () => `${process.env.JWT_SECRET}:space-delete`;

// The caller's role in a course, or null if they're not in it.
async function roleIn(db, userId, courseId) {
    const [[row]] = await db.query(
        "SELECT role FROM course_members WHERE user_id = ? AND course_id = ?",
        [userId, courseId]
    );
    return row ? row.role : null;
}

// GET /api/me/space-delete-status
// -> { hasPassword, triesLeft, lockedUntil }   lockedUntil: ms timestamp, or null when not locked
// The Delete Space window shows the right state as soon as it opens.
router.get("/me/space-delete-status", async (req, res) => {
    try {
        const [[user]] = await pool.query(
            `SELECT password_hash IS NOT NULL AS has_password, delete_pw_failures,
                    IF(delete_locked_until > NOW(), UNIX_TIMESTAMP(delete_locked_until) * 1000, NULL) AS locked_until_ms
             FROM users WHERE id = ?`,
            [req.user.id]
        );
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({
            hasPassword: Boolean(user.has_password),
            triesLeft: Math.max(0, MAX_DELETE_TRIES - user.delete_pw_failures),
            lockedUntil: user.locked_until_ms === null ? null : Number(user.locked_until_ms),
        });
    } catch (error) {
        console.error("Error checking space delete status:", error);
        res.status(500).json({ error: "Failed to check your delete status" });
    }
});

// POST /api/courses/:id/verify-delete  { password }
// -> 200 { verifyToken }                         right password (valid VERIFY_MINUTES)
//    403 { error, triesLeft }                    wrong password, tries left
//    423 { error, lockedUntil }                  locked (now, or by this wrong try)
//    409 { error, code: "no_password" }          a Google-only account has no password
// (Never 401: the frontend treats 401 as "signed out".)
router.post("/courses/:id/verify-delete", async (req, res) => {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: "Space not found" });
    const password = req.body && req.body.password;
    if (typeof password !== "string" || !password) {
        return res.status(400).json({ error: "Enter your password" }); // doesn't use up a try
    }

    let connection;
    try {
        connection = await pool.getConnection();
        const role = await roleIn(connection, req.user.id, id);
        if (!role) return res.status(404).json({ error: "Space not found" });
        if (role !== "teacher") return res.status(403).json({ error: "Only the space's teacher can delete it" });

        // FOR UPDATE: two tries sent at once are counted one after the other, so they
        // can't both read "2 failures" and slip a 4th try past the lock.
        await connection.beginTransaction();
        const [[user]] = await connection.query(
            `SELECT password_hash, delete_pw_failures, delete_locked_until > NOW() AS locked,
                    UNIX_TIMESTAMP(delete_locked_until) * 1000 AS locked_until_ms
             FROM users WHERE id = ? FOR UPDATE`,
            [req.user.id]
        );
        if (!user.password_hash) {
            await connection.rollback();
            return res.status(409).json({ error: "Set a password to delete spaces", code: "no_password" });
        }
        if (user.locked) {
            await connection.rollback();
            return res.status(423).json({ error: "Deleting spaces is locked", lockedUntil: Number(user.locked_until_ms) });
        }

        if (await bcrypt.compare(password, user.password_hash)) {
            await connection.query(
                "UPDATE users SET delete_pw_failures = 0, delete_locked_until = NULL WHERE id = ?",
                [req.user.id]
            );
            await connection.commit();
            // Tied to this user, this space and this sign-in: useless for any other space,
            // and dead as soon as this device signs out.
            const verifyToken = jwt.sign(
                { id: req.user.id, courseId: id, sid: req.user.sessionId },
                verifySecret(),
                { algorithm: "HS256", expiresIn: `${VERIFY_MINUTES}m` }
            );
            return res.json({ verifyToken });
        }

        const failures = user.delete_pw_failures + 1;
        if (failures >= MAX_DELETE_TRIES) {
            // Lock, and start the count again for when the lock ends.
            await connection.query(
                `UPDATE users SET delete_pw_failures = 0,
                     delete_locked_until = NOW() + INTERVAL ${DELETE_LOCK_HOURS} HOUR
                 WHERE id = ?`,
                [req.user.id]
            );
            const [[lock]] = await connection.query(
                "SELECT UNIX_TIMESTAMP(delete_locked_until) * 1000 AS ms FROM users WHERE id = ?",
                [req.user.id]
            );
            await connection.commit();
            return res.status(423).json({ error: "Too many wrong passwords. Deleting spaces is locked.", lockedUntil: Number(lock.ms) });
        }
        await connection.query("UPDATE users SET delete_pw_failures = ? WHERE id = ?", [failures, req.user.id]);
        await connection.commit();
        res.status(403).json({ error: "Incorrect password", triesLeft: MAX_DELETE_TRIES - failures });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        console.error("Error checking password for space delete:", error);
        res.status(500).json({ error: "Failed to check your password" });
    } finally {
        if (connection) connection.release();
    }
});

// True if this verify token came from verify-delete for this user, space and sign-in.
function hasValidVerifyToken(token, req, courseId) {
    if (typeof token !== "string" || !token) return false;
    try {
        const payload = jwt.verify(token, verifySecret(), { algorithms: ["HS256"] });
        return payload.id === req.user.id && payload.courseId === courseId && payload.sid === req.user.sessionId;
    } catch {
        return false; // bad signature or expired
    }
}

// DELETE /api/courses/:id  { verifyToken }   (verifyToken from POST /api/courses/:id/verify-delete)
// Deletes the whole space. Only its teacher (the creator: joining always makes you a
// student) can do this; TAs can see the join code but not delete.
// The database removes every row (ON DELETE CASCADE from courses: members, channels,
// messages, assignments, study groups, resources, calendar event rows). This route
// cleans up what the database can't: files on disk, live chat rooms, open tabs, and
// the events already copied into people's Google calendars.
// -> { id, deleted: true, files_deleted }
router.delete("/courses/:id", spaceDeleteLimiter, async (req, res) => {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: "Space not found" });
    // The password must have been confirmed in the Delete Space window (verify-delete).
    if (!hasValidVerifyToken(req.body && req.body.verifyToken, req, id)) {
        return res.status(403).json({ error: "Confirm your password first", code: "verify_required" });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // FOR UPDATE holds the course row until commit, so a join or an upload at the
        // same moment either finishes first (and is cleaned up below) or fails.
        const [[course]] = await connection.query("SELECT id FROM courses WHERE id = ? FOR UPDATE", [id]);
        const [[me]] = await connection.query(
            "SELECT role FROM course_members WHERE user_id = ? AND course_id = ?",
            [req.user.id, id]
        );
        // Same answer for "doesn't exist" and "not in it", like the other routes.
        if (!course || !me) {
            await connection.rollback();
            return res.status(404).json({ error: "Space not found" });
        }
        if (me.role !== "teacher") {
            await connection.rollback();
            return res.status(403).json({ error: "Only the space's teacher can delete it" });
        }

        // Collect what the cascade can't clean up, BEFORE the rows are gone.
        const [files] = await connection.query(
            "SELECT stored_name FROM course_resources WHERE course_id = ? AND stored_name IS NOT NULL", [id]);
        const [members] = await connection.query("SELECT user_id FROM course_members WHERE course_id = ?", [id]);
        const [channels] = await connection.query("SELECT id FROM channels WHERE course_id = ?", [id]);
        const [groups] = await connection.query("SELECT id FROM study_groups WHERE course_id = ?", [id]);
        const [events] = await connection.query(
            `SELECT google_calendar_events.user_id, google_calendar_events.google_event_id
             FROM google_calendar_events
             JOIN assignments ON assignments.id = google_calendar_events.assignment_id
             WHERE assignments.course_id = ?`,
            [id]
        );

        await connection.query("DELETE FROM courses WHERE id = ?", [id]); // everything else cascades
        await connection.commit();

        // Only after the commit: had the DELETE failed, all of this would still be needed.
        resourcesRouter.removeUploads(files.map((file) => file.stored_name));
        closeRooms([...channels.map((c) => `channel:${c.id}`), ...groups.map((g) => `group:${g.id}`)]);
        // Every open tab of every member drops the space (Settings, Spaces, Planner...).
        members.forEach((member) => emitTo(`user:${member.user_id}`, "course-deleted", { courseId: id }));
        googleCalendarRouter.removeCalendarEvents(events); // not awaited: never holds up the response

        res.json({ id, deleted: true, files_deleted: files.length });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        console.error("Error deleting space:", error);
        res.status(500).json({ error: "Failed to delete the space" });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
