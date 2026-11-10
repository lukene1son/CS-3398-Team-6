const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const pool = require("../db");
const sharp = require("sharp");
const { avatarUploadLimiter } = require("../middleware/rateLimits");

const router = express.Router();

// Every route here runs after requireAuth. Writes only touch req.user.id's own row.

const MAX_NAME_LENGTH = 100;               // users.name is VARCHAR(100)
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;  // 3 MB
const AVATAR_DIR = path.join(__dirname, "..", "..", "uploads", "avatars");
// No SVG on purpose: SVGs can carry scripts.
const AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
// sharp's format name -> the Content-Type we store and send back
const REAL_AVATAR_TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#c2410c", "#15803d", "#0e7490", "#b91c1c", "#475569"];

fs.mkdirSync(AVATAR_DIR, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: AVATAR_DIR,
        filename: (req, file, cb) => cb(null, crypto.randomUUID()),
    }),
    limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
    fileFilter: (req, file, cb) => cb(null, AVATAR_TYPES.has(file.mimetype)),
});

function receiveAvatar(req, res, next) {
    upload.single("avatar")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                error: err.code === "LIMIT_FILE_SIZE"
                    ? `Image is too large (${MAX_AVATAR_BYTES / (1024 * 1024)} MB max)`
                    : "Upload failed. Send one image in the \"avatar\" field."
            });
        }
        if (err) return next(err);
        next();
    });
}

function removeAvatar(storedName) {
    if (storedName) fs.unlink(path.join(AVATAR_DIR, storedName), () => {});
}

// Can viewerId see targetId's profile picture? Yes for yourself, classmates, and friends.
async function canSeeAvatar(viewerId, targetId) {
    if (viewerId === targetId) return true;
    const [rows] = await pool.query(
        `SELECT 1 FROM course_members AS mine
         JOIN course_members AS theirs ON theirs.course_id = mine.course_id
         WHERE mine.user_id = ? AND theirs.user_id = ?
         UNION
         SELECT 1 FROM friend_requests
         WHERE status = 'accepted'
           AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
         LIMIT 1`,
        [viewerId, targetId, viewerId, targetId, targetId, viewerId]
    );
    return rows.length > 0;
}

// Sends the image file for a settings row, or 404 if there's no picture.
function sendAvatar(res, row) {
    if (!row || !row.avatar_stored_name) return res.status(404).json({ error: "No profile picture" });
    res.set({
        "Content-Type": row.avatar_mime_type,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
    });
    res.sendFile(path.join(AVATAR_DIR, row.avatar_stored_name), (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: "No profile picture" });
    });
}


async function getSettingsRow(userId) {
    const [rows] = await pool.query(
        `SELECT name, email_notifications, assignment_reminders, avatar_stored_name, avatar_mime_type, avatar_color,
                IF(name_changed_at > NOW() - INTERVAL 1 MONTH,
                   name_changed_at + INTERVAL 1 MONTH, NULL) AS name_change_available_at
         FROM users WHERE id = ?`,
        [userId]
    );
    return rows[0] || null;
}

// MySQL BOOLEAN comes back as 0/1, and stored_name never leaves the server.
function toSettings(row) {
    return {
        display_name: row.name,
        email_notifications: Boolean(row.email_notifications),
        assignment_reminders: Boolean(row.assignment_reminders),
        has_avatar: Boolean(row.avatar_stored_name),
        avatar_color: row.avatar_color,
        name_change_available_at: row.name_change_available_at,  // null = can change now
    };
}

// GET /api/me/settings loads the Settings page.
router.get("/me/settings", async (req, res) => {
    try {
        const row = await getSettingsRow(req.user.id);
        if (!row) return res.status(404).json({ error: "User not found" });
        res.json(toSettings(row));
    } catch (error) {
        console.error("Error fetching settings:", error);
        res.status(500).json({ error: "Failed to fetch settings" });
    }
});

// PUT /api/me/settings handles the Save button. The body is { display_name, email_notifications, assignment_reminders }.
router.put("/me/settings", async (req, res) => {
    try {
        const body = req.body || {};
        const name = typeof body.display_name === "string" ? body.display_name.trim() : "";
        if (!name || name.length > MAX_NAME_LENGTH) {
            return res.status(400).json({ error: `display_name is required (${MAX_NAME_LENGTH} characters max)` });
        }
        if (typeof body.email_notifications !== "boolean" || typeof body.assignment_reminders !== "boolean") {
            return res.status(400).json({ error: "email_notifications and assignment_reminders must be true or false" });
        }

        const current = await getSettingsRow(req.user.id);
        if (!current) return res.status(404).json({ error: "User not found" });

        // Compared in JS, not SQL: MySQL's default collation would treat "maya" and "Maya" as equal.
        if (name !== current.name) {
            // One UPDATE that only succeeds if the last change was over a month ago (or never),
            // so two quick saves can't both get through.
            const [result] = await pool.query(
                `UPDATE users SET name = ?, name_changed_at = NOW()
                 WHERE id = ? AND (name_changed_at IS NULL OR name_changed_at <= NOW() - INTERVAL 1 MONTH)`,
                [name, req.user.id]
            );
            if (result.affectedRows === 0) {
                return res.status(429).json({ error: "You can only change your name once a month." });
            }
        }

        await pool.query(
            "UPDATE users SET email_notifications = ?, assignment_reminders = ? WHERE id = ?",
            [body.email_notifications, body.assignment_reminders, req.user.id]
        );
        res.json(toSettings(await getSettingsRow(req.user.id)));
    } catch (error) {
        console.error("Error saving settings:", error);
        res.status(500).json({ error: "Failed to save settings" });
    }
});
// The frontend sends the whole form, so all three fields are required. Any extra fields are ignored.

