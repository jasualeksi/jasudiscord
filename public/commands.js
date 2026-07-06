const commandsList = document.querySelector("#commands-list");

const commandTypeLabels = {
  1: "slash",
  2: "user",
  3: "message"
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderStatus(title, text) {
  commandsList.innerHTML = `
    <article class="command-card command-card--status">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function renderCommands(commands) {
  if (!commands.length) {
    renderStatus("Ei komentoja", "Discord API ei palauttanut botille yhtään komentoa.");
    return;
  }

  commandsList.innerHTML = commands.map((command) => {
    const name = command.type === 1 ? `/${command.name}` : command.name;
    const description = command.description || "Ei kuvausta.";
    const type = commandTypeLabels[command.type] || "komento";
    const optionCount = Array.isArray(command.options) ? command.options.length : 0;

    return `
      <article class="command-card">
        <h2>${escapeHtml(name)}</h2>
        <p>${escapeHtml(description)}</p>
        <div class="command-meta">
          <span class="command-pill">${escapeHtml(type)}</span>
          ${optionCount ? `<span class="command-pill">${optionCount} asetusta</span>` : ""}
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

    renderCommands(data.commands || []);
  } catch {
    renderStatus("Komentojen haku ei onnistunut", "Sivusto ei saanut yhteyttä komento-APIin juuri nyt.");
  }
}

loadCommands();
