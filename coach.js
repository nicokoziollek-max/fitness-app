const imported = window.FITNESS_DATA;
const reviewState = JSON.parse(localStorage.getItem("nh-coach-review-state") || "{}");
const themePresets = {
  lime: { name: "Performance Lime", accent: "#b7f348", rgb: "183, 243, 72", ink: "#152009" },
  cyan: { name: "Electric Cyan", accent: "#42e3e7", rgb: "66, 227, 231", ink: "#061a1b" },
  violet: { name: "Coach Violet", accent: "#a98bff", rgb: "169, 139, 255", ink: "#120d26" },
  orange: { name: "Energy Orange", accent: "#ffad42", rgb: "255, 173, 66", ink: "#201204" },
  rose: { name: "Pulse Rose", accent: "#ff6ea8", rgb: "255, 110, 168", ink: "#250812" },
  blue: { name: "Focus Blue", accent: "#5799ff", rgb: "87, 153, 255", ink: "#071328" },
};
const savedCoachSettings = JSON.parse(localStorage.getItem("nh-coach-settings") || "{}");
const settings = {
  theme: savedCoachSettings.theme || "lime",
  customColor: savedCoachSettings.customColor || "#b7f348",
  useCustom: Boolean(savedCoachSettings.useCustom),
  compact: Boolean(savedCoachSettings.compact),
  showRevenue: savedCoachSettings.showRevenue !== false,
  loomHints: savedCoachSettings.loomHints !== false,
};

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

const nicolasEntries = imported.dailyEntries.slice(-42);
const nicolasWeights = nicolasEntries.map((entry) => entry.weight).filter(Number.isFinite);

const clients = [
  {
    id: "nicolas", name: "Nicolas Hollendung", initials: "NH", source: "Live-Daten", status: "active",
    since: "Okt. 2025", months: 7, fee: 249, paid: true, plan: "Meso 4 · Aufbau", phase: "Woche 1 / 9",
    goal: "Muskelaufbau", adherence: 92, trainingCompliance: 94, nutritionCompliance: 89, checkIn: "Heute",
    sleep: round(average(nicolasEntries.slice(-14).map((entry) => entry.sleep))), steps: round(average(nicolasEntries.slice(-7).map((entry) => entry.steps)), 0),
    calories: round(average(nicolasEntries.slice(-7).map((entry) => entry.calories)), 0), weights: nicolasWeights, strength: 8.4,
    nextCall: "29. Mai · 17:00", focus: "Rate of gain kontrollieren", notes: "Stabiler Aufbau. Training performant, Verdauung weiter beobachten.",
    wins: ["Gewichtstrend konsistent", "Adhärenz > 90%", "Training bereit für Progression"],
  },
  {
    id: "lea", name: "Lea Berger", initials: "LB", source: "Demo", status: "active",
    since: "Jan. 2026", months: 5, fee: 199, paid: true, plan: "Lifestyle Cut", phase: "Woche 6 / 12",
    goal: "Fettverlust", adherence: 97, trainingCompliance: 95, nutritionCompliance: 98, checkIn: "Morgen",
    sleep: 7.8, steps: 11250, calories: 1850, weights: generateTrend(68.4, -0.22, 42, 0.16), strength: 5.1,
    nextCall: "30. Mai · 11:30", focus: "Diätpause evaluieren", notes: "Sehr zuverlässig, Kraft stabil trotz Defizit.",
    wins: ["Gewicht im Zielkorridor", "Hohe Ernährungsadhärenz", "Kraft gehalten"],
  },
  {
    id: "tim", name: "Tim Schneider", initials: "TS", source: "Demo", status: "attention",
    since: "Nov. 2025", months: 6, fee: 229, paid: false, plan: "Powerbuilding", phase: "Woche 4 / 8",
    goal: "Kraft & Masse", adherence: 71, trainingCompliance: 74, nutritionCompliance: 68, checkIn: "Überfällig",
    sleep: 6.4, steps: 6940, calories: 3340, weights: generateTrend(89.5, 0.38, 42, 0.32), strength: -2.3,
    nextCall: "Überfällig", focus: "Recovery und Zahlung", notes: "Körpergewicht steigt, Performance sinkt; Feedback fehlt.",
    wins: ["Volumen dokumentiert", "Masseziel grundsätzlich erreicht"],
  },
  {
    id: "mia", name: "Mia Hoffmann", initials: "MH", source: "Demo", status: "active",
    since: "Mär. 2026", months: 3, fee: 179, paid: true, plan: "Glute Focus", phase: "Woche 5 / 10",
    goal: "Rekomposition", adherence: 88, trainingCompliance: 91, nutritionCompliance: 85, checkIn: "Gestern",
    sleep: 7.2, steps: 9820, calories: 2160, weights: generateTrend(61.3, 0.04, 42, 0.14), strength: 6.8,
    nextCall: "28. Mai · 19:00", focus: "Hip Thrust Progression", notes: "Messbare Leistungssteigerung bei stabilem Gewicht.",
    wins: ["Kraft +6,8%", "Gewicht stabil", "Check-ins vollständig"],
  },
  {
    id: "jan", name: "Jan Peters", initials: "JP", source: "Demo", status: "risk",
    since: "Feb. 2026", months: 4, fee: 249, paid: true, plan: "Contest Prep", phase: "Peak Week -2",
    goal: "Bühnenform", adherence: 62, trainingCompliance: 66, nutritionCompliance: 59, checkIn: "3 Tage offen",
    sleep: 5.9, steps: 15400, calories: 2010, weights: generateTrend(78.8, -0.65, 42, 0.3), strength: -5.6,
    nextCall: "Heute · dringend", focus: "Prep-Risiko", notes: "Check-in fehlt; Müdigkeit und schneller Gewichtsverlust kritisch.",
    wins: ["Gewichtsreduktion sichtbar"],
  },
];

