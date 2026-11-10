// ONE place for every backend call. Pages import from here and never call fetch() themselves.
//
// Each feature has a flag in USE_MOCK:
//   true  = the backend route doesn't exist yet, so we return fake data (the UI still works)
//   false = call the real backend route
// When a teammate finishes a route, flip that one flag to false. Nothing else changes.

export const USE_MOCK = {
  settings: false,  // live: GET/PUT   /api/me/settings, POST/GET /api/me/avatar
  ai: false,       // live: POST     /api/ai/chat
  chat: false,
};

const JSON_HEADERS = { "Content-Type": "application/json" };

const TOKEN_KEY = "buddytech-token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
}

// App.jsx registers a callback here so an expired/invalid token sends the user
// back to the login page instead of leaving them on a broken dashboard.
const sessionExpiredListeners = new Set();
export function onSessionExpired(fn) {
  sessionExpiredListeners.add(fn);
  return () => sessionExpiredListeners.delete(fn);
}

// fetch() with the login token. Throws (with err.status) on any non-2xx response.
// Use request() for JSON; use this directly for anything else (like file downloads).
async function authFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    // 401 on a protected route = token missing/expired. (Not on /api/auth: a wrong
    // password is also a 401 and should just show the error on the login form.)
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      setToken(null);
      sessionExpiredListeners.forEach((fn) => fn());
    }
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || `Request failed (${res.status})`);
    error.status = res.status; // lets callers tell a 409 from a 429 without matching the message text
    throw error;
  }
  return res;
}

async function request(path, options = {}) {
  const res = await authFetch(path, options);
  return res.json();
}

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

/* ---------- Auth ---------- */
export async function login({ email, password }) {
  const { token, user } = await request("/api/auth/login", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password }),
  });
  setToken(token);
  return user;
}

export async function register({ name, email, password }) {
  const { token, user } = await request("/api/auth/register", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, email, password }),
  });
  setToken(token);
  return user;
}

export function logout() {
  setToken(null);
}

export function getMe() {
  return request("/api/me");
}

/* ---------- Courses & assignments (for the logged-in user) ---------- */
export function getMyCourses() {
  return request("/api/me/courses");
}

export function getMyAssignments() {
  return request("/api/me/assignments");
}

export function updateAssignmentStatus(id, status) {
  return request(`/api/assignments/${id}/status`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  });
}

// data: { course_id, title, description?, due_date, personal? }
// personal defaults to true on the backend (only you see it). Teachers/TAs can
// send personal: false to post it for the whole course.
export function createAssignment(data) {
  return request("/api/assignments", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

/* ---------- Google Calendar sync ---------- */
// -> { configured, connected, connected_at }
export function getGoogleCalendarStatus() {
  return request("/api/me/google-calendar");
}

// -> { url }: Google's consent page. Send the browser there.
export function getGoogleCalendarConnectUrl() {
  return request("/api/me/google-calendar/connect", { method: "POST" });
}

// Due dates are saved without a timezone, so the browser's is sent with every sync.
export function syncGoogleCalendar() {
  return request("/api/me/google-calendar/sync", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  });
}

export function disconnectGoogleCalendar() {
  return request("/api/me/google-calendar", { method: "DELETE" });
}


/* ---------- Spaces (message board) ---------- */
export function getCourseChannels(courseId) {
  return request(`/api/courses/${courseId}/channels`);
}

export function getChannelMessages(channelId) {
  return request(`/api/channels/${channelId}/messages`);
}

// The backend takes the author from the login token, so no user id is sent.
export function sendChannelMessage(channelId, content) {
  return request(`/api/channels/${channelId}/messages`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ content }),
  });
}
/* ---------- Study partners / friends ---------- */
// Classmates who share a course with you and aren't already friends or
// pending. Each item: { id, name, shared_courses: ["CS 3398", ...] }
export function getSuggestedPartners() {
  return request("/api/me/study-partners/suggested");
}

// The backend takes the sender from the login token, so only the receiver is sent.
// Returns { id, sender_id, receiver_id, status }. status is "accepted" if they
// had already sent you a request.
export function sendFriendRequest(receiverId) {
  return request("/api/me/friend-requests", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ receiver_id: receiverId }),
  });
}
// Pending requests. direction "incoming" = sent to you, "outgoing" = sent by you.
// Each item: { id, sender_id, receiver_id, status, created_at, other_user_id, other_user_name }
export function getFriendRequests(direction = "incoming") {
  return request(`/api/me/friend-requests?direction=${direction}`);
}

