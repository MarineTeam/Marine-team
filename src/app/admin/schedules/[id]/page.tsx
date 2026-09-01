import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { serializeSchedule } from "@/lib/schedules/query";
import { googleSheetsConfigured } from "@/lib/sheets/credentials";
import { ScheduleEditor } from "@/components/schedule-editor";

/** One schedule: where its events come from, and what is on it. */
export default async function AdminSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/schedules");
  if (!(await hasCapability(user, "manage_files"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to schedules.</p>;
  }

  const { id } = await params;
  const row = await prisma.schedule.findFirst({
    where: { id, deletedAt: null },
    include: { source: true },
  });
  if (!row) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/schedules" className="text-sm text-zinc-500 hover:underline">
          ← Schedules
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink">{row.name}</h1>
      </div>

      <ScheduleEditor
        schedule={{
          ...serializeSchedule(row),
          source: row.source
            ? {
                spreadsheetId: row.source.spreadsheetId,
                sheetName: row.source.sheetName,
                format: row.source.format,
                syncIntervalMinutes: row.source.syncIntervalMinutes,
                lastSyncError: row.source.lastSyncError,
              }
            : null,
        }}
        sheetsConfigured={googleSheetsConfigured()}
      />
    </div>
  );
}
