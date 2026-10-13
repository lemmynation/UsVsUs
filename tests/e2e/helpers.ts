import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/** Each player gets their own browser context = their own phone and cookie. */
export async function newPlayer(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

/** Host creates a room and guests join. Everyone ends up in the lobby. */
export async function lobby(browser: Browser, mode: "Couple" | "Friends" | "Circle", guestNames: string[]) {
  const host = await newPlayer(browser);
  await host.goto(`/create?mode=${mode.toLowerCase()}`);
  await host.getByLabel("Your nickname").fill("Lem");
  await host.getByRole("button", { name: `Create ${mode} room` }).click();
  await expect(host).toHaveURL(/\/room\//);
  const code = (await host.getByTestId("join-code").textContent())!.trim();

  const guests: Page[] = [];
  for (const name of guestNames) {
    const guest = await newPlayer(browser);
    await guest.goto(`/join/${code}`);
    await guest.getByLabel("Your nickname").fill(name);
    await guest.getByRole("button", { name: "Join room" }).click();
    await expect(guest).toHaveURL(/\/room\//);
    guests.push(guest);
  }
  return { host, guests, code, roomId: host.url().split("/room/")[1] };
}

/** Lobby, then the host starts: everyone lands on the round intro. */
export async function startGame(browser: Browser, mode: "Couple" | "Circle", guestNames: string[]) {
  const room = await lobby(browser, mode, guestNames);
  await expect(room.host.getByRole("button", { name: "Start game" })).toBeEnabled();
  await room.host.getByRole("button", { name: "Start game" }).click();
  for (const p of [room.host, ...room.guests]) await expect(p.getByText("Round 1 of 3")).toBeVisible();
  return room;
}

export const options = (page: Page, group = "Answers") => page.getByRole("group", { name: group }).getByRole("button");

/** Answers whatever is open with the first option, including This or That's second "guess" tap. */
export async function answerFirst(page: Page) {
  // The last player to answer skips "Locked in" and lands straight on the reveal.
  const done = page.getByText(/Locked in!/).or(page.getByRole("list", { name: /^(Answers|Votes)$/ }));
  await options(page).first().click();
  await expect(page.getByText(/Now guess/).or(done)).toBeVisible();
  if (await page.getByText(/Now guess/).isVisible()) await options(page, "Your guess").first().click();
  await expect(done).toBeVisible();
}

/**
 * Plays a quiz from wherever it is to Wrapped: everyone answers with the first option and
 * `host` taps whatever moves the game on. Works after a host hand-over too.
 */
export async function playToEnd(host: Page, players: Page[]) {
  // The Wrapped screen's subtitle ("Circle night · Wrapped"); headings can't be used, a
  // question like "Who's most likely to win…" would match them.
  const wrapped = host.getByText(/· Wrapped$/);
  const hostButton = host.getByRole("button", {
    name: /^(Start round|Next question|End round|Next round|Finish game)$/,
  });
  for (let i = 0; i < 80; i++) {
    await expect(wrapped.or(hostButton).or(options(host).first())).toBeVisible();
    if (await wrapped.isVisible()) return;
    if (await options(host).first().isVisible()) {
      // Everyone answers once; the reveal can take a moment to reach the host's phone.
      if (await host.getByText(/Locked in!/).isHidden()) for (const p of players) await answerFirst(p);
      await expect(host.getByText(/Locked in!/)).toBeHidden();
      await expect(options(host).first()).toBeHidden();
      continue;
    }
    // Between screens nothing may match yet: look again.
    // The screen can also move on between seeing the button and tapping it (e.g. to a
    // question, which has no host button): never wait on a button that's gone.
    const label = await hostButton.textContent({ timeout: 1_000 }).catch(() => null);
    if (
      !label ||
      !(await hostButton.click({ timeout: 2_000 }).then(
        () => true,
        () => false,
      ))
    )
      continue;
    await expect(host.getByRole("button", { name: label })).toBeHidden();
  }
  throw new Error("game didn't finish");
}

/** Phone layout guard: no sideways scrolling and no tap target under 44px. */
export async function expectPhoneFriendly(page: Page) {
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    smallTargets: [...document.querySelectorAll("button, input, select, textarea")]
      .filter((el) => {
        const { height } = el.getBoundingClientRect();
        return height > 0 && height < 44;
      })
      .map((el) => el.textContent || el.getAttribute("aria-label") || el.tagName),
  }));
  expect(layout).toEqual({ overflow: false, smallTargets: [] });
}

/** WCAG 2.1 A/AA scan; serious and critical problems fail the test. */
export async function expectAccessible(page: Page) {
  // Contrast is measured on what's painted: let fade-ins finish first (spinners loop forever, skip them).
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ rule: v.id, help: v.help, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
  expect(blocking).toEqual([]);
}

/**
 * Closes the extra "phones" a test opened with browser.newContext(). Playwright
 * only closes its own default context, and every room page keeps polling, so
 * leftovers pile up over a run and slow the server for later tests.
 * Use in every spec: `test.afterEach(closeExtraPhones);`
 */
export async function closeExtraPhones({ browser, context }: { browser: Browser; context: BrowserContext }) {
  await Promise.all(
    browser
      .contexts()
      .filter((c) => c !== context)
      .map((c) => c.close()),
  );
}
