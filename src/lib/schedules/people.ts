import { isPlausibleName, normalizeName, toDisplayName } from "@/lib/names";
import { prisma, type PrismaTransaction } from "@/lib/db";

/**
 * Resolving raw names to stable `Person` ids.
 *
 * Names are how humans write schedules; ids are how the app stores them. This
 * module is the only bridge between the two, and it is deliberately the only
 * place that creates people, so the "Devin / devin / DEVIN are one person"
 * rule cannot be bypassed by a new caller.
 */

export interface ResolvedPeople {
  /** normalized name -> person id */
  idByNormalizedName: Map<string, string>;
  created: number;
}

type Client = PrismaTransaction | typeof prisma;

/**
 * Look up (and create when necessary) a person for each raw name.
 *
 * Aliases are consulted before creating anything, so renaming someone in a
 * spreadsheet from "Cindy" to "Cynthia" resolves to the existing person once
 * an admin records the alias -- rather than silently splitting their history
 * across two rows.
 */
export async function resolvePeople(
  rawNames: readonly string[],
  client: Client = prisma,
): Promise<ResolvedPeople> {
  const wanted = new Map<string, string>();
  for (const raw of rawNames) {
    if (!isPlausibleName(raw)) continue;
    const display = toDisplayName(raw);
    const key = normalizeName(display);
    if (key && !wanted.has(key)) wanted.set(key, display);
  }

  const idByNormalizedName = new Map<string, string>();
  if (wanted.size === 0) return { idByNormalizedName, created: 0 };

  const keys = [...wanted.keys()];

  const existing = await client.person.findMany({
    where: { normalizedName: { in: keys } },
    select: { id: true, normalizedName: true },
  });
  for (const person of existing) {
    idByNormalizedName.set(person.normalizedName, person.id);
  }

  const stillMissing = keys.filter((key) => !idByNormalizedName.has(key));
  if (stillMissing.length > 0) {
    const aliases = await client.personAlias.findMany({
      where: { normalizedName: { in: stillMissing } },
      select: { normalizedName: true, personId: true },
    });
    for (const alias of aliases) {
      idByNormalizedName.set(alias.normalizedName, alias.personId);
    }
  }

  let created = 0;
  for (const key of keys) {
    if (idByNormalizedName.has(key)) continue;
    const displayName = wanted.get(key) ?? key;
    // `upsert` rather than `create` because two schedules syncing in parallel
    // can race on the same new name.
    const person = await client.person.upsert({
      where: { normalizedName: key },
      update: { deletedAt: null },
      create: { normalizedName: key, displayName },
      select: { id: true },
    });
    idByNormalizedName.set(key, person.id);
    created += 1;
  }

  return { idByNormalizedName, created };
}

/** Everyone who can be picked on the "Choose your name" screen. */
export async function listSelectablePeople() {
  return prisma.person.findMany({
    where: { deletedAt: null, active: true },
    select: { id: true, displayName: true, normalizedName: true, updatedAt: true },
    orderBy: { displayName: "asc" },
  });
}
