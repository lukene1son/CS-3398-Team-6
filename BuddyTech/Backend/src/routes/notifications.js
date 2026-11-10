const express = require("express");
const pool = require("../db");

const router = express.Router();

// Extra data for the bell. Pending friend requests and group invites come from
// their own routes (friends.js, studyGroups.js). Runs after requireAuth.

// GET /api/me/notifications
// -> { accepted_requests: [{ id, other_user_name, responded_at }], unread_group_messages }
router.get("/me/notifications", async (req, res) => {
    try {
        const me = req.user.id;

        // Requests I sent that were accepted and I haven't cleared yet.
        const [accepted] = await pool.query(
            `
            SELECT friend_requests.id,
                   users.id AS other_user_id,
                   users.name AS other_user_name,
                   users.avatar_color AS other_user_avatar_color,
                   users.avatar_stored_name IS NOT NULL AS other_user_has_avatar,
                   friend_requests.responded_at            FROM friend_requests
            JOIN users ON users.id = friend_requests.receiver_id
            WHERE friend_requests.sender_id = ?
              AND friend_requests.status = 'accepted'
              AND friend_requests.accept_seen = FALSE
            ORDER BY friend_requests.responded_at DESC
            `,
            [me]
        );

    
    // Other people's messages, newer than my read marker, in groups I'm a
    // member of (and still in the course), counted per group. No marker yet = nothing read.
    const [unreadRows] = await pool.query(
        `
        SELECT study_groups.id AS group_id, study_groups.name AS group_name, COUNT(*) AS unread
        FROM study_group_members AS members
        JOIN study_groups ON study_groups.id = members.group_id
        JOIN course_members
            ON course_members.course_id = study_groups.course_id
           AND course_members.user_id = members.user_id
        JOIN study_group_messages AS messages ON messages.group_id = members.group_id
        LEFT JOIN study_group_reads AS group_reads
          ON group_reads.user_id = members.user_id
          AND group_reads.group_id = messages.group_id
          AND group_reads.channel = messages.channel
        WHERE members.user_id = ?
          AND messages.user_id <> members.user_id
          AND messages.created_at >= members.joined_at
          AND messages.id > COALESCE(group_reads.last_read_message_id, 0)
        GROUP BY study_groups.id, study_groups.name
        ORDER BY MAX(messages.id) DESC
        `,
        [me]
    );
    const unreadGroups = unreadRows.map((row) => ({ ...row, unread: Number(row.unread) }));

    res.json({
        accepted_requests: accepted,
        unread_groups: unreadGroups,
        unread_group_messages: unreadGroups.reduce((sum, group) => sum + group.unread, 0)
    });

    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ error: "Failed to fetch notifications" });
    }
});

// POST /api/me/notifications/accepted/seen
// Marks every accepted request I sent as seen, so it leaves the bell.
router.post("/me/notifications/accepted/seen", async (req, res) => {
    try {
        const [result] = await pool.query(
            `
            UPDATE friend_requests
            SET accept_seen = TRUE
            WHERE sender_id = ? AND status = 'accepted' AND accept_seen = FALSE
            `,
            [req.user.id]
        );
        res.json({ cleared: result.affectedRows });
    } catch (error) {
        console.error("Error clearing accepted notifications:", error);
        res.status(500).json({ error: "Failed to clear notifications" });
    }
});

// GET /api/me/activity
// -> { messages: [...], assignments: [...] } for the dashboard's Recent Activity card.
// messages:    the newest chats from other people, from every place I can read:
//              course channels I'm in, study groups I'm in (or teach), and DMs sent to me.
// assignments: the newest course-wide assignments in my courses ("posted" ones,
//              not personal tasks). Newest = highest id, since assignments have no
//              posted-at time.
const ACTIVITY_MESSAGES = 8;
const ACTIVITY_ASSIGNMENTS = 3;

router.get("/me/activity", async (req, res) => {
    try {
        const me = req.user.id;

        // Three sources, each already limited, merged and re-sorted by time.
        // Each SELECT has the same columns in the same order, which UNION ALL needs.
        const [messages] = await pool.query(
            `
            (SELECT 'space' AS kind, messages.id, LEFT(messages.content, 200) AS content, messages.created_at,
                    users.id AS author_id, users.name AS author_name, users.avatar_color AS author_avatar_color,
                    users.avatar_stored_name IS NOT NULL AS author_has_avatar,
                    CONCAT(courses.course_code, ' · ', channels.name) AS place
             FROM messages
             JOIN channels ON channels.id = messages.channel_id
             JOIN courses ON courses.id = channels.course_id
             JOIN course_members
                 ON course_members.course_id = channels.course_id
                AND course_members.user_id = ?
             JOIN users ON users.id = messages.user_id
             WHERE messages.user_id <> ?
             ORDER BY messages.created_at DESC
             LIMIT ?)
            UNION ALL
            (SELECT 'group' AS kind, group_messages.id, LEFT(group_messages.content, 200), group_messages.created_at,
                    users.id, users.name, users.avatar_color, users.avatar_stored_name IS NOT NULL,
                    study_groups.name
             FROM study_group_messages AS group_messages
             JOIN study_groups ON study_groups.id = group_messages.group_id
             JOIN course_members
                 ON course_members.course_id = study_groups.course_id
                AND course_members.user_id = ?
             LEFT JOIN study_group_members AS my_membership
                 ON my_membership.group_id = group_messages.group_id
                AND my_membership.user_id = ?
             JOIN users ON users.id = group_messages.user_id
             WHERE group_messages.user_id <> ?
               AND (my_membership.user_id IS NOT NULL OR course_members.role IN ('teacher', 'ta'))
             ORDER BY group_messages.created_at DESC
             LIMIT ?)
            UNION ALL
            (SELECT 'direct' AS kind, direct_messages.id, LEFT(direct_messages.content, 200), direct_messages.created_at,
                    users.id, users.name, users.avatar_color, users.avatar_stored_name IS NOT NULL,
                    'Direct message'
             FROM direct_messages
             JOIN users ON users.id = direct_messages.sender_id
             WHERE direct_messages.receiver_id = ?
             ORDER BY direct_messages.created_at DESC
             LIMIT ?)
            ORDER BY created_at DESC
            LIMIT ?
            `,
            [me, me, ACTIVITY_MESSAGES, me, me, me, ACTIVITY_MESSAGES, me, ACTIVITY_MESSAGES, ACTIVITY_MESSAGES]
        );

        // Course-wide assignments only (owner_user_id IS NULL). due_date is sent as
        // plain wall-clock text, the same as the assignment routes.
        const [assignments] = await pool.query(
            `
            SELECT assignments.id, assignments.title, assignments.course_id, courses.course_code,
                   DATE_FORMAT(assignments.due_date, '%Y-%m-%dT%H:%i:%s') AS due_date
            FROM assignments
            JOIN courses ON courses.id = assignments.course_id
            JOIN course_members
                ON course_members.course_id = assignments.course_id
               AND course_members.user_id = ?
            WHERE assignments.owner_user_id IS NULL
            ORDER BY assignments.id DESC
            LIMIT ?
            `,
            [me, ACTIVITY_ASSIGNMENTS]
        );

        res.json({
            messages: messages.map((m) => ({ ...m, author_has_avatar: Boolean(m.author_has_avatar) })),
            assignments
        });
    } catch (error) {
        console.error("Error fetching activity:", error);
        res.status(500).json({ error: "Failed to fetch activity" });
    }
});

module.exports = router;