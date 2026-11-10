# BuddyTech Backend

Standalone backend for BuddyTech using Node.js, Express 5, MySQL, and Socket.IO.

Canvas/LTI integration is deferred for now.

- [Configure](#1-configure-portenv)
- [Install dependencies](#2-install-dependencies)
- [Initialize the database](#3-initialize-the-database)
- [Run the app](#4-run-the-app-two-terminals)
- [Project layout](#project-layout)
- [Permissions](#permissions)
- [Rate limits](#rate-limits)
- [Real-time updates](#real-time-updates-socketio)
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
DB_PASSWORD=
DB_NAME=buddytech

# JWT_SECRET acts as a password hash key
JWT_SECRET=change-me-to-a-long-random-string
# AI study tools (create a key in Google AI Studio)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
```

Set `DB_PASSWORD` to the root password you chose when installing MySQL.

Set `JWT_SECRET` to any long random string. The backend uses it to sign login tokens (and, with a suffix, the Google Calendar OAuth `state`), so:

- **It is required.** Without it, sign-in and registration fail and every protected `/api` route returns 401.
- **Keep it secret.** Anyone who knows it can create a valid login token for any user. Never commit it (`port.env` is already git-ignored).
- **Changing it signs everyone out**, since existing tokens stop verifying.

To generate one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Optional settings

`.env.example` doesn't list these yet; add the lines to `port.env` yourself when you need them.

| Setting | Needed for | Notes |
|---|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | AI tools (`POST /api/ai/chat`) | Without the key, that route returns 503 "AI service is not configured yet". The model is optional. |
| `GOOGLE_CLIENT_ID` | Sign in with Google, and Google Calendar sync | An OAuth "Web application" client from Google Cloud Console. Add your frontend address (e.g. `http://localhost:5173`) as an authorized JavaScript origin. Without it, the Google button is hidden and `POST /api/auth/google` returns 503. |
| `GOOGLE_CLIENT_SECRET` | Google Calendar sync | From the same OAuth client. |
| `GOOGLE_REDIRECT_URI` | Google Calendar sync | Must be `/api/auth/google/callback` on the address the browser uses, e.g. `http://localhost:5173/api/auth/google/callback`, and must also be listed as an authorized redirect URI on the OAuth client. |
| `GOOGLE_TOKEN_KEY` | Google Calendar sync | Exactly 64 hex characters (a 32-byte key). Encrypts the stored Google refresh tokens with AES-256-GCM. Changing it makes existing links unreadable, so users must reconnect. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `DB_SSL`, `DB_SSL_CA` | Cloud databases that require SSL | Set `DB_SSL_CA` to the path of the provider's CA certificate (relative to `BuddyTech/Backend`) to verify the server. `DB_SSL=true` without a CA encrypts but doesn't verify. `DB_SSL=false` turns it off. |
| `TRUST_PROXY` | Hosting behind a proxy | Which proxies to trust for the client IP (used by the rate limits). Defaults to `loopback, linklocal, uniquelocal`. |

Google Calendar sync only turns on when **all four** of `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and a valid `GOOGLE_TOKEN_KEY` are set; otherwise its routes return 503 "Google Calendar sync is not configured yet". Sign in with Google needs only `GOOGLE_CLIENT_ID`.

**Under Docker,** `port.env` is not used. `docker-compose.yml` sets the database settings itself and reads `JWT_SECRET` (required: Compose refuses to start without it), `GEMINI_*`, and `GOOGLE_*` from the `.env` file in the repository root. It also sets `TRUST_PROXY=uniquelocal`.

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
| `npm run db:ensure` | Creates the database and loads `schema.sql` + `seed.sql`, **only if it's empty** (no `users` table yet). Either way, it puts back any demo files missing from `uploads/`. Safe to run any time; Docker runs it on every start |
| `npm run db:migrate` | Applies new files in `database/migrations/` in filename order and records them in `schema_migrations`, so each runs once. Safe to run any time; Docker runs it on every start |
| `npm run db:init` | Drops and rebuilds every table from `schema.sql`, then loads `seed.sql` and copies the demo files |
| `npm run db:schema` | Same as `db:init`, but leaves the tables empty (no seed data) |
| `npm run db:verify` | Prints row counts and a few sanity queries. Changes nothing |

> ⚠️ `schema.sql` **drops and recreates** every table, so `db:init` and `db:schema` wipe existing data. Use them to reset your local DB.

These scripts use Node + `mysql2`, so you don't need the `mysql` command-line client on your PATH. (If you prefer, you can still run `database/schema.sql` then `database/seed.sql` in MySQL Workbench, but then the demo files won't be copied.)

Expected `db:verify` (with seed data) output: users 11, courses 2, course_members 14, channels 4, messages 3, assignments 18, assignment_progress 1, course_resources 10.

The seed data also loads friend_requests 5, study_groups 5 (one private), study_group_members 14, study_group_invites 2, study_group_messages 5, and direct_messages 2 (`db:verify` doesn't count these). Every seeded account uses the password `password123`; see the root README for the list.

### Demo files

`database/seed-files/` holds the files the seed data points to: three PDFs and two source files for the Resources page, and five GIF profile pictures (`seed-files/avatars/`). `database/seedFiles.js` copies any that are missing into `uploads/` and `uploads/avatars/`, so it never overwrites real uploads.

### Changing the schema

1. Add the next migration file, e.g. `database/migrations/018_something.sql`.
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
| `009_message_indexes.sql` | an index on `messages (channel_id, created_at)` |
| `010_course_resources.sql` | `course_resources` (links and files teachers share) |
| `011_study_groups_visibility.sql` | `study_groups.visibility` (`public` / `private`) |
| `012_user_settings.sql` | `users.email_notifications`, `assignment_reminders`, `avatar_stored_name`, `avatar_mime_type`, `name_changed_at` |
| `013_avatar_color.sql` | `users.avatar_color` |
| `014_google_calendar.sql` | `google_calendar_links` (encrypted refresh token per user), `google_calendar_events` (which Google event each assignment became) |
| `015_google_calendar_time_zone.sql` | `google_calendar_links.time_zone` |
| `016_notifications.sql` | `friend_requests.accept_seen`, `study_group_reads` (last message each user read per group channel) |
| `017_google_sign_in.sql` | `users.google_sub` (the linked Google account) |

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

Open http://localhost:5173. Vite proxies every `/api/...` request (including the Socket.IO connection at `/api/socket.io`) to the backend on port 3000.

Production build of the frontend: `npm run build` (output in `Frontend/dist`).

## Project layout

| Path | What's there |
|---|---|
| `src/server.js` | App setup, course / channel / assignment routes, mounting the route files below, and starting Socket.IO |
| `src/realtime.js` | Socket.IO: login check, rooms, and `emitTo()` for the routes |
| `src/routes/auth.js` | Sign-up, sign-in, and Sign in with Google |
| `src/routes/ai.js` | AI study tools (Gemini) |
| `src/routes/friends.js` | Study partners: suggestions, user search, friend requests, connections |
| `src/routes/studyGroups.js` | Study groups: discover, create, join/leave, members, group chat, invites, read markers |
| `src/routes/directMessages.js` | One-to-one messages between connections |
| `src/routes/notifications.js` | The notification bell and the dashboard's Recent Activity |
| `src/routes/resources.js` | Course resources: links and file uploads |
| `src/routes/userSettings.js` | Settings: display name, notification switches, profile pictures, avatar color |
| `src/routes/googleCalendar.js` | Google Calendar connect / sync / disconnect, and the OAuth callback |
| `src/middleware/requireAuth.js` | Checks the login token and sets `req.user` |
| `src/middleware/rateLimits.js` | Rate limits (see below) |
| `src/dbConfig.js` | MySQL connection settings, including SSL |
| `database/` | `schema.sql`, `seed.sql`, `verify.sql`, `migrations/`, `seed-files/`, and the `init` / `ensure` / `migrate` / `seedFiles` scripts |
| `uploads/` | Uploaded resource files, and `uploads/avatars/` for profile pictures. Git-ignored; a Docker volume under Docker |

Every route mounted after `app.use("/api", requireAuth)` in `server.js` requires a login token. The only exceptions are `/api/auth/*` and `GET /api/auth/google/callback` (Google redirects the browser there without a token, so it identifies the user from a signed `state` value instead). User-specific routes live under `/api/me/...`, always act as the logged-in user (`req.user.id`), and never take a user id from the request body. All SQL uses `?` placeholders.

## Permissions

**Courses ("Study Spaces"):** only members of a course can see its channels, messages, members, assignments, and resources.

**Assignments:** TAs and teachers can post assignments for the whole course; anyone can add a personal task that only they see.

**Resources:** everyone in the course can list them and download files. Only the course's **teachers** can add or delete them (to let TAs manage them too, add `"ta"` to `MANAGER_ROLES` in `resources.js`). Files are stored under random names and are always sent back as downloads, never shown inline. Up to 20 MB; allowed types are PDF, plain text, images, Office documents, zip, and common source-code extensions (stored as plain text).

**Study partners:**

- Anyone can send a friend request to another user; only the receiver can accept or decline, and only the sender can cancel.
- If the other person already sent you a request, sending one back accepts it.
- A declined request can be sent again later (limited by the rate limits below).
- Accepting runs in a database transaction.

**Study groups:**

| Who | See it in Discover | Create / join / be invited | Read and post in the group chat | Invite others |
|---|---|---|---|---|
| Student in the group's course, member of the group | ✅ (public groups) | already a member | ✅ | ✅ |
| Student in the group's course, not a member | ✅ public groups (name, members, meeting time); ❌ private groups | public: join or be invited; private: invite only | ❌ (403) | ❌ |
| Teacher / TA of the group's course | ✅ public groups (shown as "Teaching") | ❌ — they don't need to | ✅ without joining (public and private) | ✅ |
| Anyone not in the group's course | ❌ | ❌ | ❌ | ❌ |

- Group members are always students in the group's course. Someone who leaves the course loses access to its groups.
- Only the invitee can accept or decline an invite (accepting adds them to the group in the same transaction); only the inviter can cancel it. A declined invite can be sent again.
- Joining a group from Discover also settles any pending invite to it.

**Direct messages:** only the sender and receiver can ever read a conversation. Not even teachers/TAs can see them. You can only send messages to your current connections; after a connection is removed, the conversation drops out of both people's lists and no new messages can be sent.

**Profile pictures:** you can see your own, your classmates' (anyone who shares a course with you), and your connections'. Everyone else gets a 404, the same as "no picture", so it doesn't reveal who has one. Uploads must really be PNG, JPEG, WebP, or GIF (checked from the file contents with `sharp`, not the extension), up to 3 MB, with no transparent background. SVG is refused because it can contain scripts.

**Display name:** can be changed once a month. The check happens in the `UPDATE` itself, so two quick saves can't both get through.

**Sign in with Google:** the backend verifies Google's ID token with `google-auth-library` (it must be issued for our `GOOGLE_CLIENT_ID`), then:

1. If the Google account is already linked (`users.google_sub`), it signs that user in.
2. If a password account has the same email, it links it only when Google vouches for the address (an `@gmail.com` address, or `email_verified` with a Google Workspace domain). Otherwise it returns 409 and asks the user to sign in with their password, so nobody can take over an account with an unverified address.
3. Otherwise it creates a new account with no password.

**Google Calendar:** the OAuth scope is `calendar.app.created`, so BuddyTech can only see and change calendars it created (a "BuddyTech" calendar), nothing else in the user's account. Refresh tokens are encrypted in the database and never sent to the browser. Disconnecting revokes the token with Google and forgets the link; the calendar stays in the user's account.

## Rate limits

Counts are kept in memory, so they reset when the backend restarts.

| Limit | Applies to |
|---|---|
| 5 wrong passwords per email per 15 minutes | `POST /api/auth/login` (successful sign-ins don't count) |
| 50 requests per IP per 15 minutes | every `/api/auth/*` route |
| 10 new accounts per IP per hour | `POST /api/auth/register` |
| 20 per user per hour | `POST /api/me/friend-requests` |
| 3 per user per day **to the same person** | `POST /api/me/friend-requests` |
| 30 per user per minute | `GET /api/users/search` |
| 30 per user per hour | `POST /api/study-groups/:id/invites` |
| 3 per user per 15 minutes | `POST /api/me/avatar` (rejected uploads don't count) |
| 10 per user per 15 minutes | `POST /api/me/google-calendar/sync` |

The friend request and group invite limits skip failed attempts (400 / 404 / 409), so only requests that actually go through count.

## Real-time updates (Socket.IO)

The backend runs a Socket.IO server at path **`/api/socket.io`** (under `/api` so the Vite proxy and Docker setup already forward it). Clients only **listen** on the socket; sending messages, requests, and invites still goes through the REST routes, which then push the update out.

- **Login:** the client passes its login token as `auth: { token }` when connecting. No valid token, no connection.
- **Rooms:**
  - `user:<id>`: every open tab of that user, joined automatically.
  - `channel:<id>`: a course channel; only people in the course can join.
  - `group:<id>`: a study group chat; only people who can read it can join.
- **Client → server:** `join` and `leave` with `{ type: "channel" | "group", id }`. `join` replies `{ ok: true }` or `{ error }`.
- **Server → client events:**

| Event | Room | Sent when |
|---|---|---|
| `channel-message` | `channel:<id>` | someone posts in a course channel |
| `group-message` | `group:<id>` | someone posts in a study group channel |
| `group-unread-changed` | `user:<id>` | a group you're in gets a new message, or you read one |
| `direct-message` | `user:<id>` (both people) | a direct message is sent |
| `friends-changed` | `user:<id>` | a friend request or connection involving you changes |
| `group-invites-changed` | `user:<id>` (the invitee) | you're sent an invite, or one sent to you is accepted, declined, or cancelled |

Events carry ids, not full content; the frontend re-fetches through the REST routes, so the usual permission checks still apply. The frontend also re-checks every 10 seconds (friend data) and every 60 seconds (chat) as a safety net.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | MySQL isn't running — start the `MySQL80` service |
| `ECONNREFUSED` once when Docker starts | MySQL wasn't ready yet; the backend retries. Only a problem if it keeps repeating |
| `Set JWT_SECRET in the root .env file` from `docker compose up` | Create the root `.env` with a `JWT_SECRET` line |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD` in `port.env` |
| `EADDRINUSE :3000` | Another backend is already running — close it or change `PORT` (and the proxy target in `Frontend/vite.config.js`) |
| Frontend shows no data | Backend not running, or check the browser dev tools Network tab for `/api` errors |
| Chat doesn't update live | Check the Network tab for a failed `/api/socket.io` connection. Updates still arrive within about 60 seconds through polling |
| `Database "buddytech" already initialized.` but new demo data is missing | The seed only loads into an empty database. Reset it (`docker compose down -v`, or `npm run db:init` natively) |
| `Database setup failed` with `ER_PARSE_ERROR` or `ER_DUP_ENTRY` | `seed.sql` has a syntax error or a duplicate row. The failed run leaves empty tables, so fix the file and reset again |
| `Migration failed: 0XX_...sql` | That migration has an error MySQL doesn't treat as "already applied"; fix it and run `npm run db:migrate` again |
| AI tools say "AI service is not configured yet" | Set `GEMINI_API_KEY` (in `port.env`, or the root `.env` under Docker) |
| No **Sign in with Google** button | Set `GOOGLE_CLIENT_ID` and restart the backend |
| Google sign-in popup errors with an origin mismatch | Add the address you open the app at (e.g. `http://localhost:5173`) as an authorized JavaScript origin on the OAuth client |
| Planner says Google Calendar sync is not set up | Set all four `GOOGLE_*` settings; `GOOGLE_TOKEN_KEY` must be exactly 64 hex characters |
| Google shows `redirect_uri_mismatch` | `GOOGLE_REDIRECT_URI` must exactly match an authorized redirect URI on the OAuth client |

## API endpoints

Every route except `/test-db`, `/api/auth/*`, and `GET /api/auth/google/callback` needs an `Authorization: Bearer <token>` header.

**Auth** (`routes/auth.js`)

- `POST /api/auth/register` (`{ name, email, password }`)
- `POST /api/auth/login` (`{ email, password }`)
- `GET /api/auth/google/config`: `{ clientId }` (public; `null` when Google sign-in isn't set up)
- `POST /api/auth/google` (`{ credential }`, the ID token from Google's button): returns `{ token, user }` like login
- `GET /api/me`: the logged-in user (`{ id, name, email, created_at, avatar_color, has_avatar }`)

**Courses, channels, assignments** (`server.js`)

- `GET /test-db`
- `GET /api/courses`, `GET /api/courses/:id`
- `GET /api/me/courses`: your courses, including your `role` in each
- `GET /api/courses/:id/channels`, `GET /api/courses/:id/assignments`
- `GET /api/courses/:id/members`: everyone in the course, teachers and TAs first
- `GET /api/channels/:id/messages`, `POST /api/channels/:id/messages` (`{ content }`; the author is the logged-in user)
- `GET /api/me/assignments`
- `POST /api/assignments` (`{ course_id, title, description?, due_date, personal? }`): also pushed to linked Google Calendars
- `PATCH /api/assignments/:id/status` (`{ status }`: `todo`, `in_progress`, or `done`)

**Study partners** (`routes/friends.js`)

- `GET /api/me/study-partners/suggested`: classmates who share a course with you and aren't already connected or pending (`{ id, name, avatar_color, has_avatar, shared_courses }`)
- `GET /api/users/search?q=`: search other users by name
- `POST /api/me/friend-requests` (`{ receiver_id }`): 201 for a new request, 200 if it accepted their pending request to you
- `GET /api/me/friend-requests?direction=incoming|outgoing`: pending requests
- `PATCH /api/me/friend-requests/:id` (`{ action: "accept" | "decline" }`): receiver only
- `DELETE /api/me/friend-requests/:id`: cancel a request you sent
- `GET /api/me/friends`: your connections
- `DELETE /api/me/friends/:userId`: remove a connection

**Study groups** (`routes/studyGroups.js`)

- `GET /api/me/study-groups/discover`: every public group in your courses
- `GET /api/me/study-groups`: groups whose chat you can open (`access` is `"member"` or `"staff"`)
- `POST /api/study-groups` (`{ course_id, name, meeting_time?, visibility?: "public" | "private" }`): students only; you join it automatically. `visibility` defaults to `public`
- `POST /api/me/study-groups/:id`: join (public groups); `DELETE /api/me/study-groups/:id`: leave
- `GET /api/study-groups/:id/members`: the group's members
- `GET /api/study-groups/:id/messages?channel=general|homework|meetups`: also marks the channel as read for you
- `POST /api/study-groups/:id/messages` (`{ channel, content }`, up to 2000 characters)
- `POST /api/study-groups/:id/invites` (`{ user_id }`)
- `GET /api/me/study-group-invites?direction=incoming|outgoing`: pending invites, including the group's `members`
- `PATCH /api/me/study-group-invites/:id` (`{ action: "accept" | "decline" }`): invitee only
- `DELETE /api/me/study-group-invites/:id`: cancel an invite you sent

**Direct messages** (`routes/directMessages.js`)

- `GET /api/me/direct-messages`: your conversations with current connections, newest first
- `GET /api/me/direct-messages/:userId`: the conversation with one user
- `POST /api/me/direct-messages/:userId` (`{ content }`, up to 2000 characters): connections only

**Notifications and activity** (`routes/notifications.js`)

- `GET /api/me/notifications`: `{ accepted_requests, unread_group_messages }` for the bell (pending friend requests and invites come from their own routes)
- `POST /api/me/notifications/accepted/seen`: clears accepted requests from the bell
- `GET /api/me/activity`: `{ messages, assignments }` for the dashboard's Recent Activity card

**Resources** (`routes/resources.js`)

- `GET /api/courses/:id/resources`: the course's resources, newest first
- `POST /api/courses/:id/resources` (`{ title, url }`): teachers only; adds a link (`http://` or `https://`)
- `POST /api/courses/:id/resources/file` (multipart: `file`, `title?`): teachers only; up to 20 MB
- `GET /api/resources/:id/file`: download a file (course members only)
- `DELETE /api/resources/:id`: teachers of the course only; also deletes the file

**Settings and profile pictures** (`routes/userSettings.js`)

- `GET /api/me/settings`: `{ display_name, email_notifications, assignment_reminders, has_avatar, avatar_color, name_change_available_at }`
- `PUT /api/me/settings` (`{ display_name, email_notifications, assignment_reminders }`, all required): 429 if the name changed less than a month ago
- `POST /api/me/avatar` (multipart: `avatar`): upload a profile picture
- `GET /api/me/avatar`: your picture; `GET /api/users/:id/avatar`: someone else's (see Permissions)
- `DELETE /api/me/avatar`: remove your picture
- `PUT /api/me/avatar-color` (`{ color }`): one of the 8 preset colors, or `null` for the default

**Google Calendar** (`routes/googleCalendar.js`)

- `GET /api/me/google-calendar`: `{ configured, connected, connected_at }`
- `POST /api/me/google-calendar/connect`: `{ url }` of Google's consent page; the frontend sends the browser there
- `GET /api/auth/google/callback?code=&state=`: **public**; Google redirects here, and it redirects back to `/dashboard?google_calendar=connected|denied|error`
- `POST /api/me/google-calendar/sync` (`{ timeZone }`, e.g. `"America/Chicago"`): `{ synced }`, the number of assignments pushed
- `DELETE /api/me/google-calendar`: disconnect

**AI** (`routes/ai.js`)

- `POST /api/ai/chat` (`{ tool, prompt }`): requires `GEMINI_API_KEY`
