const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const pool = require("../db");

const router = express.Router();

// Every route here runs after requireAuth, so req.user.id is the logged-in user.
//
// Course resources (links and uploaded files):
//   - anyone in the course can see the list and download files
//   - teachers and TAs can add them, to the course or to a course-wide assignment
//     (those show in a folder named after the assignment, and are deleted with it)
//   - only teachers can delete them
// Files are saved under BuddyTech/Backend/uploads with random names and are only
// served through GET /api/resources/:id/file, which checks course membership.

const UPLOAD_ROLES = ["teacher", "ta"];
const DELETE_ROLES = ["teacher"];
const MAX_TITLE_LENGTH = 200;
const MAX_URL_LENGTH = 2048;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

// What teachers can upload. (The browser reports the type, so this is a filter,
// not a guarantee; files are always sent back as downloads, never shown inline.)
const ALLOWED_FILE_TYPES = new Set([
    "application/pdf",
    "text/plain",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
]);

// Source code teachers can share. Browsers report these types inconsistently (".sql"
// often arrives as "application/octet-stream", ".jsx" as nothing at all), so code is
// recognised by its file extension instead, and always stored as plain text so the
// Resources page can show it. Downloads keep the original name, so the extension is kept.
// Left out on purpose: Windows scripts that run on double-click (.bat, .cmd, .ps1, .vbs).
const CODE_EXTENSIONS = new Set([
    ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hh", ".cs", ".java", ".kt", ".scala",
    ".py", ".ipynb", ".r", ".rb", ".go", ".rs", ".swift", ".php", ".pl", ".lua", ".hs",
    ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".html", ".css", ".scss",
    ".json", ".xml", ".yml", ".yaml", ".toml", ".md", ".csv", ".sql", ".sh",
    ".asm", ".s", ".v", ".vhd", ".m",
]);

function isCodeFile(fileName) {
    return CODE_EXTENSIONS.has(path.extname(fileName || "").toLowerCase());
}
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: UPLOAD_DIR,
        // Random name on disk, so an uploaded filename can never pick its own path.
        filename: (req, file, cb) => cb(null, crypto.randomUUID()),
    }),
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    defParamCharset: "utf8", // keep non-English filenames readable
    fileFilter: (req, file, cb) => cb(null, ALLOWED_FILE_TYPES.has(file.mimetype) || isCodeFile(file.originalname)),
});

// Turns a route param / body value into a positive integer id, or null.
function toId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function getCourseRole(userId, courseId) {
    const [rows] = await pool.query(
        "SELECT role FROM course_members WHERE user_id = ? AND course_id = ?",
        [userId, courseId]
    );
    return rows.length > 0 ? rows[0].role : null;
}

// Only http(s) links, so a resource can't be a "javascript:" link that runs code when clicked.
function cleanUrl(value) {
    if (typeof value !== "string" || value.trim().length > MAX_URL_LENGTH) return null;
    try {
        const url = new URL(value.trim());
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
        return null;
    }
}

function cleanTitle(value) {
    const title = typeof value === "string" ? value.trim() : "";
    return title && title.length <= MAX_TITLE_LENGTH ? title : null;
}

// The file's path in uploads/. Stored names are random UUIDs (or seed-file names like
// "seed-cs3398-welcome.pdf"): letters, digits, "-", "_" and single dots, never a slash
// or "..". Anything else gets null, so no caller can reach a file outside uploads/.
const SAFE_STORED_NAME = /^[\w-]+(\.[\w-]+)*$/;
function uploadPath(storedName) {
    return typeof storedName === "string" && SAFE_STORED_NAME.test(storedName)
        ? path.join(UPLOAD_DIR, storedName)
        : null;
}

function removeUpload(storedName) {
    const file = uploadPath(storedName);
    if (file) fs.unlink(file, () => {}); // already gone is fine
}

// The columns the frontend gets. Never includes stored_name (the file's path on disk).
const RESOURCE_COLUMNS = `
    course_resources.id,
    course_resources.course_id,
    course_resources.assignment_id,
    assignments.title AS assignment_title,
    DATE_FORMAT(assignments.due_date, '%Y-%m-%dT%H:%i:%s') AS assignment_due_date,
    course_resources.type,
    course_resources.title,
    course_resources.url,
    course_resources.file_name,
    course_resources.mime_type,
    course_resources.size_bytes,
    course_resources.created_at,
    users.name AS uploaded_by_name
`;
const RESOURCE_FROM = `
    FROM course_resources
    JOIN users ON users.id = course_resources.uploaded_by
    LEFT JOIN assignments ON assignments.id = course_resources.assignment_id
`;

