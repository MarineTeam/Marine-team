import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExpensesManager } from "./expenses-manager";

/**
 * Money out, rendered.
 *
 * Two things only a rendered page can show. That a treasurer is told their own
 * claim is theirs rather than offered a button that fails — a control the user
 * only discovers by tripping over it is one they work around. And that
 * "agreed" and "paid" never appear as a single spent figure.
 */

const ME = "u-treasurer";

const row = (over: Record<string, unknown> = {}) => ({
  id: "x1",
  categoryId: "utilities",
  categoryName: "Utilities",
  amount: 100_00,
  payee: "Gas board",
  description: "Q3 gas",
  incurredOn: "2026-06-01",
  status: "SUBMITTED" as const,
  claimantId: null as string | null,
  claimant: null as string | null,
  approvedByEmail: null as string | null,
  rejectedReason: null as string | null,
  receiptRef: null as string | null,
  paidOn: null as string | null,
  paidMethod: null as string | null,
  ...over,
});

const view = {
  from: "2025-10-12",
  to: "2026-10-12",
  spend: { committed: 2_000_00, paid: 3_000_00, awaiting: 150_00, againstBudget: 5_000_00 },
  byCategory: [
    {
      categoryId: "utilities",
      name: "Utilities",
      budget: 1_000_00,
      spend: { committed: 200_00, paid: 1_200_00, awaiting: 0, againstBudget: 1_400_00 },
      remaining: -400_00,
      fractionUsed: 1.4,
      over: true,
    },
    {
      categoryId: "mission",
      name: "Mission",
      budget: 5_000_00,
      spend: { committed: 0, paid: 1_000_00, awaiting: 0, againstBudget: 1_000_00 },
      remaining: 4_000_00,
      fractionUsed: 0.2,
      over: false,
    },
  ],
  position: {
    received: 10_000_00,
    paidOut: 3_000_00,
    net: 7_000_00,
    committed: 2_000_00,
    netAfterCommitments: 5_000_00,
  },
  waiting: [
    row({ id: "theirs", amount: 42_00, claimantId: "u-volunteer", claimant: "A Volunteer", payee: "Tesco" }),
    row({ id: "mine", amount: 8_00, claimantId: ME, claimant: "Treasurer", payee: "Post office" }),
  ],
  owing: [row({ id: "owed", status: "APPROVED", amount: 500_00, approvedByEmail: "warden@x.test" })],
  recent: [
    row({ id: "settled", status: "PAID", amount: 70_00, payee: "Window cleaner", paidOn: "2026-06-02" }),
    row({
      id: "no",
      status: "REJECTED",
      amount: 60_00,
      payee: "Travel agent",
      rejectedReason: "Not a church cost.",
    }),
  ],
};

const categories = [
  { id: "utilities", name: "Utilities", slug: "utilities", annualBudget: 1_000_00, active: true },
  { id: "closed", name: "Old thing", slug: "old", annualBudget: null, active: false },
];

let posted: unknown[] = [];

function mockFetch() {
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, json: async () => ({ view, categories }) } as Response;
    }),
  );
}

beforeEach(() => {
  mockFetch();
  vi.stubGlobal("prompt", vi.fn(() => "2026-10-12"));
});

describe("the self-approval rule", () => {
  it("offers no approve button on the treasurer's own claim", async () => {
    render(<ExpensesManager meId={ME} />);
    const mine = (await screen.findByText(/Post office/)).closest("li")!;
    expect(within(mine).queryByRole("button", { name: /approve/i })).toBeNull();
  });

  it("says why, rather than leaving a button that would fail", async () => {
    // A control somebody only discovers by tripping over it is one they work
    // around.
    render(<ExpensesManager meId={ME} />);
    const mine = (await screen.findByText(/Post office/)).closest("li")!;
    expect(mine.textContent).toMatch(/your own claim — somebody else has to approve it/i);
  });

  it("still offers it on somebody else's claim", async () => {
    render(<ExpensesManager meId={ME} />);
    const theirs = (await screen.findByText(/Tesco/)).closest("li")!;
    await userEvent.click(within(theirs).getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ action: "approve", expenseId: "theirs" });
  });

  it("never sends an approver id — the server takes it from the session", async () => {
    render(<ExpensesManager meId={ME} />);
    const theirs = (await screen.findByText(/Tesco/)).closest("li")!;
    await userEvent.click(within(theirs).getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(JSON.stringify(posted[0])).not.toContain(ME);
  });
});

