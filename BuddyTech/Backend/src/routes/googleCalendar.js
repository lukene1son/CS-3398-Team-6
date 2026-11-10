const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { calendarSyncLimiter } = require("../middleware/rateLimits");

const router = express.Router();

// Google Calendar sync (one-way: BuddyTech assignments -> a "BuddyTech" calendar
// in the student's Google account).
//
// Every route on `router` runs after requireAuth, so req.user.id is the logged-in user.
// The ONE exception is `router.callback` at the bottom: Google redirects the browser
// there with no login token, so server.js registers it above requireAuth and it
// identifies the user from the signed `state` value instead.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
// Narrowest scope that works: only calendars this app created, nothing else of the user's.
const SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const CALENDAR_NAME = "BuddyTech";
const EVENT_MINUTES = 30; // each deadline shows as a 30-minute block ending at the due time

function isConfigured() {
    return Boolean(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REDIRECT_URI &&
        /^[0-9a-f]{64}$/i.test(process.env.GOOGLE_TOKEN_KEY || "")
    );
}

function requireConfigured(req, res, next) {
    if (!isConfigured()) {
        return res.status(503).json({ error: "Google Calendar sync is not configured yet" });
    }
    next();
}

// ---- Refresh token encryption (AES-256-GCM) ----
// Stored as "iv.tag.ciphertext", each part base64.

function tokenKey() {
    return Buffer.from(process.env.GOOGLE_TOKEN_KEY, "hex");
}

function encrypt(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
    const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
}

function decrypt(stored) {
    const [iv, tag, data] = stored.split(".").map((part) => Buffer.from(part, "base64"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// ---- The OAuth "state" value ----
// Signed with a DIFFERENT secret than login tokens. It travels in a URL, so it must
// never be usable as a login token (and a login token must never pass as a state).

function stateSecret() {
    return `${process.env.JWT_SECRET}:google-oauth-state`;
}

function makeState(userId) {
    return jwt.sign({ id: userId }, stateSecret(), { expiresIn: "10m" });
}

function readState(state) {
    try {
        return jwt.verify(String(state || ""), stateSecret()).id;
    } catch {
        return null;
    }
}

// ---- Talking to Google ----

// POSTs a form to Google's token endpoint. Returns { ok, data }.
async function tokenRequest(fields) {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            ...fields,
        }),
    });
    return { ok: response.ok, data: await response.json().catch(() => ({})) };
}

