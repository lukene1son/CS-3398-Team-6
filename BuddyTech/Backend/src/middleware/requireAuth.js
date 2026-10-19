const jwt = require("jsonwebtoken");

// Runs before protected routes. Reads "Authorization: Bearer <token>",
// verifies it, and puts the logged-in user's id on req.user.
module.exports = function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: "Not signed in" });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: payload.id };
        next();
    } catch {
        return res.status(401).json({ error: "Session expired, please sign in again" });
    }
};