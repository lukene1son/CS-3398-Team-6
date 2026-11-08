const express = require("express");
const pool = require("../db");
const { groupInviteLimiter } = require("../middleware/rateLimits");

const router = express.Router();

// Every route here runs after requireAuth, so req.user.id is the logged-in user.
//
// Who can see a study group's chat:
//   - members of the group who are still in its course: read AND post
//   - teachers/TAs of the group's course: read AND post, without joining
// Members are always students in the group's course; teachers/TAs never join (they don't need to).
// Everyone else gets 403, including other students in the same course.

const STAFF_ROLES = ["teacher", "ta"]; // same as server.js
const GROUP_CHANNELS = ["general", "homework", "meetups"]; // same as the ENUM in schema.sql
const MAX_MESSAGE_LENGTH = 2000;
const MESSAGE_HISTORY_LIMIT = 200; // same as server.js

// Turns a route param / body value into a positive integer id, or null.
function toId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// null if the group doesn't exist; otherwise what this user is allowed to do with it.
async function getGroupAccess(userId, groupId) {
    const [rows] = await pool.query(
        `
        SELECT
            study_groups.course_id,
            course_members.role AS course_role,
            (study_group_members.user_id IS NOT NULL) AS is_member
        FROM study_groups
        LEFT JOIN course_members
            ON course_members.course_id = study_groups.course_id
           AND course_members.user_id = ?
        LEFT JOIN study_group_members
            ON study_group_members.group_id = study_groups.id
           AND study_group_members.user_id = ?
        WHERE study_groups.id = ?
        `,
        [userId, userId, groupId]
    );
    if (rows.length === 0) return null;

    const { course_id, course_role, is_member } = rows[0];
    const inCourse = course_role !== null;
    const isMember = Boolean(is_member) && inCourse; // left the course = lost access
    const isStaff = STAFF_ROLES.includes(course_role);
    return {
        courseId: course_id,
        inCourse,
        isMember,
        isStaff,
        canRead: isMember || isStaff,
        canPost: isMember || isStaff,
    };
}

// ---- Listing groups ----

// GET /api/me/study-groups/discover
// Every group in the courses you're in (the Discover list). Names and member
// counts only. Messages are NOT included, so this doesn't leak any chat.
router.get("/me/study-groups/discover", async (req, res) => {
    try {
        const me = req.user.id;
        const [rows] = await pool.query(
            `
            SELECT
                study_groups.id,
                study_groups.name,
                study_groups.meeting_time,
                study_groups.course_id,
                courses.course_code,
                COUNT(DISTINCT members.user_id) AS member_count,
                MAX(members.user_id = ?) AS is_member,
                course_members.role AS my_role,
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', users.id, 'name', users.name, 'role', member_roles.role))
                 FROM study_group_members AS group_members
                 JOIN users ON users.id = group_members.user_id
                 JOIN course_members AS member_roles
                     ON member_roles.course_id = study_groups.course_id
                    AND member_roles.user_id = group_members.user_id
                 WHERE group_members.group_id = study_groups.id) AS members
            FROM course_members
            JOIN study_groups ON study_groups.course_id = course_members.course_id
            JOIN courses ON courses.id = study_groups.course_id
            LEFT JOIN study_group_members AS members ON members.group_id = study_groups.id
            WHERE course_members.user_id = ?
            GROUP BY study_groups.id, study_groups.name, study_groups.meeting_time,
                     study_groups.course_id, courses.course_code, course_members.role
            ORDER BY courses.course_code ASC, study_groups.name ASC
            `,
            [me, me]
        );
        // members comes back from JSON_ARRAYAGG; parse it if it arrives as text. NULL (no members) becomes [].
        res.json(rows.map(row => ({
            ...row,
            is_member: Boolean(row.is_member),
            members: (typeof row.members === "string" ? JSON.parse(row.members) : row.members) || [],
        })));
    } catch (error) {
        console.error("Error fetching study groups:", error);
        res.status(500).json({ error: "Failed to fetch study groups" });
    }
});

