import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getPlannableFiles } from "@/lib/services";

/**
 * Service plans, for the admin screen that builds them.
 *
 * Gated on `manage_files` rather than a capability of its own: a plan is a
 * list of files, everyone who can arrange the library can arrange one, and a
 * new capability is a row in a permissions UI that would have to be granted
 * to the same people all over again.
 */
const createSchema = z.object({
  title: z.string().min(1),
  serviceDate: z.string().nullable().optional(),
});

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");
    const [plans, files] = await Promise.all([
      prisma.servicePlan.findMany({
        include: {
          items: {
            orderBy: { position: "asc" },
            include: { file: { select: { id: true, title: true, pageNumber: true } } },
          },
        },
        orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }],
      }),
      // Sent with the list so the builder has something to pick from without
      // a second round trip — it is the whole point of the screen.
      getPlannableFiles(),
    ]);
    return NextResponse.json({ plans, files });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");
    const body = createSchema.parse(await request.json());
    const plan = await prisma.servicePlan.create({
      data: {
        title: body.title,
        serviceDate: body.serviceDate ? new Date(body.serviceDate) : null,
      },
    });
    await logAudit(user.email, "create", "service-plan", plan.id, plan.title);
    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
