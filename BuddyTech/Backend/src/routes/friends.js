const express = require("express");
const pool = require("../db");
const { friendRequestLimiter, friendRequestPairLimiter, userSearchLimiter } = require("../middleware/rateLimits");
const { emitTo } = require("../realtime");

// Tell these users (every open tab) that their friends or requests changed.
function notifyFriendsChanged(...userIds) {
    userIds.forEach(id => emitTo(`user:${id}`, "friends-changed", {}));
}

const router = express.Router();

// Every route here runs after requireAuth, so req.user.id is the logged-in user.

// Turns a route param / body value into a positive integer id, or null.
function toId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// ---- Find other users ----

// GET /api/me/study-partners/suggested
// People who share at least one course with you, minus yourself and anyone
// you're already friends with or have a pending request with (either direction).
router.get("/me/study-partners/suggested", async (req, res) => {
    try {
        const me = req.user.id;
        const [rows] = await pool.query(
            `
            SELECT
                users.id,
                users.name,
                users.avatar_color,
                users.avatar_stored_name IS NOT NULL AS has_avatar,
                GROUP_CONCAT(DISTINCT courses.course_code ORDER BY courses.course_code) AS shared_courses
            FROM course_members AS mine
            JOIN course_members AS theirs
                ON theirs.course_id = mine.course_id
               AND theirs.user_id <> mine.user_id
            JOIN users ON users.id = theirs.user_id
            JOIN courses ON courses.id = mine.course_id
            WHERE mine.user_id = ?
              AND NOT EXISTS (
                  SELECT 1 FROM friend_requests
                  WHERE friend_requests.status IN ('pending', 'accepted')
                    AND ((friend_requests.sender_id = ? AND friend_requests.receiver_id = users.id)
                      OR (friend_requests.sender_id = users.id AND friend_requests.receiver_id = ?))
              )
            GROUP BY users.id, users.name, users.avatar_color, users.avatar_stored_name
            ORDER BY users.name ASC
            `,
            [me, me, me]
        );

        // "CS3398,MATH2471" -> ["CS3398", "MATH2471"]
        res.json(rows.map(row => ({
            ...row,
            shared_courses: row.shared_courses ? row.shared_courses.split(",") : []
        })));
    } catch (error) {
        console.error("Error fetching suggested partners:", error);
        res.status(500).json({ error: "Failed to fetch suggested study partners" });
    }
});

// GET /api/users/search?q=maya
// Search other users by name. Only returns id + name (never email or password).
router.get("/users/search", userSearchLimiter, async (req, res) => {
    try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (q.length < 2) {
            return res.status(400).json({ error: "q must be at least 2 characters" });
        }

        // Escape LIKE wildcards so "%" or "_" in the search are treated literally.
        const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;

        const [rows] = await pool.query(
            `
            SELECT id, name
            FROM users
            WHERE name LIKE ? AND id <> ?
            ORDER BY name ASC
            LIMIT 20
            `,
            [pattern, req.user.id]
        );

        res.json(rows);
    } catch (error) {
        console.error("Error searching users:", error);
        res.status(500).json({ error: "Failed to search users" });
    }
});

// ---- Friend requests ----

