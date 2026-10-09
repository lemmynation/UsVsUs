import { expect, test } from "@playwright/test";
import { lobby, options, startGame } from "./helpers";

/** Design doc §16 resilience: a dropped phone shows it, keeps its place and catches up. */

test("a phone that loses signal mid-question shows Reconnecting, then catches up", async ({ browser }) => {
  const { host, guests } = await startGame(browser, "Couple", ["Ana"]);
  const [guest] = guests;
  await host.getByRole("button", { name: "Start round" }).click();
  await expect(options(guest).first()).toBeVisible();

  await guest.context().setOffline(true);
  await expect(guest.getByText("Reconnecting… your answers are safe.")).toBeVisible();

  // The game moves on without them: the host answers while the guest is offline.
  await options(host).first().click();
  await expect(host.getByText(/Locked in!/)).toBeVisible();

  await guest.context().setOffline(false);
  await expect(guest.getByText("Reconnecting… your answers are safe.")).toBeHidden();
  await expect(guest.getByText("1 of 2 answered")).toBeVisible(); // caught up without a reload

  // And they can still play.
  await options(guest).first().click();
  await expect(guest.getByRole("list", { name: /^(Answers|Votes)$/ })).toBeVisible();
});

test("a removed player sees why, and can't keep reading the room", async ({ browser }) => {
  const { host, guests, roomId } = await lobby(browser, "Circle", ["Ana", "Ben"]);
  const [ana] = guests;

  host.on("dialog", (dialog) => void dialog.accept());
  await host.getByRole("button", { name: "Remove Ana" }).click();

  await expect(ana.getByRole("heading", { name: "You were removed" })).toBeVisible();
  const res = await ana.request.get(`/api/rooms/${roomId}`);
  expect(res.status()).toBe(403);

  // Reloading doesn't sneak back in.
  await ana.reload();
  await expect(ana.getByRole("heading", { name: "You were removed" })).toBeVisible();
});
