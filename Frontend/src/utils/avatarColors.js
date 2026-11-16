// Must match AVATAR_COLORS in BuddyTech/Backend/src/routes/userSettings.js.
// All dark enough for a white letter to stay readable.
export const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#c2410c", "#15803d", "#0e7490", "#b91c1c", "#475569"];
export const AVATAR_COLOR_NAMES = ["Blue", "Purple", "Pink", "Orange", "Green", "Teal", "Red", "Slate"];

// The color the user picked, or a default based on their id so it's the same everywhere.
export function avatarColor(userId, chosen) {
  if (AVATAR_COLORS.includes(chosen)) return chosen;
  return AVATAR_COLORS[Math.abs(Number(userId) || 0) % AVATAR_COLORS.length];
}

// First letter of the first and last name: "Maya Chen" -> "MC", "Maya" -> "M".
export function getInitial(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}