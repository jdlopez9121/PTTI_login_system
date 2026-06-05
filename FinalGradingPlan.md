# Grading Module — Implementation Plan

## Context
The PTTI attendance system needs a new grading module so teachers can track and enter grades per cohort. There is zero existing grade-related code. The module must integrate with the existing teacher-subject-cohort model and add a public project-submission entry point on the login screen. The user wants the work phased.

---

## Phase 1 — Database Schema & Core API

### Prisma schema changes (`server/prisma/schema.prisma`)

Add enum and two new models. Also add back-relations to existing `Teacher` and `Student` models.

```prisma
enum GradeType {
  quiz
  project
}

model GradeTemplate {
  id          String       @id @default(uuid())
  teacherId   String       @map("teacher_id")
  teacher     Teacher      @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  subject     String
  type        GradeType
  name        String       // "Quiz 1", "Final Project"
  description String?
  maxScore    Decimal      @default(100) @db.Decimal(5, 2)
  createdAt   DateTime     @default(now())
  entries     GradeEntry[]
  @@unique([teacherId, subject, name])
  @@map("grade_templates")
}

model GradeEntry {
  id           String        @id @default(uuid())
  templateId   String        @map("template_id")
  template     GradeTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  studentId    String        @map("student_id")
  student      Student       @relation(fields: [studentId], references: [id])
  score        Decimal?      @db.Decimal(5, 2)
  isVerified   Boolean       @default(false) @map("is_verified")
  submittedBy  String?       @map("submitted_by")   // 'teacher' | 'student'
  submittedAt  DateTime?     @map("submitted_at")
  verifiedById String?       @map("verified_by_id") // Teacher.id FK (soft ref)
  verifiedAt   DateTime?     @map("verified_at")
  createdAt    DateTime      @default(now())
  @@unique([templateId, studentId])
  @@map("grade_entries")
}
```

Add to `Teacher` model: `gradeTemplates GradeTemplate[]`  
Add to `Student` model: `gradeEntries GradeEntry[]`

Run: `npx prisma migrate dev --name add-grading-module`

---

### New API file: `server/src/routes/grades.ts`

Mount in `server/src/index.ts` as: `app.use('/api/grades', gradesRouter)`

#### Endpoints (all auth-required unless noted)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/grades/templates` | List templates for teacher's subjects. Query: `?subject=DC+1` |
| POST | `/api/grades/templates` | Create one template. If `batchAllCohorts: true` in body, auto-create `GradeEntry` rows for every active non-floating student in that subject |
| DELETE | `/api/grades/templates/:id` | Delete template + cascade entries |
| GET | `/api/grades/dashboard` | Grade table for one cohort. Query: `?subject=DC+1&cohortStartMonth=5&track=day`. Returns students[], templates[], entries[], attendance% per student |
| PUT | `/api/grades/entries/:entryId` | Set score + optionally verify (projects) |
| POST | `/api/grades/entries` | Create a missing entry (teacher enters score for student not yet in entries) |
| GET | `/api/grades/projects/public` | **No auth** — list project templates for a subject dropdown. Query: `?subject=DC+1` |
| POST | `/api/grades/projects/submit` | **No auth** — student submits project. Body: `{ studentId (human-readable), subject, templateId }` |

#### Attendance calculation (implemented inside `GET /api/grades/dashboard` handler)

Each student can attend two classes per day (two rooms). Attendance grade is **per subject**, filtering logs by the room that corresponds to the requested subject.

**Room → subject mapping** (define as a constant in `grades.ts`):
```
"PLC Room"   → PLC 1, PLC 2, PLC 3
"AC Room"    → AC 1, AC 2
"DC Room"    → DC 1, DC 2, DC 3
"MT/HT Room" → MT, HT
```

```
attendance% for student X in subject Y this month =
  count(DISTINCT date from AttendanceLog
    where studentId = X
    and date >= first-of-month
    and roomName = room_for_subject(Y))
  /
  count(Mon–Fri days in current calendar month)
  * 100
```

Capped at 100. Stored as a computed value in the response, not persisted. Each teacher's grade table shows the attendance % specific to their subject's room.

#### Grade total formula

```
total = (attendance_pct * 0.10) + (quiz_avg * 0.15) + (project_avg * 0.75)

quiz_avg    = avg(score / maxScore * 100) over all quiz entries that have a score
project_avg = avg(score / maxScore * 100) over all VERIFIED project entries that have a score
```

