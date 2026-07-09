const DISCORD_API = "https://discord.com/api/v10";
const SESSION_COOKIE = "jasu_session";
const OAUTH_STATE_COOKIE = "jasu_oauth_state";

function randomToken(size = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([name, value]) => name && value)
      .map(([name, ...value]) => [name, decodeURIComponent(value.join("="))])
  );
}

function bytesToBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function textToBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToText(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function signValue(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function createSession(user, secret) {
  const payload = textToBase64Url(JSON.stringify({
    id: user.id,
    username: user.global_name || user.username,
    avatar: user.avatar || "",
    exp: Date.now() + (7 * 24 * 60 * 60 * 1000)
  }));
  return `${payload}.${await signValue(payload, secret)}`;
}

async function readSession(request, secret) {
  if (!secret) {
    return null;
  }

  const session = parseCookies(request)[SESSION_COOKIE];
  const [payload, signature] = (session || "").split(".");

  if (!payload || !signature || signature !== await signValue(payload, secret)) {
    return null;
  }

  try {
    const user = JSON.parse(base64UrlToText(payload));
    return user.exp > Date.now() ? user : null;
  } catch {
    return null;
  }
}

function cookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  return parts.join("; ");
}

function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      ...headers
    }
  });
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": init.cacheControl || "no-store",
      ...init.headers
    }
  });
}

