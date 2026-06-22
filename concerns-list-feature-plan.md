# Teacher Dashboard Concerns List Feature Plan

Task: `t_50a01e69` — requirements intake and implementation plan only. No application code was changed.

Repository inspected: `/home/jlopez/.hermes/kanban/boards/ptti-dashboard/workspaces/t_73da226d/PTTI_login_system`
Branch/commit from parent handoff: `feature/teacher-csv-quiz-import` at `ba2248948089a6de5d725c19d354e7d9957fd5f9`

## Requested feature

Add a Teacher Dashboard tab that shows the daily "concerns list": students and phone numbers imported automatically from a CSV email feed. Concerns list entries should disappear/delete after 48 hours. The reporting email address is expected to be `reporting@ptt.edu`. Email auth, webhook details, and CSV sample must be requested before implementation.

## Existing patterns found

### Backend

- Express API is wired in `server/src/index.ts` with route modules mounted under `/api/*`.
- Teacher-only routes use `requireAuth`, including `server/src/routes/teacher.ts` and `server/src/routes/grades.ts`.
- Existing scheduled work uses `node-cron`:
  - Dependency exists in `server/package.json`.
  - `server/src/cron/monthlyRotation.ts` schedules monthly rotation with `cron.schedule('0 0 1 * *', ...)`.
  - `server/src/index.ts` calls `scheduleMonthlyRotation()` at startup.
- Existing outbound email is SMTP-only:
  - `server/src/services/emailService.ts` uses `nodemailer` for teacher verification emails.
  - SMTP env vars already exist in docs/examples: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
- No inbound email/IMAP/webhook ingestion implementation was found.
  - No IMAP dependency is currently listed in `server/package.json`.
  - No webhook endpoint for email providers was found.
- Existing spreadsheet parsing uses `xlsx` and in-memory file parsing:
  - Student import: `server/src/services/csvImportService.ts` reads XLSX/CSV-like workbook buffers and imports students.
  - Quiz grade import: `server/src/services/quizGradeImportService.ts` parses workbook rows, validates headers, previews matches, and applies upserts.
- Existing upload routes use `multer.memoryStorage()` with file-size limits.
  - Student import route: `POST /api/students/import` in `server/src/routes/students.ts`.
  - Grade import route: `POST /api/grades/import/preview` and `/apply` in `server/src/routes/grades.ts`.

### Frontend

- Teacher dashboard lives in `client/src/pages/TeacherDashboard.tsx`.
- Current dashboard is a single page with top nav actions (`School-wide View`, `Grades`, logout), split panels, and action-column buttons.
- API wrappers/types live in `client/src/api/index.ts`.
- A concerns list should likely follow the existing pattern: add typed API functions in `client/src/api/index.ts`, a dedicated component/modal/page for concerns, and a Teacher Dashboard nav/action entry.

## Recommended product behavior

### What teachers see

- Add a Teacher Dashboard nav button or tab: `Concerns List`.
- The view should show only unexpired active concerns by default.
- Table columns, pending CSV confirmation:
  - Student name
  - Phone number
  - Concern date/import date
  - Source file/message metadata
  - Expires at
  - Optional note/reason/category if present in CSV
- Add visible copy such as: `Entries auto-expire 48 hours after import`.
- Add a manual refresh button.
- Optional admin/teacher controls after clarification:
  - Manual upload fallback for CSV/XLSX.
  - Manually expire/delete one entry.
  - View import history and skipped-row errors.

### Expiration behavior

Use both query filtering and cleanup:

1. Every normal list query returns only records where `expiresAt > now` and `deletedAt IS NULL`.
2. A cron cleanup job runs periodically and marks/removes expired rows.
3. Prefer soft delete first (`deletedAt`) rather than immediate hard delete, because these records contain PII and imports need audit/debug visibility. If the user requires literal deletion after 48 hours, use hard delete in the cleanup job after confirming retention needs.

Recommended cleanup schedule:

- `cron.schedule('*/15 * * * *', cleanupExpiredConcernEntries)` to check every 15 minutes, or hourly if the app needs fewer DB writes.
- On server startup, also call a one-time cleanup so stale entries disappear even if cron was offline.

## Proposed database schema

Add to `server/prisma/schema.prisma`:

