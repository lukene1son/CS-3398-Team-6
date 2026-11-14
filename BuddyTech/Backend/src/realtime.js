
const { Server } = require("socket.io");

// Real-time updates over WebSockets (Socket.IO). Clients only listen here;
// sending still goes through the REST routes, which then push the update out.
//
// Rooms:
//   user:<id>     every open tab of that user (joined automatically): DMs, requests, invites
//   session:<id>  every socket of one sign-in session, so revoking it can disconnect them
//   channel:<id>  a course channel; only people in that course can join
//   group:<id>    a study group's chat; only people who can read it can join

let io = null;

function toId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// Called once from server.js. The access checks are passed in so this file
// doesn't have to require the route files (they'll require this one in step 5).
const TOUCH_EVERY_MS = 5 * 60 * 1000; // open sockets keep their session "active" (sessions.js)

function initRealtime(httpServer, { canAccessChannel, getGroupAccess, verifySession, touchSession }) {
    // Under /api so the Vite proxy and Docker setup that already forward /api also cover it.
    io = new Server(httpServer, { path: "/api/socket.io" });

    // Same check as requireAuth: no live session, no connection.
    io.use(async (socket, next) => {
        const token = socket.handshake.auth && socket.handshake.auth.token;
        if (typeof token !== "string" || !token) return next(new Error("Not signed in"));
        try {
            const session = await verifySession(token);
            if (!session) return next(new Error("Session expired, please sign in again"));
            socket.data.userId = session.userId;
            socket.data.sessionId = session.sessionId;
            socket.data.expiresAt = session.expiresAt;
            next();
        } catch (error) {
            console.error("Couldn't check socket session:", error.message);
            next(new Error("Couldn't check your sign-in"));
        }
    });

    io.on("connection", (socket) => {
        const userId = socket.data.userId;
        socket.join(`user:${userId}`);
        socket.join(`session:${socket.data.sessionId}`);

        // Auth is only checked at connection time, so close the socket when its token
        // expires. (Revoked sessions are closed right away by disconnectSessions.)
        const expiryTimer = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expiresAt - Date.now()));

        // An open tab counts as signed in, even if it isn't making REST requests.
        const touch = () => touchSession(socket.data.sessionId)
            .catch((error) => console.error("Couldn't update session activity:", error.message));
        touch();
        const touchTimer = setInterval(touch, TOUCH_EVERY_MS);

        socket.on("disconnect", () => {
            clearTimeout(expiryTimer);
            clearInterval(touchTimer);
        });

        // join: { type: "channel" | "group", id }. Replies { ok: true } or { error }.
        // Same answer for "doesn't exist" and "no access", like the REST routes.
        socket.on("join", async (room, reply) => {
            const done = typeof reply === "function" ? reply : () => {};
            const type = room && room.type;
            const id = toId(room && room.id);
            try {
                if (type === "channel" && id && (await canAccessChannel(userId, id))) {
                    socket.join(`channel:${id}`);
                    return done({ ok: true });
                }
                if (type === "group" && id) {
                    const access = await getGroupAccess(userId, id);
                    if (access && access.canRead) {
                        socket.join(`group:${id}`);
                        return done({ ok: true });
                    }
                }
                done({ error: "You don't have access to that chat" });
            } catch (error) {
                console.error("Error joining room:", error);
                done({ error: "Failed to join" });
            }
        });

        // leave: { type, id }. Called when the user switches to a different chat.
        socket.on("leave", (room) => {
            const type = room && room.type;
            const id = toId(room && room.id);
            if (id && (type === "channel" || type === "group")) {
                socket.leave(`${type}:${id}`);
            }
        });
    });
}

// For the routes (step 5): push an event to everyone in a room,
// e.g. emitTo("group:12", "group-message", row).
function emitTo(room, event, data) {
    if (io) io.to(room).emit(event, data);
}

// Take every open tab of a user out of a room, e.g. when they leave a study group.
function removeFromRoom(userId, room) {
    if (io) io.in(`user:${userId}`).socketsLeave(room);
}

// Close every live socket of these sessions (sign-out, password change, "sign out everywhere").
function disconnectSessions(sessionIds) {
    if (io && sessionIds.length > 0) io.in(sessionIds.map((id) => `session:${id}`)).disconnectSockets(true);
}

// True if this user has the app open somewhere right now (a live socket), i.e. someone
// is there to see the bell and approve a held sign-in.
async function isUserOnline(userId) {
    if (!io) return false;
    return (await io.in(`user:${userId}`).fetchSockets()).length > 0;
}

module.exports = { initRealtime, emitTo, removeFromRoom, disconnectSessions, isUserOnline };