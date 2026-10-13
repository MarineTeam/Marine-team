import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnnualAccounts } from "./annual-accounts";

/**
 * The statement, rendered.
 *
 * Three things only a rendered page can show. That restricted and unrestricted
 * are columns a reader can see apart. That a statement which does not
 * reconcile says so instead of printing figures nobody can trust. And that
 * what is owed sits outside the totals rather than inside them.
 */

const column = (restricted: number, unrestricted: number) => ({
  restricted,
  unrestricted,
  total: restricted + unrestricted,
});

let payload: Record<string, unknown>;
let asked: string[] = [];
let posted: { url: string; body: Record<string, unknown> }[] = [];

const accounts = (over: Record<string, unknown> = {}) => ({
  from: "2026-01-01",
  to: "2026-12-31",
  label: "2026",
  opening: column(1_000_00, 2_000_00),
  receipts: [
    { name: "Building fund", amounts: column(6_000_00, 0) },
    { name: "General fund", amounts: column(0, 4_000_00) },
    { name: "Gift Aid recovered", amounts: column(1_500_00, 1_000_00) },
  ],
  totalReceipts: column(7_500_00, 5_000_00),
  payments: [
    { name: "Repairs", amounts: column(2_000_00, 0) },
    { name: "Utilities", amounts: column(0, 1_200_00) },
  ],
  totalPayments: column(2_000_00, 1_200_00),
  transfers: column(500_00, -500_00),
  closing: column(7_000_00, 5_300_00),
  owed: column(400_00, 300_00),
  reconciles: true,
  ...over,
});

function mockFetch() {
  asked = [];
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted.push({ url, body: JSON.parse(String(init.body)) });
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      asked.push(url);
      return { ok: true, json: async () => payload } as Response;
    }),
  );
}

const held = (over: Record<string, unknown> = {}) => ({
  asAt: "2026-12-31",
  label: "2026",
  assets: [
    { name: "Cash at bank and in hand", amounts: column(7_000_00, 5_300_00), carriedFrom: null },
    { name: "The hall", amounts: column(0, 500_000_00), carriedFrom: "2022-12-31" },
    { name: "Gift Aid claimed and not yet received", amounts: column(0, 250_00), carriedFrom: null },
  ],
  liabilities: [
    { name: "Agreed and not yet paid", amounts: column(400_00, 300_00), carriedFrom: null },
  ],
  totalAssets: column(7_000_00, 505_550_00),
  totalLiabilities: column(400_00, 300_00),
  netAssets: column(6_600_00, 505_250_00),
  stale: [{ name: "The hall", amounts: column(0, 500_000_00), carriedFrom: "2022-12-31" }],
  ...over,
});

beforeEach(() => {
  payload = {
    accounts: accounts(),
    held: held(),
    holdings: [
      {
        id: "h1",
        name: "The hall",
        kind: "ASSET",
        amount: 500_000_00,
        asAt: "2022-12-31",
        note: null,
        fundName: null,
      },
    ],
    years: [2026, 2025, 2024],
    year: 2026,
  };
  mockFetch();
});

const line = async (name: string) => (await screen.findByRole("rowheader", { name })).closest("tr")!;

describe("restricted and unrestricted are columns you can see apart", () => {
  it("gives all three column headings, with the total last", async () => {
    // The total reconciles against a bank statement, so it earns its place —
    // but a single total column is how a roof appeal pays for the heating.
    render(<AnnualAccounts />);
    const table = await screen.findByRole("table", { name: /receipts and payments/i });
    const headings = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headings).toEqual(["Line", "Restricted", "Unrestricted", "Total"]);
  });

  it("keeps a restricted receipt out of the unrestricted column", async () => {
    render(<AnnualAccounts />);
    const row = await line("Building fund");
    const cells = within(row).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells).toEqual(["£6,000.00", "£0.00", "£6,000.00"]);
  });

  it("splits Gift Aid across both columns rather than calling it all general", async () => {
    // Tax recovered on a restricted gift carries the restriction with it.
    render(<AnnualAccounts />);
    const row = await line("Gift Aid recovered");
    const cells = within(row).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells).toEqual(["£1,500.00", "£1,000.00", "£2,500.00"]);
  });

  it("shows a transfer as a move between the columns, netting to nothing", async () => {
    render(<AnnualAccounts />);
    const row = await line("Transfers between funds");
    const cells = within(row).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells).toEqual(["£500.00", "-£500.00", "£0.00"]);
  });

  it("leaves the transfer line out entirely when nothing moved", async () => {
    payload = { ...payload, accounts: accounts({ transfers: column(0, 0) }) };
    render(<AnnualAccounts />);
    await screen.findByRole("rowheader", { name: "Closing balance" });
    expect(screen.queryByRole("rowheader", { name: "Transfers between funds" })).toBeNull();
  });
});

