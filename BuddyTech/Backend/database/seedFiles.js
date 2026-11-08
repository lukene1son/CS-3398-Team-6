// Copies the seed PDFs (database/seed-files) into uploads/, where routes/resources.js
// serves them from. The course_resources rows in seed.sql point at these file names.
// Files already in uploads/ are left alone, so this is safe to run on every start.
const fs = require("fs");
const path = require("path");

const SEED_DIR = path.join(__dirname, "seed-files");
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

function copySeedFiles() {
    if (!fs.existsSync(SEED_DIR)) return 0;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const files = fs.readdirSync(SEED_DIR).filter((file) => !file.startsWith("."));
    let copied = 0;
    for (const file of files) {
        const target = path.join(UPLOAD_DIR, file);
        if (fs.existsSync(target)) continue;
        fs.copyFileSync(path.join(SEED_DIR, file), target);
        copied++;
    }
    return copied;
}

module.exports = copySeedFiles;