// Only the receiver can respond, and only while it's pending. action: "accept" | "decline"
export function respondToFriendRequest(requestId, action) {
  return request(`/api/me/friend-requests/${requestId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ action }),
  });
}

// Only the sender can cancel, and only while it's pending.
export function cancelFriendRequest(requestId) {
  return request(`/api/me/friend-requests/${requestId}`, { method: "DELETE" });
}

// Everyone you're friends with. Each item: { id, name, friends_since }
export function getFriends() {
  return request("/api/me/friends");
}

export function removeFriend(userId) {
  return request(`/api/me/friends/${userId}`, { method: "DELETE" });
}

/* ---------- Direct messages (study partners) ---------- */
// Your DM conversations with current connections, newest first.
// Each item: { id, name, last_message, last_message_at }  (id = the other person's user id)
export function getConversations() {
  return request("/api/me/direct-messages");
}

// Every message between you and one connection, oldest first.
// Each item: { id, user_id (the sender), user_name, content, created_at }
export function getDirectMessages(userId) {
  return request(`/api/me/direct-messages/${userId}`);
}

// The backend takes the sender from the login token; you can only message connections.
export function sendDirectMessage(userId, content) {
  return request(`/api/me/direct-messages/${userId}`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ content }),
  });
}

/* ---------- Study groups ---------- */
// Every group in your courses (the Discover list). No messages included.
// Each item: { id, name, meeting_time, course_id, course_code, member_count, is_member }
export function getDiscoverGroups() {
  return request("/api/me/study-groups/discover");
}

// Groups whose chat you can open: ones you're in + every group in courses you teach.
// Each item: { id, name, meeting_time, course_id, course_code, access: "member" | "staff", can_post }
export function getMyStudyGroups() {
  return request("/api/me/study-groups");
}

// data: { course_id, name, meeting_time? }. You join it automatically.
export function createStudyGroup(data) {
  return request("/api/study-groups", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

export function joinStudyGroup(groupId) {
  return request(`/api/me/study-groups/${groupId}`, { method: "POST" });
}

export function leaveStudyGroup(groupId) {
  return request(`/api/me/study-groups/${groupId}`, { method: "DELETE" });
}

// channel: "general" | "homework" | "meetups"
// Each item: { id, group_id, channel, user_id, user_name, content, created_at }
export function getGroupMessages(groupId, channel) {
  return request(`/api/study-groups/${groupId}/messages?channel=${encodeURIComponent(channel)}`);
}

export function sendGroupMessage(groupId, channel, content) {
  return request(`/api/study-groups/${groupId}/messages`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ channel, content }),
  });
}

/* ---------- Study group invites ---------- */
// Pending invites. direction "incoming" = sent to you, "outgoing" = sent by you.
// Each item: { id, group_id, group_name, meeting_time, course_code, member_count,
//              inviter_id, inviter_name, invitee_id, invitee_name, created_at }
export function getGroupInvites(direction = "incoming") {
  return request(`/api/me/study-group-invites?direction=${direction}`);
}

// Members and the course's teachers/TAs can invite anyone else in the course.
export function inviteToGroup(groupId, userId) {
  return request(`/api/study-groups/${groupId}/invites`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ user_id: userId }),
  });
}

// Only the invitee can respond. action: "accept" | "decline"
export function respondToGroupInvite(inviteId, action) {
  return request(`/api/me/study-group-invites/${inviteId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ action }),
  });
}

/* ---------- Members (Chat header) ---------- */
// Everyone in a course. Each item: { id, name, role: "teacher" | "ta" | "student" }
export function getCourseMembers(courseId) {
  return request(`/api/courses/${courseId}/members`);
}

// A study group's members. Each item: { id, name, role }
export function getGroupMembers(groupId) {
  return request(`/api/study-groups/${groupId}/members`);
}

/* ---------- Resources (teachers add/delete; everyone in the course can view) ---------- */
export function getResources(courseId) {
  return request(`/api/courses/${courseId}/resources`);
}

