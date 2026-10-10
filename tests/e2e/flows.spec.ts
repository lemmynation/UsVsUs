import { expect, test } from "@playwright/test";
import { closeExtraPhones, lobby, newPlayer, options, startGame } from "./helpers";

test.afterEach(closeExtraPhones);

/** Everyday paths not covered elsewhere: joining by typed code, leaving, host handover, play again. */

test("join by typing the code, with a taken nickname caught first", async ({ browser }) => {
  const { host, code } = await lobby(browser, "Friends", []);
  const guest = await newPlayer(browser);
  await guest.goto("/");
  await guest.getByRole("link", { name: "Join with code" }).click();
  await guest.getByLabel("Room code").fill(code.toLowerCase()); // case doesn't matter
  await guest.getByRole("button", { name: "Find room" }).click();
  await expect(guest).toHaveURL(new RegExp(`/join/${code}$`));
  await expect(guest.getByText("Lem", { exact: true })).toBeVisible(); // "Lem invited you to"

  await guest.getByLabel("Your nickname").fill("lem"); // same name, different case
  await guest.getByRole("button", { name: "Join room" }).click();
  await expect(guest.getByText(/already has that nickname/)).toBeVisible();

  await guest.getByLabel("Your nickname").fill("Ana");
  await guest.getByRole("button", { name: "Join room" }).click();
  await expect(guest).toHaveURL(/\/room\//);
  await expect(host.getByTestId("player-count")).toHaveText("2/2");
});

test("when the host leaves the lobby, the next player becomes host", async ({ browser }) => {
  const { host, guests } = await lobby(browser, "Circle", ["Ana", "Ben"]);
  const [ana] = guests;
  host.on("dialog", (d) => void d.accept());
  await host.getByRole("button", { name: "Leave room" }).click();
  await expect(host).toHaveURL(/\/$/);

  await expect(ana.getByTestId("player-count")).toHaveText("2/10");
  await expect(ana.getByRole("button", { name: "Start game" })).toBeVisible(); // Ana joined first, so she hosts now
});

test("if your partner leaves mid-game, the game ends with a recap instead of hanging", async ({ browser }) => {
  const { host, guests } = await startGame(browser, "Couple", ["Ana"]);
  const [ana] = guests;
  await host.getByRole("button", { name: "Start round" }).click();
  await expect(options(ana).first()).toBeVisible();

  ana.on("dialog", (d) => void d.accept());
  await ana.getByRole("button", { name: "Leave game" }).click();
  await expect(ana).toHaveURL(/\/$/);

  await expect(host.getByText("Everyone else left, so the game ended early.")).toBeVisible();
  await expect(host.getByRole("link", { name: "New room" })).toBeVisible();
});

test("New room after a game opens a fresh room in the same mode", async ({ browser }) => {
  const { host, guests } = await startGame(browser, "Couple", ["Ana"]);
  await expect(host.getByRole("heading", { name: "Mind Reader" })).toBeVisible();
  // Finish quickly: the guest leaves, which ends the game for the host.
  guests[0].on("dialog", (d) => void d.accept());
  await guests[0].getByRole("button", { name: "Leave game" }).click();
  await host.getByRole("link", { name: "New room" }).click();
  await expect(host).toHaveURL(/\/create\?mode=couple$/);
  // The host's earlier create page is kept alive by Next: it must come back usable, not stuck on "Creating…".
  await host.getByLabel("Your nickname").fill("Lem");
  await host.getByRole("button", { name: "Create Couple room" }).click();
  await expect(host).toHaveURL(/\/room\//);
  await expect(host.getByTestId("player-count")).toHaveText("1/2");
});

test("Friends mode plays its own lineup", async ({ browser }) => {
  const room = await lobby(browser, "Friends", ["Ana"]);
  await room.host.getByRole("button", { name: "Start game" }).click();
  await expect(room.host.getByText("Round 1 of 3")).toBeVisible();
  await expect(room.host.getByRole("heading", { name: "Mind Reader" })).toBeVisible();
  await room.host.getByRole("button", { name: "Start round" }).click();
  await expect(options(room.guests[0]).first()).toBeVisible();
  // Friends questions never use Couple-only romance prompts.
  await expect(room.guests[0].getByRole("heading", { level: 1 })).not.toHaveText(/date|anniversary/i);
});
