const { createHash, createPublicKey, randomBytes } = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const { ltiLaunchLimiter } = require("../middleware/rateLimits");

const CLAIM = "https://purl.imsglobal.org/spec/lti/claim/";
const LEARNER = "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner";
const STATE_COOKIE = "buddytech_lti_state";
const LAUNCH_COOKIE = "buddytech_lti_launch";
const LIFETIME_MS = 10 * 60 * 1000;
const MAX_PENDING = 250;

const id = () => randomBytes(32).toString("hex");

function readCookie(req, name) {
    return (req.headers.cookie || "").split(";").map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith(name + "="))?.slice(name.length + 1);
}

function loadConfig(env) {
    if (!env.CANVAS_LTI_ISSUER) return null;
    const app = new URL(env.APP_URL);
    const authorize = new URL(env.CANVAS_LTI_AUTHORIZE_URL);
    const jwks = new URL(env.CANVAS_LTI_JWKS_URL);
    const localApp = ["localhost", "127.0.0.1"].includes(app.hostname);
    const courseMap = new Map(Object.entries(JSON.parse(env.CANVAS_LTI_COURSE_MAP)));
    for (const url of [app, authorize, jwks]) {
        if (url.username || url.password ||
            (url.protocol !== "https:" && !(localApp && url.protocol === "http:"))) {
            throw new Error("Canvas LTI URLs require HTTPS outside local development");
        }
    }
    if (!env.CANVAS_LTI_CLIENT_ID || !env.CANVAS_LTI_DEPLOYMENT_ID || !courseMap.size ||
        [...courseMap.values()].some(courseId => !Number.isSafeInteger(courseId) || courseId <= 0)) {
        throw new Error("Canvas LTI requires a client ID, deployment ID, and valid course map");
    }
    return {
        issuer: env.CANVAS_LTI_ISSUER,
        clientId: env.CANVAS_LTI_CLIENT_ID,
        deploymentId: env.CANVAS_LTI_DEPLOYMENT_ID,
        courseMap, app, authorize, jwks,
        target: new URL("/api/lti/launch", app).href
    };
}

