const DISCORD_API = "https://discord.com/api/v10";
const SESSION_COOKIE = "jasu_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

const TICKETS = {
  service: { label: "Osto", prefix: "osto", categoryId: "1527163086736199820" },
  general: { label: "Yleinen", prefix: "yleinen", categoryId: "1527163056688337016" },
  partnership: { label: "Yhteistyö", prefix: "yhteistyö", categoryId: "1520012167594643566" },
  application: { label: "Hae yhteisöön", prefix: "haeyhteisöön", categoryId: "1527163226100334674" }
};

const PORTFOLIO_CHANNELS = {
  avatars: "1523660648096075836",
  banners: "1523662022049267732",
  logos: "1523641950526509080"
};

const STATUS_LABELS = {
  received: "Vastaanotettu",
  queued: "Jonossa",
  working: "Työn alla",
  waiting_customer: "Odottaa vastaustasi",
  ready: "Valmis",
  cancelled: "Peruttu"
};

function responseJson(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}

function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  const match = cookies.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function sessionCookie(value, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function discordHeaders(env) {
  return { "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" };
}

function avatarUrl(user) {
  if (!user.avatar) return "";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=128`;
}

function safeChannelPart(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9åäö-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 35) || "kayttaja";
}

async function currentUser(request, env) {
  if (!env.DB) return null;
  const sessionId = getCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;
  const session = await env.DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > ?").bind(sessionId, Date.now()).first();
  return session ? { id: session.user_id, username: session.username, avatarUrl: session.avatar_url } : null;
}

function requireDatabase(env) {
  return env.DB ? null : responseJson({ message: "Tietokantaa ei ole vielä yhdistetty." }, 503);
}

async function startLogin(request, env) {
  if (!env.DISCORD_APPLICATION_ID || !env.DISCORD_CLIENT_SECRET) {
    return responseJson({ message: "Discord-kirjautumisen salaisuudet puuttuvat." }, 503);
  }
  const state = crypto.randomUUID();
  const redirectUri = `${new URL(request.url).origin}/api/auth/discord/callback`;
  const params = new URLSearchParams({ client_id: env.DISCORD_APPLICATION_ID, response_type: "code", redirect_uri: redirectUri, scope: "identify guilds.members.read", state });
  return new Response(null, { status: 302, headers: { Location: `https://discord.com/oauth2/authorize?${params}`, "Set-Cookie": `jasu_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
}

async function finishLogin(request, env) {
  const missingDb = requireDatabase(env); if (missingDb) return missingDb;
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  if (!state || state !== getCookie(request, "jasu_oauth_state")) return responseJson({ message: "Kirjautumispyyntö vanheni. Yritä uudelleen." }, 400);
  const redirectUri = `${url.origin}${url.pathname}`;
  const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.DISCORD_APPLICATION_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code: url.searchParams.get("code") || "", redirect_uri: redirectUri })
  });
  if (!tokenResponse.ok) return responseJson({ message: "Discord-kirjautuminen epäonnistui." }, 502);
  const token = await tokenResponse.json();
  const userResponse = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!userResponse.ok) return responseJson({ message: "Discord-käyttäjää ei saatu." }, 502);
  const user = await userResponse.json();
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (id,user_id,username,avatar_url,expires_at,created_at) VALUES (?,?,?,?,?,?)")
    .bind(sessionId, user.id, user.global_name || user.username, avatarUrl(user), now + SESSION_TTL_SECONDS * 1000, now).run();
  return new Response(null, { status: 302, headers: { Location: "/oma-sivu", "Set-Cookie": sessionCookie(sessionId) } });
}

