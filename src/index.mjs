const DISCORD_API = "https://discord.com/api/v10";

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

function getStaticRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
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

    const pagePath = url.pathname.replace(/\/$/, "") || "/";

    if (["/", "/etusivu", "/bannerit", "/discord-komennot"].includes(pagePath)) {
      return env.ASSETS.fetch(getStaticRequest(request, "/index.html"));
    }

    return env.ASSETS.fetch(request);
  }
};
