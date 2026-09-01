import { prisma } from "@/lib/db";
import { uniqueSlug } from "@/lib/slug";

/**
 * Reading forms out of the database.
 *
 * Deliberately not in lib/forms.ts: that file's helpers are imported by the
 * component people fill the form in with, and a client component that reaches
 * a module importing Prisma bundles Prisma into the browser, where it throws
 * on sight. Pure rules there, queries here.
 */

/** The form as somebody filling it in sees it: live fields, in order. */
export async function getPublicForm(slug: string) {
  return prisma.form.findUnique({
    where: { slug },
    include: {
      fields: { where: { deletedAt: null }, orderBy: { position: "asc" } },
    },
  });
}

export async function listPublishedForms() {
  return prisma.form.findMany({
    where: { published: true },
    orderBy: { title: "asc" },
    select: { id: true, slug: true, title: true, description: true, memberOnly: true },
  });
}

/** A slug nothing else has taken. */
export async function nextFormSlug(title: string): Promise<string> {
  const taken = await prisma.form.findMany({ select: { slug: true } });
  return uniqueSlug(
    title,
    taken.map((form) => form.slug),
    "form",
  );
}
