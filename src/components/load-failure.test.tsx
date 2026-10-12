import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiKeysManager } from "./api-keys-manager";
import { EventsManager } from "./events-manager";
import { GivingFunds } from "./giving-funds";
import { PlaylistsManager } from "./playlists-manager";
import { PrayerModeration } from "./prayer-moderation";
import { TvDevices } from "./tv-devices";

/**
 * Every screen says something when its first load fails.
 *
 * Written after fixing twenty-eight components that did not. Ten rendered the
 * message after an early `return <Loading />` that the failure itself
 * guaranteed they would hit; eighteen never recorded the failure at all. One
 * of those, the television list, went further and said "No televisions are
 * signed in" — a false statement rather than a missing one.
 *
 * This is the regression test for the class, not for any one screen: the point
 * is that a reader can add a component to the list below and find out in a
 * second whether it joined the club.
 */

function failEverything() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response),
  );
}

afterEach(() => vi.unstubAllGlobals());

const screens = [
  { name: "API keys", render: () => <ApiKeysManager /> },
  { name: "events", render: () => <EventsManager /> },
  { name: "giving funds", render: () => <GivingFunds /> },
  { name: "playlists", render: () => <PlaylistsManager /> },
  { name: "prayer moderation", render: () => <PrayerModeration /> },
  { name: "televisions", render: () => <TvDevices /> },
];

describe("a first load that fails", () => {
  for (const { name, render: renderIt } of screens) {
    it(`says so on ${name}`, async () => {
      failEverything();
      render(renderIt());
      const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
      expect(alert.textContent).toMatch(/couldn't load/i);
    });

    it(`does not sit on "Loading…" on ${name}`, async () => {
      failEverything();
      render(renderIt());
      await screen.findByRole("alert", {}, { timeout: 3000 });
      expect(screen.queryByText("Loading…")).toBeNull();
    });
  }

  it("never claims the televisions list is simply empty", async () => {
    // The worst shape of the bug: an empty state reached because the load
    // failed reads as a fact about the world.
    failEverything();
    render(<TvDevices />);
    await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(screen.queryByText(/no televisions are signed in/i)).toBeNull();
  });
});
