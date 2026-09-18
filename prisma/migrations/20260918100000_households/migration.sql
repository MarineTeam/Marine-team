-- Families. See the Household model's comment for why this hangs off Person
-- rather than User: most children, and many grandparents, have no account.
CREATE TYPE "HouseholdRole" AS ENUM ('ADULT', 'CHILD');

CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "primaryContactId" TEXT,
    "anniversary" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Person"
    ADD COLUMN "householdId" TEXT,
    ADD COLUMN "householdRole" "HouseholdRole" NOT NULL DEFAULT 'ADULT',
    ADD COLUMN "dateOfBirth" DATE,
    ADD COLUMN "medicalNotes" TEXT;

CREATE INDEX "Household_name_idx" ON "Household"("name");
CREATE INDEX "Household_primaryContactId_idx" ON "Household"("primaryContactId");
CREATE INDEX "Person_householdId_idx" ON "Person"("householdId");

-- SetNull on both sides: a household is a statement about a family unit, and
-- deleting one must never delete the people in it or strand a pointer.
ALTER TABLE "Household" ADD CONSTRAINT "Household_primaryContactId_fkey"
    FOREIGN KEY ("primaryContactId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
