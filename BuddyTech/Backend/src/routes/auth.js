const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const router = express.Router();

// POST /api/auth/register  { name, email, password }
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
        res.status(201).json({ id: result.insertId, name, email }); // never return the hash
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "An account with that email already exists" });
        }
        console.error("Error registering user:", error);
        res.status(500).json({ error: "Failed to create account" });
    }
});

module.exports = router;