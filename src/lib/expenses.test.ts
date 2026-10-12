import { describe, it, expect } from "vitest";
import {
  awaitingApproval,
  byCategory,
  checkExpense,
  inSpan,
  mayApprove,
  mayPay,
  netPosition,
  overspendNote,
  owed,
  rejectWith,
  spendOf,
  type CategoryRow,
  type ExpenseRow,
} from "./expenses";

const TODAY = "2026-10-12";

const expense = (over: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id: "e1",
  categoryId: "utilities",
  amount: 100_00,
  status: "SUBMITTED",
  incurredOn: "2026-06-01",
  claimantId: null,
  approvedById: null,
  paidOn: null,
  fundId: null,
  ...over,
});

const category = (over: Partial<CategoryRow> = {}): CategoryRow => ({
  id: "utilities",
  name: "Utilities",
  annualBudget: 1000_00,
  active: true,
  ...over,
});

describe("mayApprove", () => {
  const treasurer = { id: "u-treasurer", manages: true };

  it("lets the treasurer approve an ordinary invoice", () => {
    expect(mayApprove(expense(), treasurer).ok).toBe(true);
  });

  it("lets them approve somebody else's claim", () => {
    expect(mayApprove(expense({ claimantId: "u-volunteer" }), treasurer).ok).toBe(true);
  });

  it("REFUSES their own claim, however senior they are", () => {
    // The load-bearing rule. A volunteer who can wave through their own
    // reimbursement is a fraud route found years later by an auditor.
    const verdict = mayApprove(expense({ claimantId: "u-treasurer" }), treasurer);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/can't approve your own/i);
  });

  it("says the useful thing when somebody's own claim is also beyond their grant", () => {
    // "You cannot approve your own" is actionable; "you lack a capability" is
    // baffling to somebody who plainly has it.
    const verdict = mayApprove(expense({ claimantId: "u-vol" }), { id: "u-vol", manages: false });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/your own/i);
  });

  it("refuses somebody without the money grant", () => {
    expect(mayApprove(expense(), { id: "u-other", manages: false }).ok).toBe(false);
  });

  it("refuses one already approved or paid", () => {
    expect(mayApprove(expense({ status: "APPROVED" }), treasurer).ok).toBe(false);
    expect(mayApprove(expense({ status: "PAID" }), treasurer).ok).toBe(false);
  });

  it("refuses a rejected one until it is reopened", () => {
    const verdict = mayApprove(expense({ status: "REJECTED" }), treasurer);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/reopen/i);
  });
});

describe("mayPay", () => {
  const treasurer = { id: "u-treasurer", manages: true };

  it("pays something approved", () => {
    expect(mayPay(expense({ status: "APPROVED" }), treasurer).ok).toBe(true);
  });

  it("refuses to pay what nobody approved", () => {
    // The other half of the same hole.
    expect(mayPay(expense({ status: "SUBMITTED" }), treasurer).ok).toBe(false);
  });

  it("refuses to pay twice, and says so rather than something else", () => {
    // Without its own guard this still refuses — via "it has to be approved
    // first", which is a baffling thing to be told about money that has
    // already gone. A mutation test found the message, not the outcome.
    const verdict = mayPay(expense({ status: "PAID" }), treasurer);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/already been paid/i);
  });

  it("lets the claimant move the money once somebody else approved it", () => {
    // Deliberate: the approval is the control, and the person with the bank
    // details is often the claimant. Refusing here would stop reimbursements
    // happening at all in a small church.
    const own = expense({ status: "APPROVED", claimantId: "u-treasurer", approvedById: "u-other" });
    expect(mayPay(own, treasurer).ok).toBe(true);
  });

  it("refuses somebody without the money grant", () => {
    expect(mayPay(expense({ status: "APPROVED" }), { id: "x", manages: false }).ok).toBe(false);
  });
});

describe("rejectWith", () => {
  it("keeps the reason", () => {
    const result = rejectWith("  No receipt  ");
    expect(result.ok && result.reason).toBe("No receipt");
  });

  it("refuses to turn something down silently", () => {
    // The claimant will ask in the car park, and nobody will remember.
    expect(rejectWith("   ").ok).toBe(false);
  });
});

