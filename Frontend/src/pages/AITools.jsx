import React, { useState } from "react";
import { askAI, USE_MOCK } from "../api";

const TOOLS = [
  {
    id: "summarize",
    label: "Summarize notes",
    hint: "Paste your notes and get a short summary.",
    placeholder: "Paste your lecture notes or chat discussion here...",
    example: "Today we covered the Scrum framework: sprints are time-boxed iterations, the product backlog is prioritized by the product owner, and the daily standup keeps the team in sync.",
  },
  {
    id: "quiz",
    label: "Quiz me",
    hint: "Enter a topic and get practice questions.",
    placeholder: "e.g. Agile vs Waterfall, cell respiration, binary trees...",
    example: "Agile vs Waterfall software development",
  },
  {
    id: "explain",
    label: "Explain a concept",
    hint: "Ask about anything you're stuck on.",
    placeholder: "e.g. Explain how REST APIs work like I'm new to this",
    example: "Explain how a frontend talks to a backend REST API.",
  },
];

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem" };
const smallLink = { background: "none", border: "none", color: "#2563eb", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", padding: 0 };

export default function AITools({ initialTool }) {
  const startTool = TOOLS.some((t) => t.id === initialTool) ? initialTool : TOOLS[0].id;

  const [toolId, setToolId] = useState(startTool);
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const tool = TOOLS.find((t) => t.id === toolId);

  async function handleRun(e) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError("");
    setReply("");
    setCopied(false);
    try {
      const data = await askAI({ tool: toolId, prompt: prompt.trim() });
      setReply(data.reply);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reply);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; ignore */
    }
  }

  function handleKeyDown(e) {
    // Ctrl/Cmd + Enter runs the tool
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleRun(e);
  }

  return (
    <div style={{ maxWidth: "800px" }}>
      <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.25rem" }}>AI Tools</h1>
      <p style={{ color: "#64748b", marginBottom: "1rem" }}>
        Study helpers powered by AI.
        {USE_MOCK.ai && " (Demo mode: responses are placeholders until the AI endpoint is ready.)"}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setToolId(t.id)}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "999px",
              border: "1px solid #c7d2fe",
              cursor: "pointer",
              fontWeight: toolId === t.id ? 600 : 400,
              background: toolId === t.id ? "#e0e7ff" : "#fff",
              color: toolId === t.id ? "#4338ca" : "#475569",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleRun} style={{ ...card, marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>{tool.hint}</p>
          <button type="button" style={smallLink} onClick={() => setPrompt(tool.example)}>Use an example</button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tool.placeholder}
          rows={5}
          style={{ width: "100%", padding: "0.7rem", border: "1px solid #cbd5e1", borderRadius: "8px", outline: "none", resize: "vertical", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.75rem" }}>
          <button type="submit" disabled={loading || !prompt.trim()} style={{ padding: "0.7rem 1.4rem", background: loading || !prompt.trim() ? "#93c5fd" : "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: loading || !prompt.trim() ? "default" : "pointer" }}>
            {loading ? "Thinking..." : "Run"}
          </button>
          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>or press Ctrl + Enter</span>
        </div>
      </form>

      {error && <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "0.5rem 1rem", borderRadius: "8px" }}>{error}</div>}
      {reply && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <strong style={{ fontSize: "0.85rem", color: "#475569" }}>{tool.label}</strong>
            <button type="button" style={smallLink} onClick={handleCopy}>{copied ? "Copied ✓" : "Copy"}</button>
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{reply}</div>
        </div>
      )}
    </div>
  );
}