```prisma
model ConcernEntry {
  id             String    @id @default(uuid())
  studentName    String    @map("student_name")
  normalizedName String?   @map("normalized_name")
  phoneNumber    String    @map("phone_number")
  concernDate    DateTime? @map("concern_date") @db.Date
  sourceEmail    String?   @map("source_email")
  sourceMessageId String?  @map("source_message_id")
  sourceFileName String?   @map("source_file_name")
  importedAt     DateTime  @default(now()) @map("imported_at") @db.Timestamptz
  expiresAt      DateTime  @map("expires_at") @db.Timestamptz
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz
  rawRow         Json?     @map("raw_row")

  @@index([expiresAt])
  @@index([deletedAt])
  @@index([sourceMessageId])
  @@map("concern_entries")
}
```

Optional separate import log model:

```prisma
model ConcernImportRun {
  id              String   @id @default(uuid())
  sourceEmail     String?  @map("source_email")
  sourceMessageId String?  @unique @map("source_message_id")
  sourceFileName  String?  @map("source_file_name")
  importedAt      DateTime @default(now()) @map("imported_at") @db.Timestamptz
  rowsImported    Int      @default(0) @map("rows_imported")
  rowsSkipped     Int      @default(0) @map("rows_skipped")
  errors          Json?

  @@map("concern_import_runs")
}
```

Deduplication should be confirmed after seeing the CSV. Candidate unique key choices:

- For email imports: unique `sourceMessageId` plus row number to prevent reprocessing the same email.
- For daily list semantics: unique normalized student name + phone number + concern date/import day, if repeated CSVs should replace the same daily list.
- Avoid unique by phone number alone; multiple students/family contacts could share a number.

## Proposed API design

Create `server/src/routes/concerns.ts` mounted in `server/src/index.ts` as `/api/concerns`.

Teacher-authenticated routes:

- `GET /api/concerns`
  - Returns active, unexpired concerns.
  - Query params: optional `date`, `includeExpired=false`.
- `POST /api/concerns/import/preview`
  - Optional manual CSV/XLSX upload fallback using `multer.memoryStorage()`.
  - Parses file and returns importable/skipped rows without saving.
- `POST /api/concerns/import/apply`
  - Optional manual CSV/XLSX upload fallback; applies parsed rows.
- `POST /api/concerns/import/email/run`
  - Admin/teacher-triggered manual email poll, if IMAP polling is selected.
- `DELETE /api/concerns/:id`
  - Optional manual expire/delete. Prefer setting `deletedAt`.

Internal services:

- `server/src/services/concernImportService.ts`
  - Parse CSV/XLSX buffer.
  - Validate required headers.
  - Normalize names/phone numbers.
  - Apply dedupe policy.
- `server/src/services/concernEmailIngestService.ts`
  - Only if email ingestion is selected.
  - Fetch or receive email attachments from `reporting@ptt.edu`.
  - Validate sender and attachment type.
  - Pass attachment buffer to `concernImportService`.
- `server/src/cron/concernCleanup.ts`
  - Delete or soft-delete expired rows.
- `server/src/cron/concernEmailPolling.ts`
  - Only if IMAP polling is selected.

## Email ingestion options

### Option A: IMAP polling from `reporting@ptt.edu`

Best if the app can sign into the mailbox directly.

Needed additions:

- Add an IMAP library such as `imapflow` plus MIME parser such as `mailparser`.
- Env vars:
  - `CONCERNS_EMAIL_MODE=imap`
  - `CONCERNS_IMAP_HOST`
  - `CONCERNS_IMAP_PORT`
  - `CONCERNS_IMAP_SECURE=true/false`
  - `CONCERNS_IMAP_USER=reporting@ptt.edu`
  - `CONCERNS_IMAP_PASS` or OAuth credentials/app password
  - `CONCERNS_ALLOWED_SENDERS` if only specific systems should send CSVs
- Cron schedule example: every 5-15 minutes.
- Store processed email/message IDs to avoid duplicate imports.

Pros: Does not require public webhook URL. Works with normal mailbox access.
Cons: Needs mailbox credentials/app password/OAuth and careful duplicate handling.

### Option B: Email provider webhook

Best if PTT email is hosted by a provider that supports inbound parse webhooks, or if mail can be forwarded to a service like SendGrid/Mailgun/Postmark/Cloudflare Email Workers.

Needed additions:

- Public HTTPS endpoint, e.g. `POST /api/concerns/import/webhook`.
- Signature validation or shared secret.
- Provider-specific parsing of attachment payload.
- Env vars:
  - `CONCERNS_EMAIL_MODE=webhook`
  - `CONCERNS_WEBHOOK_SECRET`
  - Provider-specific signing/public key variables.

Pros: Near real-time, no polling credentials in the app.
Cons: Requires provider support, public URL, and secure webhook validation.

