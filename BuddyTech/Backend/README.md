# BuddyTech Backend

Standalone Sprint 1 backend for BuddyTech using Node.js, Express, and MySQL.

Canvas/LTI integration is deferred for this sprint.

- [Configure](#1._Configure_`port.env`)
- [Install dependencies](#2._Install_dependencies)
- [Initialize the database](#3._Initialize_the_database)
- [Run the app](#4._Run_the_app)

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
| `npm run db:schema` | Same, but leaves the tables empty (no seed data) |
| `npm run db:verify` | Prints row counts and a few sanity queries |

> ⚠️ `schema.sql` **drops and recreates** every table, so `db:schema` wipe existing data. Use to reset your local DB.

These scripts use Node + `mysql2`, so you don't need the `mysql` command-line client on your PATH. (If you prefer, you can still run `database/schema.sql` then `database/seed.sql` in MySQL Workbench.)

Expected `db:verify` (with seed data) output: users 2, courses 2, course_members 3, channels 4, messages 3, assignments 2.

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

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | MySQL isn't running — start the `MySQL80` service |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD` in `port.env` |
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