// One Calendar API call. Returns { status, data }.
async function calendarRequest(accessToken, method, path, body) {
    const response = await fetch(`${CALENDAR_API}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function getLink(userId) {
    const [rows] = await pool.query(
        "SELECT refresh_token_enc, calendar_id, time_zone, connected_at FROM google_calendar_links WHERE user_id = ?",
        [userId]
    );
    return rows[0] || null;
}

async function removeLink(userId) {
    await pool.query("DELETE FROM google_calendar_events WHERE user_id = ?", [userId]);
    await pool.query("DELETE FROM google_calendar_links WHERE user_id = ?", [userId]);
}

async function createCalendar(userId, accessToken) {
    const { status, data } = await calendarRequest(accessToken, "POST", "/calendars", {
        summary: CALENDAR_NAME,
    });
    if (status !== 200 || !data.id) throw new Error(`Could not create calendar (${status})`);
    // A new calendar has none of our events, so any old event ids are stale.
    await pool.query("DELETE FROM google_calendar_events WHERE user_id = ?", [userId]);
    await pool.query("UPDATE google_calendar_links SET calendar_id = ? WHERE user_id = ?", [data.id, userId]);
    return data.id;
}

// Creates or updates one event. Returns true if it worked, false if the CALENDAR
// itself is gone (deleted in Google, or the user reconnected a different account).
async function pushEvent(userId, accessToken, calendarId, assignment, timeZone) {
    const events = `/calendars/${encodeURIComponent(calendarId)}/events`;
    const event = {
        summary: assignment.course_code ? `${assignment.course_code}: ${assignment.title}` : assignment.title,
        description: assignment.description || undefined,
        start: { dateTime: assignment.starts_at, timeZone },
        end: { dateTime: assignment.due_at, timeZone },
    };

    if (assignment.google_event_id) {
        const updated = await calendarRequest(
            accessToken, "PUT", `${events}/${encodeURIComponent(assignment.google_event_id)}`, event
        );
        if (updated.status === 200) return true;
        // 404/410 = the event was deleted in Google: fall through and create it again.
        if (updated.status !== 404 && updated.status !== 410) {
            throw new Error(`Could not update event (${updated.status})`);
        }
    }

    const created = await calendarRequest(accessToken, "POST", events, event);
    if (created.status === 404) return false;
    if (created.status !== 200 || !created.data.id) {
        throw new Error(`Could not create event (${created.status})`);
    }
    await pool.query(
        `INSERT INTO google_calendar_events (user_id, assignment_id, google_event_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE google_event_id = ?`,
        [userId, assignment.id, created.data.id, created.data.id]
    );
    return true;
}

// The same assignments GET /api/me/assignments returns (course-wide + this user's
// personal tasks), plus the Google event id if one was already pushed.
// The times are formatted in SQL as plain "wall clock" text, because due_date has no
// timezone; the browser's timezone is sent to Google alongside it.
// Pass onlyAssignmentId to get just that one assignment (if this user can see it).
async function getAssignmentsToSync(userId, onlyAssignmentId = null) {
    const [rows] = await pool.query(
        `
        SELECT
            assignments.id,
            assignments.title,
            assignments.description,
            courses.course_code,
            DATE_FORMAT(DATE_SUB(assignments.due_date, INTERVAL ? MINUTE), '%Y-%m-%dT%H:%i:%s') AS starts_at,
            DATE_FORMAT(assignments.due_date, '%Y-%m-%dT%H:%i:%s') AS due_at,
            google_calendar_events.google_event_id
        FROM course_members
        JOIN courses ON courses.id = course_members.course_id
        JOIN assignments ON assignments.course_id = courses.id
        LEFT JOIN google_calendar_events
            ON google_calendar_events.assignment_id = assignments.id
           AND google_calendar_events.user_id = course_members.user_id
        WHERE course_members.user_id = ?
          AND (assignments.owner_user_id IS NULL OR assignments.owner_user_id = course_members.user_id)
          AND assignments.due_date IS NOT NULL
          AND (? IS NULL OR assignments.id = ?)
        ORDER BY assignments.due_date ASC
        `,
        [EVENT_MINUTES, userId, onlyAssignmentId, onlyAssignmentId]
    );
    return rows;
}

function isValidTimeZone(timeZone) {
    if (typeof timeZone !== "string" || !timeZone) return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
        return true;
    } catch {
        return false;
    }
}

// An error the sync route shows to the user as a 409 (anything else becomes a 502).
function notConnected(message) {
    const error = new Error(message);
    error.status = 409;
    return error;
}

// Pushes this user's assignments (or just one of them) to their Google calendar.
// Returns how many were pushed.
async function syncUser(userId, timeZone, onlyAssignmentId = null) {
    const link = await getLink(userId);
    if (!link) throw notConnected("Google Calendar is not connected");

    const refreshed = await tokenRequest({
        grant_type: "refresh_token",
        refresh_token: decrypt(link.refresh_token_enc),
    });
    if (!refreshed.ok) {
        // invalid_grant = the user removed our access in Google, or the token expired.
        if (refreshed.data.error === "invalid_grant") {
            await removeLink(userId);
            throw notConnected("Google Calendar was disconnected. Please connect it again.");
        }
        throw new Error(`Token refresh failed: ${refreshed.data.error || "unknown"}`);
    }
    const accessToken = refreshed.data.access_token;

    let calendarId = link.calendar_id || await createCalendar(userId, accessToken);
    let assignments = await getAssignmentsToSync(userId, onlyAssignmentId);
    let recreated = false;
    let synced = 0;

    for (let i = 0; i < assignments.length; i++) {
        const ok = await pushEvent(userId, accessToken, calendarId, assignments[i], timeZone);
        if (ok) {
            synced++;
            continue;
        }
        // The calendar is gone. Make a new one and push EVERYTHING again (once),
        // because the new calendar is empty.
        if (recreated) throw new Error("Calendar missing right after it was created");
        recreated = true;
        calendarId = await createCalendar(userId, accessToken);
        assignments = await getAssignmentsToSync(userId);
        synced = 0;
        i = -1;
    }
    return synced;
}

// One sync at a time per user. Two at once could both see "no event yet" and
// create the same event twice. (In memory, so this assumes one backend instance,
// like the rate limits.)
const syncQueues = new Map(); // user id -> that user's most recent sync

function queueSync(userId, timeZone, onlyAssignmentId = null) {
    const previous = syncQueues.get(userId) || Promise.resolve();
    const next = previous
        .catch(() => {}) // a failed sync shouldn't block the next one
        .then(() => syncUser(userId, timeZone, onlyAssignmentId));
    syncQueues.set(userId, next);
    next.catch(() => {}).finally(() => {
        if (syncQueues.get(userId) === next) syncQueues.delete(userId);
    });
    return next;
}

// ---- Routes ----

// GET /api/me/google-calendar
router.get("/me/google-calendar", async (req, res) => {
    try {
        const link = isConfigured() ? await getLink(req.user.id) : null;
        res.json({
            configured: isConfigured(),
            connected: Boolean(link),
            connected_at: link ? link.connected_at : null,
        });
    } catch (error) {
        console.error("Error checking Google Calendar link:", error);
        res.status(500).json({ error: "Failed to check Google Calendar" });
    }
});

// POST /api/me/google-calendar/connect
// Returns the Google consent page URL; the frontend sends the browser there.
router.post("/me/google-calendar/connect", requireConfigured, (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: SCOPE,
        access_type: "offline", // ask for a refresh token
        prompt: "consent",      // ...and get one every time, not only on the first connect
        state: makeState(req.user.id),
    });
    res.json({ url: `${AUTH_URL}?${params}` });
});

// POST /api/me/google-calendar/sync  { timeZone: "America/Chicago" }
router.post("/me/google-calendar/sync", calendarSyncLimiter, requireConfigured, async (req, res) => {
    try {
        const timeZone = (req.body || {}).timeZone;
        if (!isValidTimeZone(timeZone)) {
            return res.status(400).json({ error: "timeZone is required (e.g. America/Chicago)" });
        }

        // Remembered so new assignments can be pushed later with no browser involved.
        await pool.query(
            "UPDATE google_calendar_links SET time_zone = ? WHERE user_id = ?",
            [timeZone, req.user.id]
        );
        res.json({ synced: await queueSync(req.user.id, timeZone) });
    } catch (error) {
        if (error.status === 409) return res.status(409).json({ error: error.message });
        console.error("Error syncing Google Calendar:", error);
        res.status(502).json({ error: "Failed to sync with Google Calendar" });
    }
});

// DELETE /api/me/google-calendar
// Takes away our access in Google and forgets the link. The "BuddyTech" calendar
// itself stays in the user's Google account.
router.delete("/me/google-calendar", requireConfigured, async (req, res) => {
    try {
        const link = await getLink(req.user.id);
        if (link) {
            const query = new URLSearchParams({ token: decrypt(link.refresh_token_enc) });
            // Best effort: still forget the link if Google can't be reached.
            await fetch(`${REVOKE_URL}?${query}`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            }).catch(() => {});
            await removeLink(req.user.id);
        }
        res.json({ connected: false });
    } catch (error) {
        console.error("Error disconnecting Google Calendar:", error);
        res.status(500).json({ error: "Failed to disconnect Google Calendar" });
    }
});

// GET /api/auth/google/callback?code=...&state=...   (PUBLIC: see the note at the top)
// Google sends the browser here after the consent page. Always ends in a redirect
// back to the app, with ?google_calendar=connected | denied | error.
router.callback = async function googleCallback(req, res) {
    const back = (result) => res.redirect(`/dashboard?google_calendar=${result}`);
    try {
        if (!isConfigured()) return back("error");
        if (req.query.error) return back("denied"); // the user clicked Cancel

        const userId = readState(req.query.state);
        if (!userId || typeof req.query.code !== "string") return back("error");

        const exchanged = await tokenRequest({
            grant_type: "authorization_code",
            code: req.query.code,
            redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        });
        if (!exchanged.ok || !exchanged.data.refresh_token) {
            console.error("Google code exchange failed:", exchanged.data.error || "no refresh token");
            return back("error");
        }

        // Reconnecting keeps calendar_id, so the same "BuddyTech" calendar is reused.
        const encrypted = encrypt(exchanged.data.refresh_token);
        await pool.query(
            `INSERT INTO google_calendar_links (user_id, refresh_token_enc)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE refresh_token_enc = ?, connected_at = CURRENT_TIMESTAMP`,
            [userId, encrypted, encrypted]
        );
        back("connected");
    } catch (error) {
        console.error("Google callback failed:", error);
        back("error");
    }
};

// Called by POST /api/assignments (server.js) right after a new assignment is saved.
// Pushes just that assignment to everyone who can see it AND has connected Google
// Calendar. Never throws: the assignment is already saved either way.
router.syncNewAssignment = async function syncNewAssignment(assignmentId) {
    if (!isConfigured()) return;
    try {
        // The same visibility rule as getAssignmentsToSync: everyone in the course
        // for a course-wide assignment, only the owner for a personal task.
        const [rows] = await pool.query(
            `
            SELECT google_calendar_links.user_id, google_calendar_links.time_zone
            FROM assignments
            JOIN course_members ON course_members.course_id = assignments.course_id
            JOIN google_calendar_links ON google_calendar_links.user_id = course_members.user_id
            WHERE assignments.id = ?
              AND (assignments.owner_user_id IS NULL OR assignments.owner_user_id = course_members.user_id)
              AND google_calendar_links.time_zone IS NOT NULL
            `,
            [assignmentId]
        );
        for (const row of rows) {
            await queueSync(row.user_id, row.time_zone, assignmentId).catch((error) => {
                console.error(`Google Calendar push failed for user ${row.user_id}:`, error.message);
            });
        }
    } catch (error) {
        console.error("Google Calendar push failed:", error);
    }
};

module.exports = router;