async function getResourceRow(id) {
    const [rows] = await pool.query(
        `SELECT ${RESOURCE_COLUMNS} ${RESOURCE_FROM} WHERE course_resources.id = ?`,
        [id]
    );
    return rows[0];
}

// The two gates below run before anything that adds a resource, and BEFORE the
// upload is read, so files from people who can't add resources never reach the disk.

// /courses/:id/...: the logged-in user must be a teacher or TA of the course.
async function requireCourseUploader(req, res, next) {
    try {
        const courseId = toId(req.params.id);
        if (!courseId) return res.status(400).json({ error: "Invalid course id" });

        const role = await getCourseRole(req.user.id, courseId);
        if (!role) return res.status(403).json({ error: "You are not in this course" });
        if (!UPLOAD_ROLES.includes(role)) {
            return res.status(403).json({ error: "Only teachers and TAs can add resources" });
        }
        req.courseId = courseId;
        req.assignmentId = null;
        next();
    } catch (error) {
        console.error("Error checking course role:", error);
        res.status(500).json({ error: "Failed to check your course role" });
    }
}

// /assignments/:id/...: a course-wide assignment (personal tasks are private, but
// resources are seen by the whole course), and a teacher or TA of its course.
async function requireAssignmentUploader(req, res, next) {
    try {
        const assignmentId = toId(req.params.id);
        if (!assignmentId) return res.status(400).json({ error: "Invalid assignment id" });

        const [rows] = await pool.query(
            "SELECT course_id, owner_user_id FROM assignments WHERE id = ?",
            [assignmentId]
        );
        const assignment = rows[0];
        const role = assignment ? await getCourseRole(req.user.id, assignment.course_id) : null;
        // 404 for "not in this course" too, so ids can't be probed.
        if (!role) return res.status(404).json({ error: "Assignment not found" });
        if (assignment.owner_user_id !== null) {
            return res.status(400).json({ error: "Files can only be added to course assignments" });
        }
        if (!UPLOAD_ROLES.includes(role)) {
            return res.status(403).json({ error: "Only teachers and TAs can add files to assignments" });
        }
        req.courseId = assignment.course_id;
        req.assignmentId = assignmentId;
        next();
    } catch (error) {
        console.error("Error checking assignment role:", error);
        res.status(500).json({ error: "Failed to check your course role" });
    }
}

// multer's own errors (file too big, wrong field name) become a clean 400.
function receiveFile(req, res, next) {
    upload.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                error: err.code === "LIMIT_FILE_SIZE"
                    ? `File is too large (${MAX_FILE_BYTES / (1024 * 1024)} MB max)`
                    : "Upload failed. Send one file in the \"file\" field."
            });
        }
        if (err) return next(err);
        next();
    });
}

// GET /api/courses/:id/resources
// Everyone in the course can see its resources, newest first.
router.get("/courses/:id/resources", async (req, res) => {
    try {
        const courseId = toId(req.params.id);
        if (!courseId) return res.status(400).json({ error: "Invalid course id" });
        if (!(await getCourseRole(req.user.id, courseId))) {
            return res.status(403).json({ error: "You are not in this course" });
        }

        const [rows] = await pool.query(
            `SELECT ${RESOURCE_COLUMNS} ${RESOURCE_FROM}
             WHERE course_resources.course_id = ?
             ORDER BY course_resources.created_at DESC, course_resources.id DESC`,
            [courseId]
        );
        res.json(rows);
    } catch (error) {
        console.error("Error fetching resources:", error);
        res.status(500).json({ error: "Failed to fetch resources" });
    }
});

// Adds a link: { title, url }. Shared by the course and assignment routes below;
// the gate before it has set req.courseId and req.assignmentId (null = course only).
async function addLink(req, res) {
    try {
        const body = req.body || {};
        const title = cleanTitle(body.title);
        const url = cleanUrl(body.url);
        if (!title) {
            return res.status(400).json({ error: `title is required (${MAX_TITLE_LENGTH} characters max)` });
        }
        if (!url) {
            return res.status(400).json({ error: "url must be a full http:// or https:// link" });
        }

        const [result] = await pool.query(
            `INSERT INTO course_resources (course_id, assignment_id, uploaded_by, type, title, url)
             VALUES (?, ?, ?, 'link', ?, ?)`,
            [req.courseId, req.assignmentId, req.user.id, title, url]
        );
        res.status(201).json(await getResourceRow(result.insertId));
    } catch (error) {
        console.error("Error adding resource link:", error);
        res.status(500).json({ error: "Failed to add resource" });
    }
}