// GET /api/me/study-groups
// Groups whose chat you can open (the Chat tab's Study Groups section):
// groups you're in, plus every group in courses where you're a teacher/TA.
// access = "member", or "staff" (a teacher/TA of the course who hasn't joined). Both can post.
router.get("/me/study-groups", async (req, res) => {
    try {
        const me = req.user.id;
        const [rows] = await pool.query(
            `
            SELECT
                study_groups.id,
                study_groups.name,
                study_groups.meeting_time,
                study_groups.course_id,
                courses.course_code,
                (members.user_id IS NOT NULL) AS is_member
            FROM course_members
            JOIN study_groups ON study_groups.course_id = course_members.course_id
            JOIN courses ON courses.id = study_groups.course_id
            LEFT JOIN study_group_members AS members
                ON members.group_id = study_groups.id
               AND members.user_id = course_members.user_id
            WHERE course_members.user_id = ?
              AND (members.user_id IS NOT NULL OR course_members.role IN ('teacher', 'ta'))
            ORDER BY courses.course_code ASC, study_groups.name ASC
            `,
            [me]
        );
        res.json(rows.map(({ is_member, ...row }) => ({
            ...row,
            access: is_member ? "member" : "staff",
            can_post: true,
        })));
    } catch (error) {
        console.error("Error fetching my study groups:", error);
        res.status(500).json({ error: "Failed to fetch your study groups" });
    }
});

// ---- Creating, joining, leaving ----

// POST /api/study-groups  { course_id, name, meeting_time? }
// Any student in the course can create a group; the creator joins it automatically.
// Teachers/TAs don't create or join groups; they can already see every group in their courses.
router.post("/study-groups", async (req, res) => {
    const me = req.user.id;
    const body = req.body || {};
    const courseId = toId(body.course_id);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const meetingTime = typeof body.meeting_time === "string" ? body.meeting_time.trim() : "";

    if (!courseId) return res.status(400).json({ error: "course_id is required" });
    if (!name || name.length > 100) {
        return res.status(400).json({ error: "name is required (100 characters max)" });
    }
    if (meetingTime.length > 100) {
        return res.status(400).json({ error: "meeting_time is 100 characters max" });
    }

    let connection;
    try {
        const [member] = await pool.query(
            "SELECT role FROM course_members WHERE user_id = ? AND course_id = ?",
            [me, courseId]
        );
        if (member.length === 0) {
            return res.status(403).json({ error: "You are not in this course" });
        }
        if (member[0].role !== "student") {
            return res.status(403).json({ error: "Only students can create study groups" });
        }

        // Group + creator membership are saved together or not at all.
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [result] = await connection.query(
            "INSERT INTO study_groups (course_id, name, meeting_time, created_by) VALUES (?, ?, ?, ?)",
            [courseId, name, meetingTime || null, me]
        );
        await connection.query(
            "INSERT INTO study_group_members (group_id, user_id) VALUES (?, ?)",
            [result.insertId, me]
        );
        await connection.commit();

        res.status(201).json({
            id: result.insertId,
            course_id: courseId,
            name,
            meeting_time: meetingTime || null,
            access: "member",
            can_post: true,
        });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        console.error("Error creating study group:", error);
        res.status(500).json({ error: "Failed to create study group" });
    } finally {
        if (connection) connection.release();
    }
});

// POST /api/me/study-groups/:id  - join a group in one of your courses.
router.post("/me/study-groups/:id", async (req, res) => {
    try {
        const groupId = toId(req.params.id);
        if (!groupId) return res.status(400).json({ error: "Invalid group id" });

        const access = await getGroupAccess(req.user.id, groupId);
        if (!access) return res.status(404).json({ error: "Study group not found" });
        if (!access.inCourse) return res.status(403).json({ error: "You are not in this course" });

        if (access.isStaff) {
            return res.status(403).json({ error: "Teachers and TAs can already see this group without joining" });
        }

        // INSERT IGNORE: joining twice is harmless.
        await pool.query(
            "INSERT IGNORE INTO study_group_members (group_id, user_id) VALUES (?, ?)",
            [groupId, req.user.id]
        );

        // Joining from Discover also settles any pending invite to this group.
        await pool.query(
            `
            UPDATE study_group_invites
            SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
            WHERE group_id = ? AND invitee_id = ? AND status = 'pending'
            `,
            [groupId, req.user.id]
        );

        res.json({ group_id: groupId, joined: true });
    } catch (error) {
        console.error("Error joining study group:", error);
        res.status(500).json({ error: "Failed to join study group" });
    }
});

// DELETE /api/me/study-groups/:id  - leave a group.
router.delete("/me/study-groups/:id", async (req, res) => {
    try {
        const groupId = toId(req.params.id);
        if (!groupId) return res.status(400).json({ error: "Invalid group id" });

        const [result] = await pool.query(
            "DELETE FROM study_group_members WHERE group_id = ? AND user_id = ?",
            [groupId, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "You are not in this study group" });
        }
        res.json({ group_id: groupId, joined: false });
    } catch (error) {
        console.error("Error leaving study group:", error);
        res.status(500).json({ error: "Failed to leave study group" });
    }
});

