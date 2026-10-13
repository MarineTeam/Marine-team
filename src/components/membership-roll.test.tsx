import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MembershipRoll } from "./membership-roll";

/**
 * The roll, rendered.
 *
 * Two things only a rendered page can show. That the date box asks what the
 * roll *was*, not what it is — the question a return actually asks. And that
 * somebody already on the roll is still offered in the picker, because a
 * person has to be on it to come off it, and a picker that hid them would make
 * a death impossible to record.
 */

let payload: Record<string, unknown>;
let asked: string[] = [];
let posted: unknown[] = [];

const entry = (over: Record<string, unknown> = {}) => ({
  personId: "p1",
  name: "Ada Carter",
  householdName: "The Carters",
  since: "2015-04-01",
  joined: "BAPTISM",
  ...over,
});

const zeroes = {
  BAPTISM: 0,
  PROFESSION: 0,
  TRANSFER_IN: 0,
  RESTORED: 0,
  DEATH: 0,
  TRANSFER_OUT: 0,
  REQUEST: 0,
  LAPSED: 0,
};

/**
 * A paragraph whose whole text matches, rather than one text node of it.
 *
 * These lines put the numbers in their own spans for styling, which splits the
 * text and defeats the default matcher.
 */
const paragraph = (pattern: RegExp) =>
  screen.findByText(
    (_text, element) => element?.tagName === "P" && pattern.test(element.textContent ?? ""),
  );

function mockFetch() {
  asked = [];
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      asked.push(url);
      return { ok: true, json: async () => payload } as Response;
    }),
  );
}

beforeEach(() => {
  payload = {
    at: "2026-10-13",
    roll: [entry(), entry({ personId: "p2", name: "Ben Shaw", householdName: null, since: "2022-01-01", joined: "RESTORED" })],
    candidates: [{ id: "p9", displayName: "Nia Price" }],
    revision: null,
  };
  mockFetch();
});

describe("the roll as it stood on a day", () => {
  it("asks what the roll was on a date, not just today", async () => {
    render(<MembershipRoll />);
    expect(await screen.findByLabelText(/the roll as it stood on/i)).toBeInTheDocument();
  });

  it("asks the server again for a different date", async () => {
    render(<MembershipRoll />);
    // A date input is set rather than typed into: jsdom does not drive one
    // keystroke by keystroke the way a browser does.
    const box = await screen.findByLabelText(/the roll as it stood on/i);
    fireEvent.change(box, { target: { value: "2019-12-31" } });
    await waitFor(() => expect(asked.some((url) => url.includes("at=2019-12-31"))).toBe(true));
  });

  it("counts who was on it", async () => {
    render(<MembershipRoll />);
    expect(await paragraph(/^2 on the roll$/)).toBeInTheDocument();
  });

  it("says when each person joined and how", async () => {
    render(<MembershipRoll />);
    const list = await screen.findByRole("list", { name: "The roll" });
    const row = within(list).getByText("Ada Carter").closest("li")!;
    expect(row.textContent).toContain("since 2015-04-01");
    expect(row.textContent).toContain("baptism");
  });

  it("dates a returner from the restoration", async () => {
    render(<MembershipRoll />);
    const list = await screen.findByRole("list", { name: "The roll" });
    const row = within(list).getByText("Ben Shaw").closest("li")!;
    expect(row.textContent).toContain("since 2022-01-01");
    expect(row.textContent).toContain("restored to the roll");
  });

  it("says nobody was on it, rather than nothing at all", async () => {
    // An empty list with no sentence reads as a failed load.
    payload = { ...payload, roll: [] };
    render(<MembershipRoll />);
    expect(await screen.findByText(/nobody was on the roll that day/i)).toBeInTheDocument();
  });
});

