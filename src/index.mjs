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

    return env.ASSETS.fetch(request);
  }
};