let selectedClientId = "nicolas";
let selectedView = "dashboard";
let presentationSlide = 0;
let checkInFilter = "all";

function selectedClient() {
  return clients.find((client) => client.id === selectedClientId);
}

function hexToRgb(hex) {
  const raw = hex.replace("#", "");
  const value = raw.length === 3 ? raw.split("").map((character) => character + character).join("") : raw;
  const number = Number.parseInt(value, 16);
  return `${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}`;
}

function contrastInk(hex) {
  const values = hexToRgb(hex).split(", ").map(Number);
  const luminance = (values[0] * 299 + values[1] * 587 + values[2] * 114) / 1000;
  return luminance > 150 ? "#152009" : "#f5faf7";
}

function activeTheme() {
  if (settings.useCustom) {
    return { name: "Custom", accent: settings.customColor, rgb: hexToRgb(settings.customColor), ink: contrastInk(settings.customColor) };
  }
  return themePresets[settings.theme];
}

function applySettings() {
  const theme = activeTheme();
  document.documentElement.style.setProperty("--accent", theme.accent);
  document.documentElement.style.setProperty("--accent-rgb", theme.rgb);
  document.documentElement.style.setProperty("--accent-ink", theme.ink);
  document.body.classList.toggle("compact-mode", settings.compact);
  localStorage.setItem("nh-coach-settings", JSON.stringify(settings));
}

function trendFor(client) {
  return round(average(client.weights.slice(-7)) - average(client.weights.slice(-14, -7)));
}

function statusLabel(status) {
  return { active: "Auf Kurs", attention: "Beobachten", risk: "Handlungsbedarf" }[status];
}

function statusPriority(client) {
  return { risk: 0, attention: 1, active: 2 }[client.status];
}

function chartSvg(values, className = "weight-chart") {
  const width = 490;
  const height = className.includes("present") ? 250 : 155;
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
  return `<svg class="weight-chart ${className}" viewBox="0 0 ${width} ${height}" aria-label="Gewichtstrend">
    <path class="grid" d="M0 ${height * 0.25} H${width} M0 ${height * 0.5} H${width} M0 ${height * 0.75} H${width}"></path>
    <polygon class="area" points="${points[0][0]},${height} ${line} ${points[points.length - 1][0]},${height}"></polygon>
    <polyline class="line" points="${line}"></polyline>
  </svg>`;
}

