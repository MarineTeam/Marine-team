-- Automatic transcription: a small queue held on the video itself.
ALTER TABLE "Video" ADD COLUMN "transcriptStatus" TEXT;
ALTER TABLE "Video" ADD COLUMN "transcriptError" TEXT;
ALTER TABLE "Video" ADD COLUMN "transcriptStartedAt" TIMESTAMP(3);