// POST /api/me/friend-requests  { receiver_id }
// Sends a friend request from the logged-in user. The sender is ALWAYS
// req.user.id, never the request body.
router.post("/me/friend-requests", friendRequestPairLimiter, friendRequestLimiter, async (req, res) => {
    try {
        const me = req.user.id;
        const receiverId = toId((req.body || {}).receiver_id);

        if (!receiverId) {
            return res.status(400).json({ error: "receiver_id is required" });
        }
        if (receiverId === me) {
            return res.status(400).json({ error: "You can't send a friend request to yourself" });
        }

        const [users] = await pool.query("SELECT id FROM users WHERE id = ?", [receiverId]);
        if (users.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        // Any existing request between these two users, in either direction.
        const [existing] = await pool.query(
            `
            SELECT id, sender_id, status
            FROM friend_requests
            WHERE (sender_id = ? AND receiver_id = ?)
               OR (sender_id = ? AND receiver_id = ?)
            `,
            [me, receiverId, receiverId, me]
        );

        if (existing.some(r => r.status === "accepted")) {
            return res.status(409).json({ error: "You are already friends" });
        }

        const mine = existing.find(r => r.sender_id === me);
        const theirs = existing.find(r => r.sender_id === receiverId);

        if (mine && mine.status === "pending") {
            return res.status(409).json({ error: "Friend request already sent" });
        }

        // They already asked you: treat this as accepting their request.
        if (theirs && theirs.status === "pending") {
            const [result] = await pool.query(
                `
                UPDATE friend_requests
                SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'pending'
                `,
                [theirs.id]
            );
            if (result.affectedRows === 1) {
                notifyFriendsChanged(me, receiverId);
                return res.json({
                    id: theirs.id,
                    sender_id: receiverId,
                    receiver_id: me,
                    status: "accepted"
                });
            }
            // They cancelled it in the meantime; fall through and send a new one.
        }

        // You sent one before and it was declined: re-open that row.
        // (UNIQUE (sender_id, receiver_id) means we can't insert a second row.)
        if (mine && mine.status === "declined") {
            await pool.query(
                `
                UPDATE friend_requests
                SET status = 'pending', created_at = CURRENT_TIMESTAMP, responded_at = NULL
                WHERE id = ?
                `,
                [mine.id]
            );
            notifyFriendsChanged(me, receiverId);
            return res.status(201).json({
                id: mine.id,
                sender_id: me,
                receiver_id: receiverId,
                status: "pending"
            });
        }

        const [result] = await pool.query(
            "INSERT INTO friend_requests (sender_id, receiver_id) VALUES (?, ?)",
            [me, receiverId]
        );
        notifyFriendsChanged(me, receiverId);
        res.status(201).json({
            id: result.insertId,
            sender_id: me,
            receiver_id: receiverId,
            status: "pending"
        });
    } catch (error) {
        // Two clicks at the same moment: the UNIQUE key stops the duplicate.
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "Friend request already sent" });
        }
        console.error("Error sending friend request:", error);
        res.status(500).json({ error: "Failed to send friend request" });
    }
});

// GET /api/me/friend-requests?direction=incoming|outgoing
// Pending requests sent TO you (incoming, the default) or BY you (outgoing),
// with the other person's name.
router.get("/me/friend-requests", async (req, res) => {
    try {
        const direction = req.query.direction || "incoming";
        if (direction !== "incoming" && direction !== "outgoing") {
            return res.status(400).json({ error: "direction must be incoming or outgoing" });
        }

        // incoming: I'm the receiver, show the sender. outgoing: the reverse.
        const myColumn = direction === "incoming" ? "receiver_id" : "sender_id";
        const otherColumn = direction === "incoming" ? "sender_id" : "receiver_id";

        const [rows] = await pool.query(
            `
            SELECT
                friend_requests.id,
                friend_requests.sender_id,
                friend_requests.receiver_id,
                friend_requests.status,
                friend_requests.created_at,
                users.id AS other_user_id,
                users.name AS other_user_name,
                users.avatar_color AS other_user_avatar_color,
                users.avatar_stored_name IS NOT NULL AS other_user_has_avatar
            FROM friend_requests
            JOIN users ON users.id = friend_requests.${otherColumn}
            WHERE friend_requests.${myColumn} = ?
              AND friend_requests.status = 'pending'
            ORDER BY friend_requests.created_at DESC
            `,
            [req.user.id]
        );

        res.json(rows);
    } catch (error) {
        console.error("Error fetching friend requests:", error);
        res.status(500).json({ error: "Failed to fetch friend requests" });
    }
});

