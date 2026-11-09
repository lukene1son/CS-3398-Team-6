import { io } from "socket.io-client";
import { getToken } from "./api";

// ONE live connection to the backend (see BuddyTech/Backend/src/realtime.js).
// It only tells us WHEN something changed; we still load the data through api.js.

let socket = null;

// Opens the connection the first time something needs it.
export function getSocket() {
  if (!socket) {
    socket = io({
      path: "/api/socket.io",
      // A function, so a reconnect always sends the current login token.
      auth: (cb) => cb({ token: getToken() }),
    });
    socket.on("connect_error", (err) => console.warn("Live updates unavailable:", err.message));
  }
  return socket;
}

// Called on logout / session expiry.
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Listen for one event. Returns a function that stops listening.
export function onSocketEvent(event, handler) {
  const s = getSocket();
  s.on(event, handler);
  return () => s.off(event, handler);
}

// Stay in a room ({ type: "channel" | "group", id }) while a chat is open.
// The server forgets rooms when the connection drops, so rejoin on every
// reconnect and call onReconnect to catch up on anything missed.
export function watchRoom(room, onReconnect) {
  const s = getSocket();
  const join = () => s.emit("join", room);
  const rejoin = () => {
    join();
    if (onReconnect) onReconnect();
  };
  if (s.connected) join();
  s.on("connect", rejoin);
  return () => {
    s.off("connect", rejoin);
    s.emit("leave", room);
  };
}