function recommendations(client) {
  const items = [];
  const trend = trendFor(client);
  if (client.status === "risk" || client.adherence < 70) {
    items.push(["Check-in priorisieren", "Heute persönlich kontaktieren und Hindernisse klären."]);
  } else if (client.adherence < 80) {
    items.push(["Adhärenz verbessern", "Plan vereinfachen und mit klaren Wochenzielen begleiten."]);
  } else {
    items.push(["Plan fortführen", "Strategie funktioniert; nächste Progression sauber dokumentieren."]);
  }
  if (client.sleep < 7) {
    items.push(["Recovery besprechen", `Schlaf liegt bei ${formatNumber(client.sleep)} h; Belastung und Routinen prüfen.`]);
  } else if (client.strength > 5) {
    items.push(["Progression freigeben", "Leistungsentwicklung positiv; Laststeigerung bei Ziel-Reps erwägen."]);
  }
  if (client.goal === "Muskelaufbau" && trend > 0.35) {
    items.push(["Rate of Gain bremsen", `+${formatNumber(trend)} kg/Woche liegt hoch; Kalorien leicht prüfen.`]);
  }
  if (client.goal === "Fettverlust" && trend > -0.1) {
    items.push(["Defizit justieren", "Gewichtsrate langsam; Aktivität oder Kalorien überprüfen."]);
  }
  if (!client.paid) {
    items.push(["Zahlung offen", "Rechnung freundlich erinnern, bevor die nächste Betreuung startet."]);
  }
  return items.slice(0, 4);
}

function renderSummary() {
  const revenue = clients.reduce((total, client) => total + client.fee, 0);
  const attention = clients.filter((client) => client.status !== "active").length;
  const avgAdherence = average(clients.map((client) => client.adherence));
  const unpaid = clients.filter((client) => !client.paid).length;
  document.getElementById("sidebar-revenue").textContent = settings.showRevenue ? `${formatNumber(revenue, 0)} €` : "•••• €";
  document.getElementById("portfolio-summary").innerHTML = `
    <article class="summary-card"><p class="caption">Aktive Klienten</p><strong>${clients.length}</strong><p class="muted">1 Live · ${clients.length - 1} Demo</p></article>
    <article class="summary-card good"><p class="caption">Adhärenz Ø</p><strong>${formatNumber(avgAdherence, 0)}%</strong><p class="muted">Letzte 4 Wochen</p></article>
    <article class="summary-card attention"><p class="caption">Follow-ups</p><strong>${attention}</strong><p class="muted">Coach-Aktion notwendig</p></article>
    <article class="summary-card ${unpaid ? "attention" : ""}"><p class="caption">Monthly Revenue</p><strong>${settings.showRevenue ? `${formatNumber(revenue, 0)} €` : "•••• €"}</strong><p class="muted">${unpaid} Zahlung offen</p></article>`;
}

function renderClientList(query = "") {
  const normalized = query.toLowerCase();
  const visible = clients
    .filter((client) => client.name.toLowerCase().includes(normalized) || client.plan.toLowerCase().includes(normalized))
    .sort((left, right) => statusPriority(left) - statusPriority(right));
  return visible.map((client) => `
    <button class="client-card ${selectedClientId === client.id ? "selected" : ""}" data-client="${client.id}">
      <span class="client-name-row">
        <span class="avatar">${client.initials}</span>
        <span><h4>${client.name}</h4><p class="muted">${client.plan}</p></span>
        <span class="status-dot ${client.status}"></span>
      </span>
      <span class="client-row-metrics"><span>${client.checkIn}</span><span>${client.fee} €/Monat</span></span>
    </button>`).join("") || `<p class="muted">Kein Klient gefunden.</p>`;
}

function clientListPanel() {
  return `<section class="client-panel">
    <div class="section-head"><div><p class="caption">Portfolio</p><h3>Klienten</h3></div><span class="pill">Live + Demo</span></div>
    <div class="client-list" id="client-list">${renderClientList(document.getElementById("client-search").value)}</div>
  </section>`;
}

function signalRows(client) {
  return [
    ["Adhärenz", client.adherence, "var(--accent)"],
    ["Ernährung", client.nutritionCompliance, "var(--teal)"],
    ["Training", client.trainingCompliance, "var(--blue)"],
    ["Recovery", Math.min(100, client.sleep * 10), client.sleep < 7 ? "var(--orange)" : "var(--teal)"],
  ].map(([label, value, color]) => `
    <div class="signal"><div><span>${label}</span><strong>${formatNumber(value, 0)}%</strong></div><div class="signal-track"><span style="width:${value}%;background:${color}"></span></div></div>`).join("");
}

