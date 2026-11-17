import React, { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { deleteSpace, getSpaceDeleteStatus, verifySpaceDelete } from "../../api";
import "./DeleteSpaceModal.css";

// The "Delete Space" popup (Settings > Spaces Settings).
// Left card: pick one of the spaces you own and see what's in it.
// Right card: confirm your password, then Delete Space turns red and can be clicked.
// 3 wrong passwords in a row lock deleting spaces for 48 hours. The SERVER counts the tries
// and keeps the lock (spaces.js verify-delete), so closing this window doesn't reset them,
// and the delete itself needs the verify token a right password returns.
//
// Props:
//   spaces     the courses you're the teacher of (from getMyCourses, role === "teacher")
//   onClose()
//   onDeleted(space)  after a space was deleted

const MAX_TRIES = 3;
const LOCK_HOURS = 48;

const formatLock = (ms) => new Date(ms).toLocaleString(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

export default function DeleteSpaceModal({ spaces, onClose, onDeleted }) {
  const [selectedId, setSelectedId] = useState(spaces[0]?.id ?? null);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(null);       // { hasPassword, triesLeft, lockedUntil } from the server
  const [verifyToken, setVerifyToken] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const passwordRef = useRef(null);

  const space = spaces.find((s) => s.id === selectedId) || spaces[0];
  const busy = verifying || deleting;
  // The server only sends lockedUntil while the lock is on (null once it has ended),
  // so there's no need to compare clocks here.
  const locked = Boolean(status?.lockedUntil);
  const verified = Boolean(verifyToken);

  // Ask the server where this account stands (locked? tries left? has a password at all?).
  useEffect(() => {
    let cancelled = false;
    getSpaceDeleteStatus()
      .then((data) => { if (!cancelled) setStatus(data); })
      .catch((err) => { if (!cancelled) setError(`Could not check your account: ${err.message}`); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (status && !locked) passwordRef.current?.focus(); }, [status, locked]);

  // Esc closes, except while a request is running.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // A verify token is for ONE space: picking another one means confirming again.
  function pickSpace(id) {
    setSelectedId(id);
    setVerifyToken(null);
    setPassword("");
    setError("");
  }

  async function handleVerify(e) {
    e.preventDefault();
    if (!space || !password || busy || locked || verified) return;
    setVerifying(true);
    setError("");
    try {
      const { verifyToken: token } = await verifySpaceDelete(space.id, password);
      setVerifyToken(token);
      setStatus((prev) => ({ ...prev, triesLeft: MAX_TRIES, lockedUntil: null }));
    } catch (err) {
      const data = err.data || {};
      if (err.status === 403 && typeof data.triesLeft === "number") {
        setStatus((prev) => ({ ...prev, triesLeft: data.triesLeft }));
      } else if (err.status === 423 && data.lockedUntil) {
        setStatus((prev) => ({ ...prev, triesLeft: 0, lockedUntil: data.lockedUntil }));
      } else if (err.status === 409 && data.code === "no_password") {
        setStatus((prev) => ({ ...prev, hasPassword: false }));
      } else {
        setError(`Could not check your password: ${err.message}`);
      }
    } finally {
      setPassword("");
      setVerifying(false);
    }
  }

  async function handleDelete() {
    if (!space || !verified || busy) return;
    setDeleting(true);
    setError("");
    try {
      await deleteSpace(space.id, verifyToken);
      onDeleted(space);
    } catch (err) {
      // The token lasts a few minutes; after that, confirm the password again.
      if (err.status === 403 && err.data?.code === "verify_required") {
        setVerifyToken(null);
        setError("Your confirmation expired. Please enter your password again.");
      } else {
        setError(`Could not delete the space: ${err.message}`);
      }
      setDeleting(false);
    }
  }

  if (!space) return null;
  const groupsAndChannels = Number(space.channel_count || 0) + Number(space.study_group_count || 0);
  const triesUsed = status ? MAX_TRIES - status.triesLeft : 0;

  // The one status line under the password field.
  let statusLine = null;
  if (status && !status.hasPassword) {
    statusLine = { kind: "lock", text: "Your account signs in with Google and has no password. Set a password to delete spaces." };
  } else if (locked) {
    statusLine = { kind: "lock", text: <>Too many wrong passwords. Deleting spaces is locked until <strong>{formatLock(status.lockedUntil)}</strong>.</> };
  } else if (verified) {
    statusLine = { kind: "ok", text: "Password confirmed. You can now delete this space." };
  } else if (status && triesUsed > 0) {
    statusLine = {
      kind: "bad",
      text: (
        <>
          Incorrect password. {status.triesLeft} {status.triesLeft === 1 ? "try" : "tries"} left before a {LOCK_HOURS}-hour lock.
          <span className="dsm-dots" aria-hidden="true">
            {Array.from({ length: MAX_TRIES }, (_, i) => <i key={i} className={i < triesUsed ? "used" : ""} />)}
          </span>
        </>
      ),
    };
  }
  const canType = Boolean(status?.hasPassword) && !locked && !verified && !busy;

  return (
    <div className="dsm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="dsm" role="dialog" aria-modal="true" aria-labelledby="dsm-title">
        <div className="dsm-head">
          <div className="dsm-icon" aria-hidden="true"><Trash2 size={20} /></div>
          <div>
            <h2 id="dsm-title">Delete Space</h2>
            <p>Pick a space you teach, confirm your password, then delete.</p>
          </div>
          <button type="button" className="dsm-close" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="dsm-cols">
          <div className="dsm-card">
            <h3>Space</h3>
            {spaces.length > 1 ? (
              <div className="dsm-picker">
                <label htmlFor="dsm-space">Spaces you teach</label>
                <select id="dsm-space" value={space.id} onChange={(e) => pickSpace(Number(e.target.value))} disabled={busy}>
                  {spaces.map((s) => <option key={s.id} value={s.id}>{s.course_code} · {s.course_name}</option>)}
                </select>
              </div>
            ) : (
              <p className="dsm-name">{space.course_code} · {space.course_name}</p>
            )}
            {space.join_code && (
              <div className="dsm-code-row"><span>Course code</span><span className="dsm-code">{space.join_code}</span></div>
            )}
            <div className="dsm-stats">
              <div className="dsm-stat"><b>{space.member_count ?? 0}</b><span>Members</span></div>
              <div className="dsm-stat"><b>{space.task_count ?? 0}</b><span>Tasks</span></div>
              <div className="dsm-stat"><b>{space.file_count ?? 0}</b><span>Files</span></div>
              <div className="dsm-stat"><b>{groupsAndChannels}</b><span>Channels &amp; groups</span></div>
            </div>
            {(space.professor || space.university) && (
              <p className="dsm-meta">{[space.professor, space.university].filter(Boolean).join(" · ")}</p>
            )}
          </div>

          <div className="dsm-card">
            <h3>Confirm with your password</h3>
            <p className="dsm-warning">
              <strong>Are you sure you want to delete this course and all of its contents?</strong>
              <span>This will completely remove any files, tasks, and users associated with the course.</span>
            </p>

            <div>
              <label className="dsm-field-label" htmlFor="dsm-password">Your password</label>
              <form className="dsm-pw-row" onSubmit={handleVerify}>
                <input
                  ref={passwordRef}
                  id="dsm-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!canType}
                />
                <button type="submit" className="dsm-verify" disabled={!canType || !password}>
                  {verifying ? "Checking..." : "Verify password"}
                </button>
              </form>
            </div>

            {statusLine && <p className={`dsm-status ${statusLine.kind}`} role="status">{statusLine.text}</p>}
            {error && <p className="dsm-error" role="alert">{error}</p>}

            <div className="dsm-actions">
              <button type="button" className="dsm-delete" onClick={handleDelete} disabled={!verified || busy}>
                {deleting ? "Deleting..." : "Delete Space"}
              </button>
              <button type="button" className="dsm-back" onClick={onClose} disabled={busy}>Back</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
