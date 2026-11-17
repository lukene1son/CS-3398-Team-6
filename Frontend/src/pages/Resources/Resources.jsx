import React, { useState, useEffect, useRef } from "react";
import { BookOpen, CheckSquare, ChevronDown, FileText, Folder, Link2, Plus } from "lucide-react";
import {
  getMyCourses, getResources, addResourceLink, uploadResourceFile, addAssignmentLink, uploadAssignmentFile,
  deleteResource, downloadResourceFile, viewResourceFile, VIEWABLE_TYPES,
} from "../../api";
import { courseAccent } from "../../utils/courseColors";
import { onSocketEvent } from "../../socket";
import "./Resources.css";

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
const UPLOAD_ROLES = ["teacher", "ta"]; // same as the backend: TAs add, only teachers delete

function formatSize(bytes) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
const shortDate = (value) => new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The course's resources split in two: a folder for each assignment that has files or
// links (soonest due first), and everything else (the course's own resources).
function groupResources(items) {
  const folders = new Map();
  const general = [];
  for (const r of items) {
    if (!r.assignment_id) { general.push(r); continue; }
    if (!folders.has(r.assignment_id)) {
      folders.set(r.assignment_id, { id: r.assignment_id, title: r.assignment_title, due: r.assignment_due_date, items: [] });
    }
    folders.get(r.assignment_id).items.push(r);
  }
  const sorted = [...folders.values()].sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  return { folders: sorted, general };
}