describe("agreed is not paid", () => {
  it("shows paid out and agreed-not-paid as separate figures", async () => {
    render(<ExpensesManager meId={ME} />);
    const paid = (await screen.findByText("Paid out")).parentElement!;
    expect(within(paid).getByText("£3,000")).toBeInTheDocument();
    const agreed = screen.getByText("Agreed, not yet paid").parentElement!;
    expect(within(agreed).getByText("£2,000")).toBeInTheDocument();
  });

  it("never prints their sum as one spent figure", async () => {
    // £5,000 as "spent" is the number that must not appear on its own: it is
    // neither what left the bank nor what the church still holds.
    render(<ExpensesManager meId={ME} />);
    await screen.findByText("Paid out");
    const position = screen.getByText("Position").parentElement!;
    expect(position.textContent).toContain("£7,000");
    expect(position.textContent).toContain("£5,000");
    // And the £5,000 is labelled as the position after commitments, not spend.
    expect(position.textContent).toMatch(/once the agreed bills land/i);
  });

  it("gives both the bank position and the one after commitments", async () => {
    render(<ExpensesManager meId={ME} />);
    const position = (await screen.findByText("Position")).parentElement!;
    expect(position.textContent).toContain("£7,000");
    expect(position.textContent).toContain("£5,000");
  });
});

/**
 * A category name is on the screen twice — once as a budget line and once as an
 * option in the picker — so a bare text query is ambiguous. Scope to the
 * section rather than taking whichever comes first.
 */
async function budgetRow(name: string) {
  const section = (await screen.findByText("Against budget")).closest("section")!;
  return within(section).getByText(name).closest("li")!;
}

describe("against budget", () => {
  it("does not flatten an overspend to full", async () => {
    render(<ExpensesManager meId={ME} />);
    expect(await screen.findByText("140%")).toBeInTheDocument();
  });

  it("says by how much a category is over", async () => {
    render(<ExpensesManager meId={ME} />);
    expect((await budgetRow("Utilities")).textContent).toContain("£400 over");
  });

  it("shows what is left where there is room", async () => {
    render(<ExpensesManager meId={ME} />);
    expect((await budgetRow("Mission")).textContent).toContain("£4,000 left");
  });

  it("breaks each category into paid and agreed", async () => {
    render(<ExpensesManager meId={ME} />);
    const utilities = await budgetRow("Utilities");
    expect(utilities.textContent).toContain("£1,200 paid");
    expect(utilities.textContent).toContain("£200 agreed");
  });
});

describe("recording and paying", () => {
  it("offers only open categories", async () => {
    render(<ExpensesManager meId={ME} />);
    const picker = await screen.findByLabelText(/^category$/i);
    const names = Array.from(picker.querySelectorAll("option")).map((o) => o.textContent);
    expect(names).toContain("Utilities");
    expect(names).not.toContain("Old thing");
  });

  it("says the receipt box is for a reference, not the receipt", async () => {
    render(<ExpensesManager meId={ME} />);
    expect(
      await screen.findByPlaceholderText(/where the receipt is filed — not the receipt itself/i),
    ).toBeInTheDocument();
  });

  it("says everything waits for approval, including what a treasurer enters", async () => {
    render(<ExpensesManager meId={ME} />);
    expect(await screen.findByText(/including what a treasurer enters/i)).toBeInTheDocument();
  });

  it("asks when something was paid rather than assuming today", async () => {
    render(<ExpensesManager meId={ME} />);
    const owed = (await screen.findByText(/approved by warden/i)).closest("li")!;
    await userEvent.click(within(owed).getByRole("button", { name: /mark paid/i }));
    expect(vi.mocked(window.prompt).mock.calls[0][0]).toMatch(/paid on/i);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ action: "pay", expenseId: "owed", paidOn: "2026-10-12" });
  });

  it("turns nothing down without a reason", async () => {
    vi.mocked(window.prompt).mockReturnValue("   ");
    render(<ExpensesManager meId={ME} />);
    const theirs = (await screen.findByText(/Tesco/)).closest("li")!;
    await userEvent.click(within(theirs).getByRole("button", { name: /turn down/i }));
    expect(posted).toHaveLength(0);
  });
});

