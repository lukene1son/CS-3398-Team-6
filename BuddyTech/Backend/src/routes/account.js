const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { revokeSessions, cancelLoginAttempts } = require("../sessions");
const { passwordChangeLimiter } = require("../middleware/rateLimits");

// Signing out and account security. Every route runs after requireAuth, so
// req.user.id / req.user.sessionId are the logged-in user and this device's session.
const router = express.Router();

// POST /api/me/logout  -> signs out this device only.
router.post("/me/logout", async (req, res) => {
    try {
        await revokeSessions(req.user.id, { only: req.user.sessionId });
        res.status(204).end();
    } catch (error) {
        console.error("Error signing out:", error);
        res.status(500).json({ error: "Failed to sign out" });
    }
});

// POST /api/me/logout-everywhere  -> signs out every OTHER device (the "this wasn't me" button).
router.post("/me/logout-everywhere", async (req, res) => {
    try {
        // First, so a sign-in approved by mistake can't be collected afterwards.
        await cancelLoginAttempts(req.user.id);
        const signedOut = await revokeSessions(req.user.id, { exceptSessionId: req.user.sessionId });
        res.json({ signedOut });
    } catch (error) {
        console.error("Error signing out other devices:", error);
        res.status(500).json({ error: "Failed to sign out other devices" });
    }
});

// PUT /api/me/password  { currentPassword, newPassword }
// Changes the password, signs out every other device, and cancels pending sign-in approvals.
// A wrong current password answers 400, not 401: the frontend treats 401 as "signed out".
router.put("/me/password", passwordChangeLimiter, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    try {
        const [[user]] = await pool.query("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
        if (!user || !user.password_hash) {
            return res.status(400).json({ error: "This account signs in with Google, so it has no password to change." });
        }
        const ok = typeof currentPassword === "string" && (await bcrypt.compare(currentPassword, user.password_hash));
        if (!ok) return res.status(400).json({ error: "Current password is incorrect" });

        await pool.query(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            [await bcrypt.hash(newPassword, 10), req.user.id]
        );
        await cancelLoginAttempts(req.user.id);
        const signedOut = await revokeSessions(req.user.id, { exceptSessionId: req.user.sessionId });
        res.json({ signedOut });
    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({ error: "Failed to change password" });
    }
});

module.exports = router;
