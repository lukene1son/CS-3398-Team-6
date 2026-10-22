// ONE place for every backend call. Pages import from here and never call fetch() themselves.
//
// Each feature has a flag in USE_MOCK:
//   true  = the backend route doesn't exist yet, so we return fake data (the UI still works)
//   false = call the real backend route
// When a teammate finishes a route, flip that one flag to false. Nothing else changes.

export const USE_MOCK = {
  resources: true, // needs: GET/POST /api/courses/:id/resources
  settings: true,  // needs: GET/PUT  /api/users/:id/settings
  ai: true,        // needs: POST     /api/ai/chat
};

const JSON_HEADERS = { "Content-Type": "application/json" };

async function request(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error("Could not reach the server. Is the backend running?");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.error) throw new Error(body.error);
    // The Vite proxy returns an empty 5xx when the backend isn't running
    if (res.status >= 500) throw new Error("Server error. Is the backend running?");
    throw new Error(`Request failed (${res.status})`);
  }
  return res.json();
}

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

/* ---------- Auth (REAL: POST /api/auth/register exists; login does not yet) ---------- */
export function registerUser({ name, email, password }) {
  return request(`/api/auth/register`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, email, password }),
  });
}

/* ---------- Courses (REAL: backend already has this) ---------- */
export function getUserCourses(userId) {
  return request(`/api/users/${userId}/courses`);
}

/* ---------- Resources ---------- */
let mockResources = [
  { id: 1, course_id: 1, title: "Course syllabus", url: "https://example.com/syllabus", type: "link" },
  { id: 2, course_id: 1, title: "Sprint planning guide", url: "https://example.com/sprint", type: "link" },
  { id: 3, course_id: 2, title: "Metabolism study sheet", url: "https://example.com/metabolism", type: "link" },
];
let nextMockId = 100;

export async function getResources(courseId) {
  if (USE_MOCK.resources) {
    await delay();
    return mockResources.filter((r) => r.course_id === courseId);
  }
  return request(`/api/courses/${courseId}/resources`);
}

export async function addResource(courseId, userId, { title, url, type = "link" }) {
  if (USE_MOCK.resources) {
    await delay();
    const created = { id: nextMockId++, course_id: courseId, title, url, type };
    mockResources = [...mockResources, created];
    return created;
  }
  return request(`/api/courses/${courseId}/resources`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ user_id: userId, title, url, type }),
  });
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
  return request(`/api/users/${userId}/settings`);
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
  return request(`/api/users/${userId}/settings`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(settings),
  });
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