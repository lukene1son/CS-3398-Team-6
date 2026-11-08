# BuddyTech

BuddyTech is a student-focused academic collaboration platform built with React, Express, and MySQL.

Students chat in their courses ("Study Spaces"), find and connect with classmates ("Study Partners"), message each other directly, and organize small study groups. Teachers and TAs can see and take part in every study group in the courses they teach.

## Live Version

The publicly hosted version of BuddyTech is at **https://buddytech.devs.li**.

To run your own copy locally, follow the setup below.

More detail:

- Backend setup, database, permissions, and the full API list: [`BuddyTech/Backend/README.md`](BuddyTech/Backend/README.md)
- Frontend structure and how the Chat, Study Partners, and Study Groups tabs work: [`Frontend/README.md`](Frontend/README.md)

## Recommended Setup: Docker

Docker is the easiest and most reliable way to run BuddyTech on macOS, Windows, or Linux.

### Requirements

Install:

- Git
- Docker Desktop

You do not need to install Node.js or MySQL separately when using Docker.

> **Windows tip:** if PowerShell says `docker : The term 'docker' is not recognized`, Docker Desktop is installed but its command-line folder isn't on your `PATH`. For a per-user install, add `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin` to your user `PATH`, then restart your terminal (and VS Code, if you use its terminal).

### 1. Clone the repository

    git clone https://github.com/lukene1son/CS-3398-Team-6.git
    cd CS-3398-Team-6

### 2. (Optional) Add your secrets

Docker reads an optional `.env` file in the repository root (it is git-ignored). Everything has a working default for local development, so you only need it to turn on the AI tools or use your own login-token secret:

    JWT_SECRET=any-long-random-string
    GEMINI_API_KEY=your-google-ai-studio-key

Never commit this file.

### 3. Start BuddyTech

Make sure Docker Desktop is running, then run:

    docker compose up --build

On the first launch Docker will:

- download the required images
- build the frontend
- build the backend
- start MySQL
- create the BuddyTech database
- create the required tables
- load demo data
- start the Express backend
- start the React frontend

On every start, the backend also runs `npm run db:migrate`, which applies any new files in `BuddyTech/Backend/database/migrations/` without touching existing data.

### 4. Open BuddyTech

Frontend:

    http://localhost:5173

Backend:

    http://localhost:3000

### Stopping BuddyTech

Press Ctrl+C in the terminal running Docker.

Your database is stored in a Docker volume, so your data remains available the next time you run:

    docker compose up

### Resetting the Local Database

To completely erase the Docker database and start fresh:

    docker compose down -v
    docker compose up --build

Only use the `-v` option when you intentionally want to erase local BuddyTech data.

**When to reset:** demo data (`seed.sql`) is only loaded into an **empty** database. If someone changes `seed.sql`, you won't see the new demo data until you reset. The backend log says `Database "buddytech" already initialized.` when it skipped the seed, and `Database initialized successfully.` when it loaded it. If the log shows `Database setup failed` with an SQL error, fix `seed.sql` and reset again (the failed run leaves empty tables behind).

## Native Development Setup

Docker is recommended, but BuddyTech can also run directly on a developer machine.

### Backend

Requirements:

- Node.js
- MySQL

From the repository root:

    cd BuddyTech/Backend
    cp .env.example port.env
    npm ci

The backend reads its settings from `BuddyTech/Backend/port.env` (git-ignored). Edit it if your MySQL username or password differs from the defaults, and set `JWT_SECRET` (required) and `GEMINI_API_KEY` (only for the AI tools). See the backend README for details.

Initialize the database if necessary:

    npm run db:ensure

Apply any new schema changes:

    npm run db:migrate

Verify the database:

    npm run db:verify

Start the backend:

    npm start

For development with automatic restart:

    npm run dev

### Frontend

Open another terminal from the repository root:

    cd Frontend
    npm ci
    npm run dev

Then open:

    http://localhost:5173

## Database Commands

Run these from `BuddyTech/Backend`.

### Safe initialization

    npm run db:ensure

Creates and seeds the BuddyTech database only if it has not already been initialized.

### Migrations

    npm run db:migrate

Applies new `database/migrations/*.sql` files in order and remembers which ones ran (in a `schema_migrations` table), so it is safe to run repeatedly. Docker runs it on every start.

### Verification

    npm run db:verify

Displays database table counts and sample records.

### Full reset

    npm run db:init

This completely rebuilds and reseeds the BuddyTech database.

Warning: `db:init` deletes existing BuddyTech table data.

## Current Development Status

BuddyTech is under active development.

Working now:

- **Accounts:** sign up and sign in with an email and password. Passwords are hashed with bcrypt, and the backend issues a login token that lasts 7 days, so you stay signed in after a browser refresh.
- **Private data:** every `/api` route (except sign-in and sign-up) requires a login token. Users only see courses they belong to, plus their own personal tasks and task status.
- **Course roles:** each course member is a student, TA, or teacher. Only TAs and teachers can post assignments for the whole course; students can add personal tasks.
- **Chat tab:** one place for every conversation, with a collapsible sidebar:
  - **Study Spaces:** members of a course chat in its channels.
  - **Study Groups:** the groups you belong to (and, for teachers/TAs, every group in the courses they teach), each with `#general`, `#homework`, and `#meetups` channels.
  - **Direct Messages:** one-to-one chats with your connections.
  - Every message shows the sender's profile picture (their initials in a colored circle). The header shows the people in the open space or group (up to 15, then a **…** list of the rest). Clicking someone opens a card with **Message** and **Invite to group** if you're connected, or **Request** / **Requested** / **Accept request** if you're not.
  - New messages show up for other users within about 3 seconds; new conversations and groups within about 10 seconds.