// GET /api/study-groups/:id/members
// The group's members, for the Chat header's member strip. Same access as the
// chat itself: members, plus teachers/TAs of the group's course.
router.get("/study-groups/:id/members", async (req, res) => {
    try {
        const groupId = toId(req.params.id);
        if (!groupId) return res.status(400).json({ error: "Invalid group id" });

        const access = await getGroupAccess(req.user.id, groupId);
        if (!access) return res.status(404).json({ error: "Study group not found" });
        if (!access.canRead) {
            return res.status(403).json({ error: "You don't have access to this study group" });
        }

        // Joining course_members leaves out anyone who has since left the course,
        // the same rule getGroupAccess uses.
        const [rows] = await pool.query(
            `
            SELECT users.id, users.name, course_members.role
            FROM study_group_members
            JOIN users ON users.id = study_group_members.user_id
            JOIN study_groups ON study_groups.id = study_group_members.group_id
            JOIN course_members
                ON course_members.course_id = study_groups.course_id
               AND course_members.user_id = study_group_members.user_id
            WHERE study_group_members.group_id = ?
            ORDER BY users.name ASC
            `,
            [groupId]
        );
        res.json(rows);
    } catch (error) {
        console.error("Error fetching study group members:", error);
        res.status(500).json({ error: "Failed to fetch group members" });
    }
});

// ---- Group chat ----

// GET /api/study-groups/:id/messages?channel=general
router.get("/study-groups/:id/messages", async (req, res) => {
    try {
        const groupId = toId(req.params.id);
        const channel = req.query.channel || "general";
        if (!groupId) return res.status(400).json({ error: "Invalid group id" });
        if (!GROUP_CHANNELS.includes(channel)) {
            return res.status(400).json({ error: `channel must be one of: ${GROUP_CHANNELS.join(", ")}` });
        }

        const access = await getGroupAccess(req.user.id, groupId);
        if (!access) return res.status(404).json({ error: "Study group not found" });
        if (!access.canRead) {
            return res.status(403).json({ error: "You don't have access to this study group" });
        }

        // Same shape as course channel messages so the Chat tab renders both the same way.
        const [rows] = await pool.query(
            `
            SELECT
                study_group_messages.id,
                study_group_messages.group_id,
                study_group_messages.channel,
                study_group_messages.user_id,
                users.name AS user_name,
                study_group_messages.content,
                study_group_messages.created_at
            FROM study_group_messages
            JOIN users ON users.id = study_group_messages.user_id
            WHERE study_group_messages.group_id = ? AND study_group_messages.channel = ?
            ORDER BY study_group_messages.created_at DESC, study_group_messages.id DESC
            LIMIT ?
            `,
            [groupId, channel, MESSAGE_HISTORY_LIMIT]
        );
        // Fetched newest-first so LIMIT keeps the latest ones; send them oldest-first.
        res.json(rows.reverse());
    } catch (error) {
        console.error("Error fetching study group messages:", error);
        res.status(500).json({ error: "Failed to fetch messages" });
    }
});
// POST /api/study-groups/:id/messages  { channel, content }
// Members and the course's teachers/TAs can post. Everyone else gets a 403.

router.post("/study-groups/:id/messages", async (req, res) => {
    try {
        const groupId = toId(req.params.id);
        const body = req.body || {};
        const channel = body.channel || "general";
        const content = typeof body.content === "string" ? body.content.trim() : "";

        if (!groupId) return res.status(400).json({ error: "Invalid group id" });
        if (!GROUP_CHANNELS.includes(channel)) {
            return res.status(400).json({ error: `channel must be one of: ${GROUP_CHANNELS.join(", ")}` });
        }
        if (!content || content.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ error: `content is required (${MAX_MESSAGE_LENGTH} characters max)` });
        }

        const access = await getGroupAccess(req.user.id, groupId);
        if (!access) return res.status(404).json({ error: "Study group not found" });
        if (!access.canPost) {
            return res.status(403).json({ error: "You don't have access to this study group" });
        }

        const [result] = await pool.query(
            "INSERT INTO study_group_messages (group_id, channel, user_id, content) VALUES (?, ?, ?, ?)",
            [groupId, channel, req.user.id, content]
        );
       const [rows] = await pool.query(
            `
            SELECT
                study_group_messages.id,
                study_group_messages.group_id,
                study_group_messages.channel,
                study_group_messages.user_id,
                users.name AS user_name,
                study_group_messages.content,
                study_group_messages.created_at
            FROM study_group_messages
            JOIN users ON users.id = study_group_messages.user_id
            WHERE study_group_messages.id = ?
            `,
            [result.insertId]
        );
       res.status(201).json(rows[0]);
    } catch (error) {
        console.error("Error sending study group message:", error);
        res.status(500).json({ error: "Failed to send message" });
    }
});

