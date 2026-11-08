import React, { useState, useEffect, useRef } from "react";
import { getMyCourses, getResources, addResourceLink, uploadResourceFile, deleteResource, downloadResourceFile, viewResourceFile, VIEWABLE_TYPES } from "../api";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem" };
const input = { padding: "0.6rem 0.8rem", border: "1px solid #cbd5e1", borderRadius: "8px", outline: "none" };
const primaryButton = { padding: "0.6rem 1.2rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" };
const smallButton = { padding: "0.35rem 0.75rem", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "6px", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" };
const tabButton = (active) => ({ ...smallButton, background: active ? "#2563eb" : "#f1f5f9", color: active ? "#fff" : "#475569", borderColor: active ? "#2563eb" : "#cbd5e1" });
const smallPrimaryButton = { ...smallButton, background: "#2563eb", color: "#fff", border: "1px solid #2563eb" };
// Every box and the submit button in the teacher's add form share this size, so
// nothing jumps when switching between "Add link" and "Upload file".
const FIELD_HEIGHT = "2.5rem";
const fieldInput = { ...input, height: FIELD_HEIGHT, boxSizing: "border-box" };
const submitButton = { ...primaryButton, height: FIELD_HEIGHT, width: "8rem", flexShrink: 0, whiteSpace: "nowrap" };

// What the file picker offers. Code files are shown as plain text by View and keep
// their extension when downloaded (the backend's CODE_EXTENSIONS must match this list).
const ACCEPTED_FILES = [
  ".pdf", ".txt", ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".zip",
  ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hh", ".cs", ".java", ".kt", ".scala",
  ".py", ".ipynb", ".r", ".rb", ".go", ".rs", ".swift", ".php", ".pl", ".lua", ".hs",
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".html", ".css", ".scss",
  ".json", ".xml", ".yml", ".yaml", ".toml", ".md", ".csv", ".sql", ".sh",
  ".asm", ".s", ".v", ".vhd", ".m",
].join(",");
const MAX_FILE_MB = 20; // same limit as the backend (routes/resources.js)

function formatSize(bytes) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Resources for the course picked in the dropdown. Everyone in the course can view
// and download; only the course's teachers see the add form and Delete buttons.
// (The backend enforces the same rules, so hiding the form is just for a clean UI.)
export default function Resources() {
  const [courses, setCourses] = useState([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [itemsByCourse, setItemsByCourse] = useState({});
  const [mode, setMode] = useState("link"); // "link" | "file"
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null); // resource being downloaded/deleted
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const courseId = selectedCourseId ?? courses[0]?.id;
  const course = courses.find((c) => c.id === courseId);
  const isTeacher = course?.role === "teacher";
  const items = courseId ? itemsByCourse[courseId] : undefined;

  // Your courses, each with your role in it (from GET /api/me/courses).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getMyCourses();
        if (!cancelled) setCourses(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setCoursesLoaded(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // The selected course's resources, newest first.
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await getResources(courseId);
        if (!cancelled) setItemsByCourse((prev) => ({ ...prev, [courseId]: data }));
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [courseId]);

  function changeCourse(id) {
    setSelectedCourseId(id);
    setError("");
  }

  function resetForm() {
    setTitle("");
    setUrl("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!courseId || saving) return;
    if (mode === "link" && (!title.trim() || !url.trim())) return setError("Enter a title and a link.");
    if (mode === "file" && !file) return setError("Choose a file to upload.");
    if (mode === "file" && file.size > MAX_FILE_MB * 1024 * 1024) return setError(`That file is too large (${MAX_FILE_MB} MB max).`);

    setSaving(true);
    try {
      const created = mode === "link"
        ? await addResourceLink(courseId, { title: title.trim(), url: url.trim() })
        : await uploadResourceFile(courseId, file, title.trim());
      setItemsByCourse((prev) => ({ ...prev, [courseId]: [created, ...(prev[courseId] ?? [])] }));
      resetForm();
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload(resource) {
    setBusyId(resource.id);
    try {
      await downloadResourceFile(resource);
      setError("");
    } catch (err) {
      setError(`Couldn't download "${resource.title}": ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  // Not async on purpose: the tab must open during the click, before anything awaits.
  function handleView(resource) {
    const tab = window.open("", "_blank");
    if (!tab) {
      setError("Your browser blocked the new tab. Allow pop-ups for this site, or use Download.");
      return;
    }
    tab.opener = null; // the new tab can't reach back into this page
    tab.document.title = resource.title;
    tab.document.body.textContent = "Loading...";
    setBusyId(resource.id);
    viewResourceFile(resource, tab)
      .then(() => setError(""))
      .catch((err) => {
        tab.close();
        setError(`Couldn't open "${resource.title}": ${err.message}`);
      })
      .finally(() => setBusyId(null));
  }

  async function handleDelete(resource) {
    if (!window.confirm(`Delete "${resource.title}" for everyone in this course?`)) return;
    setBusyId(resource.id);
    try {
      await deleteResource(resource.id);
      setItemsByCourse((prev) => ({ ...prev, [courseId]: (prev[courseId] ?? []).filter((r) => r.id !== resource.id) }));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ maxWidth: "800px" }}>
      <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.25rem" }}>Resources</h1>
      <p style={{ color: "#64748b", marginBottom: "1rem" }}>
        Shared links and study material for each of your courses.
      </p>

      {error && <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "0.5rem 1rem", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.85rem" }}>{error}</div>}

      {coursesLoaded && courses.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>You aren't in any courses yet.</p>
      ) : (
        <>
          <select
            value={courseId ?? ""}
            onChange={(e) => changeCourse(Number(e.target.value))}
            style={{ ...input, marginBottom: "1rem", background: "#fff" }}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.course_code} {c.course_name}</option>
            ))}
          </select>

          <div style={{ ...card, marginBottom: "1rem" }}>
            {items === undefined ? (
              <p style={{ color: "#94a3b8" }}>Loading...</p>
            ) : items.length === 0 ? (
              <p style={{ color: "#94a3b8" }}>
                {isTeacher ? "No resources yet. Add the first one below." : "Your teacher hasn't shared any resources for this course yet."}
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {items.map((r) => (
                  <li key={r.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                    <div style={{ minWidth: 0 }}>
                      {r.type === "file" ? (
                        <span style={{ color: "#0f172a", fontWeight: 600 }}>📄 {r.title}</span>
                      ) : (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>🔗 {r.title}</a>
                      )}
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8", overflowWrap: "anywhere" }}>
                        {r.type === "file" ? `${r.file_name} · ${formatSize(r.size_bytes)}` : r.url}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        Added {new Date(r.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                      {r.type === "file" && VIEWABLE_TYPES.includes(r.mime_type) && (
                        <button onClick={() => handleView(r)} disabled={busyId === r.id} style={smallButton}>
                          View
                        </button>
                      )}
                      {r.type === "file" && (
                        <button onClick={() => handleDownload(r)} disabled={busyId === r.id} style={smallPrimaryButton}>
                          {busyId === r.id ? "..." : "Download"}
                        </button>
                      )}
                      {isTeacher && (
                        <button onClick={() => handleDelete(r)} disabled={busyId === r.id} style={{ ...smallButton, color: "#dc2626" }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isTeacher && (
            <form onSubmit={handleAdd} style={{ ...card, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button type="button" onClick={() => setMode("link")} style={tabButton(mode === "link")}>Add link</button>
                <button type="button" onClick={() => setMode("file")} style={tabButton(mode === "file")}>Upload file</button>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <input
                  style={{ ...fieldInput, flex: "1 1 0", minWidth: "160px" }}
                  placeholder={mode === "file" ? "Title (defaults to file name)" : "Title"}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                />
                {mode === "link" ? (
                  <input style={{ ...input, flex: 2, minWidth: "200px" }} placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
                ) : (
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="resource-file-input"
                    accept={ACCEPTED_FILES}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    // Top padding = (box height - 2px border - 1.75rem button) / 2, which centers the
                    // Choose File button (its height is set in index.css).
                    style={{ ...fieldInput, flex: "2 1 0", minWidth: "200px", background: "#fff", padding: `calc((${FIELD_HEIGHT} - 2px - 1.75rem) / 2) 0.8rem 0` }}
                  />
                )}
                <button type="submit" disabled={saving} style={submitButton}>
                  {saving ? (mode === "file" ? "Uploading..." : "Adding...") : mode === "file" ? "Upload" : "Add"}
                </button>
              </div>
              {mode === "file" && (
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#94a3b8" }}>
                  PDF, image, text, Office, zip, or code files (.js, .py, .cpp, .sql, ...), up to {MAX_FILE_MB} MB.
                </p>
              )}
            </form>
          )}
        </>
      )}
    </div>
  );
}