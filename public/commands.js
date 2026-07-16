const commandsList = document.querySelector("#commands-list");
const commandSearch = document.querySelector("#command-search");
const categoryTabs = document.querySelector("#category-tabs");
const serverWidget = document.querySelector("#server-widget");
const serverStats = document.querySelector("#server-stats");
const feedbackList = document.querySelector("#feedback-list");
const feedbackControls = document.querySelector("#feedback-controls");
const imageLightbox = document.querySelector("#image-lightbox");
const imageLightboxImage = imageLightbox?.querySelector(".image-lightbox__image");
const imageLightboxClose = imageLightbox?.querySelector(".image-lightbox__close");
const imageLightboxBackdrop = imageLightbox?.querySelector(".image-lightbox__backdrop");
const bannerShowcase = document.querySelector("#banner-showcase");
const logosGrid = document.querySelector("#logos-grid");
const avatarsGrid = document.querySelector("#avatars-grid");
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
let feedbackMessages = [];
let feedbackIndex = 0;
let feedbackTimer = null;
let placeholderTimer = null;

function setupExclusiveNavMenus() {
  const toggles = document.querySelectorAll(".nav-more__toggle");

  toggles.forEach((toggle) => {
    toggle.addEventListener("change", () => {
      if (!toggle.checked) {
        return;
      }

      toggles.forEach((otherToggle) => {
        if (otherToggle !== toggle) {
          otherToggle.checked = false;
        }
      });
    });
  });
}

function setupImageLightbox() {
  if (!imageLightbox || !imageLightboxImage || !imageLightboxClose || !imageLightboxBackdrop) {
    return;
  }

  let lastFocusedElement = null;

  const closeLightbox = () => {
    imageLightbox.classList.remove("is-open");
    imageLightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lightbox-open");
    imageLightboxImage.removeAttribute("src");
    imageLightboxImage.alt = "";

    if (lastFocusedElement) {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  };

  const openLightbox = (link) => {
    const title = link.closest(".portfolio-card")?.querySelector("h2")?.textContent?.trim() || "Portfolio kuva";

    lastFocusedElement = link;
    imageLightboxImage.src = link.href;
    imageLightboxImage.alt = title;
    imageLightbox.classList.add("is-open");
    imageLightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("lightbox-open");
    imageLightboxClose.focus();
  };

  document.addEventListener("click", (event) => {
    const link = event.target.closest(".portfolio-card__action");

    if (!link) {
      return;
    }

    event.preventDefault();
    openLightbox(link);
  });

  imageLightboxClose.addEventListener("click", closeLightbox);
  imageLightboxBackdrop.addEventListener("click", closeLightbox);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && imageLightbox.classList.contains("is-open")) {
      closeLightbox();
    }
  });
}

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

