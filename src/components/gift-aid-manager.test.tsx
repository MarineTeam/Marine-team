import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GiftAidManager } from "./gift-aid-manager";

/**
 * The Gift Aid screen, rendered.
 *
 * The first component test in this repo, and it starts here because this is
 * the screen where a mistake is money: a button that claims the wrong span, a
 * figure that disagrees with the one being sent, a confirmation that does not
 * actually confirm. The rules behind it are covered exhaustively in
 * `gift-aid.test.ts`; none of that says the button works.
 *
 * `fetch` is the seam. Everything else is the real component.
 */

const payload = {
  view: {
    from: "2025-09-01",
    to: "2026-10-11",
    summary: { giftCount: 3, donationTotal: 18000, claimTotal: 4500 },
    blocked: [
      { reason: "no-declaration", label: "no Gift Aid declaration on file", fixable: true, gifts: 2, amount: 50000, worth: 12500 },
      { reason: "fund-not-eligible", label: "the fund isn't eligible", fixable: false, gifts: 1, amount: 7500, worth: 1875 },
    ],
    expiring: [{ giftId: "g9", givenAt: "2022-12-01", amount: 4000, deadline: "2026-12-01" }],
    schedule: [{ firstName: "Ruth", lastName: "Bell", postcode: "AB1 2CD", amount: "150.00" }],
    awaitingLetter: 1,
  },
  declarations: [
    {
      id: "d1",
      personId: "p1",
      madeOn: "2025-01-01",
      coversPast: true,
      withdrawnOn: null as string | null,
      firstName: "Ruth",
      lastName: "Bell",
      houseNumber: "14",
      postcode: "AB1 2CD",
      how: "PAPER" as const,
    },
  ],
  claims: [],
  worth: { claimableNow: 4500, fixable: 12500, lost: 300 },
};

let posted: { url: string; body: unknown }[] = [];

function mockFetch(overrides: Partial<typeof payload> = {}) {
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method && init.method !== "GET") {
        posted.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, json: async () => ({ ...payload, ...overrides }) } as Response;
    }),
  );
}

beforeEach(() => {
  mockFetch();
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("prompt", vi.fn(() => "2026-10-11"));
});

