import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CheckinDesk } from "./checkin-desk";

/**
 * The check-in desk, rendered.
 *
 * The highest-stakes screen in the app: it decides who walks out of a room
 * with a child. `checkin.ts` proves the *rule* — code and guardian, both — and
 * says nothing about whether the desk sends what the rule expects, whether the
 * override can be fired with nothing written in it, or whether a refusal from
 * the server reaches the volunteer standing at the door.
 *
 * `fetch` is the seam; everything else is the real component.
 */

const family = {
  householdId: "h1",
  name: "The Bells",
  members: [
    { id: "p-mum", displayName: "Ruth Bell", householdRole: "ADULT" as const, active: true },
    { id: "p-gran", displayName: "Edith Bell", householdRole: "ADULT" as const, active: true },
    { id: "p-kid", displayName: "Jo Bell", householdRole: "CHILD" as const, active: true },
    { id: "p-gone", displayName: "Old Address", householdRole: "ADULT" as const, active: false },
  ],
  records: { "p-kid": true },
};

const register = {
  session: { id: "s1", name: "The Nest", room: "Room 2", closedAt: null },
  here: 1,
  children: [
    {
      id: "r1",
      childId: "p-kid",
      name: "Jo Bell",
      age: 6,
      code: "4KQ7",
      medicalNotes: "Peanut allergy",
      checkedOutAt: null,
      releasedTo: null,
      overrideReason: null,
    },
  ],
};

let posted: unknown[] = [];
let releaseReply: { ok: boolean; payload: unknown } = { ok: true, payload: { by: "code-and-guardian" } };

function mockFetch() {
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posted.push(body);
        if (body.action === "search") {
          return { ok: true, json: async () => ({ families: [family] }) } as Response;
        }
        return { ok: releaseReply.ok, json: async () => releaseReply.payload } as Response;
      }
      return { ok: true, json: async () => register } as Response;
    }),
  );
}

/** Get to the collection panel, which is two steps in. */
async function openCollection() {
  render(<CheckinDesk sessionId="s1" />);
  await screen.findByText("Jo Bell");
  await userEvent.click(screen.getByRole("button", { name: "Collect" }));
  await screen.findByText(/collecting jo bell/i);
}

beforeEach(() => {
  releaseReply = { ok: true, payload: { by: "code-and-guardian" } };
  mockFetch();
});