### Option C: Forwarded attachment to a controlled mailbox/service

Useful if direct `reporting@ptt.edu` access is unavailable.

- PTT forwards concerns CSV emails to a mailbox/service that the app can access.
- The app still uses either IMAP polling or a webhook on the destination.

## CSV/XLSX requirements to confirm

Before implementation, request a real sample CSV/XLSX or at least exact headers. The parser should not be implemented against guessed columns.

Questions:

1. What are the exact CSV/XLSX headers for student name and phone number?
2. Is there a concern/reason/category column, or only name + phone?
3. Does the CSV include one sheet or multiple sheets?
4. If XLSX, what is the sheet name? If CSV, what delimiter/encoding is used?
5. Does the list represent only today's concerns, or can it include a date column for future/past days?
6. Should each import replace the current active daily list, or append/update entries?
7. Are duplicate rows possible? If yes, should duplicates be skipped, merged, or shown once?
8. Should rows be matched to existing `Student` records, or shown even if no matching student exists?
9. Should teachers see all concerns, or only concerns for their assigned subject/shift/students?
10. Should the system hard-delete after 48 hours, or soft-delete/hide after 48 hours with an admin audit log?

## Security and PII handling notes

This feature stores student names and phone numbers, so treat it as sensitive PII.

- Restrict all concerns API routes to authenticated teachers at minimum.
- Consider role/admin checks if not every teacher should see every phone number.
- Do not log raw CSV rows, phone numbers, email credentials, or attachment contents in normal logs.
- Store email credentials only in environment variables/secrets, never in git.
- Validate file extension and MIME type; accept only `.csv`, `.xlsx`, maybe `.xls` if required.
- Use size limits comparable to existing imports (`5-10MB`) and reject oversized attachments.
- Normalize phone numbers for display/dedupe, but keep original formatting if needed.
- Validate webhook signatures/shared secrets before parsing attachments.
- Deduplicate processed email message IDs to avoid repeated imports.
- Decide hard delete vs soft delete before implementation; if literal auto-delete is required, ensure cleanup permanently removes rows older than 48 hours.

## Implementation phases

### Phase 0 — User inputs/blockers

Do not implement until the following are provided/decided:

- Sample concerns CSV/XLSX file or exact header list.
- Ingestion mechanism: IMAP polling, email provider webhook, or forwarded attachment/service.
- Credentials/auth approach for `reporting@ptt.edu` if IMAP polling is chosen.
- Webhook provider, public URL availability, and signing/secret details if webhook is chosen.
- Whether rows should match existing students and whether visibility is all-teacher or teacher-scoped.
- Whether 48-hour behavior must be hard delete or hidden/soft delete.

### Phase 1 — Schema and parser

- Add Prisma models/migration for `ConcernEntry` and optional `ConcernImportRun`.
- Build parser service with header validation based on confirmed CSV sample.
- Add unit tests using sanitized sample rows.
- Add dedupe policy.

### Phase 2 — Manual import and API

- Add authenticated concerns routes.
- Add `GET /api/concerns` for active concerns.
- Add manual import preview/apply endpoint as a safe fallback, even if automatic email import is planned.
- Add tests for parser and route/service behavior.

### Phase 3 — UI tab

- Add concerns API types/functions in `client/src/api/index.ts`.
- Add `ConcernsList` component/page/modal.
- Add Teacher Dashboard nav/action button.
- Display active entries, expiration time, import status/skipped rows if applicable.

### Phase 4 — Expiry cleanup

- Add `server/src/cron/concernCleanup.ts`.
- Schedule cleanup from `server/src/index.ts`.
- Ensure queries hide expired rows even if cleanup has not run yet.
- Test expiry behavior using seeded/fake timestamps.

### Phase 5 — Automatic email import

Implement one of:

- IMAP polling cron with `imapflow` + `mailparser`; or
- Provider webhook endpoint with signature validation; or
- Forwarded mailbox/service ingestion.

Add import-run logging and processed-message dedupe.

### Phase 6 — Deployment/secrets

- Add required env vars to `.env.example` without real secrets.
- Document setup steps for mailbox/webhook credentials.
- Verify Docker/server build.
- Verify cron startup logs.

## Recommended default path after clarification

If the user can provide mailbox/app-password access for `reporting@ptt.edu`, start with IMAP polling because the current app already runs scheduled jobs through `node-cron` and does not appear to have an inbound email webhook provider configured.

If the email provider already has inbound webhook support and the deployed app has a stable public HTTPS URL, prefer webhook ingestion for faster delivery and fewer mailbox-auth issues.
