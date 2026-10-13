# BuddyTech Backend

Standalone Sprint 1 backend for BuddyTech using Node.js, Express, and MySQL.

Canvas/LTI integration is deferred for this sprint.

## Prerequisites

- **Node.js 20+** (LTS) — https://nodejs.org
- **MySQL Server 8.x** — https://dev.mysql.com/downloads/installer/ (MySQL Workbench is optional but handy)
- **Visual Studio 2022/2026** with the **Node.js development** workload (or VS Code)

## 1. Configure `port.env`

`BuddyTech/Backend/port.env` holds your local settings. It is git-ignored (`*.env`), so every teammate keeps their own copy.

```
PORT=3000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-mysql-root-password
DB_NAME=buddytech
```

Set `DB_PASSWORD` to the root password you chose when installing MySQL.

### Using the shared DigitalOcean database instead

```
PORT=3000
DB_HOST=db-mysql-sfo2-91031-do-user-44370503-0.g.db.ondigitalocean.com
DB_PORT=25060
DB_USER=doadmin
DB_PASSWORD=<from the DigitalOcean dashboard>
DB_NAME=defaultdb
DB_SSL=REQUIRED
# DB_SSL_CA=ca-certificate.crt   (optional: CA cert downloaded from DigitalOcean, saved next to port.env)
```

- `PORT` is the backend's port (3000), **not** the database port. The database port is `DB_PORT` (25060).
- If the connection times out, add your IP under **Trusted Sources** on the DigitalOcean database page.
- ⚠️ The cloud database is **shared by the whole team**. `npm run db:init` wipes and reseeds it for everyone, so only run it when the team agrees.

## 2. Install dependencies

From `BuddyTech/Backend`:

```bash
npm install
```

From `Frontend`:

```bash
npm install
```

## 3. Initialize the database

Make sure the MySQL service is running (Windows: Services → `MySQL80` → Start). Then from `BuddyTech/Backend`:

| Command | What it does |
|---|---|
| `npm run db:init` | Creates the `buddytech` database, all tables, and the demo seed data |
| `npm run db:schema` | Same, but leaves the tables empty (no seed data) |
| `npm run db:verify` | Prints row counts and a few sanity queries |

> ⚠️ `schema.sql` **drops and recreates** every table, so `db:init` / `db:schema` wipe existing data. Use them to reset your local DB.

These scripts use Node + `mysql2`, so you don't need the `mysql` command-line client on your PATH. (If you prefer, you can still run `database/schema.sql` then `database/seed.sql` in MySQL Workbench.)

Expected `db:verify` output: users 2, courses 2, course_members 3, channels 4, messages 3, assignments 2.

## 4. Run the app (two terminals)

Backend — from `BuddyTech/Backend`:

```bash
npm run dev      # auto-restarts on file changes (or: npm start)
```

You should see `Server running on port 3000` and `MySQL connection successful!`. Check http://localhost:3000/test-db.

Frontend — from `Frontend`:

```bash
npm run dev
```

Open http://localhost:5173. Vite proxies every `/api/...` request to the backend on port 3000.

Production build of the frontend: `npm run build` (output in `Frontend/dist`).

## Working in Visual Studio

1. **File → Open → Folder…** and pick the repo root (`CS-3398-Team-6`).
2. **View → Terminal** (``Ctrl+` ``) opens a Developer PowerShell. Use the **+** button to open a second tab, so you have one for the backend and one for the frontend, and run the commands above.
3. Optional: **View → Other Windows → Task Runner Explorer** lists the npm scripts from each `package.json` (`start`, `dev`, `db:init`, …) — double-click one to run it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | MySQL isn't running — start the `MySQL80` service |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD` in `port.env` |
| `ER_BAD_DB_ERROR: Unknown database 'buddytech'` | Run `npm run db:init` |
| `EADDRINUSE :3000` | Another backend is already running — close it or change `PORT` (and the proxy target in `Frontend/vite.config.js`) |
| Frontend shows no data | Backend not running, or check the browser dev tools Network tab for `/api` errors |

## API endpoints

- `GET /test-db`
- `GET /api/courses`, `GET /api/courses/:id`
- `GET /api/courses/:id/channels`, `GET /api/courses/:id/assignments`
- `GET /api/channels/:id/messages`, `POST /api/channels/:id/messages` (`{ user_id, content }`)
- `GET /api/users/:id/courses`, `GET /api/users/:id/assignments`
- `POST /api/assignments` (`{ course_id, title, description?, due_date }`)
- `PATCH /api/assignments/:id/status` (`{ status }`)