function profilePanel(client) {
  const trend = trendFor(client);
  const trendClass = client.status === "active" ? "trend-positive" : "trend-warning";
  return `<section class="profile-panel">
    <header class="profile-head">
      <div class="profile-identity">
        <span class="avatar">${client.initials}</span>
        <div><p class="caption">${client.source}</p><h3>${client.name}</h3><p class="muted">${client.goal} · ${client.plan}</p></div>
      </div>
      <div class="profile-actions">
        <button class="ghost accent" data-present="${client.id}">Präsentationsmodus</button>
        <span class="tag ${client.status}">${statusLabel(client.status)}</span>
      </div>
    </header>
    <section class="profile-stats">
      <article class="stat-card"><p class="caption">Dabei seit</p><strong>${client.since}</strong><p class="muted">${client.months} Monate</p></article>
      <article class="stat-card"><p class="caption">Beitrag</p><strong>${client.fee} €</strong><p class="muted">${client.paid ? "Bezahlt" : "Offen"}</p></article>
      <article class="stat-card"><p class="caption">Gewicht</p><strong>${formatNumber(last(client.weights))} kg</strong><p class="muted">aktuell</p></article>
      <article class="stat-card"><p class="caption">Adhärenz</p><strong>${client.adherence}%</strong><p class="muted">4 Wochen</p></article>
      <article class="stat-card"><p class="caption">Check-in</p><strong>${client.checkIn}</strong><p class="muted">Status</p></article>
    </section>
    <section class="profile-analytics">
      <article class="chart-card">
        <div class="section-head"><div><p class="caption">Gewicht · 6 Wochen</p><h4>Verlaufsanalyse</h4></div><span class="${trendClass}">${trend >= 0 ? "+" : ""}${formatNumber(trend)} kg / Woche</span></div>
        ${chartSvg(client.weights)}
      </article>
      <article class="chart-card"><p class="caption">Performance Signale</p><h4>Readiness</h4>${signalRows(client)}</article>
    </section>
    <section class="detail-grid">
      <article class="detail-card"><p class="caption">Lifestyle</p><h4>Daily Metrics</h4><div class="metric-list">
        <div class="metric-line"><span>Schlaf Ø</span><strong>${formatNumber(client.sleep)} h</strong></div>
        <div class="metric-line"><span>Schritte Ø</span><strong>${formatNumber(client.steps, 0)}</strong></div>
        <div class="metric-line"><span>Kalorien Ø</span><strong>${formatNumber(client.calories, 0)} kcal</strong></div>
      </div></article>
      <article class="detail-card"><p class="caption">Betreuung</p><h4>Planung</h4><div class="metric-list">
        <div class="metric-line"><span>Phase</span><strong>${client.phase}</strong></div>
        <div class="metric-line"><span>Nächster Call</span><strong>${client.nextCall}</strong></div>
        <div class="metric-line"><span>Fokus</span><strong>${client.focus}</strong></div>
      </div></article>
      <article class="detail-card"><p class="caption">Coach Notiz</p><h4>Aktueller Kontext</h4><p class="muted">${client.notes}</p></article>
    </section>
    <article class="recommendation-card">
      <div class="recommendation-head"><div><p class="caption">Coach Assist</p><h4>Handlungsempfehlungen</h4></div><span class="pill">${recommendations(client).length} Hinweise</span></div>
      <div class="recommendation-grid">${recommendations(client).map(([title, copy]) => `<div class="recommendation"><strong>${title}</strong><p>${copy}</p></div>`).join("")}</div>
      ${client.source === "Demo" ? `<p class="demo-note">Dieses Profil enthält Beispieldaten zur Darstellung des Coach-Workflows.</p>` : ""}
    </article>
  </section>`;
}

