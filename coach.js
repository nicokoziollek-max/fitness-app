const imported = window.FITNESS_DATA;

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((total, value) => total + value, 0) / usable.length : 0;
}

function last(values) {
  return values[values.length - 1];
}

function formatNumber(value, digits = 1) {
  return Number(value).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function generateTrend(start, weeklyChange, count, variation) {
  return Array.from({ length: count }, (_, index) => round(start + (weeklyChange * index / 7) + Math.sin(index * 1.8) * variation));
}

const nicolasWeights = imported.dailyEntries.slice(-42).map((entry) => entry.weight).filter(Number.isFinite);
const nicolasSleep = average(imported.dailyEntries.slice(-14).map((entry) => entry.sleep));

const clients = [
  {
    id: "nicolas",
    name: "Nicolas Hollendung",
    initials: "NH",
    source: "Live-Daten",
    status: "active",
    since: "Okt. 2025",
    months: 7,
    fee: 249,
    plan: "Meso 4 · Aufbau",
    goal: "Muskelaufbau",
    adherence: 92,
    checkIn: "Heute",
    sleep: round(nicolasSleep),
    weights: nicolasWeights,
    strength: 8.4,
  },
  {
    id: "lea",
    name: "Lea Berger",
    initials: "LB",
    source: "Demo",
    status: "active",
    since: "Jan. 2026",
    months: 5,
    fee: 199,
    plan: "Lifestyle Cut",
    goal: "Fettverlust",
    adherence: 97,
    checkIn: "Morgen",
    sleep: 7.8,
    weights: generateTrend(68.4, -0.22, 42, 0.16),
    strength: 5.1,
  },
  {
    id: "tim",
    name: "Tim Schneider",
    initials: "TS",
    source: "Demo",
    status: "attention",
    since: "Nov. 2025",
    months: 6,
    fee: 229,
    plan: "Powerbuilding",
    goal: "Kraft & Masse",
    adherence: 71,
    checkIn: "Überfällig",
    sleep: 6.4,
    weights: generateTrend(89.5, 0.38, 42, 0.32),
    strength: -2.3,
  },
  {
    id: "mia",
    name: "Mia Hoffmann",
    initials: "MH",
    source: "Demo",
    status: "active",
    since: "Mär. 2026",
    months: 3,
    fee: 179,
    plan: "Glute Focus",
    goal: "Rekomposition",
    adherence: 88,
    checkIn: "Gestern",
    sleep: 7.2,
    weights: generateTrend(61.3, 0.04, 42, 0.14),
    strength: 6.8,
  },
  {
    id: "jan",
    name: "Jan Peters",
    initials: "JP",
    source: "Demo",
    status: "risk",
    since: "Feb. 2026",
    months: 4,
    fee: 249,
    plan: "Contest Prep",
    goal: "Bühnenform",
    adherence: 62,
    checkIn: "3 Tage offen",
    sleep: 5.9,
    weights: generateTrend(78.8, -0.65, 42, 0.3),
    strength: -5.6,
  },
];

let selectedClientId = "nicolas";

function trendFor(client) {
  return round(average(client.weights.slice(-7)) - average(client.weights.slice(-14, -7)));
}

function statusLabel(status) {
  return { active: "Auf Kurs", attention: "Beobachten", risk: "Handlungsbedarf" }[status];
}

function chartSvg(values) {
  const width = 490;
  const height = 155;
  const pad = 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = pad + index * (width - pad * 2) / Math.max(values.length - 1, 1);
    const y = height - pad - (value - min) / range * (height - pad * 2);
    return [x, y];
  });
  const line = points.map((point) => point.join(",")).join(" ");
  return `<svg class="weight-chart" viewBox="0 0 ${width} ${height}" aria-label="Gewichtstrend">
    <path class="grid" d="M0 38 H${width} M0 78 H${width} M0 118 H${width}"></path>
    <polygon class="area" points="${points[0][0]},${height} ${line} ${points[points.length - 1][0]},${height}"></polygon>
    <polyline class="line" points="${line}"></polyline>
  </svg>`;
}

function recommendations(client) {
  const items = [];
  const trend = trendFor(client);
  if (client.status === "risk" || client.adherence < 70) {
    items.push(["Check-in priorisieren", "Heute Kontakt aufnehmen und Adhärenzbarrieren klären."]);
  } else if (client.adherence < 80) {
    items.push(["Adhärenz verbessern", "Plan vereinfachen und nächste Woche eng begleiten."]);
  } else {
    items.push(["Plan fortführen", "Adhärenz stabil, aktuelle Strategie weiterführen."]);
  }
  if (client.sleep < 7) {
    items.push(["Recovery besprechen", `Schlaf liegt bei ${formatNumber(client.sleep)} h; Regeneration vor Volumensteigerung prüfen.`]);
  } else if (client.strength > 5) {
    items.push(["Progression prüfen", "Leistungsentwicklung positiv; Laststeigerung bei Ziel-Reps erwägen."]);
  }
  if (client.goal === "Muskelaufbau" && trend > 0.35) {
    items.push(["Rate of Gain", `+${formatNumber(trend)} kg/Woche ist eher schnell; Kalorienentwicklung prüfen.`]);
  }
  if (client.goal === "Fettverlust" && trend > -0.1) {
    items.push(["Defizit justieren", "Gewichtsrate langsam; Aktivität oder Kalorien überprüfen."]);
  }
  return items.slice(0, 3);
}

