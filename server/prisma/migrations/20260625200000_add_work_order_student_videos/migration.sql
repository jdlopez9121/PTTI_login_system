-- CreateTable
CREATE TABLE "work_order_student_videos" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "title" TEXT,
    "original_url" TEXT NOT NULL,
    "embed_url" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_student_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_student_videos_created_at_idx" ON "work_order_student_videos"("created_at");

-- AddForeignKey
ALTER TABLE "work_order_student_videos" ADD CONSTRAINT "work_order_student_videos_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
