const express = require("express");
const crypto = require("crypto");
const pool = require("../db");
const { spaceCreateLimiter, spaceJoinLimiter } = require("../middleware/rateLimits");

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
            return res.status(200).json({ ...course, role: existing[0].role, joined: false });
        }

        try {
            await pool.query(
                "INSERT INTO course_members (user_id, course_id, role) VALUES (?, ?, 'student')",
                [req.user.id, course.id]
            );
        } catch (error) {
            // Two requests at the same moment: the other one added them first. Same as already in.
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(200).json({ ...course, role: "student", joined: false });
            }
            throw error;
        }
        res.status(201).json({ ...course, role: "student", joined: true });
    } catch (error) {
        console.error("Error joining space:", error);
        res.status(500).json({ error: "Failed to join the space" });
    }
});

module.exports = router;