Unscored or unverified entries are excluded from the average (not treated as zero).

---

## Phase 2 — Teacher Grade Dashboard UI

### New files

**`client/src/pages/GradesDashboard.tsx`**
- On mount: fetch teacher's subjects from `getMe()`, then list all active cohorts for each subject (derived from headcount data or a new lightweight endpoint if needed)
- Shows a subject selector (tabs or dropdown) and below it a list of active cohorts for that subject
- Click a cohort → renders `GradeTable` for that cohort

**`client/src/components/GradeTable.tsx`**
- Inline-column layout: fixed columns (Student ID, Full Name, Attendance %, Total Grade) + one dynamic column per GradeTemplate
- Editable score cells: click → input field → blur/enter saves via `PUT /api/grades/entries/:id`
- Projects: unverified entries show a "Verify" button next to the score input
- Column header row shows a "Add Quiz" / "Add Project" button that opens GradeTemplateManager

**`client/src/components/GradeTemplateManager.tsx`** (modal)
- Form: Type (quiz/project toggle), Name, Description (optional), Max Score
- Checkbox: "Apply to all active cohorts for this subject" (batch mode)
- On submit: `POST /api/grades/templates`

### Modified files

**`client/src/pages/TeacherDashboard.tsx`**
- Add "Grades" button in the nav bar (alongside the existing "School-wide View" button)
- Navigates to `/grades` route

**`client/src/main.tsx`**
- Add route: `<Route path="/grades" element={<GradesDashboard />} />`

**`client/src/api/index.ts`**
- Add: `getGradeTemplates(subject)`, `createGradeTemplate(payload)`, `deleteGradeTemplate(id)`
- Add: `getGradeDashboard(subject, cohortStartMonth, track)`
- Add: `updateGradeEntry(entryId, score, isVerified?)`, `createGradeEntry(templateId, studentId)`

---

## Phase 3 — Project Submission on Login Page

### New file

**`client/src/components/ProjectSubmitModal.tsx`**
- Triggered by a "Submit Project" button on `LoginPage.tsx` (separate small button, not in the login form card)
- Form fields:
  1. **Class** — dropdown, populated from `GET /api/grades/projects/public` (distinct subjects that have project templates)
  2. **Student ID** — text input (human-readable ID, e.g. "12345")
  3. **Project Name** — dropdown, populated once class is selected (project templates for that subject)
- Submit calls `POST /api/grades/projects/submit`
- On success: confirmation message; entry is created with `submittedBy: 'student'`, `isVerified: false`

### Modified files

**`client/src/pages/LoginPage.tsx`**
- Add a small "Submit Project" button below or outside the main login card
- `{showProjectSubmit && <ProjectSubmitModal onClose={() => setShowProjectSubmit(false)} />}`

**`client/src/api/index.ts`**
- Add: `getPublicProjects(subject)`, `submitProject(studentId, subject, templateId)`

---

## Key Design Decisions

| Decision | Choice |
|----------|--------|
| Grade templates scope | Per-teacher + per-subject. Two teachers who both teach DC 1 have independent grade books |
| Attendance denominator | Mon–Fri days in current calendar month (resets monthly); filtered by room for that subject |
| Attendance scope | Per-subject (student in DC Room → attendance credit for DC grade; MT/HT Room → MT/HT grade) |
| Unscored entries | Excluded from averages (not treated as zero) |
| Unverified projects | Excluded from project average; shown as pending in UI |
| Batch template | Creates `GradeEntry` rows up-front for all active, non-floating students in that subject |
| Project submit auth | No auth — uses human-readable student ID for lookup |

---

## Verification

1. **API** — After Phase 1, test with `curl`:
   - Create a template (quiz, batch=true) → check DB for entry rows
   - Fetch dashboard → confirm attendance % is calculated per room, template columns appear
   - Submit project as student (no auth) → confirm pending entry in DB

2. **UI** — After Phase 2:
   - Log in as teacher → click "Grades" → select a subject → confirm cohort list appears
   - Select a cohort → confirm inline column table renders with student rows
   - Enter a quiz score → confirm PUT fires and cell updates

3. **Phase 3**:
   - On login page click "Submit Project" → confirm modal opens with subject/project dropdowns
   - Submit → confirm unverified entry in DB
   - Teacher opens grade table → Verify button → confirm `isVerified: true`, entry now counts toward average
