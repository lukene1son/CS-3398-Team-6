const crypto = require("crypto");
const express = require("express");
const pool = require("../db");
const { emitTo, isUserOnline } = require("../realtime");
const { sendMail, escapeHtml } = require("../mailer");
const { sha256, userAgentOf, createSession } = require("../sessions");
const { loginPollLimiter, loginPollIpLimiter, loginDecisionLimiter } = require("../middleware/rateLimits");

// Sign-ins held for approval because the account is already signed in somewhere.
//
//   1. auth.js calls finishSignIn(). No active session -> normal token.
//      Active session -> a login_attempts row, 202 { pending, attemptId, pollSecret },
//      a "login-attempt" socket event to the signed-in user, and an email.
//   2. The owner approves or denies, from the bell (meRouter) or the email link (publicRouter).
//   3. The waiting device polls publicRouter's /:id/status; once approved it gets its
//      token exactly once (status 'approved' -> 'claimed').

const ATTEMPT_MINUTES = 10;       // how long the owner has to decide
const CLAIM_MINUTES = 5;          // after approval, how long the waiting device has to collect its token
const MAX_ATTEMPTS_PER_HOUR = 5;  // per account, approved ones don't count: caps notifications and emails

function toId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// "Chrome on Windows" from a user-agent string. Approximate, for display only.
function describeDevice(userAgent) {
    const ua = userAgent || "";
    const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
        : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Unknown browser";
    const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS"
        : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown device";
    return `${browser} on ${os}`;
}

function publicUser(user) {
    return { id: user.id, name: user.name, email: user.email }; // never the password hash
}

// The last step of every password or Google sign-in (auth.js).
async function finishSignIn(req, res, user) {
    // Hold only while the account has the app open somewhere, so there's someone to approve.
    // (A closed tab or a signed-out device shouldn't lock the owner out.)
    if (!(await isUserOnline(user.id))) {
        return res.json({ token: await createSession(user.id, req), user: publicUser(user) });
    }

    // Per-account cap. Counted in the database (not by IP), so it holds across
    // addresses and survives restarts. Not perfectly race-proof, but it only needs
    // to stop floods, and one extra attempt slipping through is harmless.
    const [[{ recent }]] = await pool.query(
        `SELECT COUNT(*) AS recent FROM login_attempts
         WHERE user_id = ? AND status IN ('pending', 'denied') AND created_at > NOW() - INTERVAL 1 HOUR`,
        [user.id]
    );
    if (recent >= MAX_ATTEMPTS_PER_HOUR) {
        return res.status(429).json({ error: "Too many sign-in attempts for this account. Please try again later." });
    }

    const pollSecret = crypto.randomBytes(32).toString("base64url");
    const emailToken = crypto.randomBytes(32).toString("base64url");
    const ip = req.ip || null;
    const userAgent = userAgentOf(req);
    const [result] = await pool.query(
        `INSERT INTO login_attempts (user_id, ip, user_agent, poll_secret_hash, email_token_hash, expires_at)
         VALUES (?, ?, ?, ?, ?, NOW() + INTERVAL ${ATTEMPT_MINUTES} MINUTE)`,
        [user.id, ip, userAgent, sha256(pollSecret), sha256(emailToken)]
    );
    const attempt = { id: result.insertId, ip, device: describeDevice(userAgent), created_at: new Date().toISOString() };

    // Bell notification for every open tab of the signed-in user.
    emitTo(`user:${user.id}`, "login-attempt", attempt);

    // Email. Not awaited: the response shouldn't wait on (or reveal anything about) the mail service.
    // The token goes after "#", which browsers never send to a server, so it can't end up in logs.
    const link = `${process.env.APP_URL || ""}/login-attempt#token=${emailToken}`;
    sendMail({
        to: user.email,
        subject: "New BuddyTech sign-in needs your approval",
        text: `Someone is trying to sign in to your BuddyTech account.\n\n`
            + `IP address: ${ip || "unknown"}\nDevice: ${attempt.device}\n\n`
            + `Approve or deny it within ${ATTEMPT_MINUTES} minutes: ${link}\n\n`
            + `If this wasn't you, deny it and change your password.`,
        html: `<p>Someone is trying to sign in to your BuddyTech account.</p>`
            + `<p>IP address: <b>${escapeHtml(ip || "unknown")}</b><br>Device: <b>${escapeHtml(attempt.device)}</b></p>`
            + `<p><a href="${escapeHtml(link)}">Review this sign-in</a> (within ${ATTEMPT_MINUTES} minutes)</p>`
            + `<p>If this wasn't you, deny it and change your password.</p>`,
    }).catch((error) => console.error("Couldn't send sign-in email:", error.message));

    res.status(202).json({
        pending: true,
        attemptId: result.insertId,
        pollSecret,
        message: "This account is signed in on another device. We've asked the owner to approve this sign-in.",
    });
}

