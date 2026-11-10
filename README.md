# BuddyTech

BuddyTech is a student-focused academic collaboration platform built with React, Express, and MySQL.

Students chat in their courses ("Study Spaces"), find and connect with classmates ("Study Partners"), message each other directly, organize small study groups, keep a planner that can sync to Google Calendar, and use Gemini-powered AI study tools. Teachers and TAs can see and take part in every study group in the courses they teach, and teachers share course resources (links and files).

## Live Version

The publicly hosted version of BuddyTech is at **https://buddytech.devs.li**.

To run your own copy locally, follow the setup below.

Backend setup, database, permissions, real-time events, and the full API list: [`BuddyTech/Backend/README.md`](BuddyTech/Backend/README.md)

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

### 2. Create the root `.env` file

Docker reads a `.env` file in the repository root (it is git-ignored). **`JWT_SECRET` is required**: `docker compose up` stops with `Set JWT_SECRET in the root .env file` if it's missing. Everything else is optional and turns on an extra feature:

    # Required: signs login tokens. Any long random string.
    JWT_SECRET=any-long-random-string

    # Optional: AI study tools
    GEMINI_API_KEY=your-google-ai-studio-key
    GEMINI_MODEL=gemini-3.5-flash-lite

    # Optional: "Sign in with Google" (needs only the client ID)
    GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

    # Optional: Google Calendar sync (needs all four)
    GOOGLE_CLIENT_SECRET=your-client-secret
    GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
    GOOGLE_TOKEN_KEY=64-hex-characters

To generate `JWT_SECRET` or `GOOGLE_TOKEN_KEY`:

    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

Never commit this file. See the backend README for what each Google setting does.

### 3. Start BuddyTech

Make sure Docker Desktop is running, then run:

    docker compose up --build

On the first launch Docker will:

- download the required images
- build the frontend and backend
- start MySQL
- create the BuddyTech database and tables
- load demo data (accounts, courses, study groups, assignments, resources, and profile pictures)
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

Your database and uploaded files (profile pictures, course resources) are stored in Docker volumes, so they remain available the next time you run:

    docker compose up

### Resetting the Local Database

To completely erase the Docker database and uploads and start fresh:

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

The backend reads its settings from `BuddyTech/Backend/port.env` (git-ignored). Edit it if your MySQL username or password differs from the defaults, and set `JWT_SECRET` (required). The AI and Google settings are optional; see the backend README.

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

Other frontend commands: `npm run build` (production build in `Frontend/dist`) and `npm run lint` (ESLint).

## Database Commands

Run these from `BuddyTech/Backend`.

### Safe initialization

    npm run db:ensure

Creates and seeds the BuddyTech database only if it has not already been initialized, and copies the demo files (profile pictures and resource files) into `uploads/`.

### Migrations

    npm run db:migrate

Applies new `database/migrations/*.sql` files in order and remembers which ones ran (in a `schema_migrations` table), so it is safe to run repeatedly. Docker runs it on every start.

### Verification

    npm run db:verify

Displays database table counts and sample records. Changes nothing.

### Full reset

    npm run db:init

This completely rebuilds and reseeds the BuddyTech database.

Warning: `db:init` deletes existing BuddyTech table data.

## Current Development Status

BuddyTech is under active development.

Working now:

- **Accounts:**
  - Sign up and sign in with an email and password. Passwords are hashed with bcrypt, and the backend issues a login token that lasts 7 days, so you stay signed in after a browser refresh.
  - **Sign in with Google** (when `GOOGLE_CLIENT_ID` is set). A new Google user gets an account automatically. An existing password account with the same email is linked to Google only if Google vouches for the address (a `@gmail.com` address, or a verified Google Workspace address); otherwise the user is asked to sign in with their password.
