const commandsList = document.querySelector("#commands-list");
const commandSearch = document.querySelector("#command-search");
const categoryTabs = document.querySelector("#category-tabs");
const serverWidget = document.querySelector("#server-widget");
const serverStats = document.querySelector("#server-stats");
const feedbackList = document.querySelector("#feedback-list");

const inviteUrl = "https://discord.gg/MHqmuTnGms";
const commandTypeLabels = {
  1: "slash",
  2: "user",
  3: "message"
};

const categoryRules = [
  {
    id: "economy",
    label: "Economy",
    words: ["money", "cash", "coin", "bank", "pay", "work", "daily", "shop", "buy", "sell", "balance", "addmoney"]
  },
  {
    id: "xp",
    label: "XP",
    words: ["xp", "level", "rank", "addxp"]
  },
  {
    id: "giveaway",
    label: "Arvonnat",
    words: ["arvonta", "giveaway", "aloita", "voittaja"]
  },
  {
    id: "moderation",
    label: "Moderointi",
    words: ["ban", "kick", "mute", "warn", "timeout", "clear", "purge", "lock", "slowmode"]
  },
  {
    id: "admin",
    label: "Admin",
    words: ["admin", "setup", "config", "role", "channel", "settings", "set"]
  },
  {
    id: "fun",
    label: "Fun",
    words: ["meme", "fun", "joke", "avatar", "8ball", "kiss", "hug"]
  }
];

let allCommands = [];
let activeCategory = "all";
let searchValue = "";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function detectCategory(command) {
  const text = [
    command.name,
    command.description,
    ...(command.options || []).flatMap((option) => [option.name, option.description])
  ].join(" ").toLowerCase();

  return categoryRules.find((category) => category.words.some((word) => text.includes(word))) || {
    id: "general",
    label: "Yleiset"
  };
}

function normalizeCommand(command) {
  const category = detectCategory(command);

  return {
    ...command,
    categoryId: category.id,
    categoryLabel: category.label,
    searchableText: [
      command.name,
      command.description,
      category.label,
      ...(command.options || []).flatMap((option) => [option.name, option.description])
    ].join(" ").toLowerCase()
  };
}

