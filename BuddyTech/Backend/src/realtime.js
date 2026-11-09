
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

// Real-time updates over WebSockets (Socket.IO). Clients only listen here;
// sending still goes through the REST routes, which then push the update out.
//
// Rooms:
//   user:<id>     every open tab of that user (joined automatically): DMs, requests, invites
//   channel:<id>  a course channel; only people in that course can join
//   group:<id>    a study group's chat; only people who can read it can join

let io = null;

function toId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// Called once from server.js. The access checks are passed in so this file
// doesn't have to require the route files (they'll require this one in step 5).
function initRealtime(httpServer, { canAccessChannel, getGroupAccess }) {
    // Under /api so the Vite proxy and Docker setup that already forward /api also cover it.
    io = new Server(httpServer, { path: "/api/socket.io" });

    // Same check as requireAuth: no valid login token, no connection.
    io.use((socket, next) => {
        const token = socket.handshake.auth && socket.handshake.auth.token;
        if (!token) return next(new Error("Not signed in"));
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            socket.data.userId = payload.id;
            next();
        } catch {
            next(new Error("Session expired, please sign in again"));
        }
    });

    io.on("connection", (socket) => {
        const userId = socket.data.userId;
        socket.join(`user:${userId}`);

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

module.exports = { initRealtime, emitTo, removeFromRoom };