function dashboardView() {
  const queue = [...clients].sort((left, right) => statusPriority(left) - statusPriority(right)).slice(0, 3);
  const current = selectedClient();
  return `<div class="dashboard-columns">
    <section>
      <article class="workspace-card">
        <div class="section-head"><div><p class="caption">Heute</p><h3>Coach-Zentrale</h3></div><span class="pill">${new Date().toLocaleDateString("de-DE")}</span></div>
        <div class="activity-list">${queue.map((client) => `<div class="activity-row">
          <span class="avatar">${client.initials}</span><div><strong>${client.name}</strong><p>${recommendations(client)[0][0]} · ${client.checkIn}</p></div>
          <button class="ghost" data-open-client="${client.id}">Öffnen</button>
        </div>`).join("")}</div>
      </article>
      <article class="workspace-card">
        <div class="section-head"><div><p class="caption">Ausgewählt</p><h3>${current.name}</h3></div><button class="ghost accent" data-present="${current.id}">Review aufnehmen</button></div>
        <div class="profile-analytics">
          <div>${chartSvg(current.weights)}</div>
          <div>${signalRows(current)}</div>
        </div>
      </article>
    </section>
    <section>
      <article class="workspace-card">
        <p class="caption">Schnellzugriff</p><h3>Arbeitsabläufe</h3>
        <div class="quick-actions">
          <button data-view="checkins"><strong>Check-ins prüfen</strong><span>Priorisierte Inbox</span></button>
          <button data-view="clients"><strong>Klienten öffnen</strong><span>Analysen & Reviews</span></button>
          <button data-view="programs"><strong>Programme</strong><span>Zyklen prüfen</span></button>
          <button data-view="billing"><strong>Abrechnung</strong><span>Umsatz & Zahlungen</span></button>
        </div>
      </article>
      <article class="workspace-card">
        <p class="caption">Aufgaben</p><h3>Offene Aktionen</h3>
        <div class="task-list">
          <div class="task-item"><strong>Jan Peters kontaktieren</strong><p>Check-in 3 Tage offen · hohe Priorität</p></div>
          <div class="task-item"><strong>Tim: Zahlung erinnern</strong><p>229 € offen · Follow-up heute</p></div>
          <div class="task-item"><strong>Nicolas Review aufnehmen</strong><p>Meso 4 gestartet · Loom Feedback senden</p></div>
        </div>
      </article>
    </section>
  </div>`;
}

function clientsView() {
  return `<div class="content-grid">${clientListPanel()}${profilePanel(selectedClient())}</div>`;
}

function checkinsView() {
  const filtered = [...clients]
    .filter((client) => checkInFilter === "all" || client.status === checkInFilter)
    .sort((left, right) => statusPriority(left) - statusPriority(right));
  return `<article class="workspace-card">
    <div class="section-head"><div><p class="caption">Inbox</p><h3>Check-in Review Queue</h3></div><span class="pill">${filtered.length} zu prüfen</span></div>
    <div class="filters">
      ${[["all", "Alle"], ["risk", "Dringend"], ["attention", "Beobachten"], ["active", "Auf Kurs"]].map(([value, label]) => `<button class="filter ${checkInFilter === value ? "active" : ""}" data-checkin-filter="${value}">${label}</button>`).join("")}
    </div>
    <div class="queue-list">${filtered.map((client) => {
      const reviewed = reviewState[client.id];
      return `<div class="queue-item ${client.status === "risk" ? "urgent" : ""}">
        <span class="avatar">${client.initials}</span>
        <div><strong>${client.name}</strong><p>${client.checkIn} · ${client.notes}</p></div>
        <span class="mini-status ${client.status}">${reviewed ? "Reviewed" : statusLabel(client.status)}</span>
        <span class="queue-actions"><button data-open-client="${client.id}">Analyse</button><button data-review="${client.id}">${reviewed ? "Zurücksetzen" : "Erledigt"}</button></span>
      </div>`;
    }).join("")}</div>
  </article>`;
}

function programsView() {
  return `<article class="workspace-card">
    <div class="section-head"><div><p class="caption">Programming</p><h3>Aktive Programme</h3></div><button class="primary">+ Programm erstellen</button></div>
    <div class="program-list">${clients.map((client) => `<div class="program-row">
      <div><strong>${client.plan}</strong><p>${client.name} · ${client.goal}</p></div>
      <div><p class="caption">Aktuelle Phase</p><strong>${client.phase}</strong></div>
      <div><p class="caption">Compliance</p><strong>${client.trainingCompliance}%</strong><div class="row-chart"><span style="width:${client.trainingCompliance}%"></span></div></div>
      <button class="ghost" data-open-client="${client.id}">Details</button>
    </div>`).join("")}</div>
  </article>`;
}

