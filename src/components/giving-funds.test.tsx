import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GivingFunds } from "./giving-funds";

/**
 * Funds, rendered.
 *
 * The thing only a rendered page can show: that "in the fund" and "once agreed
 * bills land" are two figures a treasurer reads side by side, and that a
 * restriction is never set without somebody being asked what the money was
 * given for — a restricted fund with no stated purpose is a label, not a rule.
 */

const fund = (over: Record<string, unknown> = {}) => ({
  id: "building",
  name: "Building fund",
  description: "The roof",
  active: true,
  taxDeductible: true,
  restricted: true,
  ...over,
});

const balance = (over: Record<string, unknown> = {}) => ({
  fundId: "building",
  name: "Building fund",
  restricted: true,
  given: 10_000_00,
  movedIn: 0,
  movedOut: 0,
  spent: 2_000_00,
  committed: 3_000_00,
  awaiting: 0,
  balance: 8_000_00,
  available: 5_000_00,
  overdrawn: false,
  ...over,
});

let posted: { url: string; body: unknown }[] = [];
let payload: Record<string, unknown>;

function mockFetch() {
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method && init.method !== "GET") {
        posted.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, json: async () => payload } as Response;
    }),
  );
}

beforeEach(() => {
  payload = {
    funds: [
      fund(),
      fund({ id: "general", name: "General fund", restricted: false, description: null }),
      // Not restricted, but somebody has already written down what it is for:
      // restricting it needs no question asked.
      fund({ id: "organ", name: "Organ appeal", restricted: false, description: "The organ" }),
    ],
    balances: [
      balance(),
      balance({ fundId: "general", name: "General fund", restricted: false, available: 500_00, balance: 500_00 }),
      balance({ fundId: "organ", name: "Organ appeal", restricted: false, available: 100_00, balance: 100_00 }),
    ],
    transfers: [
      {
        id: "t1",
        amount: 1_000_00,
        movedOn: "2026-03-04",
        authority: "Trustees, 4 March",
        note: null,
        fromName: "General fund",
        toName: "Building fund",
      },
    ],
  };
  mockFetch();
  vi.stubGlobal("prompt", vi.fn(() => "The roof"));
});

/** A fund's name is also an option in two pickers; scope to the fund list. */
async function fundRow(name: string) {
  const list = await screen.findByRole("list", { name: "Funds" });
  return within(list).getByText(name).closest("li")!;
}

describe("two figures, never one", () => {
  it("shows what is in the fund and what is left once bills land", async () => {
    render(<GivingFunds />);
    const row = await fundRow("Building fund");
    expect(row.textContent).toContain("£8,000");
    expect(row.textContent).toMatch(/in the fund/i);
    expect(row.textContent).toContain("£5,000");
    expect(row.textContent).toMatch(/once agreed bills land/i);
  });

  it("shows the agreed-but-unpaid figure that explains the difference", async () => {
    // Without it the two totals look like an arithmetic error.
    render(<GivingFunds />);
    const row = await fundRow("Building fund");
    expect(row.textContent).toContain("£3,000 agreed");
  });

  it("marks a restricted fund as restricted at a glance", async () => {
    // The badge, not the checkbox beside it: the state has to be legible
    // without reading the controls.
    render(<GivingFunds />);
    const row = await fundRow("Building fund");
    const marks = within(row).getAllByText("restricted");
    expect(marks.some((mark) => mark.tagName === "SPAN" && !mark.closest("label"))).toBe(true);
    expect(within(row).getByRole("checkbox", { name: /restricted/i })).toBeChecked();
  });

  it("says what the money was given for", async () => {
    render(<GivingFunds />);
    const row = await fundRow("Building fund");
    expect(row.textContent).toMatch(/for The roof/);
  });
});

