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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      return { ok: true, json: async () => payload } as Response;
    }),
  );
}

beforeEach(() => {
  payload = { accounts: accounts(), years: [2026, 2025, 2024], year: 2026 };
  mockFetch();
});

const line = async (name: string) => (await screen.findByRole("rowheader", { name })).closest("tr")!;

describe("restricted and unrestricted are columns you can see apart", () => {
  it("gives all three column headings, with the total last", () => {
    // The total reconciles against a bank statement, so it earns its place —
    // but a single total column is how a roof appeal pays for the heating.
    render(<AnnualAccounts />);
    return waitFor(() => {
      const headings = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
      expect(headings).toEqual(["Line", "Restricted", "Unrestricted", "Total"]);
    });
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
    render(<AnnualAccounts />);
    expect(await screen.findByText(/agreed and not yet paid at the year end/i)).toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: /agreed and not yet paid/i })).toBeNull();
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
