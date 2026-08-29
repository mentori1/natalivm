-- Existing confirmed Telegram bookings are real client bookings.
UPDATE "Attendance" AS attendance
SET "enrollmentSource" = 'bot'
FROM "BotBooking" AS booking
WHERE booking."clientId" = attendance."clientId"
  AND booking."lessonId" = attendance."lessonId"
  AND booking."status" = 'confirmed';

-- Rows created together with a group lesson came from automatic roster filling.
UPDATE "Attendance" AS attendance
SET "enrollmentSource" = 'auto'
FROM "Lesson" AS lesson
WHERE lesson."id" = attendance."lessonId"
  AND lesson."format" = 'group'
  AND attendance."status" = 'enrolled'
  AND attendance."enrollmentSource" = 'crm'
  AND ABS(EXTRACT(EPOCH FROM (attendance."createdAt" - lesson."createdAt"))) <= 30
  AND NOT EXISTS (
    SELECT 1
    FROM "BotBooking" AS booking
    WHERE booking."clientId" = attendance."clientId"
      AND booking."lessonId" = attendance."lessonId"
      AND booking."status" = 'confirmed'
  );

-- Link future individual lessons created earlier in CRM to a suitable subscription.
WITH candidates AS (
  SELECT
    attendance."id" AS "attendanceId",
    (
      SELECT subscription."id"
      FROM "Subscription" AS subscription
      WHERE subscription."clientId" = attendance."clientId"
        AND subscription."type" = lesson."type"
        AND subscription."format" = 'individual'
        AND subscription."purchasedAt" <= lesson."startsAt"
        AND subscription."expiresAt" >= lesson."startsAt"
        AND subscription."usedLessons" < subscription."totalLessons"
      ORDER BY subscription."expiresAt" ASC, subscription."id" ASC
      LIMIT 1
    ) AS "subscriptionId"
  FROM "Attendance" AS attendance
  JOIN "Lesson" AS lesson ON lesson."id" = attendance."lessonId"
  WHERE lesson."format" = 'individual'
    AND attendance."status" = 'enrolled'
    AND lesson."startsAt" >= NOW()
    AND attendance."plannedSubscriptionId" IS NULL
)
UPDATE "Attendance" AS attendance
SET
  "plannedSubscriptionId" = candidates."subscriptionId",
  "enrollmentSource" = 'individual'
FROM candidates
WHERE candidates."attendanceId" = attendance."id"
  AND candidates."subscriptionId" IS NOT NULL;
