const accountContent = document.querySelector("#account-content");
const leaderboardContent = document.querySelector("#leaderboard-content");

function integrationEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function formatIntegrationDate(value) {
  return new Intl.DateTimeFormat("fi-FI", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function readIntegrationJson(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error(fallbackMessage);
  }

  return response.json();
}

function renderLogin() {
  accountContent.innerHTML = `
    <article class="login-card">
      <img src="/assets/logo.png" alt="">
      <div><h2>Kirjaudu Discordilla</h2><p>Kirjautumisen jälkeen voit avata ticketin nettisivulta ja nähdä omat tilauksesi.</p></div>
      <a href="/api/auth/discord"><img src="/assets/discord-white-icon.png" alt="">Kirjaudu</a>
    </article>`;
}

function renderAccount(data) {
  const orders = data.orders || [];
  accountContent.innerHTML = `
    <div class="account-bar">
      <div class="account-user">${data.user.avatarUrl ? `<img src="${integrationEscape(data.user.avatarUrl)}" alt="">` : ""}<div><span>Kirjautunut</span><strong>${integrationEscape(data.user.username)}</strong></div></div>
      <button id="logout-button" type="button">Kirjaudu ulos</button>
    </div>
    <div class="account-grid">
      <form class="ticket-form" id="web-ticket-form">
        <div class="form-heading"><span>UUSI TICKET</span><h2>Avaa ticket</h2></div>
        <label>Tyyppi<select name="type" required><option value="service">Osto</option><option value="general">Yleinen</option><option value="partnership">Yhteistyö</option><option value="application">Hae yhteisöön</option></select></label>
        <label>Otsikko<input name="title" maxlength="100" required placeholder="Mitä tarvitset?"></label>
        <label>Kerro tarkemmin<textarea name="details" minlength="10" maxlength="1800" required placeholder="Kerro tähän tarvittavat tiedot..."></textarea></label>
        <p class="form-message" id="ticket-form-message"></p>
        <button type="submit">Avaa ticket Discordiin</button>
      </form>
      <div class="orders-panel"><div class="form-heading"><span>OMAT TILAUKSET</span><h2>Tilanne</h2></div>
        <div class="orders-list">${orders.length ? orders.map(order => `<a class="order-row" href="${integrationEscape(order.channelUrl)}" target="_blank" rel="noopener noreferrer"><div><span>${integrationEscape(order.ticket_type)}</span><strong>${integrationEscape(order.title)}</strong><small>${formatIntegrationDate(order.created_at)}</small></div><b data-status="${integrationEscape(order.status)}">${integrationEscape(order.statusLabel)}</b></a>`).join("") : `<p class="empty-orders">Sinulla ei ole vielä tilauksia.</p>`}</div>
      </div>
    </div>`;

  document.querySelector("#logout-button")?.addEventListener("click", async () => { await fetch("/api/auth/logout", { method: "POST" }); location.reload(); });
  document.querySelector("#web-ticket-form")?.addEventListener("submit", submitTicket);
}

async function submitTicket(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const message = document.querySelector("#ticket-form-message");
  button.disabled = true;
  message.textContent = "Luodaan ticketiä...";
  const body = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await readIntegrationJson(response, "Ticket-palveluun ei saatu yhteyttä.");
    if (!response.ok) throw new Error(data.message || "Ticketin luominen epäonnistui.");
    message.innerHTML = `Ticket luotu. <a href="${integrationEscape(data.channelUrl)}" target="_blank" rel="noopener noreferrer">Avaa Discordissa</a>`;
    form.reset();
    window.setTimeout(loadAccount, 800);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function loadAccount() {
  if (!accountContent || document.documentElement.dataset.page !== "account") return;
  try {
    const response = await fetch("/api/customer");
    if (response.status === 401) return renderLogin();
    const data = await readIntegrationJson(response, "Oman sivun tietoja ei saatu juuri nyt.");
    if (!response.ok) throw new Error(data.message || "Omia tietoja ei saatu.");
    renderAccount(data);
  } catch (error) {
    accountContent.innerHTML = `<div class="integration-status">${integrationEscape(error.message)}</div>`;
  }
}

const boardLabels = { money: "Rikkaimmat", xp: "Korkein level", invites: "Eniten invitejä", games: "Blackjack" };
function renderBoard(name, entries) {
  return `<article class="leaderboard-card"><h2>${boardLabels[name]}</h2><div>${entries.length ? entries.map((entry, index) => `<div class="leader-row"><b>${index + 1}</b>${entry.avatarUrl ? `<img src="${integrationEscape(entry.avatarUrl)}" alt="">` : `<span class="leader-avatar">${integrationEscape((entry.name || "?").slice(0, 1))}</span>`}<strong>${integrationEscape(entry.name || entry.userId)}</strong><em>${integrationEscape(entry.value)}</em></div>`).join("") : `<p>Ei tietoja vielä.</p>`}</div></article>`;
}

async function loadLeaderboards() {
  if (!leaderboardContent || document.documentElement.dataset.page !== "leaderboard") return;
  try {
    const response = await fetch("/api/leaderboards");
    const data = await readIntegrationJson(response, "Leaderboardeja ei saatu juuri nyt.");
    if (!response.ok) throw new Error(data.message || "Leaderboardeja ei saatu.");
    leaderboardContent.innerHTML = `<div class="leaderboard-grid">${["money", "xp", "invites", "games"].map(name => renderBoard(name, data[name] || [])).join("")}</div>${data.updatedAt ? `<p class="leaderboard-updated">Päivitetty ${formatIntegrationDate(data.updatedAt)}</p>` : ""}`;
  } catch (error) {
    leaderboardContent.innerHTML = `<div class="integration-status">${integrationEscape(error.message)}</div>`;
  }
}

loadAccount();
loadLeaderboards();
