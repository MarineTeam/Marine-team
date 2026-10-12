-- Money going out.
--
-- Giving, Gift Aid and campaigns made the income side good and said nothing
-- about where a penny went.
--
-- Two things this schema deliberately keeps apart. Expense categories are what
-- money is spent ON and are separate from GivingFund, which is what money comes
-- IN to — conflating them gives a chart of accounts where every row means one
-- of two things depending on its sign. And APPROVED is not PAID: a budget
-- answers "what have we committed?" while a bank statement answers "what has
-- left?", and reporting one as the other either double-spends or understates.
--
-- The rule that matters most is not a column: nobody may approve their own
-- claim. It lives in lib/expenses.ts.

CREATE TYPE "ExpenseStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'PAID', 'REJECTED');

CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    -- Nullable: plenty of categories have no budget, and a zero would read as
    -- "nothing allowed" rather than "nobody has decided".
    "annualBudget" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpenseCategory_slug_key" ON "ExpenseCategory"("slug");
CREATE INDEX "ExpenseCategory_active_position_idx" ON "ExpenseCategory"("active", "position");

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "payee" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    -- When the cost happened, which is not when it was paid. A December
    -- invoice settled in January belongs to December.
    "incurredOn" DATE NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'SUBMITTED',
    -- Whose claim, when it is a reimbursement. Null for a bill: the gas board
    -- is not claiming anything back.
    "claimantId" TEXT,
    "approvedById" TEXT,
    "approvedByEmail" TEXT,
    "approvedOn" DATE,
    "paidOn" DATE,
    "paidMethod" TEXT,
    "rejectedReason" TEXT,
    -- The church's own filing reference, never the image: a receipt carries a
    -- card's last four more often than not.
    "receiptRef" TEXT,
    "fundId" TEXT,
    "recordedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Expense_status_incurredOn_idx" ON "Expense"("status", "incurredOn");
CREATE INDEX "Expense_categoryId_incurredOn_idx" ON "Expense"("categoryId", "incurredOn");
CREATE INDEX "Expense_claimantId_status_idx" ON "Expense"("claimantId", "status");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- SetNull on the people: removing an account must not erase the record of what
-- was claimed or who approved it. The denormalized email keeps it legible.
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_claimantId_fkey"
    FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_fundId_fkey"
    FOREIGN KEY ("fundId") REFERENCES "GivingFund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