// Approve or deny one pending attempt. `where` picks it: by id + owner (bell) or by email token hash.
// One UPDATE with "status = 'pending'" in the WHERE, so two clicks can't both succeed:
// whichever runs second matches nothing (affectedRows 0).
async function decide(decision, where, params) {
    const status = decision === "approve" ? "approved" : "denied";
    const [result] = await pool.query(
        `UPDATE login_attempts
         SET status = ?, decided_at = NOW(), email_token_hash = NULL,
             expires_at = IF(? = 'approved', NOW() + INTERVAL ${CLAIM_MINUTES} MINUTE, expires_at)
         WHERE ${where} AND status = 'pending' AND expires_at > NOW()`,
        [status, status, ...params]
    );
    return result.affectedRows === 1 ? status : null;
}

// ---------- Public: before requireAuth (the waiting device and email clicker have no token) ----------
const publicRouter = express.Router();

// POST /api/auth/login-attempts/:id/status  { pollSecret }
// -> { status: "pending" | "denied" | "expired" } or { status: "approved", token, user } (once).
publicRouter.post("/:id/status", loginPollIpLimiter, loginPollLimiter, async (req, res) => {
    const id = toId(req.params.id);
    const pollSecret = (req.body || {}).pollSecret;
    if (!id || typeof pollSecret !== "string" || !pollSecret) {
        return res.status(404).json({ error: "Sign-in attempt not found" });
    }
    const secretHash = sha256(pollSecret);
    try {
        // Collect the token. Claim + session INSERT run in ONE transaction:
        //  - only one poll can flip 'approved' -> 'claimed';
        //  - if the INSERT fails, the rollback leaves the attempt 'approved' for the next poll;
        //  - a lockdown (cancelLoginAttempts + revokeSessions) running at the same moment
        //    waits on this row's lock, so it either cancels the attempt first (claim fails)
        //    or runs after the commit and revokes the new session too. Nothing slips between.
        const connection = await pool.getConnection();
        let claimed = null;
        try {
            await connection.beginTransaction();
            const [claim] = await connection.query(
                `UPDATE login_attempts SET status = 'claimed'
                 WHERE id = ? AND poll_secret_hash = ? AND status = 'approved' AND expires_at > NOW()`,
                [id, secretHash]
            );
            if (claim.affectedRows === 1) {
                const [[user]] = await connection.query(
                    `SELECT users.id, users.name, users.email
                     FROM login_attempts JOIN users ON users.id = login_attempts.user_id
                     WHERE login_attempts.id = ?`,
                    [id]
                );
                if (user) claimed = { user, token: await createSession(user.id, req, connection) };
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback().catch(() => {});
            throw error;
        } finally {
            connection.release();
        }
        if (claimed) return res.json({ status: "approved", token: claimed.token, user: publicUser(claimed.user) });

        const [[attempt]] = await pool.query(
            "SELECT status, expires_at > NOW() AS live FROM login_attempts WHERE id = ? AND poll_secret_hash = ?",
            [id, secretHash]
        );
        if (!attempt) return res.status(404).json({ error: "Sign-in attempt not found" });
        if (attempt.status === "denied") return res.json({ status: "denied" });
        if (attempt.status === "claimed" || !attempt.live) return res.json({ status: "expired" });
        res.json({ status: "pending" });
    } catch (error) {
        console.error("Error checking sign-in attempt:", error);
        res.status(500).json({ error: "Failed to check sign-in attempt" });
    }
});

// POST /api/auth/login-attempts/email/details  { token }
// What the email's confirmation page shows before the owner picks. Changes nothing,
// so a mail scanner opening the link can't approve anything.
publicRouter.post("/email/details", loginDecisionLimiter, async (req, res) => {
    const token = (req.body || {}).token;
    if (typeof token !== "string" || !token) {
        return res.status(404).json({ error: "This link is invalid or has expired." });
    }
    try {
        const [[attempt]] = await pool.query(
            `SELECT ip, user_agent, created_at FROM login_attempts
             WHERE email_token_hash = ? AND status = 'pending' AND expires_at > NOW()`,
            [sha256(token)]
        );
        if (!attempt) return res.status(404).json({ error: "This link is invalid or has expired." });
        res.json({ ip: attempt.ip, device: describeDevice(attempt.user_agent), created_at: attempt.created_at });
    } catch (error) {
        console.error("Error loading sign-in attempt:", error);
        res.status(500).json({ error: "Failed to load sign-in attempt" });
    }
});

// POST /api/auth/login-attempts/email/decide  { token, decision: "approve" | "deny" }
// Sent by the confirmation page's buttons (a POST, never a link click).
publicRouter.post("/email/decide", loginDecisionLimiter, async (req, res) => {
    const { token, decision } = req.body || {};
    if (typeof token !== "string" || !token || !["approve", "deny"].includes(decision)) {
        return res.status(400).json({ error: "token and decision (approve or deny) are required" });
    }
    try {
        const tokenHash = sha256(token);
        const [[attempt]] = await pool.query(
            "SELECT id, user_id FROM login_attempts WHERE email_token_hash = ?",
            [tokenHash]
        );
        const status = attempt ? await decide(decision, "email_token_hash = ?", [tokenHash]) : null;
        if (!status) return res.status(404).json({ error: "This link is invalid or has expired." });
        emitTo(`user:${attempt.user_id}`, "login-attempt-decided", { id: attempt.id, status });
        res.json({ status });
    } catch (error) {
        console.error("Error deciding sign-in attempt:", error);
        res.status(500).json({ error: "Failed to update sign-in attempt" });
    }
});

// ---------- Signed in: after requireAuth ----------
const meRouter = express.Router();

// GET /api/me/login-attempts -> pending attempts on my account, for the bell.
meRouter.get("/me/login-attempts", async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, ip, user_agent, created_at, expires_at FROM login_attempts
             WHERE user_id = ? AND status = 'pending' AND expires_at > NOW()
             ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json(rows.map(({ user_agent, ...row }) => ({ ...row, device: describeDevice(user_agent) })));
    } catch (error) {
        console.error("Error fetching sign-in attempts:", error);
        res.status(500).json({ error: "Failed to fetch sign-in attempts" });
    }
});

// POST /api/me/login-attempts/:id/approve  and  /deny
meRouter.post("/me/login-attempts/:id/:decision", async (req, res) => {
    const id = toId(req.params.id);
    const decision = req.params.decision;
    if (!id || !["approve", "deny"].includes(decision)) {
        return res.status(404).json({ error: "Sign-in attempt not found" });
    }
    try {
        const status = await decide(decision, "id = ? AND user_id = ?", [id, req.user.id]);
        if (!status) return res.status(404).json({ error: "This sign-in attempt was already handled or has expired." });
        emitTo(`user:${req.user.id}`, "login-attempt-decided", { id, status }); // clears it in my other tabs
        res.json({ status });
    } catch (error) {
        console.error("Error deciding sign-in attempt:", error);
        res.status(500).json({ error: "Failed to update sign-in attempt" });
    }
});

module.exports = { finishSignIn, publicRouter, meRouter };
