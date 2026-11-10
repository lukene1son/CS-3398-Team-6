const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const jwt = require("jsonwebtoken");
const { authIpLimiter, loginAccountLimiter, registerLimiter } = require("../middleware/rateLimits");
const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

// Same folder userSettings.js serves profile pictures from.
const AVATAR_DIR = path.join(__dirname, "..", "..", "uploads", "avatars");
const MAX_GOOGLE_AVATAR_BYTES = 3 * 1024 * 1024; // same cap as uploads

const router = express.Router();

// Every auth route shares a per-IP cap; login and register add their own limits below.
router.use(authIpLimiter);

function makeToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}
// POST /api/auth/register  { email, password }
router.post("/register", registerLimiter, async (req, res) => {
    const body = req.body || {};
    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!name || !email || !password) {
        return res.status(400).json({ error: "name, email, and password are required" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Please enter a valid email address" });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            [name, email, passwordHash]
        );

        const user = { id: result.insertId, name, email }; // never return the hash
        res.status(201).json({ token: makeToken(user.id), user });

    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "An account with that email already exists" });
        }
        console.error("Error registering user:", error);
        res.status(500).json({ error: "Failed to create account" });
    }
});

// POST /api/auth/login  { email, password }
router.post("/login", loginAccountLimiter, async (req, res) => {
    const body = req.body || {};
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
    }

    try {
        const [rows] = await pool.query(
            "SELECT id, name, email, password_hash FROM users WHERE email = ?",
            [email]
        );
        const user = rows[0];

        // Same message for "no such email" and "wrong password" so the form
        // can't be used to discover which emails have accounts.
        const ok = user && user.password_hash
            ? await bcrypt.compare(password, user.password_hash)
            : false;
        if (!ok) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        res.json({
            token: makeToken(user.id),
            user: { id: user.id, name: user.name, email: user.email }
        });
    } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).json({ error: "Failed to sign in" });
    }
});

// GET /api/auth/google/config -> { clientId }
// The client ID is public (it's in every page that shows the button), so the
// frontend reads it from here instead of keeping a second copy in its own .env.
router.get("/google/config", (req, res) => {
    res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
});

// Copies the user's Google profile photo into BuddyTech, but only if they don't
// already have a picture (so it never replaces one they uploaded themselves).
// Never throws: a missing photo shouldn't stop anyone from signing in.
async function copyGoogleAvatar(userId, pictureUrl) {
    let storedName = null;
    try {
        // Only fetch from Google's photo host. The URL came from a verified token,
        // but checking the host means this code can never be pointed somewhere else.
        const url = new URL(pictureUrl);
        if (url.protocol !== "https:" || !url.hostname.endsWith(".googleusercontent.com")) return;

        const [[row]] = await pool.query("SELECT avatar_stored_name FROM users WHERE id = ?", [userId]);
        if (!row || row.avatar_stored_name) return; // already has a picture

        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) return;
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > MAX_GOOGLE_AVATAR_BYTES) return;

        // Re-encode instead of saving Google's bytes as-is: we end up with a known
        // format (JPEG), a sensible size, and no transparency (which uploads reject too).
        storedName = crypto.randomUUID();
        await sharp(bytes)
            .resize(256, 256, { fit: "cover" })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 85 })
            .toFile(path.join(AVATAR_DIR, storedName));

        // "AND avatar_stored_name IS NULL" = don't overwrite a picture uploaded
        // between our SELECT and now.
        const [result] = await pool.query(
            `UPDATE users SET avatar_stored_name = ?, avatar_mime_type = 'image/jpeg'
             WHERE id = ? AND avatar_stored_name IS NULL`,
            [storedName, userId]
        );
        if (result.affectedRows === 0) fs.unlink(path.join(AVATAR_DIR, storedName), () => {});
    } catch (error) {
        if (storedName) fs.unlink(path.join(AVATAR_DIR, storedName), () => {});
        console.error("Couldn't copy Google profile picture:", error.message);
    }
}

// POST /api/auth/google  { credential }
// credential = the ID token Google's button gave the browser. We verify it with
// Google, then sign the user in (or create their account) and return OUR token.
router.post("/google", async (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(503).json({ error: "Google sign-in is not set up on this server" });
    }
    const credential = (req.body || {}).credential;
    if (typeof credential !== "string" || !credential) {
        return res.status(400).json({ error: "credential is required" });
    }

    let payload;
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID, // must be a token issued for OUR app
        });
        payload = ticket.getPayload();
    } catch {
        return res.status(401).json({ error: "Google sign-in failed. Please try again." });
    }

    const { sub, name, hd } = payload;
    const email = (payload.email || "").toLowerCase();
    // Google's docs: the address is Google's to vouch for if it's @gmail.com,
    // or if email_verified is true AND hd is set (a Google Workspace account).
    const emailTrusted = email.endsWith("@gmail.com") || (payload.email_verified === true && Boolean(hd));

    try {
        // 1. This Google account is already linked: sign in.
        let [[user]] = await pool.query("SELECT id, name, email FROM users WHERE google_sub = ?", [sub]);

        if (!user) {
            const [[existing]] = await pool.query("SELECT id, name, email FROM users WHERE email = ?", [email]);
            if (existing) {
                // 2. A password account has this email: link it only if Google vouches for the address,
                //    so nobody can take over an account with an unverified address.
                if (!emailTrusted) {
                    return res.status(409).json({ error: "An account with this email already exists. Please sign in with your password." });
                }
                await pool.query("UPDATE users SET google_sub = ? WHERE id = ?", [sub, existing.id]);
                user = existing;
            } else {
                // 3. Brand-new user: create an account with no password.
                if (!email) return res.status(400).json({ error: "Your Google account has no email address" });
                const displayName = (name || email.split("@")[0]).slice(0, 100);
                const [result] = await pool.query(
                    "INSERT INTO users (name, email, google_sub) VALUES (?, ?, ?)",
                    [displayName, email, sub]
                );
                user = { id: result.insertId, name: displayName, email };
            }
        }
        if (payload.picture) await copyGoogleAvatar(user.id, payload.picture);
        res.json({ token: makeToken(user.id), user });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "That account was just created. Please try again." });
        }
        console.error("Error with Google sign-in:", error);
        res.status(500).json({ error: "Failed to sign in with Google" });
    }
});

module.exports = router;