function billingView() {
  const revenue = clients.reduce((total, client) => total + client.fee, 0);
  const paid = clients.filter((client) => client.paid).reduce((total, client) => total + client.fee, 0);
  return `<div class="dashboard-columns">
    <article class="workspace-card">
      <div class="section-head"><div><p class="caption">Abrechnung</p><h3>Monatliche Zahlungen</h3></div><span class="pill">${formatNumber(paid, 0)} € erhalten</span></div>
      <div class="billing-list">${clients.map((client) => `<div class="billing-row">
        <div><strong>${client.name}</strong><p>${client.plan}</p></div><div><p class="caption">Paket</p><strong>${client.fee} €</strong></div>
        <div><p class="caption">Laufzeit</p><strong>${client.months} Mon.</strong></div>
        <div><span class="mini-status ${client.paid ? "" : "attention"}">${client.paid ? "Bezahlt" : "Offen"}</span></div>
        <button class="ghost">${client.paid ? "Beleg" : "Erinnern"}</button>
      </div>`).join("")}</div>
    </article>
    <article class="workspace-card">
      <p class="caption">Revenue Health</p><h3>${settings.showRevenue ? `${formatNumber(revenue, 0)} €` : "•••• €"} MRR</h3>
      <div class="metric-list" style="margin-top:18px;">
        <div class="metric-line"><span>Gezahlt</span><strong>${formatNumber(paid, 0)} €</strong></div>
        <div class="metric-line"><span>Offen</span><strong>${formatNumber(revenue - paid, 0)} €</strong></div>
        <div class="metric-line"><span>Durchschnitt/Klient</span><strong>${formatNumber(revenue / clients.length, 0)} €</strong></div>
        <div class="metric-line"><span>Aktive Verträge</span><strong>${clients.length}</strong></div>
      </div>
    </article>
  </div>`;
}

function settingsView() {
  const theme = activeTheme();
  return `<div class="settings-grid">
    <article class="settings-card">
      <p class="caption">Branding</p>
      <h3>Brand Color</h3>
      <p class="muted">Ändert Akzente, Charts, aktive Zustände und deinen Loom-Präsentationsmodus live.</p>
      <div class="theme-swatches">
        ${Object.entries(themePresets).map(([key, preset]) => `<button class="theme-swatch ${!settings.useCustom && settings.theme === key ? "selected" : ""}" data-theme="${key}">
          <span class="swatch-dot" style="--swatch:${preset.accent}"></span>
          <span><strong>${preset.name}</strong><span>${preset.accent}</span></span>
        </button>`).join("")}
      </div>
      <div class="custom-color-row">
        <label>Eigene Farbe<input id="custom-brand-color" type="color" value="${settings.customColor}"></label>
        <button class="ghost accent ${settings.useCustom ? "selected" : ""}" data-use-custom>Custom anwenden</button>
        <button class="ghost" data-reset-theme>Grün zurücksetzen</button>
      </div>
    </article>
    <section>
      <article class="settings-preview">
        <div class="preview-header"><span class="preview-logo">Coach Portal</span><span class="tag">Preview</span></div>
        <p class="caption">Current Brand</p>
        <div class="preview-metric"><span>${theme.name}</span></div>
        <div class="preview-track"><span style="width:74%;"></span></div>
        <div class="quick-actions"><button><strong>Review aufnehmen</strong><span>Loom-ready</span></button><button><strong>Klient öffnen</strong><span>Insights</span></button></div>
      </article>
      <article class="settings-card" style="margin-top:14px;">
        <p class="caption">Ansicht</p><h3>Portal-Optionen</h3>
        <div class="settings-options">
          <div class="settings-toggle"><div><strong>Kompakte Tabellen</strong><p>Mehr Klienten auf einmal sehen</p></div><button class="toggle ${settings.compact ? "active" : ""}" data-setting="compact"></button></div>
          <div class="settings-toggle"><div><strong>Umsatz anzeigen</strong><p>MRR im Dashboard einblenden</p></div><button class="toggle ${settings.showRevenue ? "active" : ""}" data-setting="showRevenue"></button></div>
          <div class="settings-toggle"><div><strong>Loom-Hinweise</strong><p>Talking Points im Präsentationsmodus</p></div><button class="toggle ${settings.loomHints ? "active" : ""}" data-setting="loomHints"></button></div>
        </div>
      </article>
    </section>
  </div>`;
}

