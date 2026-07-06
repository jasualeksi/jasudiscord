# Jasu Discord

Static website for `jasudiscord.com`.

## Cloudflare Workers & Pages Git settings

- Build command: leave empty
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- Production branch: `main`

After Cloudflare is connected to the GitHub repository, every push to `main` deploys automatically.

## Discord command sync

Set these in Cloudflare Worker settings:

- `DISCORD_APPLICATION_ID`: Discord application/client ID
- `DISCORD_BOT_TOKEN`: bot token, set this as a secret
- `DISCORD_GUILD_ID`: optional server ID, use this if commands are registered only to one server

The site fetches `/api/commands`, and the Worker reads the current commands from Discord.
