// Standalone local platform for exercising the signed LTI launch without Canvas.
// Starts with a fresh signing key. The private key never leaves this process.
const { generateKeyPairSync } = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");

const port = 4400;
const issuer = `http://localhost:${port}`;
const target = "http://localhost:5173/api/lti/launch";
const clientId = "buddytech-local";
const deploymentId = "demo-deployment";
const contextId = "cs3398-demo";
const subject = "canvas-demo-student";
const claims = "https://purl.imsglobal.org/spec/lti/claim/";
const keyId = "local-simulator";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const app = express();

app.get("/", (req, res) => {
    const login = new URL("http://localhost:5173/api/lti/login");
    login.search = new URLSearchParams({
        iss: issuer, client_id: clientId, target_link_uri: target,
        login_hint: subject, lti_message_hint: contextId
    }).toString();
    res.type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8">
        <title>BuddyTech LTI test platform</title><main>
        <h1>CS 3398 · LTI test platform</h1>
        <p>This local simulator represents a student launching BuddyTech from a registered course.</p>
        <a href="${login.href.replaceAll("&", "&amp;")}">Open BuddyTech</a></main></html>`);
});

app.get("/jwks", (req, res) => {
    res.json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: keyId, alg: "RS256", use: "sig" }] });
});

app.get("/authorize", (req, res) => {
    const { client_id, redirect_uri, login_hint, lti_message_hint, state, nonce } = req.query;
    if (client_id !== clientId || redirect_uri !== target || login_hint !== subject ||
        lti_message_hint !== contextId || ![state, nonce].every(value =>
            typeof value === "string" && /^[0-9a-f]{64}$/.test(value))) {
        return res.status(400).send("Invalid LTI authorization request.");
    }
    const token = jwt.sign({
        nonce,
        [claims + "deployment_id"]: deploymentId,
        [claims + "message_type"]: "LtiResourceLinkRequest",
        [claims + "version"]: "1.3.0",
        [claims + "target_link_uri"]: target,
        [claims + "resource_link"]: { id: "buddytech-course-navigation" },
        [claims + "roles"]: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"],
        [claims + "context"]: { id: contextId, label: "CS 3398" }
    }, privateKey, {
        algorithm: "RS256", keyid: keyId, issuer, audience: clientId, subject, expiresIn: "2m"
    });
    res.type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8">
        <title>Launching BuddyTech</title>
        <form id="launch" method="post" action="${target}">
        <input type="hidden" name="state" value="${state}">
        <input type="hidden" name="id_token" value="${token}">
        <button>Continue to BuddyTech</button></form>
        <script>document.getElementById('launch').submit()</script></html>`);
});

app.listen(port, process.env.LTI_SIM_LISTEN_HOST || "localhost", () => console.log(`Canvas LTI simulator: ${issuer}`));
