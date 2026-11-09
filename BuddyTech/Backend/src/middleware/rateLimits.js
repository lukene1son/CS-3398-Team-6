const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// Limits for the sign-in / sign-up routes, to stop password guessing.
// Counts are kept in memory, so they reset when the server restarts
// (fine while we run a single backend instance).

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

function tooMany(message) {
    return (req, res, next, options) => {
        res.status(options.statusCode).json({ error: message });
    };
}

// Per IP address: caps how many auth requests one machine can send overall.
const authIpLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 50,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: tooMany("Too many requests. Please wait a few minutes and try again."),
});

// Per user: caps how many study group invites one account can send.
// Failed attempts (already invited, not in the course, ...) don't count.
const groupInviteLimiter = rateLimit({
    windowMs: ONE_HOUR,
    limit: 30,
    skipFailedRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: userKey,
    handler: tooMany("You're sending study group invites too quickly. Please try again later."),
});

// Per email: 5 wrong passwords for one account locks sign-in for that account
// for 15 minutes, even if the attacker switches IP addresses.
// Successful logins don't count toward the limit.
const loginAccountLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => {
        const email = req.body && typeof req.body.email === "string"
            ? req.body.email.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
            : "";
        return email ? `email:${email}` : `ip:${ipKeyGenerator(req.ip)}`;
    },
    handler: tooMany("Too many failed sign-in attempts. Please wait 15 minutes and try again."),
});

// Per IP address: limits how many accounts one machine can create.
const registerLimiter = rateLimit({
    windowMs: ONE_HOUR,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: tooMany("Too many accounts created from this network. Please try again later."),
});

// These run after requireAuth, so we key by the logged-in user instead of IP.
// (Falls back to IP only if req.user is somehow missing.)
function userKey(req) {
    return req.user && req.user.id
        ? `user:${req.user.id}`
        : `ip:${ipKeyGenerator(req.ip)}`;
}

// Per user: caps how many friend requests one account can send overall.
const friendRequestLimiter = rateLimit({
    windowMs: ONE_HOUR,
    limit: 20,
    skipFailedRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: userKey,
    handler: tooMany("You're sending friend requests too quickly. Please try again later."),
});

// Per sender + receiver pair: stops one user from re-sending a request to the
// same person over and over (e.g. right after it's declined).
const friendRequestPairLimiter = rateLimit({
    windowMs: ONE_DAY,
    limit: 3,
    skipFailedRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Same rules as toId() in friends.js, so "5", 5, "05" and 5.0 all count as user 5.
        const raw = Number((req.body || {}).receiver_id);
        const receiverId = Number.isInteger(raw) && raw > 0 ? raw : "invalid";
        return `${userKey(req)}:to:${receiverId}`;
    },
    handler: tooMany("You've already sent this person several requests today. Please try again tomorrow."),
});

//Per User: limits how fast one account can search other users.
const userSearchLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: userKey,
    handler: tooMany("Too many searches. Please wait a moment and try again."),
});

// Per user: three profile picture uploads every 15 minutes.
// Rejected uploads (wrong type, too large) don't use up the turn.
const avatarUploadLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 3,
    skipFailedRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: userKey,
    handler: tooMany("You can change your profile picture once every 15 minutes."),
});

module.exports = {
    authIpLimiter,
    loginAccountLimiter,
    registerLimiter,
    friendRequestLimiter,
    friendRequestPairLimiter,
    userSearchLimiter,
    groupInviteLimiter,
    avatarUploadLimiter,
};