export function addResourceLink(courseId, { title, url }) {
  return request(`/api/courses/${courseId}/resources`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ title, url }),
  });
}

// No Content-Type header here: the browser sets multipart/form-data (with its boundary) itself.
export function uploadResourceFile(courseId, file, title) {
  const form = new FormData();
  if (title) form.append("title", title);
  form.append("file", file);
  return request(`/api/courses/${courseId}/resources/file`, { method: "POST", body: form });
}

export function deleteResource(resourceId) {
  return request(`/api/resources/${resourceId}`, { method: "DELETE" });
}

// Downloads need the login token, which a plain <a href> can't send, so fetch the
// file with it and hand the browser a temporary link to save it from.
export async function downloadResourceFile(resource) {
  const res = await authFetch(`/api/resources/${resource.id}/file`);
  const blobUrl = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = resource.file_name || resource.title;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export const VIEWABLE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain"];

// Shows a file in a tab the caller already opened. (The tab has to be opened by the
// click itself, before any await, or the browser's pop-up blocker stops it.)
export async function viewResourceFile(resource, tab) {
  const res = await authFetch(`/api/resources/${resource.id}/file`);
  // The server sends every file as a generic download; re-label it with its real
  // type so the browser displays it instead of saving it.
  const blob = new Blob([await res.blob()], { type: resource.mime_type });
  const blobUrl = URL.createObjectURL(blob);
  tab.location.href = blobUrl;
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60 * 1000);
}

/* ---------- Settings ---------- */
const DEFAULT_SETTINGS = { display_name: "", email_notifications: true, assignment_reminders: true };

export async function getSettings(userId) {
  if (USE_MOCK.settings) {
    await delay(200);
    try {
      const saved = localStorage.getItem(`buddytech-settings-${userId}`);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  return request("/api/me/settings");
}

export async function saveSettings(userId, settings) {
  if (USE_MOCK.settings) {
    await delay(300);
    try {
      localStorage.setItem(`buddytech-settings-${userId}`, JSON.stringify(settings));
    } catch {
      /* storage unavailable; ignore in mock mode */
    }
    return settings;
  }
  return request("/api/me/settings", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(settings),
  });
}

// Profile pictures as blob: URLs for <img>. (<img src> can't send the login token,
// so we fetch the image ourselves.) One download per user, shared by every <Avatar>.
const avatarCache = new Map(); // userId -> Promise<blob URL | null>

export function getUserAvatarUrl(userId) {
  if (USE_MOCK.settings) return Promise.resolve(null);
  const id = String(userId);
  if (!avatarCache.has(id)) {
    const promise = authFetch(`/api/users/${encodeURIComponent(id)}/avatar`)
      .then(async (res) => URL.createObjectURL(await res.blob()))
      .catch((err) => {
        if (err.status === 404) return null; // no picture: show the initial
        avatarCache.delete(id);              // other errors: try again next time
        throw err;
      });
    avatarCache.set(id, promise);
  }
  return avatarCache.get(id);
}

// Call after uploading or removing a picture so the next <Avatar> downloads it fresh.
export function forgetUserAvatar(userId) {
  const id = String(userId);
  const promise = avatarCache.get(id);
  avatarCache.delete(id);
  if (promise) promise.then((url) => url && URL.revokeObjectURL(url)).catch(() => {});
}

export function saveAvatarColor(color) {
  if (USE_MOCK.settings) return Promise.resolve({ avatar_color: color });
  return request("/api/me/avatar-color", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ color }),
  });
}

export function deleteAvatar() {
  return request("/api/me/avatar", { method: "DELETE" });
}

export async function uploadAvatar(file) {
  if (USE_MOCK.settings) throw new Error("Profile pictures need the settings API");
  const body = new FormData();
  body.append("avatar", file);
  // No Content-Type header: the browser adds the multipart boundary itself.
  return request("/api/me/avatar", { method: "POST", body });
}

/* ---------- AI tools ---------- */
export async function askAI({ tool, prompt }) {
  if (USE_MOCK.ai) {
    await delay(900);
    return {
      reply: `[Demo response] The "${tool}" tool isn't connected to a model yet. You asked: "${prompt.slice(0, 120)}"`,
    };
  }
  return request(`/api/ai/chat`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ tool, prompt }),
  });
}