function renderStatus(title, text) {
  commandsList.innerHTML = `
    <article class="command-card command-card--status">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function formatMessageTime(value) {
  return new Intl.DateTimeFormat("fi-FI", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function renderFeedbackStatus(text) {
  feedbackList.innerHTML = `
    <article class="feedback-item feedback-item--status">
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function renderFeedback(messages) {
  if (!messages.length) {
    renderFeedbackStatus("Palautteita ei löytynyt vielä.");
    return;
  }

  feedbackList.innerHTML = messages.map((message) => `
    <article class="feedback-item">
      <div class="feedback-avatar">
        ${message.avatarUrl ? `<img src="${escapeHtml(message.avatarUrl)}" alt="">` : `<span>${escapeHtml(message.authorName.slice(0, 1).toUpperCase())}</span>`}
      </div>
      <div class="feedback-content">
        <div class="feedback-meta">
          <strong>${escapeHtml(message.authorName)}</strong>
          <time datetime="${escapeHtml(message.createdAt)}">${escapeHtml(formatMessageTime(message.createdAt))}</time>
        </div>
        <p>${escapeHtml(message.content || "Liite tai embed-viesti")}</p>
      </div>
    </article>
  `).join("");
}

function getFilteredCommands() {
  return allCommands.filter((command) => {
    const matchesCategory = activeCategory === "all" || command.categoryId === activeCategory;
    const matchesSearch = !searchValue || command.searchableText.includes(searchValue);
    return matchesCategory && matchesSearch;
  });
}

function renderCategoryTabs() {
  const counts = new Map([["all", allCommands.length]]);

  for (const command of allCommands) {
    counts.set(command.categoryId, (counts.get(command.categoryId) || 0) + 1);
  }

  const categories = [
    { id: "all", label: "Kaikki" },
    ...categoryRules.filter((category) => counts.has(category.id)),
    ...(counts.has("general") ? [{ id: "general", label: "Yleiset" }] : [])
  ];

  categoryTabs.innerHTML = categories.map((category) => `
    <button class="category-tab${activeCategory === category.id ? " is-active" : ""}" type="button" data-category="${escapeHtml(category.id)}">
      <span>${escapeHtml(category.label)}</span>
      <strong>${counts.get(category.id) || 0}</strong>
    </button>
  `).join("");
}

function renderCommands() {
  if (!allCommands.length) {
    renderStatus("Ei komentoja", "Discord API ei palauttanut botille yhtään komentoa.");
    return;
  }

  renderCategoryTabs();
  const commands = getFilteredCommands();

  if (!commands.length) {
    renderStatus("Ei osumia", "Kokeile eri hakusanaa tai vaihda kategoriaa.");
    return;
  }

  commandsList.innerHTML = commands.map((command) => {
    const name = command.type === 1 ? `/${command.name}` : command.name;
    const description = command.description || "Ei kuvausta.";
    const type = commandTypeLabels[command.type] || "komento";
    const optionCount = Array.isArray(command.options) ? command.options.length : 0;

    return `
      <article class="command-card">
        <div class="command-card__top">
          <span>${escapeHtml(command.categoryLabel)}</span>
          <span>${escapeHtml(type)}</span>
        </div>
        <h2>${escapeHtml(name)}</h2>
        <p>${escapeHtml(description)}</p>
        <div class="command-meta">
          ${optionCount ? `<span class="command-pill">${optionCount} asetusta</span>` : `<span class="command-pill">ei asetuksia</span>`}
        </div>
      </article>
    `;
  }).join("");
}

async function loadCommands() {
  try {
    const response = await fetch("/api/commands", {
      headers: {
        "Accept": "application/json"
      }
    });
    const data = await response.json();

    if (!response.ok) {
      renderStatus(data.title || "Komentojen haku ei onnistunut", data.message || "Yritä hetken päästä uudelleen.");
      return;
    }

    allCommands = (data.commands || []).map(normalizeCommand);
    renderCommands();
  } catch {
    renderStatus("Komentojen haku ei onnistunut", "Sivusto ei saanut yhteyttä komento-APIin juuri nyt.");
  }
}

async function loadServerWidget() {
  try {
    const response = await fetch("/api/server", {
      headers: {
        "Accept": "application/json"
      }
    });
    const data = await response.json();

    if (!response.ok) {
      return;
    }

    const icon = serverWidget.querySelector(".server-widget__icon img");
    const title = serverWidget.querySelector(".server-widget__content h2");
    const join = serverWidget.querySelector(".server-widget__join");

    title.textContent = data.name || "Jasu〡Discord";
    join.href = data.inviteUrl || inviteUrl;

    if (data.iconUrl) {
      icon.src = data.iconUrl;
    }

    const stats = [
      data.approximateMemberCount ? `${data.approximateMemberCount} jäsentä` : "",
      data.approximatePresenceCount ? `${data.approximatePresenceCount} online` : "",
      allCommands.length ? `${allCommands.length} komentoa` : "komennot live"
    ].filter(Boolean);

    serverStats.innerHTML = stats.map((stat) => `<span>${escapeHtml(stat)}</span>`).join("");
  } catch {
    serverStats.innerHTML = "<span>Discord kutsu valmis</span>";
  }
}

async function loadFeedback() {
  try {
    const response = await fetch("/api/feedback", {
      headers: {
        "Accept": "application/json"
      }
    });
    const data = await response.json();

    if (!response.ok) {
      renderFeedbackStatus(data.message || "Palautteita ei saatu ladattua.");
      return;
    }

    renderFeedback(data.messages || []);
  } catch {
    renderFeedbackStatus("Palautteita ei saatu ladattua juuri nyt.");
  }
}

categoryTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-category]");

  if (!tab) {
    return;
  }

  activeCategory = tab.dataset.category;
  renderCommands();
});

commandSearch.addEventListener("input", () => {
  searchValue = commandSearch.value.trim().toLowerCase();
  renderCommands();
});

loadCommands().then(loadServerWidget);
loadFeedback();