function renderWorkspace() {
  const title = {
    dashboard: "Klientenübersicht",
    clients: "Klienten & Analysen",
    checkins: "Check-in Inbox",
    programs: "Programme",
    billing: "Abrechnung",
    settings: "Einstellungen",
  }[selectedView];
  document.querySelector(".dashboard-header h2").textContent = title;
  document.querySelectorAll(".side-nav [data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === selectedView));
  const views = { dashboard: dashboardView, clients: clientsView, checkins: checkinsView, programs: programsView, billing: billingView, settings: settingsView };
  document.getElementById("workspace").innerHTML = views[selectedView]();
}

function presentationSlides(client) {
  const trend = trendFor(client);
  const recs = recommendations(client);
  return [
    `<div class="present-slide">
      <div class="slide-title"><p class="caption">Weekly Coaching Review</p><h3>${client.name}: Fortschritt auf einen Blick</h3></div>
      <div class="hero-metrics">
        <article class="hero-metric"><p class="caption">Gewicht</p><strong>${formatNumber(last(client.weights))} kg</strong><p class="muted">${trend >= 0 ? "+" : ""}${formatNumber(trend)} kg / Woche</p></article>
        <article class="hero-metric"><p class="caption">Adhärenz</p><strong>${client.adherence}%</strong><p class="muted">Letzte 4 Wochen</p></article>
        <article class="hero-metric"><p class="caption">Schlaf</p><strong>${formatNumber(client.sleep)} h</strong><p class="muted">Regeneration</p></article>
        <article class="hero-metric"><p class="caption">Phase</p><strong>${client.phase}</strong><p class="muted">${client.plan}</p></article>
      </div>
      <article class="present-card"><p class="caption">Opening Talking Point</p><h4 style="margin-top:10px;">${client.notes}</h4></article>
    </div>`,
    `<div class="present-slide">
      <div class="slide-title"><p class="caption">Trend Review</p><h3>Entwicklung der letzten sechs Wochen</h3></div>
      <div class="present-grid">
        <article class="present-card"><div class="section-head"><h4>Gewichtsverlauf</h4><span class="trend-positive">${trend >= 0 ? "+" : ""}${formatNumber(trend)} kg/Woche</span></div>${chartSvg(client.weights, "present-chart")}</article>
        <article class="present-card"><p class="caption">Readiness</p><h4>Signale im Kontext</h4>${signalRows(client)}</article>
      </div>
    </div>`,
    `<div class="present-slide">
      <div class="slide-title"><p class="caption">Coach Analyse</p><h3>Was läuft gut und was ändern wir?</h3></div>
      <div class="present-grid">
        <article class="present-card"><p class="caption">Wins</p><div class="talking-points">${client.wins.map((win) => `<div class="talking-point"><strong>${win}</strong><p>Im Review kurz würdigen und einordnen.</p></div>`).join("")}</div></article>
        <article class="present-card"><p class="caption">Empfehlungen</p><div class="talking-points">${recs.map(([title, text]) => `<div class="talking-point"><strong>${title}</strong><p>${text}</p></div>`).join("")}</div></article>
      </div>
    </div>`,
    `<div class="present-slide">
      <div class="slide-title"><p class="caption">Next Steps</p><h3>Plan für die kommende Woche</h3></div>
      <div class="hero-metrics">
        <article class="hero-metric"><p class="caption">Fokus</p><strong style="font-size:25px;">${client.focus}</strong></article>
        <article class="hero-metric"><p class="caption">Training</p><strong>${client.trainingCompliance}%</strong><p class="muted">Ziel: konstant bleiben</p></article>
        <article class="hero-metric"><p class="caption">Nutrition</p><strong>${client.nutritionCompliance}%</strong><p class="muted">Compliance</p></article>
        <article class="hero-metric"><p class="caption">Nächster Call</p><strong style="font-size:25px;">${client.nextCall}</strong></article>
      </div>
      <article class="present-card"><p class="caption">Closing für Loom</p><h4 style="margin-top:10px;">„Starker Einsatz diese Woche. Konzentriere dich jetzt auf ${client.focus.toLowerCase()}, dann besprechen wir im nächsten Check-in die nächsten Anpassungen.“</h4></article>
    </div>`,
  ];
}

function renderPresentation() {
  const client = selectedClient();
  const slides = presentationSlides(client);
  document.getElementById("presentation-content").innerHTML = `<div class="present-shell">
    <header class="present-header">
      <div class="present-client"><span class="avatar">${client.initials}</span><div><p class="caption">Client Review Presentation</p><h2>${client.name}</h2><p class="muted">${client.goal} · ${client.plan}</p></div></div>
      <div class="present-controls">${settings.loomHints ? `<span class="record-badge"><span class="record-dot"></span>Loom-ready</span>` : ""}<button class="ghost" data-present-close>Schließen</button></div>
    </header>
    <main class="present-stage">${slides[presentationSlide]}</main>
    <footer class="present-footer">
      <div class="present-nav">${slides.map((_, index) => `<button class="slide-dot ${index === presentationSlide ? "active" : ""}" data-present-slide="${index}" aria-label="Folie ${index + 1}"></button>`).join("")}</div>
      <div class="present-controls"><button class="ghost" data-present-prev>Zurück</button><button class="primary" data-present-next>${presentationSlide === slides.length - 1 ? "Zum Anfang" : "Weiter"}</button></div>
    </footer>
  </div>`;
}

function openPresentation(clientId) {
  selectedClientId = clientId;
  presentationSlide = 0;
  renderPresentation();
  document.getElementById("presentation-dialog").showModal();
}

document.querySelector(".side-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  selectedView = button.dataset.view;
  renderWorkspace();
});