describe("checkExpense", () => {
  const good = { amount: 100_00, incurredOn: "2026-06-01", today: TODAY, payee: "Gas board", description: "Q2 gas" };

  it("accepts an ordinary bill", () => {
    expect(checkExpense(good).ok).toBe(true);
  });

  it("accepts one incurred today", () => {
    expect(checkExpense({ ...good, incurredOn: TODAY }).ok).toBe(true);
  });

  it("refuses a future cost — that is a plan, not an expense", () => {
    expect(checkExpense({ ...good, incurredOn: "2027-01-01" }).ok).toBe(false);
  });

  it("refuses nought and fractions of a penny", () => {
    expect(checkExpense({ ...good, amount: 0 }).ok).toBe(false);
    expect(checkExpense({ ...good, amount: -50 }).ok).toBe(false);
    expect(checkExpense({ ...good, amount: 12.5 }).ok).toBe(false);
  });

  it("refuses one with nobody paid or nothing said", () => {
    expect(checkExpense({ ...good, payee: "  " }).ok).toBe(false);
    expect(checkExpense({ ...good, description: "" }).ok).toBe(false);
  });
});

describe("spendOf", () => {
  const rows = [
    expense({ id: "a", status: "PAID", amount: 300_00 }),
    expense({ id: "b", status: "APPROVED", amount: 200_00 }),
    expense({ id: "c", status: "SUBMITTED", amount: 50_00 }),
    expense({ id: "d", status: "REJECTED", amount: 9999_00 }),
  ];

  it("keeps paid and committed as separate figures", () => {
    // A budget answers "what have we committed?"; a bank statement answers
    // "what has left?". Reporting one as the other overspends or panics.
    expect(spendOf(rows)).toMatchObject({ paid: 300_00, committed: 200_00, awaiting: 50_00 });
  });

  it("counts both against the budget, because a commitment is spent", () => {
    expect(spendOf(rows).againstBudget).toBe(500_00);
  });

  it("counts a rejected one toward nothing at all", () => {
    // Kept on record, counted nowhere: "we said no" is a different fact from
    // "nobody asked", and only one of them is answerable.
    const withRejected = spendOf(rows);
    const withoutRejected = spendOf(rows.filter((row) => row.status !== "REJECTED"));
    expect(withRejected).toEqual(withoutRejected);
  });

  it("is all zeroes on nothing", () => {
    expect(spendOf([])).toEqual({ committed: 0, paid: 0, awaiting: 0, againstBudget: 0 });
  });
});

describe("byCategory", () => {
  const categories = [category({ id: "utilities", name: "Utilities", annualBudget: 1000_00 }),
                      category({ id: "mission", name: "Mission", annualBudget: 5000_00 }),
                      category({ id: "sundries", name: "Sundries", annualBudget: null })];

  it("shows what is left", () => {
    const rows = byCategory([expense({ categoryId: "utilities", status: "PAID", amount: 400_00 })], categories);
    expect(rows.find((row) => row.categoryId === "utilities")?.remaining).toBe(600_00);
  });

  it("does not cap the fraction — going over is the thing worth seeing", () => {
    // A pledge bar stops at full because overgiving is generosity. Here it is
    // the single thing the report exists to show.
    const rows = byCategory([expense({ categoryId: "utilities", status: "PAID", amount: 1400_00 })], categories);
    const utilities = rows.find((row) => row.categoryId === "utilities")!;
    expect(utilities.fractionUsed).toBeCloseTo(1.4);
    expect(utilities.over).toBe(true);
    expect(utilities.remaining).toBe(-400_00);
  });

  it("puts what is over first, whatever the amounts", () => {
    const rows = byCategory(
      [
        expense({ id: "big", categoryId: "mission", status: "PAID", amount: 4000_00 }),
        expense({ id: "over", categoryId: "utilities", status: "PAID", amount: 1100_00 }),
      ],
      categories,
    );
    expect(rows[0].categoryId).toBe("utilities");
  });

  it("has no fraction or verdict for a category with no budget", () => {
    const rows = byCategory([expense({ categoryId: "sundries", status: "PAID", amount: 9000_00 })], categories);
    const sundries = rows.find((row) => row.categoryId === "sundries")!;
    expect(sundries.fractionUsed).toBeNull();
    expect(sundries.remaining).toBeNull();
    expect(sundries.over).toBe(false);
  });

  it("counts a commitment against the budget alongside what was paid", () => {
    const rows = byCategory(
      [
        expense({ id: "p", categoryId: "utilities", status: "PAID", amount: 600_00 }),
        expense({ id: "c", categoryId: "utilities", status: "APPROVED", amount: 500_00 }),
      ],
      categories,
    );
    expect(rows.find((row) => row.categoryId === "utilities")?.over).toBe(true);
  });
});

