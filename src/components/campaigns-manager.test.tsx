import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CampaignsManager } from "./campaigns-manager";

/**
 * The campaigns screen, rendered.
 *
 * This screen has one job beyond the arithmetic: never let a treasurer read a
 * promise as money. `pledges.test.ts` proves the three numbers stay apart in
 * the data; only a rendered page can show that they stay apart on the screen,
 * which is where the mistake is actually made.
 */

const view = {
  campaign: { id: "c1", name: "The roof", slug: "roof", target: 40_000_00, publicTotals: false, closed: false },
  summary: {
    target: 40_000_00,
    pledged: 12_000_00,
    received: 3_500_00,
    receivedFromPledgers: 2_000_00,
    outstanding: 10_000_00,
    pledgeCount: 2,
    fractionOfTarget: 0.0875,
  },
  pledges: [
    {
      id: "pl1",
      who: "The Bells",
      householdId: "h1",
      amount: 10_000_00,
      schedule: "MONTHLY" as const,
      startsOn: "2026-01-01",
      endsOn: "2026-12-01",
      status: "ACTIVE" as const,
      note: "After the house sells",
      nameMayBeShown: false,
      progress: { pledged: 10_000_00, received: 1_000_00, expected: 5_000_00, aheadBy: -4_000_00, fraction: 0.1, fulfilled: false },
    },
    {
      id: "pl2",
      who: "The Khans",
      householdId: "h2",
      amount: 1_000_00,
      schedule: "ONE_OFF" as const,
      startsOn: "2026-02-01",
      endsOn: null,
      status: "ACTIVE" as const,
      note: null,
      nameMayBeShown: true,
      progress: { pledged: 1_000_00, received: 1_000_00, expected: 1_000_00, aheadBy: 0, fraction: 1, fulfilled: true },
    },
  ],
  behind: [{ pledgeId: "pl1", behindBy: 4_000_00, expected: 5_000_00, received: 1_000_00 }],
};

const campaigns = [
  { id: "c1", name: "The roof", slug: "roof", target: 40_000_00, startsOn: "2026-01-01", endsOn: null, publicTotals: false, closed: false, _count: { pledges: 2 } },
];

let posted: unknown[] = [];

function mockFetch() {
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      if (url.includes("slug=")) return { ok: true, json: async () => view } as Response;
      if (url.includes("funds")) {
        return { ok: true, json: async () => ({ funds: [{ id: "f1", name: "Roof fund" }] }) } as Response;
      }
      return { ok: true, json: async () => ({ campaigns }) } as Response;
    }),
  );
}

/** The pledge form, scoped — the campaign form below has the same date labels. */
function pledgeForm(): HTMLElement {
  return screen.getByText("Record a pledge").closest("section")!;
}

/** Open the campaign, which is one click in. */
async function openCampaign() {
  render(<CampaignsManager />);
  await userEvent.click(await screen.findByRole("button", { name: /the roof/i }));
  await screen.findByText("Received");
}

beforeEach(() => {
  mockFetch();
  vi.stubGlobal("confirm", vi.fn(() => true));
});

describe("the three numbers", () => {
  it("shows received, promised and asked-for as three separate figures", async () => {
    await openCampaign();
    const received = screen.getByText("Received").parentElement!;
    expect(within(received).getByText("£3,500")).toBeInTheDocument();
    const promised = screen.getByText("Promised").parentElement!;
    expect(within(promised).getByText("£12,000")).toBeInTheDocument();
    const asked = screen.getByText("Asked for").parentElement!;
    expect(within(asked).getByText("£40,000")).toBeInTheDocument();
  });

  it("never prints the sum of received and promised anywhere", async () => {
    // £15,500 is the number that must not exist. If it ever appears, somebody
    // has added a promise to the money.
    await openCampaign();
    expect(screen.queryByText(/£15,500/)).toBeNull();
    expect(document.body.textContent).not.toContain("15,500");
  });

  it("says in words that the promised figure is not money", async () => {
    await openCampaign();
    const promised = screen.getByText("Promised").parentElement!;
    expect(promised.textContent).toContain("not money");
  });

  it("measures the target against what arrived, not what was promised", async () => {
    // 3,500 / 40,000 is 9%. 12,000 / 40,000 would be 30%.
    await openCampaign();
    expect(screen.getByText(/9% received/)).toBeInTheDocument();
    expect(screen.queryByText(/30%/)).toBeNull();
  });

  it("separates money from pledgers from money from everybody", async () => {
    await openCampaign();
    expect(screen.getByText(/£2,000 of the received came from people who pledged/)).toBeInTheDocument();
  });
});