async function verifyLaunch(token, nonce, config) {
    const header = jwt.decode(token, { complete: true })?.header;
    if (header?.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Invalid LTI header");
    const response = await fetch(config.jwks, {
        redirect: "error",
        signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error("Canvas public keys unavailable");
    const { keys } = await response.json();
    const jwk = keys?.find(key => key.kid === header.kid && key.kty === "RSA" &&
        (!key.alg || key.alg === "RS256") && (!key.use || key.use === "sig"));
    if (!jwk) throw new Error("Unrecognized Canvas signing key");
    const claims = jwt.verify(token, createPublicKey({ key: jwk, format: "jwk" }), {
        algorithms: ["RS256"], issuer: config.issuer, audience: config.clientId, maxAge: "10m"
    });
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.nonce !== nonce || typeof claims.exp !== "number" ||
        typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255 ||
        audiences.length !== 1 || (claims.azp !== undefined && claims.azp !== config.clientId) ||
        claims[CLAIM + "deployment_id"] !== config.deploymentId ||
        claims[CLAIM + "message_type"] !== "LtiResourceLinkRequest" ||
        claims[CLAIM + "version"] !== "1.3.0" ||
        claims[CLAIM + "target_link_uri"] !== config.target ||
        typeof claims[CLAIM + "resource_link"]?.id !== "string" ||
        !Array.isArray(claims[CLAIM + "roles"]) || !claims[CLAIM + "roles"].includes(LEARNER)) {
        throw new Error("Unsupported Canvas launch");
    }
    return claims;
}

async function connectCourse(pool, launch, userId, confirm) {
    const db = await pool.getConnection();
    let committed = false;
    try {
        await db.beginTransaction();
        const [courses] = await db.execute(
            "SELECT id, course_code, course_name FROM courses WHERE id = ? LOCK IN SHARE MODE", [launch.courseId]
        );
        if (!courses.length) return { status: 404, error: "The mapped BuddyTech Space no longer exists." };

        if (confirm) {
            await db.execute(
                "INSERT INTO canvas_lti_identities (identity_hash, user_id) VALUES (?, ?) " +
                "ON DUPLICATE KEY UPDATE identity_hash = canvas_lti_identities.identity_hash",
                [launch.identityHash, userId]
            );
        }
        const [links] = await db.execute(
            "SELECT user_id FROM canvas_lti_identities WHERE identity_hash = ? FOR UPDATE", [launch.identityHash]
        );
        if (!links.length) return { course: courses[0], confirmationRequired: true };
        if (links[0].user_id !== userId) {
            return { status: 409, error: "This Canvas account is already linked to another BuddyTech account." };
        }
        await db.execute(
            "INSERT INTO course_members (course_id, user_id, role) VALUES (?, ?, 'student') " +
            "ON DUPLICATE KEY UPDATE id = course_members.id",
            [launch.courseId, userId]
        );
        await db.commit();
        committed = true;
        return { course: courses[0], confirmationRequired: false };
    } finally {
        // Also releases read locks when returning a preview or rejecting a conflicting link.
        try {
            if (!committed) await db.rollback();
        } finally {
            db.release();
        }
    }
}

function createCanvasLti(pool, env = process.env) {
    const config = loadConfig(env);
    const publicRouter = express.Router();
    const sessionRouter = express.Router();
    const pending = new Map();
    const launches = new Map();

    function enabled(req, res, next) {
        res.set("Cache-Control", "no-store");
        if (!config) return res.status(404).json({ error: "Canvas course launch is unavailable." });
        next();
    }

    function cookieOptions(path, crossSite = false) {
        const secure = config.app.protocol === "https:";
        return { httpOnly: true, secure, sameSite: secure && crossSite ? "none" : "lax", path };
    }

    function remember(map, data) {
        const now = Date.now();
        for (const [key, entry] of map) {
            if (entry.expires <= now) map.delete(key);
        }
        if (map.size >= MAX_PENDING) return null;
        const key = id();
        map.set(key, { ...data, expires: now + LIFETIME_MS });
        return key;
    }

    function start(req, res) {
        const { iss, client_id, target_link_uri, login_hint, lti_message_hint } =
            req.method === "POST" ? (req.body || {}) : req.query;
        if (iss !== config.issuer || (client_id !== undefined && client_id !== config.clientId) ||
            target_link_uri !== config.target || typeof login_hint !== "string" || !login_hint ||
            (lti_message_hint !== undefined && typeof lti_message_hint !== "string")) {
            return res.status(400).send("Open BuddyTech from a registered Canvas course.");
        }

        const nonce = id();
        const state = remember(pending, { nonce });
        if (!state) return res.status(503).send("Too many pending Canvas launches. Try again shortly.");
        const auth = new URL(config.authorize);
        for (const [key, value] of Object.entries({
            scope: "openid", response_type: "id_token", response_mode: "form_post", prompt: "none",
            client_id: config.clientId, redirect_uri: config.target, login_hint, state, nonce
        })) auth.searchParams.set(key, value);
        if (lti_message_hint) auth.searchParams.set("lti_message_hint", lti_message_hint);

        res.cookie(STATE_COOKIE, state, { ...cookieOptions("/api/lti/launch", true), maxAge: LIFETIME_MS });
        res.redirect(303, auth.href);
    }

    const parseForm = express.urlencoded({ extended: false, limit: "48kb" });
    publicRouter.get("/login", enabled, ltiLaunchLimiter, start);
    publicRouter.post("/login", enabled, ltiLaunchLimiter, parseForm, start);
    publicRouter.post("/launch", enabled, ltiLaunchLimiter, parseForm, async (req, res) => {
        const { id_token: token, state } = req.body || {};
        const entry = pending.get(state);
        if (!entry || entry.expires <= Date.now() || readCookie(req, STATE_COOKIE) !== state ||
            typeof token !== "string") {
            return res.status(400).send("Canvas launch expired. Open BuddyTech from the Canvas course again.");
        }
        pending.delete(state);
        res.clearCookie(STATE_COOKIE, cookieOptions("/api/lti/launch", true));

        let claims;
        try {
            claims = await verifyLaunch(token, entry.nonce, config);
        } catch (error) {
            // The reason only (never the token), so a real Canvas registration can be debugged
            // from the backend log: wrong issuer, audience, deployment ID, role, or key.
            console.warn("Canvas launch rejected:", error.message);
            return res.status(400).send("BuddyTech could not verify this Canvas student launch.");
        }
        const contextId = claims[CLAIM + "context"]?.id;
        const courseId = config.courseMap.get(contextId);
        if (!courseId) {
            if (typeof contextId === "string" && contextId.length <= 255) {
                console.info("Unmapped Canvas course context:", JSON.stringify(contextId));
            }
            return res.status(404).send("This Canvas course has no BuddyTech Space configured.");
        }
        const identityHash = createHash("sha256")
            .update(JSON.stringify([config.issuer, config.clientId, config.deploymentId, claims.sub]))
            .digest("hex");
        const launch = remember(launches, { courseId, identityHash });
        if (!launch) return res.status(503).send("Too many pending Canvas launches. Try again shortly.");
        res.cookie(LAUNCH_COOKIE, launch, { ...cookieOptions("/api/lti/complete"), maxAge: LIFETIME_MS });
        res.redirect(303, "/canvas/continue");
    });

    sessionRouter.post("/complete", enabled, async (req, res) => {
        const key = readCookie(req, LAUNCH_COOKIE);
        const launch = launches.get(key);
        if (!launch || launch.expires <= Date.now()) {
            return res.status(410).json({ error: "Canvas launch expired. Open BuddyTech from the Canvas course again." });
        }
        if (launch.busy) return res.status(409).json({ error: "This Canvas launch is already being processed." });
        launch.busy = true;
        try {
            const result = await connectCourse(pool, launch, req.user.id, req.body?.confirm === true);
            if (result.status) return res.status(result.status).json({ error: result.error });
            if (!result.confirmationRequired) {
                launches.delete(key);
                res.clearCookie(LAUNCH_COOKIE, cookieOptions("/api/lti/complete"));
            }
            res.json(result);
        } catch (error) {
            console.error("Canvas course linking failed:", error.code || error.name);
            res.status(503).json({ error: "Could not open your Canvas Space. Please try again." });
        } finally {
            launch.busy = false;
        }
    });

    return { publicRouter, sessionRouter };
}

module.exports = { createCanvasLti };