async function fetchDiscordCommands(env, scope) {
  const applicationId = env.DISCORD_APPLICATION_ID;
  const token = env.DISCORD_BOT_TOKEN;
  const guildId = env.DISCORD_GUILD_ID;

  if (!applicationId || !token) {
    return {
      ok: false,
      status: 428,
      data: {
        title: "Discord-yhteys odottaa asetuksia",
        message: "Lisää Cloudflareen DISCORD_APPLICATION_ID ja DISCORD_BOT_TOKEN, niin komennot haetaan automaattisesti."
      }
    };
  }

  const requests = [];

  if (scope !== "guild") {
    requests.push({
      scope: "global",
      url: `${DISCORD_API}/applications/${applicationId}/commands`
    });
  }

  if (guildId && scope !== "global") {
    requests.push({
      scope: "guild",
      url: `${DISCORD_API}/applications/${applicationId}/guilds/${guildId}/commands`
    });
  }

  const results = await Promise.all(requests.map(async (request) => {
    const response = await fetch(request.url, {
      headers: {
        "Authorization": `Bot ${token}`,
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();

      return {
        ok: false,
        scope: request.scope,
        status: response.status,
        errorText
      };
    }

    const commands = await response.json();
    return {
      ok: true,
      commands: commands.map((command) => ({
        id: command.id,
        name: command.name,
        description: command.description,
        type: command.type,
        options: command.options || [],
        scope: request.scope
      }))
    };
  }));

  const failed = results.find((result) => !result.ok);

  if (failed) {
    return {
      ok: false,
      status: 502,
      data: {
        title: "Discord API ei vastannut oikein",
        message: `Komentojen haku epäonnistui kohdassa ${failed.scope}. Discord status: ${failed.status}. ${failed.errorText || "Tarkista bot token, application id ja guild id Cloudflaressa."}`
      }
    };
  }

  const commandsByKey = new Map();

  for (const result of results) {
    for (const command of result.commands) {
      commandsByKey.set(`${command.scope}:${command.type}:${command.name}`, command);
    }
  }

  const commands = Array.from(commandsByKey.values())
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ok: true,
    status: 200,
    data: {
      updatedAt: new Date().toISOString(),
      commands
    }
  };
}

async function fetchDiscordServer(env) {
  const token = env.DISCORD_BOT_TOKEN;
  const guildId = env.DISCORD_GUILD_ID;
  const inviteUrl = env.DISCORD_INVITE_URL || "https://discord.gg/MHqmuTnGms";

  if (!token || !guildId) {
    return {
      ok: false,
      status: 428,
      data: {
        title: "Discord-serverin tiedot odottaa asetuksia",
        message: "Lisää Cloudflareen DISCORD_BOT_TOKEN ja DISCORD_GUILD_ID."
      }
    };
  }

  const response = await fetch(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, {
    headers: {
      "Authorization": `Bot ${token}`,
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    return {
      ok: false,
      status: 502,
      data: {
        title: "Discord-serverin tietoja ei saatu",
        message: `Discord status: ${response.status}. Tarkista guild id ja botin oikeudet.`
      }
    };
  }

  const guild = await response.json();
  const iconUrl = guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith("a_") ? "gif" : "png"}?size=256`
    : "";

  return {
    ok: true,
    status: 200,
    data: {
      id: guild.id,
      name: guild.name,
      iconUrl,
      inviteUrl,
      approximateMemberCount: guild.approximate_member_count || 0,
      approximatePresenceCount: guild.approximate_presence_count || 0
    }
  };
}

function getAvatarUrl(author) {
  if (author.avatar) {
    const extension = author.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${extension}?size=96`;
  }

  return "";
}

async function fetchDiscordFeedback(env) {
  const token = env.DISCORD_BOT_TOKEN;
  const channelId = env.DISCORD_FEEDBACK_CHANNEL_ID || "1522395762976362576";

  if (!token || !channelId) {
    return {
      ok: false,
      status: 428,
      data: {
        title: "Palautekanavan tiedot odottaa asetuksia",
        message: "Lisää Cloudflareen DISCORD_BOT_TOKEN ja DISCORD_FEEDBACK_CHANNEL_ID."
      }
    };
  }

  const [channelResponse, messagesResponse] = await Promise.all([
    fetch(`${DISCORD_API}/channels/${channelId}`, {
      headers: {
        "Authorization": `Bot ${token}`,
        "Accept": "application/json"
      }
    }),
    fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=8`, {
      headers: {
        "Authorization": `Bot ${token}`,
        "Accept": "application/json"
      }
    })
  ]);

  if (!channelResponse.ok || !messagesResponse.ok) {
    return {
      ok: false,
      status: 502,
      data: {
        title: "Palautteita ei saatu",
        message: `Discord status: kanava ${channelResponse.status}, viestit ${messagesResponse.status}. Tarkista botin View Channel ja Read Message History -oikeudet.`
      }
    };
  }

  const channel = await channelResponse.json();
  const messages = await messagesResponse.json();

  return {
    ok: true,
    status: 200,
    data: {
      channel: {
        id: channel.id,
        name: channel.name || "palautteet"
      },
      messages: messages
        .filter((message) => !message.author?.bot)
        .map((message) => ({
          id: message.id,
          content: message.content || "",
          createdAt: message.timestamp,
          authorName: message.author?.global_name || message.author?.username || "Discord käyttäjä",
          avatarUrl: message.author ? getAvatarUrl(message.author) : ""
        }))
    }
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/auth/discord") {
      if (!env.DISCORD_APPLICATION_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) {
        return redirect("/kauppa?auth=setup");
      }

      const state = randomToken();
      const redirectUri = `${url.origin}/auth/callback`;
      const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
      authorizeUrl.searchParams.set("client_id", env.DISCORD_APPLICATION_ID);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("scope", "identify");
      authorizeUrl.searchParams.set("state", state);

      return redirect(authorizeUrl.toString(), {
        "Set-Cookie": cookie(OAUTH_STATE_COOKIE, state, { maxAge: 600 })
      });
    }

    if (url.pathname === "/auth/callback") {
      const cookies = parseCookies(request);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (
        !code ||
        !state ||
        state !== cookies[OAUTH_STATE_COOKIE] ||
        !env.DISCORD_APPLICATION_ID ||
        !env.DISCORD_CLIENT_SECRET ||
        !env.SESSION_SECRET
      ) {
        return redirect("/kauppa?auth=failed");
      }

      const redirectUri = `${url.origin}/auth/callback`;
      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: env.DISCORD_APPLICATION_ID,
          client_secret: env.DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri
        })
      });

      if (!tokenResponse.ok) {
        return redirect("/kauppa?auth=failed");
      }

      const token = await tokenResponse.json();
      const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
        headers: {
          Authorization: `Bearer ${token.access_token}`
        }
      });

      if (!userResponse.ok) {
        return redirect("/kauppa?auth=failed");
      }

      const user = await userResponse.json();
      const session = await createSession(user, env.SESSION_SECRET);

      return redirect("/kauppa", {
        "Set-Cookie": cookie(SESSION_COOKIE, session, { maxAge: 7 * 24 * 60 * 60 })
      });
    }

    if (url.pathname === "/auth/logout") {
      return redirect("/kauppa", {
        "Set-Cookie": cookie(SESSION_COOKIE, "", { maxAge: 0 })
      });
    }

    if (url.pathname === "/api/session") {
      const user = await readSession(request, env.SESSION_SECRET);
      return json({
        configured: Boolean(
          env.DISCORD_APPLICATION_ID &&
          env.DISCORD_CLIENT_SECRET &&
          env.SESSION_SECRET
        ),
        authenticated: Boolean(user),
        user: user ? {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
            : ""
        } : null
      }, {
        cacheControl: "no-store"
      });
    }

    if (url.pathname === "/api/commands") {
      const scope = url.searchParams.get("scope") || "all";
      const result = await fetchDiscordCommands(env, scope);

      return json(result.data, {
        status: result.status,
        cacheControl: result.ok ? "public, max-age=60" : "no-store"
      });
    }

    if (url.pathname === "/api/server") {
      const result = await fetchDiscordServer(env);

      return json(result.data, {
        status: result.status,
        cacheControl: result.ok ? "public, max-age=120" : "no-store"
      });
    }

    if (url.pathname === "/api/feedback") {
      const result = await fetchDiscordFeedback(env);

      return json(result.data, {
        status: result.status,
        cacheControl: result.ok ? "public, max-age=45" : "no-store"
      });
    }

    return env.ASSETS.fetch(request);
  }
};
