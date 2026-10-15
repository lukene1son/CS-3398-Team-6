import React, { useState } from "react";
import { askAI, USE_MOCK } from "../api";

const TOOLS = [
  { id: "summarize", label: "Summarize notes", hint: "Paste your notes and get a short summary." },
  { id: "quiz", label: "Quiz me", hint: "Enter a topic and get practice questions." },
  { id: "explain", label: "Explain a concept", hint: "Ask about anything you're stuck on." },
];

const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.25rem" };

export default function AITools() {
  const [toolId, setToolId] = useState(TOOLS[0].id);
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tool = TOOLS.find((t) => t.id === toolId);

  async function handleRun(e) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError("");
    setReply("");
    try {
      const data = await askAI({ tool: toolId, prompt: prompt.trim() });
      setReply(data.reply);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
        <p style={{ marginTop: 0, color: "#64748b", fontSize: "0.9rem" }}>{tool.hint}</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          style={{ width: "100%", padding: "0.7rem", border: "1px solid #cbd5e1", borderRadius: "8px", outline: "none", resize: "vertical", fontFamily: "inherit" }}
        />
        <button type="submit" disabled={loading} style={{ marginTop: "0.75rem", padding: "0.7rem 1.4rem", background: loading ? "#93c5fd" : "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
          {loading ? "Thinking..." : "Run"}
        </button>
      </form>

      {error && <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "0.5rem 1rem", borderRadius: "8px" }}>{error}</div>}
      {reply && <div style={{ ...card, whiteSpace: "pre-wrap" }}>{reply}</div>}
    </div>
  );
}