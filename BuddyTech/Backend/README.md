# BuddyTech Backend

Standalone backend for BuddyTech using Node.js, Express 5, and MySQL.

Canvas/LTI integration is deferred for now.

- [Configure](#1-configure-portenv)
- [Install dependencies](#2-install-dependencies)
- [Initialize the database](#3-initialize-the-database)
- [Run the app](#4-run-the-app-two-terminals)
- [Permissions](#permissions)
- [Rate limits](#rate-limits)
- [API endpoints](#api-endpoints)

## 1. Configure `port.env`

`BuddyTech/Backend/port.env` holds your local settings. It is git-ignored (`*.env`), so every teammate keeps their own copy. Start from the example:

```bash
cp .env.example port.env
```

```
PORT=3000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-mysql-root-password
DB_NAME=buddytech

JWT_SECRET=change-me-to-a-long-random-string

# AI study tools (create a key in Google AI Studio)
GEMINI_API_KEY=
GEMINI_MODEL=
```

Set `DB_PASSWORD` to the root password you chose when installing MySQL.

Set `JWT_SECRET` to any long random string. The backend uses it to sign login tokens, so:

- **It is required.** Without it, sign-in and registration fail and every protected `/api` route returns 401.
- **Keep it secret.** Anyone who knows it can create a valid login token for any user. Never commit it (`port.env` is already git-ignored).
- **Changing it signs everyone out**, since existing tokens stop verifying.

To generate one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`GEMINI_API_KEY` is only needed for the AI tools (`POST /api/ai/chat`). Without it, that route returns 503 "AI service is not configured yet". `GEMINI_MODEL` is optional.

**Under Docker,** `port.env` is not used. `docker-compose.yml` sets the database settings itself and reads `JWT_SECRET` and `GEMINI_API_KEY` from the optional `.env` file in the repository root (falling back to a development-only `JWT_SECRET`).

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
| `npm run db:ensure` | Creates the database and loads `schema.sql` + `seed.sql`, **only if it's empty** (no `users` table yet). Safe to run any time; Docker runs it on every start |
| `npm run db:migrate` | Applies new files in `database/migrations/` in filename order and records them in `schema_migrations`, so each runs once. Safe to run any time; Docker runs it on every start |
| `npm run db:init` | Drops and rebuilds every table from `schema.sql`, then loads `seed.sql` |
| `npm run db:schema` | Same as `db:init`, but leaves the tables empty (no seed data) |
| `npm run db:verify` | Prints row counts and a few sanity queries |

> ⚠️ `schema.sql` **drops and recreates** every table, so `db:init` and `db:schema` wipe existing data. Use them to reset your local DB.

These scripts use Node + `mysql2`, so you don't need the `mysql` command-line client on your PATH. (If you prefer, you can still run `database/schema.sql` then `database/seed.sql` in MySQL Workbench.)

Expected `db:verify` (with seed data) output: users 11, courses 2, course_members 14, channels 4, messages 3, assignments 2, assignment_progress 1.

The seed data also loads friend_requests 5, study_groups 5, study_group_members 14, study_group_invites 2, study_group_messages 5, and direct_messages 2 (`db:verify` doesn't count these). Every seeded account uses the password `password123`; see the root README for the list.

### Changing the schema

1. Add the next migration file, e.g. `database/migrations/009_something.sql`.
2. Make the same change in `database/schema.sql`, so fresh databases from `db:init` / `db:ensure` match.
3. Update `database/seed.sql` if the demo data should use it.

Current migrations:

| File | Adds |
|---|---|
| `001_add_user_passwords.sql` | `users.password_hash` |
| `002_assignment_progress.sql` | `assignment_progress` (each user's own task status) |
| `003_course_roles.sql` | `course_members.role` (`student` / `ta` / `teacher`) |
| `004_backfill_demo_passwords.sql` | the demo password for the three original demo accounts |
| `005_friend_requests.sql` | `friend_requests` (study partner requests and connections) |
| `006_study_groups.sql` | `study_groups`, `study_group_members`, `study_group_messages` |
| `007_direct_messages.sql` | `direct_messages` |
| `008_study_group_invites.sql` | `study_group_invites` |

`migrate.js` treats "already exists" errors (duplicate column, table, or key) as already applied, so a database built from a newer `schema.sql` just marks those migrations as done.

Two MySQL rules worth knowing when writing new tables:

- **Don't put a `CHECK` constraint on a column that also has an `ON DELETE CASCADE` foreign key.** MySQL 8 rejects it (error 3823). Enforce rules like "can't friend yourself" in the route instead, as `friends.js` does.
- **The last line inside `CREATE TABLE (...)` must not end with a comma**, and every row in a multi-row `INSERT` except the last needs one. Either mistake is a syntax error (1064) that stops `seed.sql` partway through.

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

## Project layout

| Path | What's there |
|---|---|
| `src/server.js` | App setup, course / channel / assignment routes, and mounting the route files below |
| `src/routes/auth.js` | Sign-up and sign-in |
| `src/routes/ai.js` | AI study tools (Gemini) |
| `src/routes/friends.js` | Study partners: suggestions, user search, friend requests, connections |
| `src/routes/studyGroups.js` | Study groups: discover, create, join/leave, members, group chat, invites |
| `src/routes/directMessages.js` | One-to-one messages between connections |
| `src/middleware/requireAuth.js` | Checks the login token and sets `req.user` |
| `src/middleware/rateLimits.js` | Rate limits for sign-in, sign-up, friend requests, user search, and group invites |
| `database/` | `schema.sql`, `seed.sql`, `verify.sql`, `migrations/`, and the `init` / `ensure` / `migrate` scripts |

Every route mounted after `app.use("/api", requireAuth)` in `server.js` requires a login token. User-specific routes live under `/api/me/...`, always act as the logged-in user (`req.user.id`), and never take a user id from the request body. All SQL uses `?` placeholders.

## Permissions

**Courses ("Study Spaces"):** only members of a course can see its channels, messages, members, and assignments.

**Study partners:**

- Anyone can send a friend request to another user; only the receiver can accept or decline, and only the sender can cancel.
- If the other person already sent you a request, sending one back accepts it.
- A declined request can be sent again later (limited by the rate limits below).
- Accepting runs in a database transaction.

**Study groups:**

| Who | See it in Discover | Create / join / be invited | Read and post in the group chat | Invite others |
|---|---|---|---|---|
| Student in the group's course, member of the group | ✅ | already a member | ✅ | ✅ |
| Student in the group's course, not a member | ✅ (name, members, meeting time) | ✅ | ❌ (403) | ❌ |
| Teacher / TA of the group's course | ✅ (shown as "Teaching") | ❌ — they don't need to | ✅ without joining | ✅ |
| Anyone not in the group's course | ❌ | ❌ | ❌ | ❌ |

- Group members are always students in the group's course. Someone who leaves the course loses access to its groups.
- Only the invitee can accept or decline an invite (accepting adds them to the group in the same transaction); only the inviter can cancel it. A declined invite can be sent again.
- Joining a group from Discover also settles any pending invite to it.

**Direct messages:** only the sender and receiver can ever read a conversation. Not even teachers/TAs can see them. You can only send messages to your current connections; after a connection is removed, the conversation drops out of both people's lists and no new messages can be sent.

## Rate limits

Counts are kept in memory, so they reset when the backend restarts.

| Limit | Applies to |
|---|---|
| 5 wrong passwords per email per 15 minutes | `POST /api/auth/login` (successful sign-ins don't count) |
| 50 requests per IP per 15 minutes | sign-in and sign-up |
| 10 new accounts per IP per hour | `POST /api/auth/register` |
| 20 per user per hour | `POST /api/me/friend-requests` |
| 3 per user per day **to the same person** | `POST /api/me/friend-requests` |
| 30 per user per minute | `GET /api/users/search` |
| 30 per user per hour | `POST /api/study-groups/:id/invites` |

The friend request and group invite limits skip failed attempts (400 / 404 / 409), so only requests that actually go through count.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | MySQL isn't running — start the `MySQL80` service |
| `ECONNREFUSED` once when Docker starts | MySQL wasn't ready yet; the backend retries. Only a problem if it keeps repeating |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD` in `port.env` |
| `EADDRINUSE :3000` | Another backend is already running — close it or change `PORT` (and the proxy target in `Frontend/vite.config.js`) |
| Frontend shows no data | Backend not running, or check the browser dev tools Network tab for `/api` errors |
| `Database "buddytech" already initialized.` but new demo data is missing | The seed only loads into an empty database. Reset it (`docker compose down -v`, or `npm run db:init` natively) |
| `Database setup failed` with `ER_PARSE_ERROR` or `ER_DUP_ENTRY` | `seed.sql` has a syntax error or a duplicate row. The failed run leaves empty tables, so fix the file and reset again |
| `Migration failed: 00X_...sql` | That migration has an error MySQL doesn't treat as "already applied"; fix it and run `npm run db:migrate` again |
| AI tools say "AI service is not configured yet" | Set `GEMINI_API_KEY` (in `port.env`, or the root `.env` under Docker) |

## API endpoints

Every route except `/test-db` and `/api/auth/*` needs an `Authorization: Bearer <token>` header.

**Auth**

- `POST /api/auth/register` (`{ name, email, password }`)
- `POST /api/auth/login` (`{ email, password }`)
- `GET /api/me`: the logged-in user

**Courses, channels, assignments**

- `GET /test-db`
- `GET /api/courses`, `GET /api/courses/:id`
- `GET /api/me/courses`: your courses, including your `role` in each
- `GET /api/courses/:id/channels`, `GET /api/courses/:id/assignments`
- `GET /api/courses/:id/members`: everyone in the course (`{ id, name, role }`), teachers and TAs first
- `GET /api/channels/:id/messages`, `POST /api/channels/:id/messages` (`{ content }`; the author is the logged-in user)
- `GET /api/me/assignments`
- `POST /api/assignments` (`{ course_id, title, description?, due_date, personal? }`)
- `PATCH /api/assignments/:id/status` (`{ status }`)

**Study partners** (`routes/friends.js`)

- `GET /api/me/study-partners/suggested`: classmates who share a course with you and aren't already connected or pending (`{ id, name, shared_courses }`)
- `GET /api/users/search?q=`: search other users by name (id and name only)
- `POST /api/me/friend-requests` (`{ receiver_id }`): 201 for a new request, 200 if it accepted their pending request to you
- `GET /api/me/friend-requests?direction=incoming|outgoing`: pending requests
- `PATCH /api/me/friend-requests/:id` (`{ action: "accept" | "decline" }`): receiver only
- `DELETE /api/me/friend-requests/:id`: cancel a request you sent
- `GET /api/me/friends`: your connections (`{ id, name, friends_since }`)
- `DELETE /api/me/friends/:userId`: remove a connection

**Study groups** (`routes/studyGroups.js`)

- `GET /api/me/study-groups/discover`: every group in your courses (`{ id, name, meeting_time, course_id, course_code, member_count, is_member, my_role, members }`)
- `GET /api/me/study-groups`: groups whose chat you can open (`access` is `"member"` or `"staff"`)
- `POST /api/study-groups` (`{ course_id, name, meeting_time? }`): students only; you join it automatically
- `POST /api/me/study-groups/:id`: join; `DELETE /api/me/study-groups/:id`: leave
- `GET /api/study-groups/:id/members`: the group's members (`{ id, name, role }`)
- `GET /api/study-groups/:id/messages?channel=general|homework|meetups`
- `POST /api/study-groups/:id/messages` (`{ channel, content }`, up to 2000 characters)
- `POST /api/study-groups/:id/invites` (`{ user_id }`)
- `GET /api/me/study-group-invites?direction=incoming|outgoing`: pending invites, including the group's `members`
- `PATCH /api/me/study-group-invites/:id` (`{ action: "accept" | "decline" }`): invitee only
- `DELETE /api/me/study-group-invites/:id`: cancel an invite you sent

**Direct messages** (`routes/directMessages.js`)

- `GET /api/me/direct-messages`: your conversations with current connections, newest first (`{ id, name, last_message, last_message_at }`)
- `GET /api/me/direct-messages/:userId`: the conversation with one user (`{ id, user_id, user_name, content, created_at }`; `user_id` is the sender)
- `POST /api/me/direct-messages/:userId` (`{ content }`, up to 2000 characters): connections only

**AI**

- `POST /api/ai/chat` (`{ tool, prompt }`): requires `GEMINI_API_KEY`
