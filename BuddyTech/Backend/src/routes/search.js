const express = require("express");
const pool = require("../db");
const { userSearchLimiter } = require("../middleware/rateLimits");

const router = express.Router();
const PER_SOURCE = 10;

// "%" and "_" in what the user typed are matched literally (same as /users/search).
const like = (word) => `%${word.replace(/[\\%_]/g, "\\$&")}%`;

// Every word must appear somewhere in `column`: "exam prep" matches "...prep for the exam...".
// `column` is always a constant from this file, never user input.
function allWords(column, words) {
    return { sql: words.map(() => `${column} LIKE ?`).join(" AND "), params: words.map(like) };
}

// GET /api/me/search?q=sprint demo&date=2026-11-12
// -> { messages: [...], assignments: [...] }, only things the logged-in user can already see.
router.get("/me/search", userSearchLimiter, async (req, res) => {
    try {
        const me = req.user.id;
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? req.query.date : null;
        const words = q.split(/\s+/).filter((w) => w.length > 0).slice(0, 5);
        if (q.length < 2 && !date) return res.status(400).json({ error: "q must be at least 2 characters" });

        // Messages: the same three sources and access rules as /me/activity,
        // but DMs I sent are included too.
        const ch = allWords("messages.content", words);
        const gr = allWords("gm.content", words);
        const dm = allWords("dm.content", words);
        // A date alone only searches assignments (messages are matched by words),
        // and with no words the WHERE clauses below would be empty, which is invalid SQL.
        const [messages] = words.length === 0 ? [[]] : await pool.query(`
            (SELECT 'channel' AS kind, messages.id, messages.content, messages.created_at, users.name AS author_name,
                    CONCAT(courses.course_code, ' #', channels.name) AS place,
                    channels.id AS target_id, courses.id AS course_id, NULL AS channel
             FROM messages
             JOIN channels ON channels.id = messages.channel_id
             JOIN courses ON courses.id = channels.course_id
             JOIN course_members ON course_members.course_id = channels.course_id AND course_members.user_id = ?
             JOIN users ON users.id = messages.user_id
             WHERE ${ch.sql} ORDER BY messages.id DESC LIMIT ?)
            UNION ALL
            (SELECT 'group', gm.id, gm.content, gm.created_at, users.name, study_groups.name,
                    study_groups.id, NULL, gm.channel
             FROM study_group_messages AS gm
             JOIN study_groups ON study_groups.id = gm.group_id
             JOIN course_members ON course_members.course_id = study_groups.course_id AND course_members.user_id = ?
             LEFT JOIN study_group_members AS mine ON mine.group_id = gm.group_id AND mine.user_id = ?
             JOIN users ON users.id = gm.user_id
             WHERE (mine.user_id IS NOT NULL OR course_members.role IN ('teacher', 'ta')) AND ${gr.sql}
             ORDER BY gm.id DESC LIMIT ?)
            UNION ALL
            (SELECT 'dm', dm.id, dm.content, dm.created_at, sender.name, 'Study Chat',
                    IF(dm.sender_id = ?, dm.receiver_id, dm.sender_id), NULL, NULL
             FROM direct_messages AS dm
             JOIN users AS sender ON sender.id = dm.sender_id
             WHERE (dm.sender_id = ? OR dm.receiver_id = ?) AND ${dm.sql}
             ORDER BY dm.id DESC LIMIT ?)
            ORDER BY created_at DESC`,
            [me, ...ch.params, PER_SOURCE, me, me, ...gr.params, PER_SOURCE, me, me, me, ...dm.params, PER_SOURCE]);

        // Assignments: the same visibility as /me/assignments (my courses; course-wide or
        // my own tasks). Each word can match the title, description, course code or name.
        const text = allWords("CONCAT_WS(' ', a.title, a.description, c.course_code, c.course_name)", words);
        const conditions = [text.sql || "TRUE", date ? "DATE(a.due_date) = ?" : "TRUE"].join(date && words.length ? " OR " : " AND ");
        const [assignments] = await pool.query(`
            SELECT a.id, a.title, c.course_code, DATE_FORMAT(a.due_date, '%Y-%m-%dT%H:%i:%s') AS due_date,
                   COALESCE(ap.status, 'todo') AS status
            FROM course_members AS cm
            JOIN courses AS c ON c.id = cm.course_id
            JOIN assignments AS a ON a.course_id = c.id
            LEFT JOIN assignment_progress AS ap ON ap.assignment_id = a.id AND ap.user_id = cm.user_id
            WHERE cm.user_id = ? AND (a.owner_user_id IS NULL OR a.owner_user_id = cm.user_id)
              AND (${conditions})
            ORDER BY a.due_date ASC LIMIT ?`,
            [me, ...text.params, ...(date ? [date] : []), 15]);

        res.json({ messages, assignments });
    } catch (error) {
        console.error("Error searching:", error);
        res.status(500).json({ error: "Search failed" });
    }
});

module.exports = router;