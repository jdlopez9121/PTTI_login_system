-- CreateEnum
CREATE TYPE "GradeType" AS ENUM ('quiz', 'project');

-- CreateTable
CREATE TABLE "grade_templates" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "type" "GradeType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "max_score" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_entries" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "score" DECIMAL(5,2),
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "submitted_by" TEXT,
    "submitted_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grade_templates_teacher_id_subject_name_key" ON "grade_templates"("teacher_id", "subject", "name");

-- CreateIndex
CREATE UNIQUE INDEX "grade_entries_template_id_student_id_key" ON "grade_entries"("template_id", "student_id");

-- AddForeignKey
ALTER TABLE "grade_templates" ADD CONSTRAINT "grade_templates_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "grade_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