- **Private data:** every `/api` route (except sign-in, sign-up, and the Google Calendar callback) requires a login token. Users only see courses they belong to, plus their own personal tasks and task status.
- **Course roles:** each course member is a student, TA, or teacher. Only TAs and teachers can post assignments for the whole course; students can add personal tasks.
- **Home tab:** your upcoming tasks (check them off; each user's check-offs are saved separately) and a **Recent Activity** card with the newest messages from your channels, groups, and direct messages, plus newly posted course assignments.
- **Notification bell:** incoming study partner requests, study group invites (both with **Accept** / **Decline**), requests of yours that were accepted, and unread study group messages.
- **Spaces tab:** three sub-tabs.
  - **Chat:** one place for every conversation, with a collapsible sidebar:
    - **Study Spaces:** members of a course chat in its channels.
    - **Study Groups:** the groups you belong to (and, for teachers/TAs, every group in the courses they teach), each with `#general`, `#homework`, and `#meetups` channels.
    - **Direct Messages:** one-to-one chats with your connections.
    - Every message shows the sender's profile picture. The header shows the people in the open space or group (up to 15, then a **…** list of the rest). Clicking someone opens a card with **Message** and **Invite to group** if you're connected, or **Request** / **Requested** / **Accept request** if you're not.
    - **Real-time:** new messages, friend requests, invites, and unread counts arrive instantly over WebSockets (Socket.IO). The app still re-checks in the background as a safety net.
  - **Study Partners:**
    - **My Connections:** the classmates you've connected with, with **Message**, **Invite to group**, and **Remove**, followed by **Study Partner Invites** (requests other students sent you) with **Accept** / **Decline**.
    - **Find Study Partners:** your sent **Study Partner Requests** (with **Cancel**), then suggested classmates who share a course with you, each with a **Request** button.
  - **Study Groups:**
    - **Discover:** every public study group in your courses, with its members' pictures, a course filter and search, **Join** / **Joined ✓**, and **+ Create Group**.
    - **Public or private groups:** public groups show in Discover and any student in the course can join. Private groups never show in Discover; students join only by accepting an invite.
    - **Invites:** study group invitations sent to you, showing the group's members, with **Accept** / **Decline**.
    - Only students can create, join, or be invited to a group, and only within a course they're in. Teachers and TAs don't join groups; they can already read and post in every group (public or private) in the courses they teach (shown as "Teaching").
- **Direct messages are private:** only the two people in a conversation can read it (not even teachers), and you can only message people you're connected with.
- **Planner tab:** a month calendar of your course assignments and personal tasks (with due times), and **Add Task** for personal tasks (teachers and TAs can post course-wide assignments).
  - **Google Calendar sync** (when the Google Calendar settings are set): connect your Google account and BuddyTech copies your assignments into a separate "BuddyTech" calendar in your Google account. It's one-way, and BuddyTech can only touch calendars it created. New course assignments are pushed automatically after your first sync.
- **AI Tools tab:** AI study tools go through the backend (`POST /api/ai/chat`, powered by Gemini) when `GEMINI_API_KEY` is set.
- **Resources tab:** each course's shared links and files (PDFs, Office documents, images, zip files, and source code up to 20 MB). Everyone in the course can view and download them; only the course's teachers can add or delete them.
- **Settings tab:**
  - Change your display name (once a month).
  - Upload a profile picture (PNG, JPEG, WebP, or GIF, up to 3 MB, no transparent background) or remove it, and pick the background color for your initials avatar.
  - Only you, your classmates, and your connections can see your picture.
  - Email notification and assignment reminder switches (saved, but see the limitations below).
- **Rate limiting:**
  - **Sign-in:** after 5 wrong passwords for one email, sign-in for that account is blocked for 15 minutes. Each IP address can create at most 10 accounts per hour.
  - **Study partners and groups:** each user can send 20 friend requests per hour (3 per day to the same person), 30 study group invites per hour, and 30 user searches per minute. Failed attempts don't count.
  - **Settings and sync:** 3 profile picture uploads per 15 minutes, and 10 Google Calendar syncs per 15 minutes.

Demo accounts (created with the seed data, password `password123`):

| Email | Who | Courses |
|---|---|---|
| `student@buddytech.local` | Demo Student | CS 3398, BIO 1330 |
| `partner@buddytech.local` | Study Partner | CS 3398 |
| `teacher@buddytech.local` | Demo Teacher | CS 3398 (teacher) |
| `teacher2@buddytech.local` | Demo Teacher2 | BIO 1330 (teacher) |
| `partner1@buddytech.local` | Study Partner1 | CS 3398 (TA) |
| `partner2@buddytech.local`, `partner3@buddytech.local` | Study Partner2–3 | CS 3398 |
| `partner4@buddytech.local`, `partner5@buddytech.local` | Study Partner4–5 | CS 3398, BIO 1330 |
| `partner6@buddytech.local`, `partner7@buddytech.local` | Study Partner6–7 | BIO 1330 |

The seed data also includes:

- five study groups (three in CS 3398, two in BIO 1330); **Software Engineering Project Group** is private
- some connections between the accounts, and a pending friend request in each direction for Demo Student
- two study group invites waiting for Demo Student
- a few channel, group, and direct messages
- 18 assignments across both courses
- 10 course resources (links and files)
- animated profile pictures for Study Partner1–5

Demo Student, Study Partner, and Study Partner2 are all in **CS 3398 Exam Prep**.

Known limitations:

- **New accounts can't join a course yet.** Signing up (with a password or with Google) doesn't add the user to any course, and there is no "join course" feature, so a new account sees no channels, classmates, study groups, resources, or course assignments. For testing, use the demo accounts or add a row to `course_members` by hand.
- **`JWT_SECRET` must be set.** Natively, the backend reads it from `BuddyTech/Backend/port.env`; without it, sign-in and sign-up fail with a server error. Under Docker, `docker compose up` refuses to start until the root `.env` sets it.
- **Google features need a Google Cloud OAuth client.** Without `GOOGLE_CLIENT_ID`, the **Sign in with Google** button is hidden. Without all four Google Calendar settings, the Planner's sync card says sync isn't configured.
- **Google Calendar sync is one-way.** Changes made in Google Calendar don't come back to BuddyTech, and disconnecting leaves the "BuddyTech" calendar in your Google account.
- **The email notification and assignment reminder switches don't send anything yet.** They are saved, but the backend has no email sending.
- **A new direct message only appears for the other person once something is sent.** Clicking **Message** opens an empty chat for you right away, but nothing is saved until the first message.
- **Study groups have three fixed channels** (`#general`, `#homework`, `#meetups`).
- **Invite pickers list every group you can post in.** The app doesn't know which courses a connection is in, so if you pick a group they can't join, the backend refuses and explains why.
- **Teachers and TAs show up in Find Study Partners suggestions,** because suggestions are based on shared courses, not roles.
- **Signing out only affects this browser.** A login token stays valid until it expires (7 days); the server can't cancel it early.
- **Rate-limit counts and the Google Calendar sync queue reset on restart.** They are kept in the backend's memory, which only works while a single backend server is running.
- **The local Docker setup in this repository isn't meant for public hosting as-is:**
  - the frontend runs on the Vite development server instead of a production build
  - the site needs HTTPS
  - the demo accounts use a password that is published in this repository
  - Docker uses the MySQL root user with a weak password
- **AI tools need a Gemini API key.** Without `GEMINI_API_KEY`, the AI route returns "AI service is not configured yet".

## Technology Stack

- React 19 + Vite
- Node.js + Express 5
- MySQL 8
- Socket.IO (real-time updates)
- Google Identity Services (Sign in with Google) and the Google Calendar API
- Gemini (AI study tools)
- Docker / Docker Compose