- **Study Partners tab:**
  - **My Connections:** the classmates you've connected with, with **Message**, **Invite to group**, and **Remove**, followed by **Study Partner Invites** (requests other students sent you) with **Accept** / **Decline**.
  - **Find Study Partners:** your sent **Study Partner Requests** (with **Cancel**), then suggested classmates who share a course with you, each with a **Request** button.
- **Study Groups tab:**
  - **Discover:** every study group in your courses, with its members' pictures, a course filter and search, **Join** / **Joined ✓**, and **+ Create Group**.
  - **Invites:** study group invitations sent to you, showing the group's members, with **Accept** / **Decline**.
  - Only students can create, join, or be invited to a group, and only within a course they're in. Teachers and TAs don't join groups; they can already read and post in every group in the courses they teach (shown as "Teaching").
- **Direct messages are private:** only the two people in a conversation can read it (not even teachers), and you can only message people you're connected with.
- **Calendar and dashboard:** show the signed-in user's assignments and tasks. Tasks can be checked off on the dashboard, and each user's check-offs are saved separately.
- **AI study tools:** go through the backend (`POST /api/ai/chat`, powered by Gemini) when `GEMINI_API_KEY` is set.
- **Rate limiting:**
  - **Sign-in:** after 5 wrong passwords for one email, sign-in for that account is blocked for 15 minutes. Each IP address can create at most 10 accounts per hour.
  - **Study partners and groups:** each user can send 20 friend requests per hour (3 per day to the same person), 30 study group invites per hour, and 30 user searches per minute. Failed attempts don't count.

Demo accounts (created with the seed data, password `password123`):

| Email | Who | Courses |
|---|---|---|
| `student@buddytech.local` | Demo Student | CS 3398, BIO 1330 |
| `partner@buddytech.local` | Study Partner | CS 3398 |
| `teacher@buddytech.local` | Demo Teacher | CS 3398 (teacher) |
| `teacher2@buddytech.local` | Demo Teacher2 | BIO 1330 (teacher) |
| `partner1@buddytech.local` … `partner3@buddytech.local` | Study Partner1–3 | CS 3398 |
| `partner4@buddytech.local`, `partner5@buddytech.local` | Study Partner4–5 | CS 3398, BIO 1330 |
| `partner6@buddytech.local`, `partner7@buddytech.local` | Study Partner6–7 | BIO 1330 |

The seed data also includes five study groups (three in CS 3398, two in BIO 1330), some connections between the accounts, a pending friend request in each direction for Demo Student, two study group invites waiting for Demo Student, and a few group and direct messages. Demo Student, Study Partner, and Study Partner2 are all in **CS 3398 Exam Prep**.

Known limitations:

- **New accounts can't join a course yet.** Signing up doesn't add the user to any course, and there is no "join course" feature, so a new account sees no channels, classmates, study groups, or course assignments. For testing, use the demo accounts or add a row to `course_members` by hand.
- **`JWT_SECRET` must be set when running natively.** The backend reads it from `BuddyTech/Backend/port.env`, which is not in Git. Without it, sign-in and sign-up fail with a server error. Docker falls back to a built-in development secret if the root `.env` doesn't set one, which is fine locally but must never be used on a public server.
- **Chat is not real-time.** Messages are checked every 3 seconds, and conversation lists, groups, and requests every 10 seconds, instead of using WebSockets.
- **A new direct message only appears for the other person once something is sent.** Clicking **Message** opens an empty chat for you right away, but nothing is saved until the first message.
- **Profile pictures are placeholders.** They show the person's initials (first letter of the first and last name), so the seeded "Study Partner" accounts all show "SP"; the color is what tells them apart. There is no photo upload yet.
- **Study groups have three fixed channels** (`#general`, `#homework`, `#meetups`).
- **Invite pickers list every group you can post in.** The app doesn't know which courses a connection is in, so if you pick a group they can't join, the backend refuses and explains why.
- **Teachers and TAs show up in Find Study Partners suggestions,** because suggestions are based on shared courses, not roles.
- **Signing out only affects this browser.** A login token stays valid until it expires (7 days); the server can't cancel it early.
- **Rate-limit counts reset on restart.** They are kept in the backend's memory, which only works while a single backend server is running.
- **`npm run lint` doesn't run yet.** The ESLint packages are installed in `Frontend/package.json`, but there is no `eslint.config.js`.
- **The local Docker setup in this repository isn't meant for public hosting as-is:**
  - the frontend runs on the Vite development server instead of a production build
  - the site needs HTTPS
  - the demo accounts use a password that is published in this repository
  - Docker uses the MySQL root user with a weak password
- **Resources and Settings pages use placeholder data.** Their backend routes don't exist yet (see `USE_MOCK` in `Frontend/src/api.js`).
- **AI tools need a Gemini API key.** Without `GEMINI_API_KEY`, the AI route returns "AI service is not configured yet".

## Technology Stack

- React
- Vite
- Node.js
- Express
- MySQL
- Docker / Docker Compose
