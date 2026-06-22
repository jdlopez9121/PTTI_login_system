# Changes by Claude — 2026-06-22

Branch: `feature/teacher-csv-quiz-import`

---

## Overview

Applied security hardening, performance fixes, and resilience improvements across the server and client. All changes are based on findings from `CODE_REVIEW_REPORT.md`. CSRF protection and JWT_SECRET enforcement were intentionally skipped per user instruction.

---

## Server Changes

### `server/prisma/schema.prisma`
- Added `verifyTokenExpiresAt DateTime?` field to the `Teacher` model so email verification links can expire.
- Prisma client was regenerated after the schema change.
- **Action required:** Run `npx prisma db push` once the database is reachable to apply the new column.

### `server/src/routes/auth.ts`
- Installed and wired up `express-rate-limit`:
  - `/signup` — max 5 requests per IP per hour.
  - `/login` — max 10 requests per IP per 15 minutes.
- Added `validatePassword()` helper that enforces: minimum 8 characters, at least one uppercase letter, one lowercase letter, and one digit. Called during `/signup`.
- Signup now stores `verifyTokenExpiresAt` set to 24 hours from token creation.
- Verify endpoint (`GET /verify/:token`) now rejects tokens that are missing, expired, or invalid, and clears both `verifyToken` and `verifyTokenExpiresAt` on successful verification.

### `server/src/services/emailService.ts`
- Replaced raw string interpolation for the verification URL with the `URL` constructor — throws a clear error if `CLIENT_URL` is malformed.
- Added `escapeHtml()` helper. The link is HTML-escaped before being injected into the email body, preventing XSS if the environment variable is tampered with.
- Email body now mentions the 24-hour expiry window.

### `server/src/routes/schoolwide.ts`
- **Fixed N+1 query.** The previous implementation queried the database once per curriculum entry (students query + attendance query = 2N queries for N entries).
- Now performs exactly 2 parallel queries upfront (all students, all attendance logs for the day/shift), then filters and aggregates in memory per curriculum entry.

### `server/src/services/quizGradeImportService.ts`
- Updated `QuizGradeImportPrisma` interface: replaced the batch array form of `$transaction` with the callback form (`(tx) => Promise<T>`), and introduced `QuizGradeImportTxClient` for the transaction client type.
- **Fixed non-atomic import.** The previous implementation used two separate `$transaction` calls — one for template upserts, one for entry upserts — so a failure mid-way could leave templates created but entries missing.
- Now uses a single `$transaction` callback that upserts all templates then all entries atomically. If any step fails, the entire import rolls back.
- Added early return when there are no importable rows.

---

## Client Changes

### `client/src/components/CsvImportButton.tsx`
- The `onImported()` callback is now wrapped in its own inner `try/catch`. If the post-import data refresh throws, the error is silently absorbed — the import result is still shown to the user and the page remains functional.
- Updated `Props.onImported` type from `() => void` to `() => void | Promise<void>` to correctly reflect that the callback can be async.

### `client/src/components/ErrorBoundary.tsx` *(new file)*
- Class-based React error boundary.
- Catches any unhandled render or lifecycle error in its subtree.
- Displays the error message and a **Try Again** button that resets boundary state.
- Accepts an optional `fallback` prop for custom error UI.

### `client/src/pages/TeacherDashboard.tsx`
- Imported `ErrorBoundary`.
- Wrapped the entire dashboard JSX in `<ErrorBoundary>` so a component crash shows the recovery UI instead of a blank white page.

---

## Dependency Added

| Package | Location | Reason |
|---------|----------|--------|
| `express-rate-limit` | `server` | Rate-limit auth endpoints to prevent brute-force attacks |

---

## What Was Skipped

| Item | Reason |
|------|--------|
| CSRF token protection | Skipped per user instruction |
| JWT_SECRET hard-fail at startup | Skipped per user instruction |
| GradeDashboard state refactor (split into sub-components) | Large refactor, deferred |
| Security audit logging | Deferred — requires schema additions and a logging strategy |
| Timezone-aware date handling (client/server) | Deferred — low impact for current use case |

---

## Database Migration Note

The `verify_token_expires_at` column must be added to the `teachers` table before the server can process signups or verifications. Run the following once the database is available:

```bash
cd server
npx prisma db push
# or, if using migrations:
npx prisma migrate dev --name add_verify_token_expiry
```