describe("a fund in trouble", () => {
  it("calls a restricted deficit what it is", async () => {
    payload.balances = [balance({ available: -400_00, overdrawn: true })];
    render(<GivingFunds />);
    const note = await screen.findByRole("alert");
    expect(note).toHaveTextContent("£400 overcommitted");
    expect(note).toHaveTextContent(/given for one purpose has been committed to another/i);
  });

  it("uses the milder sentence for an unrestricted fund", async () => {
    payload.funds = [fund({ id: "general", name: "General fund", restricted: false, description: null })];
    payload.balances = [
      balance({ fundId: "general", name: "General fund", restricted: false, available: -400_00, overdrawn: true }),
    ];
    render(<GivingFunds />);
    const note = await screen.findByRole("alert");
    expect(note).toHaveTextContent("£400 overcommitted");
    expect(note.textContent).not.toMatch(/given for one purpose/i);
  });

  it("says nothing at all about a healthy fund", async () => {
    render(<GivingFunds />);
    await screen.findByRole("list", { name: "Funds" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("restricting a fund", () => {
  it("asks what the money was given for when nothing says", async () => {
    render(<GivingFunds />);
    const row = await fundRow("General fund");
    await userEvent.click(within(row).getByRole("checkbox", { name: /restricted/i }));
    expect(vi.mocked(window.prompt).mock.calls[0][0]).toMatch(/given for/i);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toEqual({ restricted: true, description: "The roof" });
  });

  it("restricts nothing when the purpose is left blank", async () => {
    // A restricted fund with no stated purpose is a label, not a rule: nothing
    // says which costs are within it.
    vi.mocked(window.prompt).mockReturnValue("   ");
    render(<GivingFunds />);
    const row = await fundRow("General fund");
    await userEvent.click(within(row).getByRole("checkbox", { name: /restricted/i }));
    expect(posted).toHaveLength(0);
  });

  it("does not ask again when the fund already says what for", async () => {
    // A mutation test caught the earlier version of this: it clicked an
    // already-restricted fund, which *unchecks* the box, so the branch that
    // decides whether to ask was never reached either way.
    render(<GivingFunds />);
    const row = await fundRow("Organ appeal");
    await userEvent.click(within(row).getByRole("checkbox", { name: /restricted/i }));
    expect(window.prompt).not.toHaveBeenCalled();
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toEqual({ restricted: true });
  });

  it("lifts a restriction without asking anything", async () => {
    render(<GivingFunds />);
    const row = await fundRow("Building fund");
    await userEvent.click(within(row).getByRole("checkbox", { name: /restricted/i }));
    expect(window.prompt).not.toHaveBeenCalled();
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toEqual({ restricted: false });
  });
});

describe("moving money between funds", () => {
  it("sends the authority along with the amount", async () => {
    render(<GivingFunds />);
    await screen.findByRole("list", { name: "Funds" });
    await userEvent.selectOptions(screen.getByLabelText(/out of/i), "general");
    await userEvent.selectOptions(screen.getByLabelText(/^into$/i), "building");
    await userEvent.type(screen.getByPlaceholderText(/amount in pounds/i), "250");
    await userEvent.type(screen.getByPlaceholderText(/what permits it/i), "Trustees, 4 March");
    await userEvent.click(screen.getByRole("button", { name: /move it/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].url).toBe("/api/admin/giving/transfers");
    expect(posted[0].body).toEqual({
      fromFundId: "general",
      toFundId: "building",
      amount: 25_000,
      authority: "Trustees, 4 March",
    });
  });

  it("will not submit without an authority", async () => {
    render(<GivingFunds />);
    await screen.findByRole("list", { name: "Funds" });
    await userEvent.selectOptions(screen.getByLabelText(/out of/i), "general");
    await userEvent.selectOptions(screen.getByLabelText(/^into$/i), "building");
    await userEvent.type(screen.getByPlaceholderText(/amount in pounds/i), "250");
    await userEvent.click(screen.getByRole("button", { name: /move it/i }));
    expect(posted).toHaveLength(0);
  });

  it("lists past transfers with the reason for each", async () => {
    // The explanation of why a restricted fund got smaller is the one thing
    // anybody will want to read back.
    render(<GivingFunds />);
    const list = await screen.findByRole("list", { name: "Past transfers" });
    const past = within(list).getByText("Trustees, 4 March").closest("li")!;
    expect(past.textContent).toContain("£1,000");
    expect(past.textContent).toContain("General fund → Building fund");
  });

  it("offers no closed fund as a destination", async () => {
    payload.funds = [fund(), fund({ id: "old", name: "Old appeal", active: false, restricted: false })];
    render(<GivingFunds />);
    const into = await screen.findByLabelText(/^into$/i);
    const names = Array.from(into.querySelectorAll("option")).map((option) => option.textContent);
    expect(names).toContain("Building fund");
    expect(names).not.toContain("Old appeal");
  });
});

describe("when the load fails", () => {
  it("says so rather than sitting on Loading", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));
    render(<GivingFunds />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load the funds/i);
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});