// Resources for the course picked in the chips. Everyone in the course can view and
// download; teachers and TAs see the add forms; only teachers see Delete.
// (The backend enforces the same rules, so hiding them is just for a clean UI.)
export default function Resources() {
  const [courses, setCourses] = useState([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [itemsByCourse, setItemsByCourse] = useState({});
  const [openFolders, setOpenFolders] = useState({}); // assignment id -> open? (unset: closed)
  const [formFolder, setFormFolder] = useState(null); // assignment id whose "Add to this folder" form is open
  const [mode, setMode] = useState("link"); // "link" | "file"
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null); // resource being downloaded/deleted
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  // The picked course, or the first one if none is picked (or the picked one was deleted).
  const courseId = courses.some((c) => c.id === selectedCourseId) ? selectedCourseId : courses[0]?.id;
  const course = courses.find((c) => c.id === courseId);
  const canAdd = UPLOAD_ROLES.includes(course?.role);
  const canDelete = course?.role === "teacher";
  const items = courseId ? itemsByCourse[courseId] : undefined;
  const { folders, general } = groupResources(items ?? []);
  const accent = courseAccent(courses, courseId);

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

  // A space you're in was deleted (spaces.js sends "course-deleted" to every member):
  // take it off the course list and forget its resources. If it was the one on screen,
  // the first remaining course shows instead (see courseId above).
  useEffect(() => onSocketEvent("course-deleted", ({ courseId: deletedId }) => {
    setCourses((prev) => prev.filter((c) => c.id !== deletedId));
    setItemsByCourse((prev) => {
      const next = { ...prev };
      delete next[deletedId];
      return next;
    });
    setFormFolder(null);
  }), []);

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
    setFormFolder(null);
    resetForm();
    setError("");
  }

  function resetForm() {
    setTitle("");
    setUrl("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // assignmentId: add to that assignment's folder; null: to the course's own resources.
  async function handleAdd(e, assignmentId) {
    e.preventDefault();
    if (!courseId || saving) return;
    if (mode === "link" && (!title.trim() || !url.trim())) return setError("Enter a title and a link.");
    if (mode === "file" && !file) return setError("Choose a file to upload.");
    if (mode === "file" && file.size > MAX_FILE_MB * 1024 * 1024) return setError(`That file is too large (${MAX_FILE_MB} MB max).`);

    setSaving(true);
    try {
      const link = { title: title.trim(), url: url.trim() };
      const created = assignmentId
        ? mode === "link" ? await addAssignmentLink(assignmentId, link) : await uploadAssignmentFile(assignmentId, file, title.trim())
        : mode === "link" ? await addResourceLink(courseId, link) : await uploadResourceFile(courseId, file, title.trim());
      setItemsByCourse((prev) => ({ ...prev, [courseId]: [created, ...(prev[courseId] ?? [])] }));
      resetForm();
      setFormFolder(null);
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

  function openFolderForm(id) {
    resetForm();
    setError("");
    setFormFolder(id);
  }

  const renderRow = (r) => (
    <li key={r.id} className="res-row">
      <span className={r.type === "file" ? "res-ico" : "res-ico link"} aria-hidden="true">
        {r.type === "file" ? <FileText size={16} /> : <Link2 size={16} />}
      </span>
      <div className="res-row-text">
        <strong>
          {r.type === "file" ? r.title : <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>}
        </strong>
        <span>
          {r.type === "file" ? `${r.file_name} · ${formatSize(r.size_bytes)}` : r.url}
          {` · Added ${shortDate(r.created_at)} by ${r.uploaded_by_name}`}
        </span>
      </div>
      <div className="res-actions">
        {r.type === "file" && VIEWABLE_TYPES.includes(r.mime_type) && (
          <button type="button" className="res-btn" onClick={() => handleView(r)} disabled={busyId === r.id}>View</button>
        )}
        {r.type === "file" && (
          <button type="button" className="res-btn primary" onClick={() => handleDownload(r)} disabled={busyId === r.id}>
            {busyId === r.id ? "..." : "Download"}
          </button>
        )}
        {canDelete && (
          <button type="button" className="res-btn danger" onClick={() => handleDelete(r)} disabled={busyId === r.id}>Delete</button>
        )}
      </div>
    </li>
  );

  // The add form: to a folder (assignmentId) or to the course's own resources (null).
  const renderAddForm = (assignmentId) => (
    <form className="res-add" onSubmit={(e) => handleAdd(e, assignmentId)}>
      <div className="res-add-tabs">
        <button type="button" className={mode === "link" ? "res-tab on" : "res-tab"} onClick={() => setMode("link")}>Add link</button>
        <button type="button" className={mode === "file" ? "res-tab on" : "res-tab"} onClick={() => setMode("file")}>Upload file</button>
        {assignmentId && <button type="button" className="res-tab" onClick={() => setFormFolder(null)}>Cancel</button>}
      </div>
      <div className="res-add-fields">
        <input
          className="res-input"
          placeholder={mode === "file" ? "Title (defaults to file name)" : "Title"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          aria-label="Title"
        />
        {mode === "link" ? (
          <input className="res-input wide" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link" />
        ) : (
          <input
            ref={fileInputRef}
            type="file"
            className="res-input wide resource-file-input"
            accept={ACCEPTED_FILES}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-label="File"
          />
        )}
        <button type="submit" disabled={saving} className="res-submit">
          {saving ? (mode === "file" ? "Uploading..." : "Adding...") : mode === "file" ? "Upload" : "Add"}
        </button>
      </div>
      {mode === "file" && (
        <p className="res-hint">PDF, image, text, Office, zip, or code files (.js, .py, .cpp, .sql, ...), up to {MAX_FILE_MB} MB.</p>
      )}
    </form>
  );

  return (
    <div className="res-page">
      <h1>Resources</h1>
      <p className="res-lead">Shared links and study material for each of your courses.</p>

      {error && <div className="res-error" role="alert">{error}</div>}

      {coursesLoaded && courses.length === 0 ? (
        <p className="res-empty">You aren't in any courses yet.</p>
      ) : (
        <>
          <div className="res-chips" role="group" aria-label="Course">
            {courses.map((c) => {
              const color = courseAccent(courses, c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  className="res-chip"
                  style={{ "--c": color }}
                  aria-pressed={c.id === courseId}
                  onClick={() => changeCourse(c.id)}
                >
                  <b style={{ background: color }}>{c.course_code.split(" ")[0]}</b>
                  {c.course_code} · {c.course_name}
                </button>
              );
            })}
          </div>

          {items === undefined ? (
            <p className="res-empty">Loading...</p>
          ) : (
            <>
              <section className="res-section" aria-labelledby="res-assignments">
                <div className="res-section-head">
                  <h2 id="res-assignments"><CheckSquare size={18} color="#2563eb" /> Assignments</h2>
                  <span className="res-count">{plural(folders.length, "folder")}</span>
                  <span className="res-section-hint">Files your teachers attached to each assignment</span>
                </div>
                {folders.length === 0 ? (
                  <p className="res-empty">No assignment files yet. Files added to an assignment show up here in their own folder.</p>
                ) : (
                  <div className="res-folders">
                    {folders.map((folder) => {
                      const open = Boolean(openFolders[folder.id]); // every folder starts closed
                      return (
                        <div key={folder.id} className={open ? "res-folder open" : "res-folder"} style={{ "--c": accent }}>
                          <button
                            type="button"
                            className="res-folder-toggle"
                            aria-expanded={open}
                            onClick={() => setOpenFolders((prev) => ({ ...prev, [folder.id]: !open }))}
                          >
                            <span className="res-folder-ico" aria-hidden="true"><Folder size={20} /></span>
                            <span className="res-folder-name">
                              <strong>{folder.title}</strong>
                              <span>{plural(folder.items.length, "item")}</span>
                            </span>
                            <ChevronDown size={18} className="res-chev" aria-hidden="true" />
                          </button>
                          {/* grid 0fr -> 1fr: opens to its real height without measuring it */}
                          <div className="res-folder-body">
                            <div className="res-folder-inner">
                              <ul className="res-folder-items">
                                {folder.items.map(renderRow)}
                              </ul>
                              {canAdd && (
                                <div className="res-folder-add">
                                  {formFolder === folder.id ? renderAddForm(folder.id) : (
                                    <button type="button" className="res-add-to" onClick={() => openFolderForm(folder.id)}>
                                      <Plus size={13} strokeWidth={2.6} /> Add to this folder
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="res-section" aria-labelledby="res-course">
                <div className="res-section-head">
                  <h2 id="res-course"><BookOpen size={18} color="#2563eb" /> Course resources</h2>
                  <span className="res-count">{plural(general.length, "item")}</span>
                </div>
                {general.length === 0 ? (
                  <p className="res-empty">
                    {canAdd ? "No course resources yet. Add the first one below." : "Your teacher hasn't shared any resources for this course yet."}
                  </p>
                ) : (
                  <ul className="res-rows">{general.map(renderRow)}</ul>
                )}
                {/* One form at a time: hidden while a folder's form is open (they share fields). */}
                {canAdd && formFolder === null && renderAddForm(null)}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
