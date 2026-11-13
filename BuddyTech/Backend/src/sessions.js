const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("./db");

// Server-side sessions behind the login tokens (see migration 021).
// A token is only accepted while its session row exists, isn't revoked, and hasn't expired.

const SESSION_DAYS = 7;
// "Already signed in" = a live session that made a request in the last 30 minutes.
// Without this, anyone who closed the tab without signing out would block their own
// sign-ins on other devices for up to 7 days.
const ACTIVE_MINUTES = 30;

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function userAgentOf(req) {
    return String(req.get("user-agent") || "").slice(0, 255) || null;
}

// Creates a session and returns a login token for it.
// `db` lets a caller run the INSERT inside its own transaction (loginAttempts.js).
async function createSession(userId, req, db = pool) {
    const sessionId = crypto.randomUUID();
    await db.query(
        `INSERT INTO user_sessions (id, user_id, ip, user_agent, expires_at)
         VALUES (?, ?, ?, ?, NOW() + INTERVAL ${SESSION_DAYS} DAY)`,
        [sessionId, userId, req.ip || null, userAgentOf(req)]
    );
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        algorithm: "HS256",
        expiresIn: `${SESSION_DAYS}d`,
        jwtid: sessionId,
    });
}

// token -> { userId, sessionId, expiresAt } or null if it isn't a live session.
// A bad/expired token returns null; a database error throws (the caller answers 503,
// so a database hiccup doesn't sign everyone out).
async function verifySession(token) {
    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch {
        return null;
    }
    if (typeof payload.jti !== "string" || !Number.isInteger(payload.id)) return null; // pre-session token

    const [[row]] = await pool.query(
        `SELECT user_id, last_seen_at < NOW() - INTERVAL 1 MINUTE AS stale
         FROM user_sessions
         WHERE id = ? AND revoked_at IS NULL AND expires_at > NOW()`,
        [payload.jti]
    );
    if (!row || row.user_id !== payload.id) return null;

    // Record activity at most once a minute, not on every request. Not awaited:
    // a failed timestamp update shouldn't fail the request.
    if (row.stale) {
        pool.query("UPDATE user_sessions SET last_seen_at = NOW() WHERE id = ?", [payload.jti])
            .catch((error) => console.error("Couldn't update session activity:", error.message));
    }
    return { userId: row.user_id, sessionId: payload.jti, expiresAt: payload.exp * 1000 };
}

async function hasActiveSession(userId) {
    const [rows] = await pool.query(
        `SELECT 1 FROM user_sessions
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()
           AND last_seen_at > NOW() - INTERVAL ${ACTIVE_MINUTES} MINUTE
         LIMIT 1`,
        [userId]
    );
    return rows.length > 0;
}

// Marks a session as in use right now. Called by realtime.js for open sockets, so an
// idle tab with the app open still counts as "signed in" (REST requests alone don't
// happen while someone just has the page open).
async function touchSession(sessionId) {
    await pool.query("UPDATE user_sessions SET last_seen_at = NOW() WHERE id = ? AND revoked_at IS NULL", [sessionId]);
}

// Denies every sign-in still waiting for approval or approved but not yet collected.
// Must run whenever we lock an account down, or an approved-but-unclaimed attempt
// would still hand out a fresh session afterwards.
async function cancelLoginAttempts(userId) {
    await pool.query(
        `UPDATE login_attempts SET status = 'denied', decided_at = NOW(), email_token_hash = NULL
         WHERE user_id = ? AND status IN ('pending', 'approved')`,
        [userId]
    );
}

// Revokes sessions and closes their live sockets. exceptSessionId keeps the current device.
async function revokeSessions(userId, { only = null, exceptSessionId = null } = {}) {
    const [rows] = await pool.query(
        `SELECT id FROM user_sessions
         WHERE user_id = ? AND revoked_at IS NULL
           AND (? IS NULL OR id = ?) AND (? IS NULL OR id <> ?)`,
        [userId, only, only, exceptSessionId, exceptSessionId]
    );
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return 0;
    await pool.query("UPDATE user_sessions SET revoked_at = NOW() WHERE id IN (?) AND revoked_at IS NULL", [ids]);
    // Required here, not at the top: realtime.js is loaded by server.js after this file.
    require("./realtime").disconnectSessions(ids);
    return ids.length;
}

module.exports = {
    sha256, userAgentOf, createSession, verifySession, hasActiveSession,
    touchSession, cancelLoginAttempts, revokeSessions,
};
