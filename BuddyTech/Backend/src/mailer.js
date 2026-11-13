// Sends email through Resend's HTTPS API (port 443, so it doesn't depend on the
// server being allowed to send on SMTP ports). Configure in .env / port.env:
//   EMAIL_API_KEY = Resend API key
//   MAIL_FROM     = e.g. "BuddyTech <security@your-domain>" (a domain verified in Resend)
// If either is missing, emails are skipped with a warning (fine for local dev).

async function sendMail({ to, subject, text, html }) {
    const apiKey = process.env.EMAIL_API_KEY;
    const from = process.env.MAIL_FROM;
    if (!apiKey || !from) {
        console.warn(`Email not configured; skipped "${subject}"`);
        return false;
    }
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text, html }),
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Email service answered ${response.status}`);
    return true;
}

// For putting untrusted text (like a browser's user-agent string) into email HTML.
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
}

module.exports = { sendMail, escapeHtml };
