const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// Limits for the sign-in / sign-up routes, to stop password guessing.
// Counts are kept in memory, so they reset when the server restarts
// (fine while we run a single backend instance).

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

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
            ? req.body.email.trim().toLowerCase()
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

module.exports = { authIpLimiter, loginAccountLimiter, registerLimiter };
