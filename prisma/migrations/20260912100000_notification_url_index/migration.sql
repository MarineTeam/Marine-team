-- The small-group join throttle counts recent notifications by url. Without
-- this index that count is a sequential scan of every notification ever sent,
-- on a path anybody signed in can trigger.
CREATE INDEX "Notification_url_createdAt_idx" ON "Notification"("url", "createdAt");