describe("recording a change", () => {
  it("offers people already on the roll, so a death can be recorded", async () => {
    // A picker that hid them would make every leaving impossible.
    render(<MembershipRoll />);
    const who = await screen.findByLabelText(/^who$/i);
    const names = Array.from(who.querySelectorAll("option")).map((option) => option.textContent);
    expect(names).toContain("Ada Carter (on the roll)");
  });

  it("offers people who are not on it", async () => {
    render(<MembershipRoll />);
    const who = await screen.findByLabelText(/^who$/i);
    const names = Array.from(who.querySelectorAll("option")).map((option) => option.textContent);
    expect(names).toContain("Nia Price");
  });

  it("groups the joinings apart from the leavings", async () => {
    render(<MembershipRoll />);
    const what = await screen.findByLabelText(/what happened/i);
    const groups = Array.from(what.querySelectorAll("optgroup")).map((group) =>
      group.getAttribute("label"),
    );
    expect(groups).toEqual(["Onto the roll", "Off the roll"]);
  });

  it("sends the date it took effect", async () => {
    render(<MembershipRoll />);
    await userEvent.selectOptions(await screen.findByLabelText(/^who$/i), "p9");
    await userEvent.selectOptions(screen.getByLabelText(/what happened/i), "BAPTISM");
    await userEvent.type(screen.getByLabelText(/when it took effect/i), "2026-09-14");
    await userEvent.click(screen.getByRole("button", { name: /record it/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ personId: "p9", change: "BAPTISM", on: "2026-09-14" });
  });

  it("says the entry is never edited, so a correction is another entry", async () => {
    render(<MembershipRoll />);
    expect(await screen.findByText(/a correction is a further entry/i)).toBeInTheDocument();
  });

  it("asks where they went for a leaving, and where they came from for a joining", async () => {
    render(<MembershipRoll />);
    await screen.findByLabelText(/what happened/i);
    expect(screen.getByPlaceholderText(/where they came from/i)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/what happened/i), "TRANSFER_OUT");
    expect(screen.getByPlaceholderText(/where they went/i)).toBeInTheDocument();
  });

  it("says the note is read one person at a time", async () => {
    render(<MembershipRoll />);
    expect(
      await screen.findByPlaceholderText(/read one person at a time, never in a list/i),
    ).toBeInTheDocument();
  });

  it("shows the server's refusal rather than swallowing it", async () => {
    // The alternation rule lives on the server; its reason is the useful part.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return {
            ok: false,
            json: async () => ({ error: "They were already on the roll then." }),
          } as Response;
        }
        return { ok: true, json: async () => payload } as Response;
      }),
    );
    render(<MembershipRoll />);
    await userEvent.selectOptions(await screen.findByLabelText(/^who$/i), "p9");
    await userEvent.type(screen.getByLabelText(/when it took effect/i), "2026-09-14");
    await userEvent.click(screen.getByRole("button", { name: /record it/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already on the roll then/i);
  });
});

describe("a revision", () => {
  beforeEach(() => {
    payload = {
      ...payload,
      // Opening and closing are deliberately different numbers: equal ones
      // would hide a report that printed the opening twice, which is what a
      // mutation test caught here.
      revision: {
        from: "2026-01-01",
        to: "2026-12-31",
        openingCount: 120,
        joined: [
          { personId: "p9", change: "BAPTISM", on: "2026-03-01" },
          { personId: "p8", change: "BAPTISM", on: "2026-04-01" },
        ],
        left: [{ personId: "p3", change: "DEATH", on: "2026-05-01" }],
        closingCount: 121,
        net: 1,
        reconciles: true,
        joinedByRoute: { ...zeroes, BAPTISM: 2 },
        leftByRoute: { ...zeroes, DEATH: 1 },
      },
    };
  });

  it("gives the four figures a return asks for", async () => {
    render(<MembershipRoll />);
    const line = (await paragraph(/120 at the start/)).textContent!;
    expect(line).toMatch(/2 in/);
    expect(line).toMatch(/1 out/);
    expect(line).toMatch(/121 at the end/);
  });

  it("signs a gain", async () => {
    render(<MembershipRoll />);
    expect((await paragraph(/120 at the start/)).textContent).toContain("(+1)");
  });

  it("signs a standstill, so it is not mistaken for growth", async () => {
    const revision = payload.revision as Record<string, unknown>;
    payload = {
      ...payload,
      revision: { ...revision, closingCount: 120, net: 0, left: [{ personId: "p3", change: "DEATH", on: "2026-05-01" }, { personId: "p4", change: "LAPSED", on: "2026-06-01" }] },
    };
    render(<MembershipRoll />);
    expect((await paragraph(/120 at the start/)).textContent).toContain("(+0)");
  });

  it("shows a loss as a negative, not an unsigned number", async () => {
    const revision = payload.revision as Record<string, unknown>;
    payload = { ...payload, revision: { ...revision, closingCount: 118, net: -2 } };
    render(<MembershipRoll />);
    expect((await paragraph(/120 at the start/)).textContent).toContain("(-2)");
  });

  it("breaks the movements down by route", async () => {
    render(<MembershipRoll />);
    await paragraph(/120 at the start/);
    expect(screen.getByText("baptism:")).toBeInTheDocument();
    expect(screen.getByText("death:")).toBeInTheDocument();
  });

  it("leaves out the routes nobody came or went by", async () => {
    // Eight zeroes would bury the two numbers that matter. Checked on both
    // sides: a mutation test found the joining half untested.
    render(<MembershipRoll />);
    await paragraph(/120 at the start/);
    expect(screen.queryByText("transfer in:")).toBeNull();
    expect(screen.queryByText("lapsed at a revision:")).toBeNull();
  });

  it("says so when the figures do not add up", async () => {
    payload = {
      ...payload,
      revision: { ...(payload.revision as object), reconciles: false },
    };
    render(<MembershipRoll />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not add up/i);
  });

  it("says nothing of the sort when they do", async () => {
    render(<MembershipRoll />);
    await paragraph(/120 at the start/);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("when the load fails", () => {
  it("says so rather than sitting on Loading", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));
    render(<MembershipRoll />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load the roll/i);
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});