describe("inSpan", () => {
  it("files by when the cost happened, not when it was paid", () => {
    // A December invoice settled in January belongs to December, or the year's
    // figures change after it has closed.
    const december = expense({ incurredOn: "2026-12-20", paidOn: "2027-01-15", status: "PAID" });
    expect(inSpan([december], "2026-01-01", "2026-12-31")).toHaveLength(1);
    expect(inSpan([december], "2027-01-01", "2027-12-31")).toHaveLength(0);
  });

  it("includes both ends", () => {
    expect(inSpan([expense({ incurredOn: "2026-01-01" })], "2026-01-01", "2026-12-31")).toHaveLength(1);
    expect(inSpan([expense({ incurredOn: "2026-12-31" })], "2026-01-01", "2026-12-31")).toHaveLength(1);
  });
});

describe("awaitingApproval and owed", () => {
  it("queues claims oldest first, not biggest", () => {
    // A queue sorted by amount leaves the small claims for ever, which is how
    // people stop claiming and quietly subsidise the church.
    const rows = awaitingApproval([
      expense({ id: "new-big", incurredOn: "2026-09-01", amount: 900_00 }),
      expense({ id: "old-small", incurredOn: "2026-02-01", amount: 7_00 }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["old-small", "new-big"]);
  });

  it("leaves out anything already dealt with", () => {
    const rows = awaitingApproval([
      expense({ id: "a", status: "APPROVED" }),
      expense({ id: "b", status: "PAID" }),
      expense({ id: "c", status: "REJECTED" }),
    ]);
    expect(rows).toEqual([]);
  });

  it("says what the church owes right now", () => {
    const rows = owed([
      expense({ id: "a", status: "APPROVED" }),
      expense({ id: "b", status: "PAID" }),
      expense({ id: "c", status: "SUBMITTED" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["a"]);
  });
});

describe("netPosition", () => {
  it("reports the bank position and the real one separately", () => {
    // They differ by everything agreed and not yet paid. A treasurer reading
    // only the first commits money twice.
    const position = netPosition({
      received: 10_000_00,
      expenses: [
        expense({ id: "p", status: "PAID", amount: 3_000_00 }),
        expense({ id: "c", status: "APPROVED", amount: 2_000_00 }),
      ],
    });
    expect(position.net).toBe(7_000_00);
    expect(position.netAfterCommitments).toBe(5_000_00);
  });

  it("shows a church spending more than it takes", () => {
    const position = netPosition({
      received: 1_000_00,
      expenses: [expense({ status: "PAID", amount: 1_500_00 })],
    });
    expect(position.net).toBe(-500_00);
  });

  it("ignores what nobody has approved yet", () => {
    const position = netPosition({
      received: 1_000_00,
      expenses: [expense({ status: "SUBMITTED", amount: 9_999_00 })],
    });
    expect(position.net).toBe(1_000_00);
    expect(position.netAfterCommitments).toBe(1_000_00);
  });
});

describe("overspendNote", () => {
  const money = (pence: number) => `£${(pence / 100).toFixed(0)}`;

  it("says by how much, and against what", () => {
    const [row] = byCategory(
      [expense({ categoryId: "utilities", status: "PAID", amount: 1400_00 })],
      [category()],
    );
    expect(overspendNote(row, money)).toBe("Utilities is £400 over its £1000.");
  });

  it("says nothing about a category inside its budget", () => {
    const [row] = byCategory(
      [expense({ categoryId: "utilities", status: "PAID", amount: 100_00 })],
      [category()],
    );
    expect(overspendNote(row, money)).toBeNull();
  });

  it("says nothing where there is no budget to be over", () => {
    const [row] = byCategory(
      [expense({ categoryId: "utilities", status: "PAID", amount: 9999_00 })],
      [category({ annualBudget: null })],
    );
    expect(overspendNote(row, money)).toBeNull();
  });
});