// ---- Invites ----

// POST /api/study-groups/:id/invites  { user_id }
// Members and the course's teachers/TAs can invite anyone else in the course.
// The inviter is ALWAYS req.user.id, never the request body.
router.post("/study-groups/:id/invites", groupInviteLimiter, async (req, res) => {
    try {
        const me = req.user.id;
        const groupId = toId(req.params.id);
        const inviteeId = toId((req.body || {}).user_id);

        if (!groupId) return res.status(400).json({ error: "Invalid group id" });
        if (!inviteeId) return res.status(400).json({ error: "user_id is required" });
        if (inviteeId === me) return res.status(400).json({ error: "You can't invite yourself" });

        const access = await getGroupAccess(me, groupId);
        if (!access) return res.status(404).json({ error: "Study group not found" });
        if (!access.canPost) {
            return res.status(403).json({ error: "You don't have access to this study group" });
        }

        // The group exists, so this is never null; it tells us where the invitee stands.
        const invitee = await getGroupAccess(inviteeId, groupId);
        if (!invitee.inCourse) {
            return res.status(400).json({ error: "That user isn't in this group's course" });
        }

        if (invitee.isStaff) {
            return res.status(400).json({ error: "Teachers and TAs can already see this group, so they can't be invited" });
        }

        if (invitee.isMember) {
            return res.status(409).json({ error: "They're already in this study group" });
        }

        const [existing] = await pool.query(
            "SELECT id, status FROM study_group_invites WHERE group_id = ? AND invitee_id = ?",
            [groupId, inviteeId]
        );

        if (existing.length > 0 && existing[0].status === "pending") {
            return res.status(409).json({ error: "They already have an invite to this group" });
        }

        // Declined before (or accepted, then they left): re-open that row with the new inviter.
        // (UNIQUE (group_id, invitee_id) means we can't insert a second row.)
        if (existing.length > 0) {
            await pool.query(
                `
                UPDATE study_group_invites
                SET inviter_id = ?, status = 'pending', created_at = CURRENT_TIMESTAMP, responded_at = NULL
                WHERE id = ?
                `,
                [me, existing[0].id]
            );
            return res.status(201).json({
                id: existing[0].id,
                group_id: groupId,
                inviter_id: me,
                invitee_id: inviteeId,
                status: "pending",
            });
        }

        const [result] = await pool.query(
            "INSERT INTO study_group_invites (group_id, inviter_id, invitee_id) VALUES (?, ?, ?)",
            [groupId, me, inviteeId]
        );
        res.status(201).json({
            id: result.insertId,
            group_id: groupId,
            inviter_id: me,
            invitee_id: inviteeId,
            status: "pending",
        });
    } catch (error) {
        // Two clicks at the same moment: the UNIQUE key stops the duplicate.
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "They already have an invite to this group" });
        }
        console.error("Error sending study group invite:", error);
        res.status(500).json({ error: "Failed to send invite" });
    }
});

