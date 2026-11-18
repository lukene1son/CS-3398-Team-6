// Tests for POST /api/ai/chat (T6-78). Gemini is replaced by a fake, so these run
// offline with no API key, no database, and no new dependencies: `npm test`.
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const realFetch = globalThis.fetch;
let gemini; // how the fake Gemini answers the current test
let geminiCalls = 0;

globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://generativelanguage.googleapis.com/")) {
        return realFetch(url, options);
    }
    geminiCalls += 1;
    return gemini(url, options);
};

const geminiReply = (status, body) => async () => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" }
});

let server;
let baseUrl;
let nextUserId = 1;

before(async () => {
    const app = express();
    app.use(express.json());
    // Stand-in for requireAuth: each test acts as its own user, so the
    // per-user rate limit from one test never affects another.
    app.use((req, res, next) => {
        req.user = { id: Number(req.get("x-test-user")) };
        next();
    });
    app.use("/api/ai", require("../src/routes/ai"));
    await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

let userId;
beforeEach(() => {
    userId = nextUserId++;
    geminiCalls = 0;
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_TIMEOUT_MS;
    gemini = geminiReply(200, { candidates: [{ content: { parts: [{ text: "A short summary." }] } }] });
});

async function ask(body) {
    const res = await realFetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-user": String(userId) },
        body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
}

test("returns Gemini's reply for a valid request", async () => {
    let sent;
    gemini = async (url, options) => {
        sent = { url, options, body: JSON.parse(options.body) };
        return geminiReply(200, { candidates: [{ content: { parts: [{ text: "Osmosis " }, { text: "moves water." }] } }] })();
    };
    const res = await ask({ tool: "explain", prompt: "  What is osmosis?  " });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { reply: "Osmosis moves water." });
    assert.equal(sent.options.headers["x-goog-api-key"], "test-key");
    assert.equal(sent.body.contents[0].parts[0].text, "What is osmosis?");
    assert.ok(sent.options.signal, "the Gemini request must carry a timeout signal");
});

test("rejects an unknown tool without calling Gemini", async () => {
    const res = await ask({ tool: "translate", prompt: "hola" });
    assert.equal(res.status, 400);
    assert.equal(geminiCalls, 0);
});

test("rejects an empty prompt", async () => {
    const res = await ask({ tool: "summarize", prompt: "   " });
    assert.equal(res.status, 400);
    assert.equal(geminiCalls, 0);
});

test("rejects a prompt over 12,000 characters", async () => {
    const res = await ask({ tool: "summarize", prompt: "a".repeat(12001) });
    assert.equal(res.status, 400);
    assert.equal(geminiCalls, 0);
});

test("returns 503 when no Gemini API key is configured", async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await ask({ tool: "quiz", prompt: "cell biology" });
    assert.equal(res.status, 503);
    assert.equal(geminiCalls, 0);
});

test("passes Gemini's 429 through as a friendly busy message", async () => {
    gemini = geminiReply(429, { error: { message: "quota" } });
    const res = await ask({ tool: "quiz", prompt: "cell biology" });
    assert.equal(res.status, 429);
    assert.match(res.body.error, /busy/);
});

test("returns 502 when Gemini errors", async () => {
    gemini = geminiReply(500, { error: { message: "internal" } });
    const res = await ask({ tool: "quiz", prompt: "cell biology" });
    assert.equal(res.status, 502);
});

test("returns 502 when Gemini sends an empty reply", async () => {
    gemini = geminiReply(200, { candidates: [] });
    const res = await ask({ tool: "summarize", prompt: "notes" });
    assert.equal(res.status, 502);
    assert.match(res.body.error, /empty/);
});

test("times out a hung Gemini request with a 504", async () => {
    process.env.GEMINI_TIMEOUT_MS = "100";
    gemini = (url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason));
    });
    const started = Date.now();
    const res = await ask({ tool: "explain", prompt: "entropy" });
    assert.equal(res.status, 504);
    assert.match(res.body.error, /too long/);
    assert.ok(Date.now() - started < 2000, "should give up close to the timeout");
});

test("rate-limits one user after 20 requests in 5 minutes", async () => {
    const statuses = [];
    for (let i = 0; i < 21; i++) statuses.push((await ask({ tool: "summarize", prompt: `note ${i}` })).status);
    assert.deepEqual(statuses.slice(0, 20), Array(20).fill(200));
    assert.equal(statuses[20], 429);
    assert.equal(geminiCalls, 20, "the limited request must not reach Gemini");
});
