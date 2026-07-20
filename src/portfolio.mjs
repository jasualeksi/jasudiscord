const DISCORD_API = "https://discord.com/api/v10";

const PORTFOLIO_CHANNELS = {
  avatars: "1523660648096075836",
  banners: "1523662022049267732",
  logos: "1523641950526509080"
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      ...headers
    }
  });
}

function discordHeaders(env) {
  return {
    "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`,
    "Accept": "application/json"
  };
}

async function fetchPortfolio(env) {
  if (!env.DISCORD_BOT_TOKEN) {
    return json({ message: "Discord-yhteys odottaa asetuksia." }, 428, {
      "Cache-Control": "no-store"
    });
  }

  const groups = await Promise.all(
    Object.entries(PORTFOLIO_CHANNELS).map(async ([key, channelId]) => {
      const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=50`, {
        headers: discordHeaders(env)
      });

      if (!response.ok) {
        return [key, []];
      }

      const messages = await response.json();
      const items = messages.flatMap(message =>
        (message.attachments || [])
          .filter(file =>
            file.content_type?.startsWith("image/") ||
            /\.(png|jpe?g|gif|webp)$/i.test(file.filename || "")
          )
          .map(file => ({
            id: file.id,
            src: file.url,
            title: file.description || file.filename.replace(/\.[^.]+$/, ""),
            createdAt: message.timestamp
          }))
      );

      return [key, items];
    })
  );

  return json(Object.fromEntries(groups));
}

export async function handlePortfolioRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/portfolio" && request.method === "GET") {
    return fetchPortfolio(env);
  }

  return null;
}
