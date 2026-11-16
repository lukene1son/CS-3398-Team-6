import React, { useEffect, useState } from "react";
import { getUserAvatarUrl, peekUserAvatarUrl } from "../api";
import { avatarColor, getInitial } from "../avatarColors";

// Profile picture if the user has one, otherwise their initials on their color.
// Change refreshKey to reload the picture (e.g. right after uploading a new one).
// online: true adds a green "Active now" dot on the bottom-right edge (Study Partners).
export default function Avatar({ name, userId, color, hasAvatar = false, refreshKey, size = 28, online = false }) {
  const key = `${userId}:${refreshKey ?? ""}`;
  const [pic, setPic] = useState({ key: null, url: null });
  const [failedKey, setFailedKey] = useState(null); // the picture for this key wouldn't load

  useEffect(() => {
    if (!hasAvatar || userId == null) return;
    let cancelled = false;
    getUserAvatarUrl(userId)
      .then((url) => { if (!cancelled) setPic({ key, url }); })
      .catch(() => { /* keep the initial */ });
    return () => { cancelled = true; };
  }, [key, userId, hasAvatar]);

  const circle = { width: size, height: size, borderRadius: "50%", flexShrink: 0 };

  // The loaded picture, or (before the effect has run) one another Avatar already
  // downloaded, so switching chats doesn't flash every initial before the pictures.
  const url = pic.key === key ? pic.url : (hasAvatar && userId != null ? peekUserAvatarUrl(userId) : null);

  let picture;
  if (hasAvatar && url && failedKey !== key) {
    picture = (
      <img
        src={url}
        alt=""
        aria-hidden="true"
        onError={() => setFailedKey(key)}
        style={{ ...circle, objectFit: "cover", display: "inline-block" }}
      />
    );
  } else {
    picture = (
    <span
      aria-hidden="true"
      style={{
        ...circle,
        background: avatarColor(userId, color),
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.4),
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {getInitial(name)}
    </span>
    );
  }

  if (!online) return picture;
  // The dot is about a quarter of the picture (at least 8px), ringed in white so it stands
  // out on any picture or background.
  const dot = Math.max(8, Math.round(size * 0.28));
  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      {picture}
      <span
        title="Active now"
        style={{
          position: "absolute", right: -1, bottom: -1, width: dot, height: dot, borderRadius: "50%",
          background: "#22c55e", boxShadow: "0 0 0 2px #ffffff",
        }}
      />
    </span>
  );
}