async function logout(request, env) {
  const id = getCookie(request, SESSION_COOKIE);
  if (id && env.DB) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
  return responseJson({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

async function getCustomer(request, env) {
  const missingDb = requireDatabase(env); if (missingDb) return missingDb;
  const user = await currentUser(request, env);
  if (!user) return responseJson({ authenticated: false }, 401);
  const { results } = await env.DB.prepare("SELECT id,ticket_type,channel_id,title,status,created_at,updated_at FROM orders WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all();
  return responseJson({ authenticated: true, user, orders: results.map(order => ({ ...order, statusLabel: STATUS_LABELS[order.status] || order.status, channelUrl: `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${order.channel_id}` })) });
}

async function createTicket(request, env) {
  const missingDb = requireDatabase(env); if (missingDb) return missingDb;
  const user = await currentUser(request, env);
  if (!user) return responseJson({ message: "Kirjaudu ensin Discordilla." }, 401);
  const body = await request.json().catch(() => ({}));
  const config = TICKETS[body.type];
  if (!config) return responseJson({ message: "Valitse ticketin tyyppi." }, 400);
  const title = String(body.title || "").trim().slice(0, 100);
  const details = String(body.details || "").trim().slice(0, 1800);
  if (!title || details.length < 10) return responseJson({ message: "Kirjoita otsikko ja vähän tarkempi kuvaus." }, 400);
  const existing = await env.DB.prepare("SELECT channel_id FROM orders WHERE user_id = ? AND ticket_type = ? AND status NOT IN ('ready','cancelled') LIMIT 1").bind(user.id, body.type).first();
  if (existing) return responseJson({ message: "Sinulla on jo tämän tyypin avoin ticket.", channelId: existing.channel_id }, 409);
  const memberResponse = await fetch(`${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`, { headers: discordHeaders(env) });
  if (!memberResponse.ok) return responseJson({ message: "Liity ensin Discord-palvelimelle." }, 403);
  const channelResponse = await fetch(`${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/channels`, {
    method: "POST", headers: discordHeaders(env), body: JSON.stringify({
      name: `🎫╹${config.prefix}-${safeChannelPart(user.username)}`, type: 0, parent_id: config.categoryId,
      topic: `web-ticket|${body.type}|${user.id}`,
      permission_overwrites: [
        { id: env.DISCORD_GUILD_ID, type: 0, deny: String(1024) },
        { id: user.id, type: 1, allow: String(1024 | 2048 | 65536 | 32768 | 16384) },
        { id: env.TICKET_STAFF_ROLE_ID || "1526666001301897349", type: 0, allow: String(1024 | 2048 | 65536 | 32768 | 16384) }
      ]
    })
  });
  if (!channelResponse.ok) return responseJson({ message: "Ticket-kanavaa ei saatu luotua.", discordStatus: channelResponse.status }, 502);
  const channel = await channelResponse.json();
  await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, { method: "POST", headers: discordHeaders(env), body: JSON.stringify({ content: `<@${user.id}>\n## Nettisivulta avattu ${config.label}-ticket\n**${title}**\n${details}` }) });
  const now = Date.now();
  await env.DB.prepare("INSERT INTO orders (user_id,ticket_type,channel_id,title,details,status,created_at,updated_at) VALUES (?,?,?,?,?,'received',?,?)").bind(user.id, body.type, channel.id, title, details, now, now).run();
  return responseJson({ ok: true, channelId: channel.id, channelUrl: `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${channel.id}` }, 201);
}

async function fetchPortfolio(env) {
  const groups = await Promise.all(Object.entries(PORTFOLIO_CHANNELS).map(async ([key, channelId]) => {
    const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=50`, { headers: discordHeaders(env) });
    if (!response.ok) return [key, []];
    const messages = await response.json();
    const items = messages.flatMap(message => (message.attachments || []).filter(file => file.content_type?.startsWith("image/")).map(file => ({ id: file.id, src: file.url, title: file.description || file.filename.replace(/\.[^.]+$/, ""), createdAt: message.timestamp })));
    return [key, items];
  }));
  return responseJson(Object.fromEntries(groups), 200, { "Cache-Control": "public, max-age=60" });
}

async function syncBot(request, env) {
  if (!env.BOT_SYNC_SECRET || request.headers.get("Authorization") !== `Bearer ${env.BOT_SYNC_SECRET}`) return responseJson({ message: "Ei oikeuksia." }, 401);
  const missingDb = requireDatabase(env); if (missingDb) return missingDb;
  const payload = await request.json();
  await env.DB.prepare("INSERT INTO bot_snapshots (key,payload,updated_at) VALUES ('leaderboards',?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(JSON.stringify(payload), Date.now()).run();
  return responseJson({ ok: true });
}

async function getLeaderboards(env) {
  const missingDb = requireDatabase(env); if (missingDb) return missingDb;
  const row = await env.DB.prepare("SELECT payload,updated_at FROM bot_snapshots WHERE key='leaderboards'").first();
  return responseJson(row ? { ...JSON.parse(row.payload), updatedAt: row.updated_at } : { money: [], xp: [], invites: [], games: [], updatedAt: null });
}

export async function handleIntegrationRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/auth/discord" && request.method === "GET") return startLogin(request, env);
  if (["/auth/callback", "/api/auth/discord/callback"].includes(url.pathname) && request.method === "GET") return finishLogin(request, env);
  if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
  if (url.pathname === "/api/customer" && request.method === "GET") return getCustomer(request, env);
  if (url.pathname === "/api/tickets" && request.method === "POST") return createTicket(request, env);
  if (url.pathname === "/api/portfolio" && request.method === "GET") return fetchPortfolio(env);
  if (url.pathname === "/api/bot/sync" && request.method === "POST") return syncBot(request, env);
  if (url.pathname === "/api/leaderboards" && request.method === "GET") return getLeaderboards(env);
  return null;
}