describe("the headline figures", () => {
  it("shows what is claimable, what is fixable and what is lost", async () => {
    render(<GiftAidManager />);
    // Scoped to the tiles: £45 is deliberately on screen twice, once here and
    // once on the claim line, and a bare getByText would be ambiguous.
    const claimable = (await screen.findByText("Claimable now")).parentElement!;
    expect(within(claimable).getByText("£45")).toBeInTheDocument();
    const fixable = screen.getByText("Blocked but fixable").parentElement!;
    expect(within(fixable).getByText("£125")).toBeInTheDocument();
    const lost = screen.getByText("Past the deadline").parentElement!;
    expect(within(lost).getByText("£3")).toBeInTheDocument();
  });

  it("gives the blocked money as much prominence as the claim", async () => {
    render(<GiftAidManager />);
    const row = (await screen.findByText(/no Gift Aid declaration on file/)).closest("li")!;
    // The figure sits in a <strong> inside the line, so the text is split.
    expect(row.textContent).toContain("£125");
    expect(row.textContent).toContain("unclaimed");
  });

  it("marks what somebody could actually do something about", async () => {
    render(<GiftAidManager />);
    const fixable = await screen.findByText(/no Gift Aid declaration on file/);
    expect(within(fixable).getByText("somebody could ask")).toBeInTheDocument();
    // And does not say it about the one nobody can fix.
    const unfixable = screen.getByText(/the fund isn't eligible/);
    expect(within(unfixable).queryByText("somebody could ask")).toBeNull();
  });
});

describe("preparing a claim", () => {
  it("claims the span the screen is showing, not the one in the date boxes", async () => {
    // The bug this guards: a treasurer types a new From date, does not press
    // anything to apply it, and claims — the figure on screen came from the
    // old span and the claim must match the figure.
    render(<GiftAidManager />);
    await screen.findByText(/3 gifts/);

    await userEvent.click(screen.getByRole("button", { name: /prepare a claim/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toEqual({ action: "claim", from: "2025-09-01", to: "2026-10-11" });
  });

  it("asks before claiming, naming the amount and the count", async () => {
    render(<GiftAidManager />);
    await screen.findByText(/3 gifts/);
    await userEvent.click(screen.getByRole("button", { name: /prepare a claim/i }));

    const asked = vi.mocked(window.confirm).mock.calls[0][0];
    expect(asked).toContain("£45");
    expect(asked).toContain("3 gifts");
  });

  it("sends nothing when the confirmation is declined", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<GiftAidManager />);
    await screen.findByText(/3 gifts/);
    await userEvent.click(screen.getByRole("button", { name: /prepare a claim/i }));
    expect(posted).toHaveLength(0);
  });

  it("offers no claim button when there is nothing to claim", async () => {
    mockFetch({
      view: { ...payload.view, summary: { giftCount: 0, donationTotal: 0, claimTotal: 0 } },
    });
    render(<GiftAidManager />);
    await screen.findByText(/0 gifts/);
    expect(screen.queryByRole("button", { name: /prepare a claim/i })).toBeNull();
  });

  it("links the schedule download to the same span as the claim", async () => {
    render(<GiftAidManager />);
    const link = await screen.findByRole("link", { name: /download the schedule/i });
    expect(link).toHaveAttribute(
      "href",
      "/api/admin/giving/gift-aid/schedule?from=2025-09-01&to=2026-10-11",
    );
  });
});

describe("declarations", () => {
  it("shows the address as declared, which is what HMRC gets", async () => {
    render(<GiftAidManager />);
    await screen.findByText("Ruth Bell");
    expect(screen.getByText("14, AB1 2CD")).toBeInTheDocument();
  });

  it("says whether it reaches back over earlier gifts", async () => {
    render(<GiftAidManager />);
    await screen.findByText(/covers earlier gifts/);
  });

  it("flags the verbal ones still owed a letter", async () => {
    render(<GiftAidManager />);
    await screen.findByText(/1 verbal declaration is still owed a written confirmation/);
  });

  it("asks which date a withdrawal takes effect from, rather than assuming today", async () => {
    // The rule the whole feature turns on: somebody ringing in March about
    // last September is describing September.
    render(<GiftAidManager />);
    await screen.findByText("Ruth Bell");
    await userEvent.click(screen.getByRole("button", { name: "withdraw" }));

    expect(vi.mocked(window.prompt).mock.calls[0][0]).toMatch(/which date/i);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toMatchObject({ action: "withdraw", declarationId: "d1", on: "2026-10-11" });
  });

  it("withdraws nothing when the date is left blank", async () => {
    vi.mocked(window.prompt).mockReturnValue("");
    render(<GiftAidManager />);
    await screen.findByText("Ruth Bell");
    await userEvent.click(screen.getByRole("button", { name: "withdraw" }));
    expect(posted).toHaveLength(0);
  });

  it("offers no withdraw button on one already withdrawn", async () => {
    mockFetch({
      declarations: [{ ...payload.declarations[0], withdrawnOn: "2026-05-01" }],
    });
    render(<GiftAidManager />);
    await screen.findByText(/withdrawn 2026-05-01/);
    expect(screen.queryByRole("button", { name: "withdraw" })).toBeNull();
  });
});

describe("recording a declaration", () => {
  it("sends what HMRC needs, including whether it back-dates", async () => {
    render(<GiftAidManager />);
    await screen.findByPlaceholderText("Forename");

    await userEvent.type(screen.getByPlaceholderText("Who (person id)"), "p2");
    // Required: without it the browser blocks the submit and nothing is sent.
    await userEvent.type(screen.getByLabelText(/signed on/i), "2026-10-01");
    await userEvent.type(screen.getByPlaceholderText("Forename"), "Sam");
    await userEvent.type(screen.getByPlaceholderText("Surname"), "Khan");
    await userEvent.type(screen.getByPlaceholderText("House name or number"), "2 The Green");
    await userEvent.type(screen.getByPlaceholderText("Postcode"), "XY9 8ZZ");
    await userEvent.click(screen.getByRole("button", { name: /record it/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toMatchObject({
      action: "declare",
      personId: "p2",
      firstName: "Sam",
      lastName: "Khan",
      houseNumber: "2 The Green",
      postcode: "XY9 8ZZ",
      coversPast: true,
      how: "PAPER",
    });
  });

  it("can record one that does not reach back", async () => {
    render(<GiftAidManager />);
    await screen.findByPlaceholderText("Forename");

    await userEvent.type(screen.getByPlaceholderText("Who (person id)"), "p2");
    // Required: without it the browser blocks the submit and nothing is sent.
    await userEvent.type(screen.getByLabelText(/signed on/i), "2026-10-01");
    await userEvent.type(screen.getByPlaceholderText("Forename"), "Sam");
    await userEvent.type(screen.getByPlaceholderText("Surname"), "Khan");
    await userEvent.type(screen.getByPlaceholderText("House name or number"), "2");
    await userEvent.type(screen.getByPlaceholderText("Postcode"), "XY9 8ZZ");
    await userEvent.click(screen.getByLabelText(/covers gifts already given/i));
    await userEvent.click(screen.getByRole("button", { name: /record it/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toMatchObject({ coversPast: false });
  });
});

describe("when something goes wrong", () => {
  it("shows the server's own refusal rather than swallowing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method && init.method !== "GET") {
          return {
            ok: false,
            json: async () => ({ error: "Somebody claimed one of these while this was being prepared." }),
          } as Response;
        }
        return { ok: true, json: async () => payload } as Response;
      }),
    );

    render(<GiftAidManager />);
    await screen.findByText(/3 gifts/);
    await userEvent.click(screen.getByRole("button", { name: /prepare a claim/i }));

    await screen.findByText(/Somebody claimed one of these/);
  });

  it("says so when the figures cannot be loaded at all", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));
    render(<GiftAidManager />);
    await screen.findByText(/couldn't load the gift aid figures/i);
  });
});
