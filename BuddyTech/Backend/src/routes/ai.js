const express = require("express");

const router = express.Router();

const ALLOWED_TOOLS = new Set(["summarize", "quiz", "explain"]);
const MAX_PROMPT_CHARS = 12000;
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

function instructionFor(tool) {
    switch (tool) {
        case "summarize":
            return [
                "You are BuddyTech's study-notes summarizer.",
                "Summarize the student's notes accurately and concisely.",
                "Use short headings and bullet points.",
                "Preserve important definitions, formulas, names, and cause/effect relationships.",
                "End with a short Key takeaways section.",
                "Do not invent facts that are not supported by the student's notes.",
                "Return clean plain text only. Do not use Markdown symbols, asterisks, hashtags, or LaTeX."
            ].join(" ");
        case "quiz":
            return [
                "You are BuddyTech's study quiz generator.",
                "Create exactly 5 useful practice questions from the student's topic or notes.",
                "Mix conceptual recall and application when appropriate.",
                "List all 5 questions first without answers.",
                "Then add an Answer key section with concise explanations.",
                "Do not introduce unrelated material.",
                "Return clean plain text only. Do not use Markdown symbols, asterisks, hashtags, or LaTeX."
            ].join(" ");
        case "explain":
            return [
                "You are BuddyTech's college-level tutor.",
                "Explain the requested concept clearly and accurately.",
                "Start with a plain-language explanation, then add the technical explanation.",
                "Include one concrete example or analogy when useful.",
                "End with a one-sentence key takeaway.",
                "If the prompt is ambiguous, state the most reasonable interpretation instead of inventing details.",
                "Return clean plain text only. Do not use Markdown symbols, asterisks, hashtags, or LaTeX."
            ].join(" ");
        default:
            return "";
    }
}

router.post("/chat", async (req, res) => {
    const { tool, prompt } = req.body || {};

    if (!ALLOWED_TOOLS.has(tool)) {
        return res.status(400).json({
            error: "tool must be one of: summarize, quiz, explain"
        });
    }

    if (typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ error: "prompt is required" });
    }

    const cleanPrompt = prompt.trim();
    if (cleanPrompt.length > MAX_PROMPT_CHARS) {
        return res.status(400).json({
            error: `prompt must be ${MAX_PROMPT_CHARS.toLocaleString()} characters or fewer`
        });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(503).json({
            error: "AI service is not configured yet"
        });
    }

    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: instructionFor(tool) }]
                },
                contents: [
                    {
                        role: "user",
                        parts: [{ text: cleanPrompt }]
                    }
                ],
                generationConfig: {
                    temperature: tool === "summarize" ? 0.2 : 0.5,
                    maxOutputTokens: 1200
                }
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error(
                "Gemini API error:",
                response.status,
                data?.error?.message || data
            );

            if (response.status === 429) {
                return res.status(429).json({
                    error: "AI is temporarily busy. Please try again in a moment."
                });
            }

            return res.status(502).json({
                error: "AI service returned an error"
            });
        }

        const reply = (data.candidates?.[0]?.content?.parts || [])
            .map((part) => part.text || "")
            .join("")
            .trim();

        if (!reply) {
            return res.status(502).json({
                error: "AI service returned an empty response"
            });
        }

        res.json({ reply });
    } catch (error) {
        console.error("AI request failed:", error);
        res.status(502).json({
            error: "Could not reach the AI service"
        });
    }
});

module.exports = router;