// PATCH /api/me/friend-requests/:id  { action: "accept" | "decline" }
// Only the RECEIVER can respond, and only while the request is still pending.
router.patch("/me/friend-requests/:id", async (req, res) => {
    const requestId = toId(req.params.id);
    const { action } = req.body || {};

    if (!requestId) {
        return res.status(400).json({ error: "Invalid request id" });
    }
    if (action !== "accept" && action !== "decline") {
        return res.status(400).json({ error: "action must be accept or decline" });
    }

    const status = action === "accept" ? "accepted" : "declined";
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // The WHERE clause is the permission check: it only matches a pending
        // request addressed to the logged-in user. FOR UPDATE locks the row
        // so a cancel from the sender can't slip in between these steps.
        const [[request]] = await connection.query(
            `
            SELECT id, sender_id
            FROM friend_requests
            WHERE id = ? AND receiver_id = ? AND status = 'pending'
            FOR UPDATE
            `,
            [requestId, req.user.id]
        );

        if (!request) {
            await connection.rollback();
            return res.status(404).json({ error: "Friend request not found" });
        }

        await connection.query(
            `
            UPDATE friend_requests
            SET status = ?, responded_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [status, requestId]
        );

        // If I'd also sent them a request, it's no longer needed once we're friends.
        if (status === "accepted") {
            await connection.query(
                `
                DELETE FROM friend_requests
                WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
                `,
                [req.user.id, request.sender_id]
            );
        }

        await connection.commit();
        notifyFriendsChanged(req.user.id, request.sender_id);
        res.json({ id: requestId, status });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
        }
        console.error("Error responding to friend request:", error);
        res.status(500).json({ error: "Failed to respond to friend request" });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// DELETE /api/me/friend-requests/:id
// Cancels a request you sent. Only the SENDER, only while pending.
router.delete("/me/friend-requests/:id", async (req, res) => {
    try {
        const requestId = toId(req.params.id);
        if (!requestId) {
            return res.status(400).json({ error: "Invalid request id" });
        }

        const [[request]] = await pool.query(
            "SELECT receiver_id FROM friend_requests WHERE id = ? AND sender_id = ? AND status = 'pending'",
            [requestId, req.user.id]
        );

        const [result] = await pool.query(
            `
            DELETE FROM friend_requests
            WHERE id = ? AND sender_id = ? AND status = 'pending'
            `,
            [requestId, req.user.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Friend request not found" });
        }
        if (request) notifyFriendsChanged(req.user.id, request.receiver_id);
        res.json({ id: requestId, deleted: true });
    } catch (error) {
        console.error("Error cancelling friend request:", error);
        res.status(500).json({ error: "Failed to cancel friend request" });
    }
});

// ---- Friends ----

// GET /api/me/friends
// Everyone you have an accepted request with, whichever of you sent it.
router.get("/me/friends", async (req, res) => {
    try {
        const me = req.user.id;
        const [rows] = await pool.query(
            `
            SELECT
                users.id,
                users.name,
                users.avatar_color,
                users.avatar_stored_name IS NOT NULL AS has_avatar,
                MIN(friend_requests.responded_at) AS friends_since
            FROM friend_requests
            JOIN users
                ON users.id = IF(friend_requests.sender_id = ?, friend_requests.receiver_id, friend_requests.sender_id)
            WHERE friend_requests.status = 'accepted'
              AND (friend_requests.sender_id = ? OR friend_requests.receiver_id = ?)
            GROUP BY users.id, users.name, users.avatar_color, users.avatar_stored_name
            ORDER BY users.name ASC
            `,
            [me, me, me]
        );

        res.json(rows);
    } catch (error) {
        console.error("Error fetching friends:", error);
        res.status(500).json({ error: "Failed to fetch friends" });
    }
});

router.delete("/me/friends/:userId", async (req, res) => {
    try {
        const me = req.user.id;
        const otherId = toId(req.params.userId);

        if (!otherId) {
            return res.status(400).json({ error: "Invalid user id" });
        }
        const [[request]] = await pool.query(
            "SELECT receiver_id FROM friend_requests WHERE id = ? AND sender_id = ? AND status = 'pending'",
            [requestId, req.user.id]
        );
        // Only matches rows that involve the logged-in user, so you can only
        // remove your own friendships.
        const [result] = await pool.query(
            `
            DELETE FROM friend_requests
            WHERE status = 'accepted'
              AND ((sender_id = ? AND receiver_id = ?)
                OR (sender_id = ? AND receiver_id = ?))
            `,
            [me, otherId, otherId, me]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "You are not friends with this user" });
        }
        notifyFriendsChanged(me, otherId);
        res.json({ user_id: otherId, removed: true });
    } catch (error) {
        console.error("Error removing friend:", error);
        res.status(500).json({ error: "Failed to remove friend" });
    }
});

module.exports = router;