describe("the pledge list", () => {
  it("shows each promise against what has arrived on it", async () => {
    await openCampaign();
    const bells = (await screen.findByText("The Bells")).closest("li")!;
    expect(bells.textContent).toContain("£10,000");
    expect(bells.textContent).toContain("£1,000 in");
    expect(bells.textContent).toContain("10%");
  });

  it("marks a promise that was kept in full", async () => {
    await openCampaign();
    const khans = screen.getByText("The Khans").closest("li")!;
    expect(khans.textContent).toContain("kept in full");
  });

  it("names who is behind, and says it is arithmetic rather than judgement", async () => {
    await openCampaign();
    expect(screen.getByText(/Behind their schedule/)).toBeInTheDocument();
    expect(screen.getByText(/arithmetic, not a judgement/i)).toBeInTheDocument();
  });
});

describe("recording a pledge", () => {
  it("sends the whole promise in pence, not the instalment", async () => {
    await openCampaign();
    // Scoped: the campaign form below has its own From and Until.
    const form = pledgeForm();
    await userEvent.type(within(form).getByPlaceholderText("Household id"), "h3");
    await userEvent.type(within(form).getByPlaceholderText(/whole promise/i), "1200");
    await userEvent.type(within(form).getByLabelText(/^from$/i), "2026-01-01");
    await userEvent.click(within(form).getByRole("button", { name: /record the pledge/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      action: "pledge",
      campaignId: "c1",
      householdId: "h3",
      amount: 120000,
      schedule: "MONTHLY",
    });
  });

  it("defaults the name to not being shown", async () => {
    // A promise made in confidence stays in it.
    await openCampaign();
    expect(screen.getByLabelText(/happy to be named/i)).not.toBeChecked();
  });

  it("hides the end date for a one-off, which has a date rather than a span", async () => {
    await openCampaign();
    expect(within(pledgeForm()).getByLabelText(/^until/i)).toBeInTheDocument();
    await userEvent.selectOptions(within(pledgeForm()).getByLabelText(/how it arrives/i), "ONE_OFF");
    expect(within(pledgeForm()).queryByLabelText(/^until/i)).toBeNull();
  });

  it("explains that a second pledge replaces rather than adds", async () => {
    await openCampaign();
    expect(screen.getByText(/replaces the first rather than adding to it/)).toBeInTheDocument();
  });
});

describe("publishing and closing", () => {
  it("offers to publish the totals, and says which way round it is", async () => {
    await openCampaign();
    await userEvent.click(screen.getByRole("button", { name: /show totals publicly/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ action: "edit-campaign", campaignId: "c1", publicTotals: true });
  });

  it("asks before closing a campaign", async () => {
    await openCampaign();
    await userEvent.click(screen.getByRole("button", { name: /close it/i }));
    expect(vi.mocked(window.confirm)).toHaveBeenCalled();
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ closed: true });
  });

  it("asks before cancelling somebody's pledge, and says the record is kept", async () => {
    await openCampaign();
    const bells = screen.getByText("The Bells").closest("li")!;
    await userEvent.click(within(bells).getByRole("button", { name: "cancel" }));
    expect(vi.mocked(window.confirm).mock.calls[0][0]).toMatch(/record is kept/i);
  });
});

describe("when the load fails", () => {
  it("says so rather than sitting on Loading", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));
    render(<CampaignsManager />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load the campaigns/i);
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});
