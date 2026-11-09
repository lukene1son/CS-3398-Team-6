import React, { useEffect, useState } from "react";
import { getUserAvatarUrl } from "../api";
import { avatarColor, getInitial } from "../avatarColors";

// Profile picture if the user has one, otherwise their initials on their color.
// Change refreshKey to reload the picture (e.g. right after uploading a new one).
export default function Avatar({ name, userId, color, hasAvatar = false, refreshKey, size = 28 }) {
  const key = `${userId}:${refreshKey ?? ""}`;
  const [pic, setPic] = useState({ key: null, url: null });

  useEffect(() => {
    if (!hasAvatar || userId == null) return;
    let cancelled = false;
    getUserAvatarUrl(userId)
      .then((url) => { if (!cancelled) setPic({ key, url }); })
      .catch(() => { /* keep the initial */ });
    return () => { cancelled = true; };
  }, [key, userId, hasAvatar]);

  const circle = { width: size, height: size, borderRadius: "50%", flexShrink: 0 };

  if (hasAvatar && pic.key === key && pic.url) {
    return (
      <img
        src={pic.url}
        alt=""
        aria-hidden="true"
        onError={() => setPic({ key: null, url: null })}
        style={{ ...circle, objectFit: "cover", display: "inline-block" }}
      />
    );
  }

   return (
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