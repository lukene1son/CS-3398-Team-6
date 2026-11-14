const express = require("express");
const pool = require("../db");

const router = express.Router();

// Extra data for the bell. Pending friend requests and group invites come from
// their own routes (friends.js, studyGroups.js). Runs after requireAuth.

// GET /api/me/notifications
// -> { accepted_requests: [{ id, other_user_name, responded_at }],
//      unread_groups: [{ group_id, group_name, unread, channels: { general: n, ... }, latest_channel }],
//      unread_group_messages, unread_direct, unread_direct_messages,
//      unread_channels: [{ channel_id, channel_name, course_id, course_code, unread }],
//      unread_channel_messages }
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
    // member of (and still in the course), counted per group channel and then
    // combined per group below. No marker yet = nothing read.
    const [unreadRows] = await pool.query(
        `
        SELECT study_groups.id AS group_id, study_groups.name AS group_name,
               messages.channel, COUNT(*) AS unread, MAX(messages.id) AS newest_id
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
        GROUP BY study_groups.id, study_groups.name, messages.channel
        ORDER BY newest_id DESC
        `,
        [me]
    );
    // One entry per group: total unread, per-channel counts (for the sidebar dots),
    // and latest_channel, the channel with the newest unread message (opened from the bell).
    const groupsById = new Map();
    for (const row of unreadRows) { // newest first, so a group's first row is its latest channel
        if (!groupsById.has(row.group_id)) {
            groupsById.set(row.group_id, {
                group_id: row.group_id, group_name: row.group_name,
                unread: 0, channels: {}, latest_channel: row.channel
            });
        }
        const group = groupsById.get(row.group_id);
        group.unread += Number(row.unread);
        group.channels[row.channel] = Number(row.unread);
    }
    const unreadGroups = [...groupsById.values()];

    // Course channel messages from other people, newer than my read marker, in
    // courses I'm in, counted per channel. No marker yet = nothing read.
    const [unreadChannelRows] = await pool.query(
        `
        SELECT channels.id AS channel_id, channels.name AS channel_name,
               courses.id AS course_id, courses.course_code, COUNT(*) AS unread
        FROM course_members
        JOIN channels ON channels.course_id = course_members.course_id
        JOIN courses ON courses.id = channels.course_id
        JOIN messages ON messages.channel_id = channels.id
        LEFT JOIN channel_reads
          ON channel_reads.user_id = course_members.user_id
         AND channel_reads.channel_id = channels.id
        WHERE course_members.user_id = ?
          AND messages.user_id <> course_members.user_id
          AND messages.id > COALESCE(channel_reads.last_read_message_id, 0)
        GROUP BY channels.id, channels.name, courses.id, courses.course_code
        ORDER BY MAX(messages.id) DESC
        `,
        [me]
    );
    const unreadChannels = unreadChannelRows.map((row) => ({ ...row, unread: Number(row.unread) }));

    // Study Chats (DMs) sent to me that are newer than my read marker for that
    // conversation, counted per sender. Only current connections, the same as
    // the Study Chats list. No marker yet = nothing read.
    const [unreadDirectRows] = await pool.query(
        `
        SELECT users.id AS user_id, users.name AS user_name,
               users.avatar_color, users.avatar_stored_name IS NOT NULL AS has_avatar,
               COUNT(*) AS unread
        FROM direct_messages
        JOIN users ON users.id = direct_messages.sender_id
        LEFT JOIN direct_message_reads AS dm_reads
          ON dm_reads.user_id = direct_messages.receiver_id
         AND dm_reads.other_user_id = direct_messages.sender_id
        WHERE direct_messages.receiver_id = ?
          AND direct_messages.id > COALESCE(dm_reads.last_read_message_id, 0)
          AND EXISTS (
              SELECT 1 FROM friend_requests
              WHERE friend_requests.status = 'accepted'
                AND ((friend_requests.sender_id = ? AND friend_requests.receiver_id = users.id)
                  OR (friend_requests.sender_id = users.id AND friend_requests.receiver_id = ?))
          )
        GROUP BY users.id, users.name, users.avatar_color, users.avatar_stored_name
        ORDER BY MAX(direct_messages.id) DESC
        `,
        [me, me, me]
    );
    const unreadDirect = unreadDirectRows.map((row) => ({
        ...row,
        has_avatar: Boolean(row.has_avatar),
        unread: Number(row.unread)
    }));

    res.json({
        accepted_requests: accepted,
        unread_groups: unreadGroups,
        unread_group_messages: unreadGroups.reduce((sum, group) => sum + group.unread, 0),
        unread_direct: unreadDirect,
        unread_direct_messages: unreadDirect.reduce((sum, chat) => sum + chat.unread, 0),
        unread_channels: unreadChannels,
        unread_channel_messages: unreadChannels.reduce((sum, channel) => sum + channel.unread, 0)
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
        // target_id / course_id / group_channel say where to open it on click:
        //   space:  the channel's id and its course
        //   group:  the group's id, its course, and which of its channels
        //   direct: the sender (the person to open the chat with)
        const [messages] = await pool.query(
            `
            (SELECT 'space' AS kind, messages.id, LEFT(messages.content, 200) AS content, messages.created_at,
                    users.id AS author_id, users.name AS author_name, users.avatar_color AS author_avatar_color,
                    users.avatar_stored_name IS NOT NULL AS author_has_avatar,
                    CONCAT(courses.course_code, ' · ', channels.name) AS place,
                    channels.id AS target_id, courses.id AS course_id, NULL AS group_channel
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
                    study_groups.name,
                    study_groups.id, study_groups.course_id, group_messages.channel
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
                    'Direct message',
                    users.id, NULL, NULL
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