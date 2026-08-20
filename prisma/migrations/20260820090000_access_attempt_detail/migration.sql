-- The Auth0 SDK's own error classification for an AUTH0_CALLBACK_ERROR
-- attempt, so an admin can see *why* Auth0 refused the callback instead of
-- just that it did. Never a token, code, or secret — see the column comment
-- in schema.prisma.

-- AlterTable
ALTER TABLE "UnauthorizedAccessAttempt" ADD COLUMN     "detail" TEXT;