function renderPortfolioStatus(container, className, text) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <article class="${className} ${className}--status">
      ${className === "banner-card" ? `<div class="banner-card__body"><h2>${escapeHtml(text)}</h2></div>` : `<h2>${escapeHtml(text)}</h2>`}
    </article>
  `;
}

function renderBanners(items) {
  if (!bannerShowcase) {
    return;
  }

  if (!items.length) {
    renderPortfolioStatus(bannerShowcase, "banner-card", "Ei bannereita vielä.");
    return;
  }

  bannerShowcase.innerHTML = items.map((item) => `
    <article class="banner-card">
      <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.title)}">
      <div class="banner-card__body">
        <h2>${escapeHtml(item.title)}</h2>
      </div>
    </article>
  `).join("");
}

function renderPortfolioGrid(container, items, emptyText) {
  if (!container) {
    return;
  }

  if (!items.length) {
    renderPortfolioStatus(container, "portfolio-card", emptyText);
    return;
  }

  container.innerHTML = items.map((item) => `
    <article class="portfolio-card">
      <div class="portfolio-card__media">
        <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.title)}">
      </div>
      <h2>${escapeHtml(item.title)}</h2>
      <a class="portfolio-card__action" href="${escapeHtml(item.src)}" target="_blank" rel="noopener noreferrer">Avaa Kuva</a>
    </article>
  `).join("");
}

async function loadPortfolioAssets() {
  try {
    let response = await fetch("/api/portfolio", {
      headers: {
        "Accept": "application/json"
      }
    });
    if (!response.ok) {
      response = await fetch("/portfolio-assets.json", { headers: { "Accept": "application/json" } });
    }
    const data = await response.json();

    if (!response.ok) {
      throw new Error("Portfolio-listaa ei saatu ladattua.");
    }

    renderBanners(data.banners || []);
    renderPortfolioGrid(logosGrid, data.logos || [], "Ei logoja vielä.");
    renderPortfolioGrid(avatarsGrid, data.avatars || [], "Ei profiilikuvia vielä.");
  } catch {
    renderPortfolioStatus(bannerShowcase, "banner-card", "Portfolio-listaa ei saatu ladattua.");
    renderPortfolioStatus(logosGrid, "portfolio-card", "Portfolio-listaa ei saatu ladattua.");
    renderPortfolioStatus(avatarsGrid, "portfolio-card", "Portfolio-listaa ei saatu ladattua.");
  }
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

  if (feedbackControls) {
    feedbackControls.innerHTML = "";
  }
}

function updateFeedbackSlider() {
  const track = feedbackList.querySelector(".feedback-list__track");

  if (!track || !feedbackMessages.length) {
    return;
  }

  track.style.transform = `translateX(-${feedbackIndex * 100}%)`;

  feedbackControls.querySelectorAll("[data-feedback-index]").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.feedbackIndex) === feedbackIndex);
  });
}

function setFeedbackIndex(index) {
  feedbackIndex = (index + feedbackMessages.length) % feedbackMessages.length;
  updateFeedbackSlider();
}

function startFeedbackAutoplay() {
  window.clearInterval(feedbackTimer);

  if (feedbackMessages.length < 2) {
    return;
  }

  feedbackTimer = window.setInterval(() => {
    setFeedbackIndex(feedbackIndex + 1);
  }, 4200);
}

function renderFeedback(messages) {
  if (!messages.length) {
    renderFeedbackStatus("Palautteita ei löytynyt vielä.");
    return;
  }

  feedbackMessages = messages;
  feedbackIndex = 0;

  feedbackList.innerHTML = `
    <div class="feedback-list__track">
      ${messages.map((message) => `
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
      `).join("")}
    </div>
  `;

  feedbackControls.innerHTML = messages.length > 1 ? `
    <button class="feedback-control" type="button" data-feedback-action="prev" aria-label="Edellinen palaute">&lt;</button>
    ${messages.map((_, index) => `
      <button class="feedback-dot${index === 0 ? " is-active" : ""}" type="button" data-feedback-index="${index}" aria-label="Palaute ${index + 1}"></button>
    `).join("")}
    <button class="feedback-control" type="button" data-feedback-action="next" aria-label="Seuraava palaute">&gt;</button>
  ` : "";

  updateFeedbackSlider();
  startFeedbackAutoplay();
}

function startCommandPlaceholderLoop() {
  const text = "Hae esim. addmoney";
  let index = 0;
  let deleting = false;

  window.clearTimeout(placeholderTimer);

  function tick() {
    if (document.activeElement !== commandSearch && !commandSearch.value) {
      commandSearch.placeholder = text.slice(0, index);
    }

    if (!deleting && index < text.length) {
      index += 1;
      placeholderTimer = window.setTimeout(tick, 95);
      return;
    }

    if (!deleting && index === text.length) {
      deleting = true;
      placeholderTimer = window.setTimeout(tick, 1250);
      return;
    }

    if (deleting && index > 0) {
      index -= 1;
      placeholderTimer = window.setTimeout(tick, 45);
      return;
    }

    deleting = false;
    placeholderTimer = window.setTimeout(tick, 420);
  }

  tick();
}

feedbackControls.addEventListener("click", (event) => {
  const control = event.target.closest("button");

  if (!control || !feedbackMessages.length) {
    return;
  }

  if (control.dataset.feedbackAction === "prev") {
    setFeedbackIndex(feedbackIndex - 1);
  } else if (control.dataset.feedbackAction === "next") {
    setFeedbackIndex(feedbackIndex + 1);
  } else if (control.dataset.feedbackIndex) {
    setFeedbackIndex(Number(control.dataset.feedbackIndex));
  }

  startFeedbackAutoplay();
});

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
    const join = serverWidget.querySelector(".server-widget__join, .server-widget__footer a");

    title.textContent = data.name || "Jasu〡Discord";
    if (join) {
      join.href = data.inviteUrl || inviteUrl;
    }

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
loadPortfolioAssets();
startCommandPlaceholderLoop();
setupExclusiveNavMenus();
setupImageLightbox();