describe("the statement closes", () => {
  it("gives an opening and a closing balance", async () => {
    render(<AnnualAccounts />);
    expect(within(await line("Opening balance")).getAllByRole("cell")[2].textContent).toBe("£3,000.00");
    expect(within(await line("Closing balance")).getAllByRole("cell")[2].textContent).toBe("£12,300.00");
  });

  it("totals receipts and payments separately", async () => {
    render(<AnnualAccounts />);
    expect(within(await line("Total receipts")).getAllByRole("cell")[2].textContent).toBe("£12,500.00");
    expect(within(await line("Total payments")).getAllByRole("cell")[2].textContent).toBe("£3,200.00");
  });

  it("says so, loudly, when the figures do not reconcile", async () => {
    // Printing a closing balance nobody can trust is worse than printing none.
    payload = { ...payload, accounts: accounts({ reconciles: false }) };
    render(<AnnualAccounts />);
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent(/do not reconcile/i);
    expect(warning).toHaveTextContent(/wrong with the report rather than with the church/i);
  });

  it("says nothing of the sort when it does reconcile", async () => {
    render(<AnnualAccounts />);
    await screen.findByRole("rowheader", { name: "Closing balance" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("what is owed sits outside the totals", () => {
  it("reports it under its own heading, not as a payment", async () => {
    // It is a liability on the other statement, where it belongs; what it must
    // never be is a line among the payments, which count money that moved.
    render(<AnnualAccounts />);
    expect(await screen.findByText(/agreed and not yet paid at the year end/i)).toBeInTheDocument();
    const payments = await screen.findByRole("table", { name: /receipts and payments/i });
    expect(within(payments).queryByRole("rowheader", { name: /agreed and not yet paid/i })).toBeNull();
  });

  it("says how much of what is owed is restricted", async () => {
    render(<AnnualAccounts />);
    const heading = await screen.findByText(/agreed and not yet paid at the year end/i);
    const section = heading.closest("section")!;
    expect(section.textContent).toContain("£700.00");
    expect(section.textContent).toContain("£400.00 of it restricted");
  });

  it("says why it is outside the figures above", async () => {
    render(<AnnualAccounts />);
    const heading = await screen.findByText(/agreed and not yet paid at the year end/i);
    expect(heading.closest("section")!.textContent).toMatch(/owed, not spent/i);
  });
});

describe("choosing a year", () => {
  it("offers only the years there is anything to report on", async () => {
    // Every year since 1970 in a dropdown is how somebody files the accounts
    // for 1994 by accident.
    render(<AnnualAccounts />);
    const picker = await screen.findByLabelText(/^year$/i);
    expect(Array.from(picker.querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      "2026",
      "2025",
      "2024",
    ]);
  });

  it("asks the server again for a different year", async () => {
    render(<AnnualAccounts />);
    await userEvent.selectOptions(await screen.findByLabelText(/^year$/i), "2024");
    await waitFor(() => expect(asked.some((url) => url.includes("year=2024"))).toBe(true));
  });

  it("asks with the chosen year start, since a church's year is its own", async () => {
    render(<AnnualAccounts />);
    await userEvent.selectOptions(await screen.findByLabelText(/year begins/i), "4-6");
    await waitFor(() =>
      expect(asked.some((url) => url.includes("startMonth=4") && url.includes("startDay=6"))).toBe(true),
    );
  });

  it("offers a spreadsheet of the same year", async () => {
    render(<AnnualAccounts />);
    const link = await screen.findByRole("link", { name: /download as a spreadsheet/i });
    expect(link.getAttribute("href")).toContain("format=csv");
    expect(link.getAttribute("href")).toContain("year=2026");
  });
});

describe("when the load fails", () => {
  it("says so rather than sitting on Loading", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));
    render(<AnnualAccounts />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load the accounts/i);
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});

describe("the statement's other half", () => {
  const assetsTable = async () =>
    (await screen.findByRole("table", { name: /assets and liabilities at 2026-12-31/i }));

  it("is on the same page, because the two are one filing", async () => {
    render(<AnnualAccounts />);
    expect(await assetsTable()).toBeInTheDocument();
  });

  it("shows the same cash figure as the closing balance above", async () => {
    // Taken from the receipts and payments account, not worked out again: the
    // two statements must not disagree about the figure they share.
    render(<AnnualAccounts />);
    const row = within(await assetsTable())
      .getByRole("rowheader", { name: "Cash at bank and in hand" })
      .closest("tr")!;
    const closing = within(await screen.findByRole("table", { name: /receipts and payments/i }))
      .getByRole("rowheader", { name: "Closing balance" })
      .closest("tr")!;
    const cells = (tr: HTMLElement) =>
      within(tr).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells(row)).toEqual(cells(closing));
  });

  it("separates what the church holds from what it owes", async () => {
    render(<AnnualAccounts />);
    const table = await assetsTable();
    expect(within(table).getByRole("rowheader", { name: /what the church holds/i })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: /what it owes/i })).toBeInTheDocument();
  });

  it("gives net assets as its own line", async () => {
    render(<AnnualAccounts />);
    const row = within(await assetsTable()).getByRole("rowheader", { name: "Net assets" }).closest("tr")!;
    expect(within(row).getAllByRole("cell")[2].textContent).toBe("£511,850.00");
  });

  it("says on the line itself when a figure was carried forward", async () => {
    // A valuation that is silently years old is how a balance sheet goes
    // quietly wrong.
    render(<AnnualAccounts />);
    expect(
      within(await assetsTable()).getByRole("rowheader", {
        name: /the hall \(carried forward from 2022-12-31\)/i,
      }),
    ).toBeInTheDocument();
  });

  it("warns once, at the top, about everything carried forward", async () => {
    render(<AnnualAccounts />);
    const warning = await screen.findByRole("status");
    expect(warning).toHaveTextContent(/one figure is carried forward/i);
    expect(warning).toHaveTextContent(/The hall \(2022-12-31\)/);
  });

  it("warns about nothing when every figure is this year's", async () => {
    payload = { ...payload, held: held({ stale: [] }) };
    render(<AnnualAccounts />);
    await screen.findByRole("table", { name: /assets and liabilities/i });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says nothing is owed rather than showing an empty section", async () => {
    payload = { ...payload, held: held({ liabilities: [], totalLiabilities: column(0, 0) }) };
    render(<AnnualAccounts />);
    expect(await screen.findByText(/nothing owed/i)).toBeInTheDocument();
  });

  it("does not say nothing is owed while listing something owed", async () => {
    // A statement claiming both £700 agreed and "nothing owed" is one nobody
    // would trust a single figure on.
    render(<AnnualAccounts />);
    await screen.findByRole("table", { name: /assets and liabilities/i });
    expect(screen.queryByText(/nothing owed/i)).toBeNull();
  });

  it("offers its own spreadsheet, separate from the other statement's", async () => {
    render(<AnnualAccounts />);
    const link = await screen.findByRole("link", { name: /download assets and liabilities/i });
    expect(link.getAttribute("href")).toContain("of=holdings");
    expect(link.getAttribute("href")).toContain("format=csv");
  });
});

describe("the figures that have to be typed in", () => {
  it("lists what has been entered, and when it was valued", async () => {
    render(<AnnualAccounts />);
    const list = await screen.findByRole("list", { name: "Entered holdings" });
    const row = within(list).getByText("The hall").closest("li")!;
    expect(row.textContent).toContain("£500,000");
    expect(row.textContent).toContain("held at 2022-12-31");
  });

  it("records a new figure against the year end on screen, not today", async () => {
    // Entering a 2026 valuation while looking at 2026 should not date it 2027
    // because that is when somebody got round to it.
    render(<AnnualAccounts />);
    await userEvent.type(
      await screen.findByPlaceholderText(/what it is — the hall/i),
      "The minibus",
    );
    await userEvent.type(screen.getByPlaceholderText(/amount in pounds/i), "12000");
    await userEvent.click(screen.getByRole("button", { name: /record it at 2026-12-31/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toEqual({
      action: "holding",
      name: "The minibus",
      kind: "ASSET",
      amount: 12_000_00,
      asAt: "2026-12-31",
    });
  });

  it("can record something the church owes rather than holds", async () => {
    render(<AnnualAccounts />);
    await userEvent.type(await screen.findByPlaceholderText(/what it is — the hall/i), "Mortgage");
    await userEvent.selectOptions(screen.getByLabelText(/held or owed/i), "LIABILITY");
    await userEvent.type(screen.getByPlaceholderText(/amount in pounds/i), "120000");
    await userEvent.click(screen.getByRole("button", { name: /record it at/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toMatchObject({ kind: "LIABILITY", amount: 120_000_00 });
  });

  it("can forget a figure entered against the wrong year", async () => {
    render(<AnnualAccounts />);
    const list = await screen.findByRole("list", { name: "Entered holdings" });
    const row = within(list).getByText("The hall").closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: /forget it/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toEqual({ action: "forget", id: "h1" });
  });
});
