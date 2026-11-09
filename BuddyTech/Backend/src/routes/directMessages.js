const express = require("express");
const pool = require("../db");
const { emitTo } = require("../realtime");

const router = express.Router();

// Every route here runs after requireAuth, so req.user.id is the logged-in user.
// Every query is restricted to messages where the logged-in user is the sender
// or the receiver, so only the two people in a conversation can ever read it.
// Not even teachers/TAs can see these. New messages require an accepted connection.

const MAX_MESSAGE_LENGTH = 2000
const MESSAGE_HISTORY_LIMIT = 200; // same as server.js

function toId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function areConnected(a, b) {
    const [rows] = await pool.query(
        `
        SELECT 1 FROM friend_requests
        WHERE status = 'accepted'
          AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        LIMIT 1
        `,
        [a, b, b, a]
    );
    return rows.length > 0;
}

// GET /api/me/direct-messages
// Your conversations with current connections (the Chat tab's Direct Messages
// section), newest first, with the last message for a preview.
router.get("/me/direct-messages", async (req, res) => {
    try {
        const me = req.user.id;
        const [rows] = await pool.query(
            `
            SELECT
                users.id,
                users.name,
                users.avatar_color,
                users.avatar_stored_name IS NOT NULL AS has_avatar,
                last_message.content AS last_message,
                last_message.created_at AS last_message_at
            FROM (
                SELECT IF(sender_id = ?, receiver_id, sender_id) AS other_id, MAX(id) AS last_id
                FROM direct_messages
                WHERE sender_id = ? OR receiver_id = ?
                GROUP BY other_id
            ) AS conversations
            JOIN direct_messages AS last_message ON last_message.id = conversations.last_id
            JOIN users ON users.id = conversations.other_id
            WHERE EXISTS (
                SELECT 1 FROM friend_requests
                WHERE friend_requests.status = 'accepted'
                  AND ((friend_requests.sender_id = ? AND friend_requests.receiver_id = users.id)
                    OR (friend_requests.sender_id = users.id AND friend_requests.receiver_id = ?))
            )
            ORDER BY last_message.id DESC
            `,
            [me, me, me, me, me]
        );
        res.json(rows);
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ error: "Failed to fetch conversations" });
    }
});

// GET /api/me/direct-messages/:userId
// The full conversation between you and one other user.
router.get("/me/direct-messages/:userId", async (req, res) => {
    try {
        const me = req.user.id;
        const otherId = toId(req.params.userId);
        if (!otherId || otherId === me) return res.status(400).json({ error: "Invalid user id" });

        // user_id = the sender, so this matches the course/group message shape
        // (the frontend's `msg.user_id === userId` check keeps working).
        const [rows] = await pool.query(
            `
            SELECT
                direct_messages.id,
                direct_messages.sender_id AS user_id,
                users.name AS user_name,
                users.avatar_color,
                users.avatar_stored_name IS NOT NULL AS has_avatar,
                direct_messages.content,
                direct_messages.created_at
            FROM direct_messages
            JOIN users ON users.id = direct_messages.sender_id
            WHERE (direct_messages.sender_id = ? AND direct_messages.receiver_id = ?)
               OR (direct_messages.sender_id = ? AND direct_messages.receiver_id = ?)
            ORDER BY direct_messages.created_at DESC, direct_messages.id DESC
            LIMIT ?
            `,
            [me, otherId, otherId, me, MESSAGE_HISTORY_LIMIT]
        );
        res.json(rows.reverse());
    } catch (error) {
        console.error("Error fetching direct messages:", error);
        res.status(500).json({ error: "Failed to fetch messages" });
    }
});

// POST /api/me/direct-messages/:userId  { content }
// The sender is always the logged-in user; you can only message your connections.
router.post("/me/direct-messages/:userId", async (req, res) => {
    try {
        const me = req.user.id;
        const otherId = toId(req.params.userId);
        const content = typeof (req.body || {}).content === "string" ? req.body.content.trim() : "";

        if (!otherId || otherId === me) return res.status(400).json({ error: "Invalid user id" });
        if (!content || content.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ error: `content is required (${MAX_MESSAGE_LENGTH} characters max)` });
        }
        if (!(await areConnected(me, otherId))) {
            return res.status(403).json({ error: "You can only message your connections" });
        }

        const [result] = await pool.query(
            "INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES (?, ?, ?)",
            [me, otherId, content]
        );
        const [rows] = await pool.query(
            `
            SELECT
                direct_messages.id,
                direct_messages.sender_id AS user_id,
                direct_messages.receiver_id,
                users.name AS user_name,
                users.avatar_color,
                users.avatar_stored_name IS NOT NULL AS has_avatar,
                direct_messages.content,
                direct_messages.created_at
            FROM direct_messages
            JOIN users ON users.id = direct_messages.sender_id
            WHERE direct_messages.id = ?
            `,
            [result.insertId]
        );

        // Both people's rooms: the receiver sees it, and the sender's other tabs do too.
        const notice = { sender_id: me, receiver_id: otherId };
        emitTo(`user:${me}`, "direct-message", notice);
        emitTo(`user:${otherId}`, "direct-message", notice);

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error("Error sending direct message:", error);
        res.status(500).json({ error: "Failed to send message" });
    }
});

module.exports = router;