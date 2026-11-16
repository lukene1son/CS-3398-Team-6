// Copies the seed PDFs (database/seed-files) into uploads/, where routes/resources.js
// serves them from. The course_resources rows in seed.sql point at these file names.
// Files already in uploads/ are left alone, so this is safe to run on every start.
const fs = require("fs");
const path = require("path");

const SEED_DIR = path.join(__dirname, "seed-files");
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

// Copies every FILE in `from` into `to`, skipping ones already there.
function copyMissing(from, to) {
    if (!fs.existsSync(from)) return 0;
    fs.mkdirSync(to, { recursive: true });
    let copied = 0;
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.startsWith(".")) continue;
        const target = path.join(to, entry.name);
        if (fs.existsSync(target)) continue;
        fs.copyFileSync(path.join(from, entry.name), target);
        copied++;
    }
    return copied;
}

function copySeedFiles() {
    return copyMissing(SEED_DIR, UPLOAD_DIR)
        + copyMissing(path.join(SEED_DIR, "avatars"), path.join(UPLOAD_DIR, "avatars"));
}

module.exports = copySeedFiles;