describe("the register", () => {
  it("shows who is in the room, with their code", async () => {
    render(<CheckinDesk sessionId="s1" />);
    await screen.findByText("Jo Bell");
    expect(screen.getByText("4KQ7")).toBeInTheDocument();
    expect(screen.getByText(/in the room: 1/i)).toBeInTheDocument();
  });

  it("shows a medical note on the room screen, where somebody can act on it", async () => {
    render(<CheckinDesk sessionId="s1" />);
    expect(await screen.findByText("Peanut allergy")).toBeInTheDocument();
  });

  it("says what went wrong if the register cannot be loaded, rather than spinning", async () => {
    // The bug component testing found across ten screens: an error set during
    // the first load was rendered after an early "Loading…" return, so it
    // never appeared.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response));
    render(<CheckinDesk sessionId="s1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load/i);
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});

describe("releasing a child", () => {
  it("sends the code and the chosen adult, which is what the rule needs", async () => {
    await openCollection();

    await userEvent.type(screen.getByLabelText(/code on their ticket/i), "4KQ7");
    await userEvent.selectOptions(screen.getByLabelText(/who is collecting/i), "p-gran");
    await userEvent.click(screen.getByRole("button", { name: "Release" }));

    await waitFor(() => expect(posted.at(-1)).toMatchObject({ action: "release" }));
    expect(posted.at(-1)).toEqual({
      action: "release",
      childId: "p-kid",
      code: "4KQ7",
      collectorId: "p-gran",
    });
  });

  it("never sends an override reason on an ordinary release", async () => {
    // The two paths must not blur: a normal release that quietly carried an
    // override would be an override nobody chose and nobody recorded.
    await openCollection();
    await userEvent.type(screen.getByLabelText(/code on their ticket/i), "4KQ7");
    await userEvent.selectOptions(screen.getByLabelText(/who is collecting/i), "p-mum");
    await userEvent.click(screen.getByRole("button", { name: "Release" }));

    await waitFor(() => expect(posted.at(-1)).toMatchObject({ action: "release" }));
    expect(posted.at(-1)).not.toHaveProperty("overrideReason");
  });

  it("offers only the household's active adults as collectors", async () => {
    await openCollection();
    const picker = screen.getByLabelText(/who is collecting/i);
    const names = Array.from(picker.querySelectorAll("option")).map((o) => o.textContent);
    expect(names).toContain("Ruth Bell");
    expect(names).toContain("Edith Bell");
    // Not the child, and not somebody no longer of the household.
    expect(names).not.toContain("Jo Bell");
    expect(names).not.toContain("Old Address");
  });

  it("sends no collector when none was chosen, rather than guessing one", async () => {
    await openCollection();
    await userEvent.type(screen.getByLabelText(/code on their ticket/i), "4KQ7");
    await userEvent.click(screen.getByRole("button", { name: "Release" }));

    await waitFor(() => expect(posted.at(-1)).toMatchObject({ action: "release" }));
    expect(posted.at(-1)).toMatchObject({ collectorId: null });
  });

  it("puts the server's refusal in front of the volunteer", async () => {
    // A refusal that does not reach the person at the door is the same as no
    // check at all.
    releaseReply = { ok: false, payload: { error: "That code doesn't match." } };
    await openCollection();
    await userEvent.type(screen.getByLabelText(/code on their ticket/i), "9999");
    await userEvent.click(screen.getByRole("button", { name: "Release" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That code doesn't match.");
  });

  it("keeps the panel open on a refusal, so the code can be retyped", async () => {
    releaseReply = { ok: false, payload: { error: "That code doesn't match." } };
    await openCollection();
    await userEvent.type(screen.getByLabelText(/code on their ticket/i), "9999");
    await userEvent.click(screen.getByRole("button", { name: "Release" }));

    await screen.findByRole("alert");
    expect(screen.getByText(/collecting jo bell/i)).toBeInTheDocument();
  });
});

describe("the override", () => {
  it("cannot be fired with nothing written in it", async () => {
    // An override nobody has to explain is one that becomes the normal route.
    await openCollection();
    await userEvent.click(screen.getByText(/neither of those is right/i));
    expect(screen.getByRole("button", { name: /override and release/i })).toBeDisabled();
  });

  it("stays disabled on whitespace alone", async () => {
    await openCollection();
    await userEvent.click(screen.getByText(/neither of those is right/i));
    await userEvent.type(screen.getByPlaceholderText(/aunt collecting/i), "   ");
    expect(screen.getByRole("button", { name: /override and release/i })).toBeDisabled();
  });

  it("sends the reason, and no code, once there is one", async () => {
    releaseReply = { ok: true, payload: { by: "override" } };
    await openCollection();
    await userEvent.click(screen.getByText(/neither of those is right/i));
    await userEvent.type(screen.getByPlaceholderText(/aunt collecting/i), "Gran, mum rang ahead");
    await userEvent.click(screen.getByRole("button", { name: /override and release/i }));

    await waitFor(() => expect(posted.at(-1)).toMatchObject({ action: "release" }));
    expect(posted.at(-1)).toEqual({
      action: "release",
      childId: "p-kid",
      overrideReason: "Gran, mum rang ahead",
    });
  });

  it("tells the volunteer it has been recorded", async () => {
    releaseReply = { ok: true, payload: { by: "override" } };
    await openCollection();
    await userEvent.click(screen.getByText(/neither of those is right/i));
    await userEvent.type(screen.getByPlaceholderText(/aunt collecting/i), "Gran, mum rang ahead");
    await userEvent.click(screen.getByRole("button", { name: /override and release/i }));

    expect(await screen.findByText(/released on an override. It has been recorded/i)).toBeInTheDocument();
  });
});
