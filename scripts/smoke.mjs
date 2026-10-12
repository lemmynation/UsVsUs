// Post-deploy smoke test: `node scripts/smoke.mjs https://your-site.vercel.app`
// Checks pages, headers and link previews, then plays the start of a real game over the
// API with two simulated phones (it creates one room, which expires on its own).
const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node scripts/smoke.mjs https://your-site");
  process.exit(2);
}

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

/** A phone: keeps its own session cookie. */
function phone() {
  let cookie = "";
  return async (path, init = {}) => {
    const res = await fetch(base + path, {
      ...init,
      redirect: "manual",
      headers: { "content-type": "application/json", ...(cookie && { cookie }), ...init.headers },
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  };
}

const visitor = phone();
const home = await visitor("/");
check("landing page loads", home.status === 200, String(home.status));
check("security headers", home.headers.get("x-frame-options") === "DENY" && !!home.headers.get("referrer-policy"));
check("served over HTTPS with HSTS", !base.startsWith("https") || !!home.headers.get("strict-transport-security"));
const html = await home.text();
const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
check("link preview image points at this site", !!og && og.startsWith(base), og ?? "missing");
if (og?.startsWith(base)) {
  const img = await fetch(og).catch(() => null);
  check("link preview image renders", img?.headers.get("content-type") === "image/png");
}
for (const path of ["/privacy", "/join", "/create?mode=circle", "/robots.txt"]) {
  const r = await visitor(path);
  check(`${path} loads`, r.status === 200, String(r.status));
}

const host = phone();
const created = await host("/api/rooms", {
  method: "POST",
  body: JSON.stringify({ mode: "couple", nickname: "Smoke" }),
});
const room = created.status === 201 ? await created.json() : null;
check("create a room", !!room, String(created.status));
if (room) {
  const guest = phone();
  const invite = await guest(`/join/${room.joinCode}`);
  check("invite page shows who's inviting", (await invite.text()).includes("Smoke"));
  const joined = await guest("/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({ code: room.joinCode, nickname: "Test" }),
  });
  check("join the room", joined.status === 200, String(joined.status));
  const state = await (await host(`/api/rooms/${room.roomId}`)).json();
  check("both players in the lobby", state.players?.length === 2, JSON.stringify(state.players?.length));
  const started = await host(`/api/rooms/${room.roomId}/start`, { method: "POST", body: "{}" });
  check("host starts the game", started.status === 200, String(started.status));
  const after = await (await guest(`/api/rooms/${room.roomId}`)).json();
  check("guest sees the game", after.game?.phase === "ROUND_INTRO", after.game?.phase);
  const outsider = await phone()(`/api/rooms/${room.roomId}`);
  check("strangers can't read the room", outsider.status === 403 || outsider.status === 404, String(outsider.status));
  // Leaving mid-game runs the roster-change paths of every game type (Chain Reactions included).
  const left = await guest(`/api/rooms/${room.roomId}/leave`, { method: "POST", body: "{}" });
  check("guest leaves mid-game", left.status === 200, String(left.status));
  const hostAfter = await host(`/api/rooms/${room.roomId}`);
  check("host's room still loads after that", hostAfter.status === 200, String(hostAfter.status));
}

// Chain Reactions (Mutation Machine) is behind CHAIN_REACTIONS=on. Report which it is.
const chaos = await phone()("/api/rooms", {
  method: "POST",
  body: JSON.stringify({ mode: "circle", nickname: "Smoke", experience: "chain_reactions" }),
});
const chaosOn = chaos.status === 201;
check(
  `Mutation Machine is ${chaosOn ? "ON" : "off"} (CHAIN_REACTIONS)`,
  chaosOn || chaos.status === 404,
  chaosOn ? "created a chaos room" : String(chaos.status),
);
const homeHtml = html.includes("Mutation Machine");
check(
  "landing page matches the flag",
  homeHtml === chaosOn,
  homeHtml ? "shows Mutation Machine" : "no Mutation Machine",
);

const cron = await visitor("/api/admin/cleanup");
check("cleanup job refuses requests without the secret", cron.status === 401, String(cron.status));

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll good.");
process.exit(failures ? 1 : 0);
