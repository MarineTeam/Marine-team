-- How many people were here.
--
-- The denominator under every other number this app keeps. Taken by a person,
-- never inferred from check-ins or sign-ins: counting digital traces
-- undercounts exactly the people a church most needs to notice.
--
-- The three parts are nullable on purpose. A week nobody counted must not
-- become a zero, because a zero is a claim that nobody came, and a chart that
-- cannot tell the two apart eventually frightens a leadership team with a
-- graph of its own missing paperwork.

CREATE TABLE "ServiceAttendance" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "gathering" TEXT NOT NULL,
    "adults" INTEGER,
    "children" INTEGER,
    -- Of whom were visiting: a subset of the above, never an addend. See
    -- lib/service-attendance.ts.
    "visitors" INTEGER,
    "note" TEXT,
    "countedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceAttendance_pkey" PRIMARY KEY ("id")
);

-- One count per gathering per day: a second steward submitting the same
-- service corrects the first rather than adding a congregation to the chart.
CREATE UNIQUE INDEX "ServiceAttendance_date_gathering_key" ON "ServiceAttendance"("date", "gathering");
CREATE INDEX "ServiceAttendance_date_idx" ON "ServiceAttendance"("date");