// POST /api/me/avatar sets the profile picture. It takes multipart/form-data with one field, avatar.
router.post("/me/avatar", avatarUploadLimiter, receiveAvatar, async (req, res) => {
    const file = req.file;
    try {
        if (!file) return res.status(400).json({ error: "Choose a PNG, JPEG, WebP, or GIF image" });
        
        // Check the real file contents. The browser's type comes from the file extension,
        // so a GIF renamed to .jpg would otherwise skip the check.
        // animated: true checks every frame of a GIF/WebP, not just the first.
        let format, isOpaque;
        try {
            ({ format } = await sharp(file.path).metadata());
            ({ isOpaque } = await sharp(file.path, { animated: true }).stats());
        } catch {
            format = null; // not an image sharp can read
        }
        const realType = REAL_AVATAR_TYPES[format];
        if (!realType) {
            removeAvatar(file.filename);
            return res.status(400).json({ error: "Choose a PNG, JPEG, WebP, or GIF image" });
        }
        if (!isOpaque) {
            removeAvatar(file.filename);
            return res.status(400).json({ error: "Profile pictures can't have a transparent background" });
        }

        const old = await getSettingsRow(req.user.id);
        await pool.query(
            "UPDATE users SET avatar_stored_name = ?, avatar_mime_type = ? WHERE id = ?",
            [file.filename, realType, req.user.id]
        );
        removeAvatar(old && old.avatar_stored_name); // delete the previous picture
        res.json({ has_avatar: true });
    } catch (error) {
        removeAvatar(file && file.filename); // don't leave an orphan if the UPDATE failed
        console.error("Error uploading avatar:", error);
        res.status(500).json({ error: "Failed to upload profile picture" });
    }
});

// GET /api/me/avatar returns the image bytes.
router.get("/me/avatar", async (req, res) => {
    try {
        sendAvatar(res, await getSettingsRow(req.user.id));
        
    } catch (error) {
        console.error("Error fetching avatar:", error);
        res.status(500).json({ error: "Failed to fetch profile picture" });
    }
});

// GET /api/users/:id/avatar returns someone else's picture, if you share a course or are friends.
// A 404 either way, so it doesn't reveal who has a picture.
router.get("/users/:id/avatar", async (req, res) => {
    try {
        const targetId = Number(req.params.id);
        if (!Number.isInteger(targetId) || !(await canSeeAvatar(Number(req.user.id), targetId))) {
            return res.status(404).json({ error: "No profile picture" });
        }
        sendAvatar(res, await getSettingsRow(targetId));
    } catch (error) {
        console.error("Error fetching avatar:", error);
        res.status(500).json({ error: "Failed to fetch profile picture" });
    }
});

// PUT /api/me/avatar-color sets the initials background.
// Body: { color }, one of AVATAR_COLORS, or null to go back to the default.
router.put("/me/avatar-color", async (req, res) => {
    try {
        const color = req.body ? req.body.color : undefined;
        if (color !== null && !AVATAR_COLORS.includes(color)) {
            return res.status(400).json({ error: "color must be one of the preset colors, or null" });
        }
        await pool.query("UPDATE users SET avatar_color = ? WHERE id = ?", [color, req.user.id]);
        res.json({ avatar_color: color });
    } catch (error) {
        console.error("Error saving avatar color:", error);
        res.status(500).json({ error: "Failed to save avatar color" });
    }
});

// DELETE /api/me/avatar
// Removes the profile picture. With has_avatar false, the frontend shows the
// initials-over-color circle again.
router.delete("/me/avatar", async (req, res) => {
    try {
        const row = await getSettingsRow(req.user.id);
        if (!row) return res.status(404).json({ error: "User not found" });
        if (!row.avatar_stored_name) return res.json({ has_avatar: false }); // already removed

        await pool.query(
            "UPDATE users SET avatar_stored_name = NULL, avatar_mime_type = NULL WHERE id = ?",
            [req.user.id]
        );
        removeAvatar(row.avatar_stored_name);
        res.json({ has_avatar: false });
    } catch (error) {
        console.error("Error removing avatar:", error);
        res.status(500).json({ error: "Failed to remove profile picture" });
    }
});

module.exports = router;