function renderSummary() {
  const revenue = clients.reduce((total, client) => total + client.fee, 0);
  const attention = clients.filter((client) => client.status !== "active").length;
  const avgAdherence = average(clients.map((client) => client.adherence));
  document.getElementById("sidebar-revenue").textContent = `${formatNumber(revenue, 0)} €`;
  document.getElementById("portfolio-summary").innerHTML = `
    <article class="summary-card"><p class="caption">Aktive Klienten</p><strong>${clients.length}</strong><p class="muted">1 Live · ${clients.length - 1} Demo</p></article>
    <article class="summary-card good"><p class="caption">Adhärenz Ø</p><strong>${formatNumber(avgAdherence, 0)}%</strong><p class="muted">Letzte 4 Wochen</p></article>
    <article class="summary-card attention"><p class="caption">Aufmerksamkeit</p><strong>${attention}</strong><p class="muted">Follow-up notwendig</p></article>
    <article class="summary-card"><p class="caption">Monthly Revenue</p><strong>${formatNumber(revenue, 0)} €</strong><p class="muted">Wiederkehrend</p></article>`;
}

function renderClientList(query = "") {
  const normalized = query.toLowerCase();
  const visible = clients.filter((client) => client.name.toLowerCase().includes(normalized) || client.plan.toLowerCase().includes(normalized));
  document.getElementById("client-list").innerHTML = visible.map((client) => `
    <button class="client-card ${selectedClientId === client.id ? "selected" : ""}" data-client="${client.id}">
      <span class="client-name-row">
        <span class="avatar">${client.initials}</span>
        <span><h4>${client.name}</h4><p class="muted">${client.plan}</p></span>
        <span class="status-dot ${client.status}"></span>
      </span>
      <span class="client-row-metrics"><span>${client.checkIn}</span><span>${client.fee} €/Monat</span></span>
    </button>`).join("") || `<p class="muted">Kein Klient gefunden.</p>`;
}

function renderProfile() {
  const client = clients.find((item) => item.id === selectedClientId);
  const trend = trendFor(client);
  const trendClass = client.status === "active" ? "trend-positive" : "trend-warning";
  document.getElementById("profile-panel").innerHTML = `
    <header class="profile-head">
      <div class="profile-identity">
        <span class="avatar">${client.initials}</span>
        <div>
          <p class="caption">${client.source}</p>
          <h3>${client.name}</h3>
          <p class="muted">${client.goal} · ${client.plan}</p>
        </div>
      </div>
      <span class="tag ${client.status}">${statusLabel(client.status)}</span>
    </header>
    <section class="profile-stats">
      <article class="stat-card"><p class="caption">Dabei seit</p><strong>${client.since}</strong><p class="muted">${client.months} Monate</p></article>
      <article class="stat-card"><p class="caption">Beitrag</p><strong>${client.fee} €</strong><p class="muted">monatlich</p></article>
      <article class="stat-card"><p class="caption">Gewicht</p><strong>${formatNumber(last(client.weights))} kg</strong><p class="muted">aktuell</p></article>
      <article class="stat-card"><p class="caption">Adhärenz</p><strong>${client.adherence}%</strong><p class="muted">4 Wochen</p></article>
      <article class="stat-card"><p class="caption">Check-in</p><strong>${client.checkIn}</strong><p class="muted">Status</p></article>
    </section>
    <section class="profile-analytics">
      <article class="chart-card">
        <div class="section-head"><div><p class="caption">Gewicht · 6 Wochen</p><h4>Verlaufsanalyse</h4></div><span class="${trendClass}">${trend >= 0 ? "+" : ""}${formatNumber(trend)} kg / Woche</span></div>
        ${chartSvg(client.weights)}
      </article>
      <article class="chart-card">
        <p class="caption">Performance Signale</p>
        <h4>Readiness</h4>
        ${[
          ["Adhärenz", client.adherence, "var(--accent)"],
          ["Schlaf", client.sleep * 10, "var(--teal)"],
          ["Krafttrend", Math.max(15, 60 + client.strength * 5), client.strength < 0 ? "var(--orange)" : "var(--blue)"],
        ].map(([label, value, color]) => `
          <div class="signal"><div><span>${label}</span><strong>${formatNumber(value, 0)}%</strong></div><div class="signal-track"><span style="width:${Math.min(value, 100)}%;background:${color}"></span></div></div>`).join("")}
      </article>
    </section>
    <article class="recommendation-card">
      <div class="recommendation-head"><div><p class="caption">Coach Assist</p><h4>Handlungsempfehlungen</h4></div><span class="pill">${recommendations(client).length} Hinweise</span></div>
      <div class="recommendation-grid">${recommendations(client).map(([title, copy]) => `<div class="recommendation"><strong>${title}</strong><p>${copy}</p></div>`).join("")}</div>
      ${client.source === "Demo" ? `<p class="demo-note">Dieses Profil enthält Beispieldaten zur Darstellung des Coach-Workflows.</p>` : ""}
    </article>`;
}

document.getElementById("client-list").addEventListener("click", (event) => {
  const card = event.target.closest("[data-client]");
  if (!card) return;
  selectedClientId = card.dataset.client;
  renderClientList(document.getElementById("client-search").value);
  renderProfile();
});

document.getElementById("client-search").addEventListener("input", (event) => {
  renderClientList(event.target.value);
});

renderSummary();
renderClientList();
renderProfile();
