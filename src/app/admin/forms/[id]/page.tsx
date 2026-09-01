import Link from "next/link";
import { notFound } from "next/navigation";
import { FormBuilder } from "@/components/form-builder";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminFormPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const form = await prisma.form.findUnique({
    where: { id },
    include: { fields: { orderBy: { position: "asc" } } },
  });
  if (!form) notFound();

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/admin/forms" className="text-accent hover:underline">
          ← Forms
        </Link>
      </p>
      <h1 className="text-lg font-semibold text-ink">{form.title}</h1>
      <FormBuilder
        form={{
          ...form,
          fields: form.fields.map((field) => ({
            ...field,
            deletedAt: field.deletedAt?.toISOString() ?? null,
          })),
        }}
      />
    </div>
  );
}
