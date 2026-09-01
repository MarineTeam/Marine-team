import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupEditor } from "@/components/group-editor";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminGroupPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const group = await prisma.smallGroup.findUnique({ where: { id } });
  if (!group) notFound();

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/admin/groups" className="text-accent hover:underline">
          ← Small groups
        </Link>
      </p>
      <h1 className="text-lg font-semibold text-ink">{group.name}</h1>
      <GroupEditor group={group} />
    </div>
  );
}
