# BuddyTech

BuddyTech is a student-focused academic collaboration platform built with React, Express, and MySQL.

## Recommended Setup: Docker

Docker is the easiest and most reliable way to run BuddyTech on macOS, Windows, or Linux.

### Requirements

Install:

- Git
- Docker Desktop

You do not need to install Node.js or MySQL separately when using Docker.

### 1. Clone the repository

    git clone https://github.com/lukene1son/CS-3398-Team-6.git
    cd CS-3398-Team-6

### 2. Start BuddyTech

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

### 3. Open BuddyTech

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

## Native Development Setup

Docker is recommended, but BuddyTech can also run directly on a developer machine.

### Backend

Requirements:

- Node.js
- MySQL

From the repository root:

    cd BuddyTech/Backend
    cp .env.example .env
    npm ci

Edit `.env` if your MySQL username or password differs from the defaults.

Initialize the database if necessary:

    npm run db:ensure

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
- **Message board (Spaces):** members of a course can chat in its channels. Messages show up for other users within about 3 seconds.
- **Calendar and dashboard:** show the signed-in user's assignments and tasks. Tasks can be checked off on the dashboard, and each user's check-offs are saved separately.
- **Sign-in rate limiting:** after 5 wrong passwords for one email, sign-in for that account is blocked for 15 minutes. Each IP address can create at most 10 accounts per hour.

Demo accounts (created with the seed data, password `password123`):

- `student@buddytech.local`
- `partner@buddytech.local`
- `teacher@buddytech.local`

Known limitations:

- **New accounts can't join a course yet.** Signing up doesn't add the user to any course, and there is no "join course" feature, so a new account sees no channels or course assignments. For testing, use the demo accounts or add a row to `course_members` by hand.
- **`JWT_SECRET` must be set.** The backend reads it from `BuddyTech/Backend/port.env`, which is not in Git. Without it, sign-in and sign-up fail with a server error, including under Docker, because `docker-compose.yml` doesn't set it.
- **Chat is not real-time.** The message board checks for new messages every 3 seconds instead of using WebSockets.
- **Signing out only affects this browser.** A login token stays valid until it expires (7 days); the server can't cancel it early.
- **Rate-limit counts reset on restart.** They are kept in the backend's memory, which only works while a single backend server is running.
- **Not ready for public hosting yet:**
  - the frontend runs on the Vite development server instead of a production build
  - the site needs HTTPS
  - the demo accounts use a password that is published in this repository
  - Docker uses the MySQL root user with a weak password
- **Resources and Settings pages use placeholder data.** Their backend routes don't exist yet (see `USE_MOCK` in `Frontend/src/api.js`).
- **AI tools are not connected to a live model yet.** They return a demo response.
- **Some feature branches haven't been merged into `main`**, including `bianca-calendar-ui` and `feature/fidel/login-page`.

## Technology Stack

- React
- Vite
- Node.js
- Express
- MySQL
- Docker / Docker Compose
