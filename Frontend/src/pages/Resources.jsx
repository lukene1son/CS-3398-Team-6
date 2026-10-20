import React, { useState, useEffect } from "react";
import { getUserCourses, getResources, addResource, USE_MOCK } from "../api";

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem" };
const input = { padding: "0.6rem 0.8rem", border: "1px solid #cbd5e1", borderRadius: "8px", outline: "none" };

export default function Resources({ user }) {
  const userId = user?.id ?? 1;

  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [itemsByCourse, setItemsByCourse] = useState({});
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const courseId = selectedCourseId ?? courses[0]?.id;
  const items = courseId ? itemsByCourse[courseId] : undefined;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getUserCourses(userId);
        if (!cancelled) setCourses(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

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

  async function handleAdd(e) {
    e.preventDefault();
    if (!title.trim() || !url.trim() || !courseId) return;
    try {
      const created = await addResource(courseId, userId, { title: title.trim(), url: url.trim() });
      setItemsByCourse((prev) => ({ ...prev, [courseId]: [...(prev[courseId] ?? []), created] }));
      setTitle("");
      setUrl("");
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ maxWidth: "800px" }}>
      <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.25rem" }}>Resources</h1>
      <p style={{ color: "#64748b", marginBottom: "1rem" }}>
        Shared links and study material for each of your courses.
        {USE_MOCK.resources && " (Sample data until the resources API is ready.)"}
      </p>

      {error && <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "0.5rem 1rem", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.85rem" }}>{error}</div>}

      <select
        value={courseId ?? ""}
        onChange={(e) => setSelectedCourseId(Number(e.target.value))}
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
          <p style={{ color: "#94a3b8" }}>No resources yet. Add the first one below.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {items.map((r) => (
              <li key={r.id}>
                <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>{r.title}</a>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8", overflowWrap: "anywhere" }}>{r.url}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={handleAdd} style={{ ...card, display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input style={{ ...input, flex: 1, minWidth: "160px" }} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input style={{ ...input, flex: 2, minWidth: "200px" }} placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="submit" style={{ padding: "0.6rem 1.2rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
          Add
        </button>
      </form>
    </div>
  );
}