describe("when the load fails", () => {
  it("says so rather than sitting on Loading", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));
    render(<ExpensesManager meId={ME} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load the expenses/i);
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});

/** Category names are on the screen more than once; scope to the section. */
async function categoryRow(name: string) {
  const section = (await screen.findByText("Categories and budgets")).closest("section")!;
  return within(section).getByText(name).closest("li")!;
}

describe("a refusal is not final", () => {
  it("still shows a turned-down claim, and why", async () => {
    // It is in neither queue, so if the screen does not list it the claim has
    // simply vanished and the reopen route is unreachable.
    render(<ExpensesManager meId={ME} />);
    const refused = (await screen.findByText("Travel agent")).closest("li")!;
    expect(refused.textContent).toContain("Not a church cost.");
  });

  it("lists only refusals there, not everything recent", async () => {
    // "Turned down" that also lists paid costs is a list nobody trusts.
    render(<ExpensesManager meId={ME} />);
    const section = (await screen.findByText("Turned down")).closest("section")!;
    expect(within(section).queryByText("Window cleaner")).toBeNull();
  });

  it("offers a way to put it back in the queue", async () => {
    render(<ExpensesManager meId={ME} />);
    const refused = (await screen.findByText("Travel agent")).closest("li")!;
    await userEvent.click(within(refused).getByRole("button", { name: /put it back/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ action: "reopen", expenseId: "no" });
  });
});

describe("categories and budgets", () => {
  it("can create the first category, slug and all", async () => {
    // Without this the whole screen is unusable on a fresh install: recording a
    // cost needs a category and nothing else here makes one.
    render(<ExpensesManager meId={ME} />);
    await userEvent.type(await screen.findByPlaceholderText("New category"), "Church Office");
    await userEvent.click(screen.getByRole("button", { name: /add category/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      action: "category",
      name: "Church Office",
      slug: "church-office",
      annualBudget: null,
    });
  });

  it("sets a budget in pounds and sends pence", async () => {
    vi.mocked(window.prompt).mockReturnValue("1500");
    render(<ExpensesManager meId={ME} />);
    const utilities = await categoryRow("Utilities");
    await userEvent.click(within(utilities).getByRole("button", { name: /set budget/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ action: "edit-category", categoryId: "utilities", annualBudget: 150_000 });
  });

  it("clears a budget when the box is emptied, rather than setting zero", async () => {
    // Nobody has decided is not the same as nothing is allowed: a zero would
    // report the category as instantly over.
    vi.mocked(window.prompt).mockReturnValue("");
    render(<ExpensesManager meId={ME} />);
    const utilities = await categoryRow("Utilities");
    await userEvent.click(within(utilities).getByRole("button", { name: /set budget/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ action: "edit-category", categoryId: "utilities", annualBudget: null });
  });

  it("refuses a typo rather than quietly clearing the budget", async () => {
    // NaN serialises to null, so the obvious code does the opposite of what
    // was asked.
    vi.mocked(window.prompt).mockReturnValue("15OO");
    render(<ExpensesManager meId={ME} />);
    const utilities = await categoryRow("Utilities");
    await userEvent.click(within(utilities).getByRole("button", { name: /set budget/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't an amount/i);
    expect(posted).toHaveLength(0);
  });

  it("closes a live category rather than toggling it the wrong way", async () => {
    render(<ExpensesManager meId={ME} />);
    const utilities = await categoryRow("Utilities");
    await userEvent.click(within(utilities).getByRole("button", { name: /^close$/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ action: "edit-category", categoryId: "utilities", active: false });
  });

  it("shows a closed category as closed rather than hiding it", async () => {
    render(<ExpensesManager meId={ME} />);
    const closed = await categoryRow("Old thing");
    expect(within(closed).getByRole("button", { name: /^reopen$/i })).toBeInTheDocument();
  });
});