// GET /api/me/study-group-invites?direction=incoming|outgoing
// Pending invites sent TO you (incoming, the default) or BY you (outgoing).
// Invites for people who've since left the course are hidden.
router.get("/me/study-group-invites", async (req, res) => {
    try {
        const direction = req.query.direction || "incoming";
        if (direction !== "incoming" && direction !== "outgoing") {
            return res.status(400).json({ error: "direction must be incoming or outgoing" });
        }
        // Whitelisted column name; never taken from user input directly.
        const myColumn = direction === "incoming" ? "invitee_id" : "inviter_id";

        const [rows] = await pool.query(
            `
            SELECT
                study_group_invites.id,
                study_group_invites.group_id,
                study_groups.name AS group_name,
                study_groups.meeting_time,
                courses.course_code,
                (SELECT COUNT(*) FROM study_group_members
                 WHERE study_group_members.group_id = study_groups.id) AS member_count,
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', users.id, 'name', users.name, 'role', member_roles.role))
                 FROM study_group_members AS group_members
                 JOIN users ON users.id = group_members.user_id
                 JOIN course_members AS member_roles
                     ON member_roles.course_id = study_groups.course_id
                    AND member_roles.user_id = group_members.user_id
                 WHERE group_members.group_id = study_groups.id) AS members,
                study_group_invites.inviter_id,
                inviter.name AS inviter_name,
                study_group_invites.invitee_id,
                invitee.name AS invitee_name,
                study_group_invites.created_at
            FROM study_group_invites
            JOIN study_groups ON study_groups.id = study_group_invites.group_id
            JOIN courses ON courses.id = study_groups.course_id
            JOIN users AS inviter ON inviter.id = study_group_invites.inviter_id
            JOIN users AS invitee ON invitee.id = study_group_invites.invitee_id
            JOIN course_members
                ON course_members.course_id = study_groups.course_id
               AND course_members.user_id = study_group_invites.invitee_id
            WHERE study_group_invites.${myColumn} = ?
              AND study_group_invites.status = 'pending'
            ORDER BY study_group_invites.created_at DESC
            `,
            [req.user.id]
        );
        // members comes back from JSON_ARRAYAGG; mysql2 usually parses it already,
        // but parse it if it arrives as text. NULL (no members) becomes [].
        res.json(rows.map(row => ({
            ...row,
            members: (typeof row.members === "string" ? JSON.parse(row.members) : row.members) || [],
        })));
    } catch (error) {
        console.error("Error fetching study group invites:", error);
        res.status(500).json({ error: "Failed to fetch invites" });
    }
});

// PATCH /api/me/study-group-invites/:id  { action: "accept" | "decline" }
// Only the INVITEE can respond, and only while it's pending.
// Accepting marks the invite accepted AND adds you to the group, all-or-nothing.
router.patch("/me/study-group-invites/:id", async (req, res) => {
    const inviteId = toId(req.params.id);
    const { action } = req.body || {};

    if (!inviteId) return res.status(400).json({ error: "Invalid invite id" });
    if (action !== "accept" && action !== "decline") {
        return res.status(400).json({ error: "action must be accept or decline" });
    }
    const status = action === "accept" ? "accepted" : "declined";

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // The WHERE clause is the permission check. FOR UPDATE locks the invite
        // so a cancel from the inviter can't slip in between these steps.
        const [[invite]] = await connection.query(
            `
            SELECT
                study_group_invites.id,
                study_group_invites.group_id,
                course_members.role AS course_role
            FROM study_group_invites
            JOIN study_groups ON study_groups.id = study_group_invites.group_id
            LEFT JOIN course_members
                ON course_members.course_id = study_groups.course_id
               AND course_members.user_id = study_group_invites.invitee_id
            WHERE study_group_invites.id = ?
              AND study_group_invites.invitee_id = ?
              AND study_group_invites.status = 'pending'
            FOR UPDATE
            `,
            [inviteId, req.user.id]
        );

        if (!invite) {
            await connection.rollback();
            return res.status(404).json({ error: "Invite not found" });
        }
        if (status === "accepted" && invite.course_role !== "student") {
            await connection.rollback();
            return res.status(403).json({
                error: invite.course_role
                    ? "Teachers and TAs can already see this group without joining"
                    : "You are no longer in this group's space",
            });
        }

        await connection.query(
            "UPDATE study_group_invites SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?",
            [status, inviteId]
        );
        if (status === "accepted") {
            await connection.query(
                "INSERT IGNORE INTO study_group_members (group_id, user_id) VALUES (?, ?)",
                [invite.group_id, req.user.id]
            );
        }

        await connection.commit();
        res.json({ id: inviteId, group_id: invite.group_id, status });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        console.error("Error responding to study group invite:", error);
        res.status(500).json({ error: "Failed to respond to invite" });
    } finally {
        if (connection) connection.release();
    }
});

// DELETE /api/me/study-group-invites/:id
// Cancels an invite you sent. Only the INVITER, only while pending.
router.delete("/me/study-group-invites/:id", async (req, res) => {
    try {
        const inviteId = toId(req.params.id);
        if (!inviteId) return res.status(400).json({ error: "Invalid invite id" });

        const [result] = await pool.query(
            "DELETE FROM study_group_invites WHERE id = ? AND inviter_id = ? AND status = 'pending'",
            [inviteId, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Invite not found" });
        }
        res.json({ id: inviteId, deleted: true });
    } catch (error) {
        console.error("Error cancelling study group invite:", error);
        res.status(500).json({ error: "Failed to cancel invite" });
    }
});

module.exports = router;