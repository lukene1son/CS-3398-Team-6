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

Known limitations:

- authentication is still a prototype
- login state is lost after a browser refresh
- some Sprint 2 features still exist on separate branches and have not yet been integrated
- AI functionality is not connected to a live model yet

## Technology Stack

- React
- Vite
- Node.js
- Express
- MySQL
- Docker / Docker Compose
