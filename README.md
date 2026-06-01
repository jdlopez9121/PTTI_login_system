# PTTI Attendance System

Web-based attendance portal for PTTI technical school. Students log in via kiosk using their ID or name. Teachers get a live split-view dashboard showing present students vs. theoretical head count. 
HTTP://ptti-login - save as a shortcut on all computers using this system
add first teacher via CLI:
docker compose exec server npm run add:teacher -- --name "Jose Lopez" --email "jlopez@ptt.edu" --password "URdead77??" --subject1 "PLC 1" --shift morning

if searching:
SELECT name, email, subject_1, subject_2, subject_3, shift FROM teachers;

---

## Tech Stack

- **Frontend:** React + TypeScript (Vite) — runs on port 5173
- **Backend:** Node.js + Express — runs on port 3001
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** JWT (teachers only) + HTTP-only cookies

---

## Running with Docker (Recommended)

Docker runs PostgreSQL, the API server, and the React UI all together — no local installs needed beyond Docker Desktop.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Step 1 — Create your `.env` file

```bash
copy .env.example .env
```

Open `.env` and set two required values:

```
POSTGRES_PASSWORD=choose_a_strong_password
JWT_SECRET=replace_with_a_long_random_string
```

The SMTP fields are optional — leave them blank if you are not using teacher email verification.

### Step 2 — Build and start everything

```bash
docker compose up --build
```

This will:
1. Start a PostgreSQL 16 container with a persistent volume
2. Build the Express API, run database migrations, seed the curriculum, and start the server
3. Build the React app and serve it through nginx

First build takes 2–3 minutes. Subsequent starts are fast.

### Step 3 — Open the app

Go to **http://localhost** in your browser.

### Step 4 — Add your first teacher account

```bash
docker compose exec server npm run add:teacher -- \
  --name "Your Name" \
  --email "you@ptti.edu" \
  --password "YourPassword" \
  --subject1 "DC 1" \
  --shift morning
```

### Useful Docker commands

| Command | What it does |
|---|---|
| `docker compose up --build` | Build images and start all containers |
| `docker compose up -d` | Start in background (detached) |
| `docker compose down` | Stop and remove containers (data volume kept) |
| `docker compose down -v` | Stop and delete everything including the database |
| `docker compose logs -f server` | Stream server logs |
| `docker compose logs -f client` | Stream nginx logs |
| `docker compose exec server npm run add:teacher -- [flags]` | Add a teacher account |

### Connecting pgAdmin to the Docker database

If you want to browse the database from pgAdmin while Docker is running:

- **Host:** `localhost`
- **Port:** `5432`
- **Database:** `ptti_attendance`
- **Username:** `postgres`
- **Password:** the `POSTGRES_PASSWORD` value from your `.env`

---

## Local Development Setup (without Docker)

### 1. Install dependencies

From the project root:

```bash
npm run install:all
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```
DATABASE_URL="postgresql://user:password@localhost:5432/ptti_attendance"
JWT_SECRET="replace-with-a-long-random-string"
NODE_ENV="development"
PORT=3001
CLIENT_URL="http://localhost:5173"

SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
```

### 3. Set up the database

```bash
npm run db:migrate    # create all tables
npm run db:seed       # seed the curriculum table (required)
```

### 4. Start the servers

Open two terminals:

```bash
# Terminal 1 — API
npm run dev:server

# Terminal 2 — React app
npm run dev:client
```

Then open [http://localhost:5173](http://localhost:5173).

---

## Adding Teacher Accounts

Teacher accounts are created manually by an admin using the CLI script. No self-registration is available.

From the `server/` folder, run:

```bash
npm run add:teacher -- \
  --name "Jane Smith" \
  --email "jane@ptti.edu" \
  --password "SecurePass123" \
  --subject1 "DC 1" \
  --subject2 "AC 1" \
  --shift morning
```

| Flag | Required | Description |
|---|---|---|
| `--name` | Yes | Teacher's full name |
| `--email` | Yes | Login email |
| `--password` | Yes | Login password (hashed automatically) |
| `--subject1` | Yes | Primary subject taught |
| `--subject2` | No | Secondary subject (used for filtering) |
| `--shift` | Yes | `morning`, `afternoon`, `evening`, or `night` |

**Valid subjects:** PLC 1, PLC 2, PLC 3, DC 1, DC 2, DC 3, AC 1, AC 2, MT, HT

The account is created as pre-verified — the teacher can log in immediately.

Alternatively, open **Prisma Studio** for a visual table editor:

```bash
cd server && npm run db:studio
```

---

## Curriculum Schedule

Students progress through a 5-month program. The system auto-calculates which teacher's room each student belongs to based on their enrollment month.

| Program Month | Day Track (Morning) | Day Track (Afternoon) | Night Track (Evening) | Night Track (Night) |
|---|---|---|---|---|
| 1 | DC 1 | AC 1 | DC 1 | AC 1 |
| 2 | MT | PLC 1 | MT | PLC 1 |
| 3 | AC 2 | DC 2 | AC 2 | DC 2 |
| 4 | PLC 2 | HT | PLC 2 | HT |
| 5 | PLC 3 | DC 3 | PLC 3 | DC 3 |

After 5 months, students become **floating** — they can still log in but no longer appear in any teacher's head count.

---

## Shift Windows

The system auto-assigns a shift based on login time.

| Shift | Login Window |
|---|---|
| Morning | 7:55 AM – 11:25 AM |
| Afternoon | 11:30 AM – 2:55 PM |
| Evening | 3:00 PM – 6:55 PM |
| Night | 7:00 PM – 11:00 PM |

**Note:** Each attendance record credits shift duration + 1 hour (preserved legacy behavior).

---

## CSV Import

Teachers can bulk-import students from the school's Excel roster via the **Import CSV** button on the dashboard.

- Target sheet: **Full Pop**
- Required columns: `Acct` (student ID), `Name` (Last, First), `Start` (Excel serial date), `Groups` (DAY or EVE)
- All other columns are ignored
- Duplicate student IDs are skipped automatically

---

## Available Scripts

All from the project root:

| Script | Description |
|---|---|
| `npm run install:all` | Install all dependencies |
| `npm run dev:server` | Start the API server (port 3001) |
| `npm run dev:client` | Start the React frontend (port 5173) |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed curriculum data |
| `npm run db:studio` | Open Prisma Studio (visual DB editor) |

From `server/` only:

| Script | Description |
|---|---|
| `npm run add:teacher -- [flags]` | Create a teacher account |
