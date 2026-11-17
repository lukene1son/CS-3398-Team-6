import React, { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { deleteSpace } from "../../api";
import "./DeleteSpaceModal.css";

// The "Delete Space" popup on the Settings page.
// Left card: pick one of the spaces you own and see what's in it. Right card: tick the
// box to unlock Delete. Only the space's teacher can delete it (the backend checks too).
//
// Props:
//   spaces     the courses you're the teacher of (from getMyCourses, role === "teacher")
//   onClose()
//   onDeleted(space)  after a space was deleted
export default function DeleteSpaceModal({ spaces, onClose, onDeleted }) {
  const [selectedId, setSelectedId] = useState(spaces[0]?.id ?? null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const checkboxRef = useRef(null);

  const space = spaces.find((s) => s.id === selectedId) || spaces[0];

  useEffect(() => { checkboxRef.current?.focus(); }, []);

  // Esc closes, except while the delete is running.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // The confirmation is for ONE space: picking another one un-ticks the box.
  function pickSpace(id) {
    setSelectedId(id);
    setConfirmed(false);
    setError("");
  }

  async function handleDelete() {
    if (!space || !confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteSpace(space.id);
      onDeleted(space);
    } catch (err) {
      setError(`Could not delete the space: ${err.message}`);
      setBusy(false);
    }
  }

  if (!space) return null;
  const groupsAndChannels = Number(space.channel_count || 0) + Number(space.study_group_count || 0);

  return (
    <div className="dsm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="dsm" role="dialog" aria-modal="true" aria-labelledby="dsm-title">
        <div className="dsm-head">
          <div className="dsm-icon" aria-hidden="true"><Trash2 size={20} /></div>
          <div>
            <h2 id="dsm-title">Delete Space</h2>
            <p>Pick a space you teach, review it, then confirm.</p>
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
            <h3>Confirm</h3>
            <label className="dsm-confirm" htmlFor="dsm-confirm">
              <input
                ref={checkboxRef}
                id="dsm-confirm"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={busy}
              />
              <div>
                <strong>Are you sure you want to delete this course and all of its contents?</strong>
                <span>This will completely remove any files, tasks, and users associated with the course. Confirm?</span>
              </div>
            </label>
            {error && <p className="dsm-error" role="alert">{error}</p>}
            <div className="dsm-actions">
              <button type="button" className="dsm-delete" onClick={handleDelete} disabled={!confirmed || busy}>
                {busy ? "Deleting..." : "Delete"}
              </button>
              <button type="button" className="dsm-back" onClick={onClose} disabled={busy}>Back</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