// Uploads one file (multipart/form-data: file, title?). The title defaults to the
// file's name. Shared like addLink.
async function addFile(req, res) {
    const file = req.file;
    try {
        if (!file) {
            return res.status(400).json({
                error: "Choose a PDF, image, text, Office, zip, or code file to upload"
            });
        }
        const fileName = path.basename(file.originalname).slice(0, 255);
        const mimeType = isCodeFile(fileName) ? "text/plain" : file.mimetype;
        const title = cleanTitle((req.body || {}).title) || cleanTitle(fileName);
        if (!title) {
            removeUpload(file.filename);
            return res.status(400).json({ error: `title must be ${MAX_TITLE_LENGTH} characters or fewer` });
        }

        const [result] = await pool.query(
            `INSERT INTO course_resources
             (course_id, assignment_id, uploaded_by, type, title, file_name, stored_name, mime_type, size_bytes)
             VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?)`,
            [req.courseId, req.assignmentId, req.user.id, title, fileName, file.filename, mimeType, file.size]
        );
        res.status(201).json(await getResourceRow(result.insertId));
    } catch (error) {
        // Don't leave an orphan file if the INSERT failed (for example, the assignment
        // was deleted while this was uploading).
        if (file) removeUpload(file.filename);
        console.error("Error uploading resource file:", error);
        res.status(500).json({ error: "Failed to upload file" });
    }
}

// POST /api/courses/:id/resources              { title, url }
// POST /api/courses/:id/resources/file         (multipart: file, title?)
// POST /api/assignments/:id/resources          { title, url }
// POST /api/assignments/:id/resources/file     (multipart: file, title?)
// Teachers and TAs. Assignment ones go in that assignment's folder.
router.post("/courses/:id/resources", requireCourseUploader, addLink);
router.post("/courses/:id/resources/file", requireCourseUploader, receiveFile, addFile);
router.post("/assignments/:id/resources", requireAssignmentUploader, addLink);
router.post("/assignments/:id/resources/file", requireAssignmentUploader, receiveFile, addFile);

// GET /api/resources/:id/file
// Anyone in the resource's course can download it.
router.get("/resources/:id/file", async (req, res) => {
    try {
        const id = toId(req.params.id);
        if (!id) return res.status(400).json({ error: "Invalid resource id" });

        const [rows] = await pool.query(
            `SELECT course_resources.stored_name, course_resources.file_name
             FROM course_resources
             JOIN course_members ON course_members.course_id = course_resources.course_id
             WHERE course_resources.id = ? AND course_resources.type = 'file'
               AND course_members.user_id = ?`,
            [id, req.user.id]
        );
        // 404 for "not in this course" too, so ids can't be probed.
        const file = rows.length > 0 ? uploadPath(rows[0].stored_name) : null;
        if (!file) return res.status(404).json({ error: "File not found" });

        res.download(
            file,
            rows[0].file_name,
            { headers: { "X-Content-Type-Options": "nosniff" } },
            (err) => {
                if (err && !res.headersSent) res.status(404).json({ error: "File not found" });
            }
        );
    } catch (error) {
        console.error("Error downloading resource file:", error);
        res.status(500).json({ error: "Failed to download file" });
    }
});

// DELETE /api/resources/:id
// Teachers of the resource's course only. Also deletes the uploaded file.
router.delete("/resources/:id", async (req, res) => {
    try {
        const id = toId(req.params.id);
        if (!id) return res.status(400).json({ error: "Invalid resource id" });

        const [rows] = await pool.query(
            "SELECT course_id, stored_name FROM course_resources WHERE id = ?",
            [id]
        );
        const resource = rows[0];
        const role = resource ? await getCourseRole(req.user.id, resource.course_id) : null;
        if (!role) return res.status(404).json({ error: "Resource not found" });
        if (!DELETE_ROLES.includes(role)) {
            return res.status(403).json({ error: "Only teachers can delete resources" });
        }

        await pool.query("DELETE FROM course_resources WHERE id = ?", [id]);
        if (resource.stored_name) removeUpload(resource.stored_name);
        res.json({ id, deleted: true });
    } catch (error) {
        console.error("Error deleting resource:", error);
        res.status(500).json({ error: "Failed to delete resource" });
    }
});

// For server.js (plain functions, not HTTP routes).

// An assignment's files and links, oldest first. Callers check access first.
router.listAssignmentResources = async (assignmentId) => {
    const [rows] = await pool.query(
        `SELECT ${RESOURCE_COLUMNS} ${RESOURCE_FROM}
         WHERE course_resources.assignment_id = ?
         ORDER BY course_resources.created_at ASC, course_resources.id ASC`,
        [assignmentId]
    );
    return rows;
};

// Removes files from uploads/ after their rows were deleted along with an assignment.
// uploadPath refuses any name that could point outside uploads/.
router.removeUploads = (storedNames) => storedNames.forEach(removeUpload);

module.exports = router;