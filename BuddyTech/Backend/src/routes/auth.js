const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const jwt = require("jsonwebtoken");

const router = express.Router();

function makeToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}
// POST /api/auth/register  { email, password }
router.post("/register", async (req, res) => {
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
router.post("/login", async (req, res) => {
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
module.exports = router;