document.getElementById("workspace").addEventListener("click", (event) => {
  const clientCard = event.target.closest("[data-client]");
  const openClient = event.target.closest("[data-open-client]");
  const view = event.target.closest("[data-view]");
  const present = event.target.closest("[data-present]");
  const review = event.target.closest("[data-review]");
  const filter = event.target.closest("[data-checkin-filter]");
  const theme = event.target.closest("[data-theme]");
  const toggle = event.target.closest("[data-setting]");
  if (theme) {
    settings.theme = theme.dataset.theme;
    settings.useCustom = false;
    applySettings();
    renderSummary();
    renderWorkspace();
    return;
  }
  if (event.target.closest("[data-use-custom]")) {
    settings.customColor = document.getElementById("custom-brand-color").value;
    settings.useCustom = true;
    applySettings();
    renderSummary();
    renderWorkspace();
    return;
  }
  if (event.target.closest("[data-reset-theme]")) {
    settings.theme = "lime";
    settings.useCustom = false;
    applySettings();
    renderSummary();
    renderWorkspace();
    return;
  }
  if (toggle) {
    settings[toggle.dataset.setting] = !settings[toggle.dataset.setting];
    applySettings();
    renderSummary();
    renderWorkspace();
    return;
  }
  if (view) {
    selectedView = view.dataset.view;
    renderWorkspace();
    return;
  }
  if (present) {
    openPresentation(present.dataset.present);
    return;
  }
  if (review) {
    reviewState[review.dataset.review] = !reviewState[review.dataset.review];
    localStorage.setItem("nh-coach-review-state", JSON.stringify(reviewState));
    renderWorkspace();
    return;
  }
  if (filter) {
    checkInFilter = filter.dataset.checkinFilter;
    renderWorkspace();
    return;
  }
  const clientId = clientCard?.dataset.client || openClient?.dataset.openClient;
  if (clientId) {
    selectedClientId = clientId;
    selectedView = "clients";
    renderWorkspace();
  }
});

document.getElementById("client-search").addEventListener("input", () => {
  if (selectedView === "clients") renderWorkspace();
});

document.querySelector(".dashboard-header .primary").addEventListener("click", () => {
  selectedView = "clients";
  renderWorkspace();
});

document.getElementById("presentation-dialog").addEventListener("click", (event) => {
  const slides = presentationSlides(selectedClient());
  if (event.target.closest("[data-present-close]")) {
    event.currentTarget.close();
    return;
  }
  let changed = false;
  if (event.target.closest("[data-present-next]")) {
    presentationSlide = (presentationSlide + 1) % slides.length;
    changed = true;
  }
  if (event.target.closest("[data-present-prev]")) {
    presentationSlide = (presentationSlide - 1 + slides.length) % slides.length;
    changed = true;
  }
  const dot = event.target.closest("[data-present-slide]");
  if (dot) {
    presentationSlide = Number(dot.dataset.presentSlide);
    changed = true;
  }
  if (changed) renderPresentation();
});

renderSummary();
applySettings();
renderWorkspace();
