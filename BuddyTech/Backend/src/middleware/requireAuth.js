const { verifySession } = require("../sessions");

// Runs before protected routes. Reads "Authorization: Bearer <token>", checks that
// the token is valid AND its session is still live (not signed out or revoked), and
// puts the logged-in user's id and this device's session id on req.user.
module.exports = async function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: "Not signed in" });
    }

    let session;
    try {
        session = await verifySession(token);
    } catch (error) {
        // Database trouble, not a bad token: answer 503 so the frontend doesn't sign the user out.
        console.error("Couldn't check session:", error.message);
        return res.status(503).json({ error: "Couldn't check your sign-in. Please try again." });
    }
    if (!session) {
        return res.status(401).json({ error: "Session expired, please sign in again" });
    }

    req.user = { id: session.userId, sessionId: session.sessionId };
    next();
};
