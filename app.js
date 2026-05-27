const sourceData = window.FITNESS_DATA;

function readStore(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch (error) {
    return fallback;
  }
}

const savedEntries = readStore("nh-training-entries", []);
const workoutLogs = readStore("nh-workout-logs", []);
const improvementNotes = readStore("nh-improvement-notes", []);
const measurements = readStore("nh-body-measurements", []);
const nutritionLogs = readStore("nh-nutrition-logs", []);
const chatMessages = readStore("nh-chat-messages", []);
const peakChecks = readStore("nh-peak-checks", {});
const settings = Object.assign({
  theme: "lime",
  goalMin: 0.15,
  goalMax: 0.3,
  restSeconds: 90,
  autoTimer: true,
  phase: "Aufbau",
  prepMode: true,
  proteinTarget: 190,
  carbsTarget: 350,
  fatTarget: 75,
  waterTarget: 3.5,
}, readStore("nh-client-settings", {}));

const themes = {
  lime: { label: "Lime", accent: "#b7f348", rgb: "183, 243, 72", dark: "#142008" },
  cyan: { label: "Cyan", accent: "#53e3d3", rgb: "83, 227, 211", dark: "#082522" },
  blue: { label: "Blue", accent: "#78a9ff", rgb: "120, 169, 255", dark: "#0b172b" },
  orange: { label: "Orange", accent: "#ffab5c", rgb: "255, 171, 92", dark: "#281407" },
};

const state = {
  tab: "home",
  meso: Number(localStorage.getItem("nh-active-meso") || 4),
  week: Number(localStorage.getItem("nh-active-week") || 1),
  metric: "weight",
  exerciseName: null,
  nutritionWeek: 0,
  entries: [],
};

const metricConfig = {
  weight: { label: "Gewicht", unit: "kg", digits: 1, color: "#b7f348" },
  calories: { label: "Kalorien", unit: "kcal", digits: 0, color: "#ffbc74" },
  sleep: { label: "Schlaf", unit: "h", digits: 1, color: "#62d6b7" },
  steps: { label: "Schritte", unit: "", digits: 0, color: "#86a8ff" },
};

const app = document.getElementById("app");
const dialog = document.getElementById("entry-dialog");
const entryForm = document.getElementById("entry-form");
const workoutDialog = document.getElementById("workout-dialog");
const workoutForm = document.getElementById("workout-form");
const measurementDialog = document.getElementById("measurement-dialog");
const measurementForm = document.getElementById("measurement-form");
const nutritionDialog = document.getElementById("nutrition-dialog");
const nutritionForm = document.getElementById("nutrition-form");
let timerHandle = null;
let timerRemaining = 0;
let chartCount = 0;

function refreshEntries() {
  state.entries = [...sourceData.dailyEntries, ...savedEntries].sort((a, b) => a.date.localeCompare(b.date));
}

function persistSettings() {
  localStorage.setItem("nh-client-settings", JSON.stringify(settings));
}

function applyTheme() {
  const theme = themes[settings.theme] || themes.lime;
  document.documentElement.style.setProperty("--accent", theme.accent);
  document.documentElement.style.setProperty("--accent-rgb", theme.rgb);
  document.documentElement.style.setProperty("--accent-dark", theme.dark);
  metricConfig.weight.color = theme.accent;
}

function valuesFor(metric, days) {
  return state.entries.slice(-days).map((entry) => entry[metric]).filter(Number.isFinite);
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function formatValue(value, digits = 1) {
  return Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatDate(date) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`));
}

function todayIso() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function latest() {
  return state.entries[state.entries.length - 1];
}

function workoutName(session) {
  return session.name === "Rest" && session.exercises.length ? `Workout ${session.code}` : session.name;
}

function displayReps(reps) {
  const serial = Number(reps);
  if (serial > 40000) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return `${date.getUTCDate()}-${date.getUTCMonth() + 1}`;
  }
  return reps;
}

function currentPlan() {
  return sourceData.mesocycles.find((meso) => meso.id === state.meso);
}

function activeSessions() {
  return currentPlan().sessions.filter((session) => session.exercises.length);
}

function currentWeekLogs() {
  return workoutLogs.filter((log) => log.meso === state.meso && log.week === state.week);
}

function nextSession() {
  const sessions = activeSessions();
  const completed = new Set(currentWeekLogs().map((log) => log.sessionCode));
  return sessions.find((session) => !completed.has(session.code)) || sessions[0];
}

function weightTrend() {
  const recent = average(valuesFor("weight", 7));
  const previous = state.entries.slice(-14, -7).map((entry) => entry.weight).filter(Number.isFinite);
  return recent - average(previous);
}

function weeklySlope() {
  const recent = valuesFor("weight", 28);
  if (recent.length < 14) return 0;
  return (average(recent.slice(-7)) - average(recent.slice(0, 7))) / 3;
}

function growthStatus() {
  const slope = weeklySlope();
  if (slope < settings.goalMin) {
    return { tone: "warning", title: "Unter Zielkorridor", text: "Gewicht steigt langsamer als geplant. Kalorien, Tracking-Konstanz und Regeneration prüfen." };
  }
  if (slope > settings.goalMax) {
    return { tone: "warning", title: "Über Zielkorridor", text: "Gewicht steigt schneller als geplant. Entwicklung von Taille und Leistung gemeinsam bewerten." };
  }
  return { tone: "good", title: "Im Zielkorridor", text: "Der Gewichtstrend passt zu deinem eingestellten Aufbauziel." };
}

function isoOffset(days) {
  const date = new Date(`${todayIso()}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayForOffset(weekOffset) {
  const date = new Date(`${todayIso()}T12:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1 + weekOffset * 7);
  return date;
}

function dateFromStart(start, offset) {
  const date = new Date(start);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function chatTimeline() {
  const demo = [
    { id: "seed-1", date: isoOffset(-19), sender: "coach", text: "Hi Nicolas, starke Woche. Gewicht läuft kontrolliert hoch. Halte die Kalorien diese Woche stabil und schick mir nach dem Lower-Training kurz ein Update." },
    { id: "seed-2", date: isoOffset(-18), sender: "me", text: "Mache ich. Lower war heute deutlich stärker, Squats fühlten sich leichter an." },
    { id: "seed-3", date: isoOffset(-18), sender: "me", text: "Check-in Fotos hochgeladen.", attachment: { label: "Check-in Front / Side", kind: "Fotos", demo: true } },
    { id: "seed-4", date: isoOffset(-12), sender: "coach", text: "Fotos und Log gesehen. Taille bleibt ruhig, Performance steigt. Wir erhöhen die Carbs an Trainingstagen leicht um 25 g." },
    { id: "seed-5", date: isoOffset(-8), sender: "me", text: "Update: Schlaf war zwei Nächte schlechter, Kraft trotzdem okay. Soll ich Cardio reduzieren?" },
    { id: "seed-6", date: isoOffset(-8), sender: "coach", text: "Noch nicht. Erst Schlaf priorisieren und die nächsten zwei Sessions beobachten. Gib mir Sonntag dein Wochenfeedback." },
    { id: "seed-7", date: isoOffset(-2), sender: "coach", text: "Die neue Woche sieht gut aus. Wenn Gewicht und Taille im Korridor bleiben, ziehen wir den Aufbau unverändert weiter." },
  ];
  return [...demo, ...chatMessages].sort((a, b) => `${a.date}-${a.id}`.localeCompare(`${b.date}-${b.id}`));
}

function chartSvg(values, color = "#b7f348") {
  if (!values.length) return `<p class="helper">Noch keine Daten für diesen Verlauf.</p>`;
  chartCount += 1;
  const gradientId = `area-fill-${chartCount}`;
  const width = 345;
  const height = 92;
  const pad = 7;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(values.length - 1, 1);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const line = points.map((point) => point.join(",")).join(" ");
  const area = `${points[0][0]},${height} ${line} ${points.at(-1)[0]},${height}`;
  const last = points.at(-1);
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="Trendverlauf">
    <defs><linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path class="grid" d="M0 28 H${width} M0 58 H${width}"></path>
    <polygon class="area" style="fill:url(#${gradientId})" points="${area}"></polygon>
    <polyline class="line" style="stroke:${color}" points="${line}"></polyline>
    <circle class="dot" style="fill:${color}" cx="${last[0]}" cy="${last[1]}" r="5"></circle>
  </svg>`;
}

function goalCard() {
  const status = growthStatus();
  const slope = weeklySlope();
  return `<article class="card goal-card ${status.tone}">
    <div class="section-head"><div><p class="eyebrow">Aufbauziel</p><h3>${status.title}</h3></div><strong class="goal-rate">${slope >= 0 ? "+" : ""}${formatValue(slope)} kg/W</strong></div>
    <p class="helper">${status.text}</p>
    <div class="goal-range">Ziel: +${formatValue(settings.goalMin)} bis +${formatValue(settings.goalMax)} kg pro Woche</div>
  </article>`;
}

function dashboard() {
  const today = latest();
  const trend = weightTrend();
  const session = nextSession();
  const completed = currentWeekLogs().length;
  const workoutCount = activeSessions().length;
  return `
    <section class="hero">
      <p class="eyebrow">${settings.phase} - Gewichtstrend 7 Tage</p>
      <div class="hero-title">${formatValue(today.weight)}<span class="unit">kg</span></div>
      <p class="subtle">Zuletzt erfasst am ${formatDate(today.date)}</p>
      <div class="trend">${trend >= 0 ? "+" : ""}${formatValue(trend)} kg gegenüber Vorwoche</div>
      ${chartSvg(valuesFor("weight", 28))}
    </section>
    <article class="action-card">
      <p class="eyebrow">Heute - Meso ${state.meso} Woche ${state.week}</p>
      <h3>${workoutName(session)}</h3>
      <p class="helper">${sum(session.exercises.map((exercise) => exercise.sets))} Arbeitssätze - ${session.exercises.length} Übungen bereit</p>
      <div class="compact-progress">
        <p class="helper">${completed} von ${workoutCount} Sessions diese Woche abgeschlossen</p>
        <div class="progress-track"><span style="width:${Math.min(100, completed / workoutCount * 100)}%"></span></div>
      </div>
      <div class="action-buttons">
        <button class="primary-button" data-start-session="${session.code}">Workout starten</button>
        <button class="secondary-button" data-new-entry>Check-in</button>
      </div>
    </article>
    ${goalCard()}
    <div class="dashboard-shortcuts">
      <button class="shortcut-card" data-go="nutrition"><span>Nährwerte</span><strong>Makros & Wasser</strong><small>Woche auswerten</small></button>
      <button class="shortcut-card ${settings.prepMode ? "accent" : ""}" data-go="peak"><span>Show Day</span><strong>Peak Week</strong><small>${settings.prepMode ? "Checkliste aktiv" : "Prep-Modus aus"}</small></button>
    </div>
    <div class="kpi-grid">
      <article class="kpi"><p class="eyebrow">Kalorien Ø 7T</p><strong>${formatValue(average(valuesFor("calories", 7)), 0)}</strong><p class="helper">kcal / Tag</p></article>
      <article class="kpi good"><p class="eyebrow">Schlaf Ø 7T</p><strong>${formatValue(average(valuesFor("sleep", 7)))} h</strong><p class="helper">Regeneration</p></article>
      <article class="kpi"><p class="eyebrow">Schritte Ø 7T</p><strong>${formatValue(average(valuesFor("steps", 7)), 0)}</strong><p class="helper">Aktivität</p></article>
      <article class="kpi warm"><p class="eyebrow">Workouts</p><strong>${workoutLogs.length}</strong><p class="helper">geloggt</p></article>
    </div>`;
}

function training() {
  const plan = currentPlan();
  const setEntries = Object.entries(plan.weeklySets).filter(([, sets]) => sets > 0);
  const completeCodes = new Set(currentWeekLogs().map((log) => log.sessionCode));
  return `
    <div class="section-head"><div><p class="eyebrow">Programm</p><h2>Trainingsplan</h2></div><p class="helper">${sum(setEntries.map(([, sets]) => sets))} Sätze/Woche</p></div>
    <div class="chips">${sourceData.mesocycles.map((meso) => `<button class="chip ${state.meso === meso.id ? "active" : ""}" data-meso="${meso.id}">Meso ${meso.id}</button>`).join("")}</div>
    <article class="card">
      <div class="section-head"><div><p class="eyebrow">Aktueller Zyklus</p><h3>Woche ${state.week} von 9</h3></div><div class="row"><button class="secondary-button" data-week-shift="-1">-</button><button class="secondary-button" data-week-shift="1">+</button></div></div>
      <div class="progress-track"><span style="width:${state.week / 9 * 100}%"></span></div>
    </article>
    <div class="volume-grid">${setEntries.slice(0, 8).map(([muscle, sets]) => `<div class="volume-box"><strong>${sets}</strong><span>${muscle}</span></div>`).join("")}</div>
    <section>${activeSessions().map((session, index) => `
      <article class="workout-card ${index === 0 ? "open" : ""}">
        <button class="workout-head" data-expand>
          <span class="session-code">${completeCodes.has(session.code) ? "OK" : session.code}</span>
          <span class="workout-title"><strong>${workoutName(session)}</strong><span>${sum(session.exercises.map((exercise) => exercise.sets))} Sätze - ${session.exercises.length} Übungen</span></span>
          <span class="chevron">+</span>
        </button>
        <div class="exercise-list">
          <button class="start-session" data-start-session="${session.code}">${completeCodes.has(session.code) ? "Erneut loggen" : "Session starten"}</button>
          ${session.exercises.map((exercise) => `
          <div class="exercise"><div><p>${exercise.name}</p><small>${exercise.group} - ${displayReps(exercise.reps)} Wdh. - RIR ${exercise.rir ?? "-"}${exercise.tempo ? ` - ${exercise.tempo}` : ""}</small></div><span class="set-tag">${exercise.sets} Sätze</span></div>`).join("")}</div>
      </article>`).join("")}</section>`;
}

function exerciseRecords() {
  return workoutLogs.flatMap((log) => log.exercises.flatMap((exercise) => exercise.sets.map((set) => ({
    name: exercise.name,
    date: log.date,
    weight: set.weight,
    reps: set.reps,
    volume: set.weight * set.reps,
    e1rm: set.weight * (1 + set.reps / 30),
  }))));
}

function performanceCard() {
  if (!workoutLogs.length) {
    return `<article class="card performance-card"><p class="eyebrow">Kraftprogression</p><h3>Noch keine Workouts geloggt</h3><p class="helper">Starte eine Session im Trainingsbereich, um Volumen und Bestleistungen auszuwerten.</p></article>`;
  }
  const recentLogs = workoutLogs.slice(-8);
  const records = exerciseRecords();
  const top = records.reduce((best, record) => !best || record.e1rm > best.e1rm ? record : best, null);
  return `<article class="card performance-card">
    <p class="eyebrow">Kraftprogression - Workouts</p>
    <div class="metric-row"><h2>${formatValue(recentLogs.at(-1).volume, 0)} <span class="unit">kg Volumen</span></h2><span class="trend">${workoutLogs.length} Logs</span></div>
    ${chartSvg(recentLogs.map((log) => log.volume), "#62d6b7")}
    <div class="log-summary">
      <div><strong>${formatValue(sum(workoutLogs.map((log) => log.volume)), 0)}</strong><span>Gesamtvolumen</span></div>
      <div><strong>${formatValue(top.e1rm, 1)}</strong><span>Bestes e1RM</span></div>
      <div><strong>${workoutLogs.at(-1).totalSets}</strong><span>Letzte Sets</span></div>
    </div>
    <p class="helper performance-foot">Bestleistung: ${top.name}</p>
  </article>`;
}

function exerciseProgressCard() {
  const records = exerciseRecords();
  if (!records.length) return "";
  const names = [...new Set(records.map((record) => record.name))];
  if (!state.exerciseName || !names.includes(state.exerciseName)) state.exerciseName = names[0];
  const selected = records.filter((record) => record.name === state.exerciseName);
  const best = selected.reduce((top, record) => !top || record.e1rm > top.e1rm ? record : top, null);
  const latestRecord = selected.at(-1);
  const previousBest = selected.slice(0, -1).reduce((top, record) => !top || record.e1rm > top.e1rm ? record : top, null);
  const improvement = previousBest ? latestRecord.e1rm - previousBest.e1rm : 0;
  const recommendation = improvement >= 0
    ? "Nächste Einheit: Last vorsichtig steigern, wenn die Ziel-RIR sauber bleibt."
    : "Nächste Einheit: Last halten und Technik sowie Erholung priorisieren.";
  return `<article class="card performance-card">
    <div class="section-head"><div><p class="eyebrow">Übungsanalyse</p><h3>${state.exerciseName}</h3></div><strong class="goal-rate">${formatValue(best.e1rm)} e1RM</strong></div>
    <div class="exercise-tabs">${names.map((name) => `<button class="mini-chip ${name === state.exerciseName ? "active" : ""}" data-exercise="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("")}</div>
    ${chartSvg(selected.map((record) => record.e1rm), (themes[settings.theme] || themes.lime).accent)}
    <div class="log-summary">
      <div><strong>${formatValue(latestRecord.weight)}</strong><span>Letzte kg</span></div>
      <div><strong>${latestRecord.reps}</strong><span>Letzte Wdh.</span></div>
      <div><strong>${improvement >= 0 ? "+" : ""}${formatValue(improvement)}</strong><span>vs. Bestwert</span></div>
    </div>
    <p class="recommendation">${recommendation}</p>
  </article>`;
}

function measurementCard() {
  const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  if (!last) {
    return `<article class="card"><div class="section-head"><div><p class="eyebrow">Körpermaße</p><h3>Erste Messung anlegen</h3></div><button class="link-button" data-new-measurement>+ Messen</button></div><p class="helper">Taille und Umfänge helfen, Gewichtszunahme sinnvoller einzuordnen.</p></article>`;
  }
  const first = sorted[0];
  return `<article class="card measurement-card">
    <div class="section-head"><div><p class="eyebrow">Körpermaße</p><h3>${formatDate(last.date)}</h3></div><button class="link-button" data-new-measurement>+ Messen</button></div>
    <div class="measurement-grid">
      <div><strong>${formatValue(last.waist)}</strong><span>Taille cm</span><small>${last.waist - first.waist >= 0 ? "+" : ""}${formatValue(last.waist - first.waist)}</small></div>
      <div><strong>${last.arm ? formatValue(last.arm) : "-"}</strong><span>Arm cm</span></div>
      <div><strong>${last.chest ? formatValue(last.chest) : "-"}</strong><span>Brust cm</span></div>
      <div><strong>${last.thigh ? formatValue(last.thigh) : "-"}</strong><span>Bein cm</span></div>
    </div>
  </article>`;
}

function setLabel(count) {
  return count === 1 ? "Satz" : "Sätze";
}

function insightCards() {
  const overallGain = latest().weight - state.entries[0].weight;
  const slope = weeklySlope();
  const sleep = average(valuesFor("sleep", 14));
  const lastLog = workoutLogs.at(-1);
  return `
    <article class="insight"><span class="insight-mark"></span><div><strong>Aufbauverlauf</strong><p>Seit ${formatDate(state.entries[0].date)}: ${overallGain >= 0 ? "+" : ""}${formatValue(overallGain)} kg. Der 28-Tage-Trend liegt bei ${slope >= 0 ? "+" : ""}${formatValue(slope)} kg pro Woche.</p></div></article>
    <article class="insight ${sleep < 7 ? "warning" : ""}"><span class="insight-mark"></span><div><strong>Recovery-Signal</strong><p>Schlafschnitt der letzten 14 Tage: ${formatValue(sleep)} h. ${sleep >= 7 ? "Das unterstützt konsistente Leistungsentwicklung." : "Unter 7 h kann Progress und Trainingsqualität begrenzen."}</p></div></article>
    ${lastLog ? `<article class="insight"><span class="insight-mark"></span><div><strong>Letzte Leistung</strong><p>${lastLog.sessionName}: ${formatValue(lastLog.volume, 0)} kg Volumen über ${lastLog.totalSets} ${setLabel(lastLog.totalSets)}.</p></div></article>` : ""}
    <article class="insight warning"><span class="insight-mark"></span><div><strong>Interpretation</strong><p>Gewicht allein misst kein Muskelwachstum. Beziehe Kraftwerte und Körpermaße in die Bewertung ein.</p></div></article>`;
}

function weeklyReviewCard() {
  const sleep = average(valuesFor("sleep", 7));
  const energy = average(valuesFor("energy", 7));
  const logs = workoutLogs.filter((log) => log.date >= isoOffset(-7));
  const nutrition = nutritionLogs.filter((entry) => entry.date >= isoOffset(-7));
  const nutritionAverage = average(nutrition.map((entry) => entry.calories));
  const signal = sleep < 7
    ? "Regeneration zuerst: Schlaf liegt unter 7 h. Belastung halten und Schlafroutine priorisieren."
    : logs.length >= 3
      ? "Training läuft konstant. Bei sauberer RIR kann die nächste Progression geplant werden."
      : "Mehr Session-Logs machen die Leistungsbewertung der Woche belastbarer.";
  return `<article class="card weekly-review">
    <div class="section-head"><div><p class="eyebrow">Wochenfeedback</p><h3>Coach Analyse</h3></div><span class="status-pill">Diese Woche</span></div>
    <div class="review-stats">
      <div><strong>${formatValue(sleep)} h</strong><span>Schlaf Ø</span></div>
      <div><strong>${formatValue(energy)}</strong><span>Energie Ø</span></div>
      <div><strong>${logs.length}</strong><span>Sessions</span></div>
      <div><strong>${nutrition.length ? formatValue(nutritionAverage, 0) : "-"}</strong><span>kcal Ø</span></div>
    </div>
    <p class="recommendation">${signal}</p>
  </article>`;
}

function progress() {
  const config = metricConfig[state.metric];
  const values = valuesFor(state.metric, 42);
  const lastSeven = valuesFor(state.metric, 7);
  const before = state.entries.slice(-14, -7).map((entry) => entry[state.metric]).filter(Number.isFinite);
  const delta = average(lastSeven) - average(before);
  return `
    <div><p class="eyebrow">Auswertung</p><h2>Fortschritt & Trends</h2></div>
    <div class="metric-tabs">${Object.entries(metricConfig).map(([key, metric]) => `<button class="metric-tab ${key === state.metric ? "active" : ""}" data-metric="${key}">${metric.label}</button>`).join("")}</div>
    <article class="card">
      <div class="metric-row"><div><p class="eyebrow">${config.label} - 6 Wochen</p><h2>${formatValue(values.at(-1), config.digits)} <span class="unit">${config.unit}</span></h2></div><span class="trend">${delta >= 0 ? "+" : ""}${formatValue(delta, config.digits)} ${config.unit}</span></div>
      ${chartSvg(values, config.color)}
      <div class="stat-row">
        <div><strong>${formatValue(Math.min(...values), config.digits)}</strong><span>Minimum</span></div>
        <div><strong>${formatValue(average(lastSeven), config.digits)}</strong><span>Ø 7 Tage</span></div>
        <div><strong>${formatValue(Math.max(...values), config.digits)}</strong><span>Maximum</span></div>
      </div>
    </article>
    ${goalCard()}
    ${performanceCard()}
    ${exerciseProgressCard()}
    ${measurementCard()}
    ${weeklyReviewCard()}
    <section class="section"><div class="section-head"><h2>Wachstumsanalyse</h2></div>${insightCards()}</section>`;
}

function tracker() {
  const recent = [...state.entries].reverse().slice(0, 14);
  const notes = [...improvementNotes].reverse();
  return `
    <div class="section-head"><div><p class="eyebrow">Data Tracker</p><h2>Tägliche Logs</h2></div><div class="row"><button class="link-button" data-new-measurement>+ Maße</button><button class="link-button" data-new-entry>+ Check-in</button></div></div>
    <article class="card"><p class="helper">${state.entries.length} Check-ins - Datenbasis ${formatDate(state.entries[0].date)} bis ${formatDate(latest().date)}</p></article>
    ${measurementCard()}
    <article class="card feedback-card">
      <div class="section-head"><div><p class="eyebrow">App Feedback</p><h3>Verbesserungen notieren</h3></div><span class="helper">${notes.length} gespeichert</span></div>
      <form id="feedback-form" class="feedback-form">
        <label>Anmerkung<textarea name="note" rows="3" maxlength="500" placeholder="Was soll an der App verbessert werden?" required></textarea></label>
        <button class="primary-button" type="submit">Bemerkung speichern</button>
      </form>
      <p class="storage-note">Aktuell nur lokal auf diesem Gerät gespeichert. Backup unter Mehr erstellen.</p>
      <div class="feedback-list">${notes.length ? notes.map((note) => `
        <div class="feedback-item"><div class="row"><strong>${formatDate(note.date)}</strong><button type="button" class="remove-note" data-remove-note="${note.id}">Löschen</button></div><p>${escapeHtml(note.text)}</p></div>`).join("") : `<p class="helper">Noch keine Bemerkungen gespeichert.</p>`}</div>
    </article>
    ${recent.map((entry) => `<article class="day-card">
      <div><strong>${formatDate(entry.date)} ${entry.session ? `- ${entry.session}` : ""}</strong><div class="day-meta"><span>${entry.sleep ? `${formatValue(entry.sleep)} h Schlaf` : "Kein Schlaf"}</span><span>${entry.steps ? `${formatValue(entry.steps, 0)} Schritte` : "Keine Schritte"}</span>${entry.energy ? `<span>Energie ${entry.energy}/10</span>` : ""}</div></div>
      <span class="weight">${formatValue(entry.weight)} kg</span>
    </article>`).join("")}`;
}

function nutrition() {
  const start = mondayForOffset(state.nutritionWeek);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = dateFromStart(start, index);
    return { date, log: nutritionLogs.find((entry) => entry.date === date) };
  });
  const weekLogs = days.map((day) => day.log).filter(Boolean);
  const averageFor = (key) => average(weekLogs.map((entry) => entry[key]));
  const endDate = days.at(-1).date;
  return `
    <div class="section-head"><div><p class="eyebrow">Ernährung</p><h2>Makro Tracker</h2></div><button class="link-button" data-new-nutrition>+ Eintrag</button></div>
    <article class="card week-picker">
      <button class="secondary-button" data-nutrition-week="-1">&larr;</button>
      <div><p class="eyebrow">Wochenansicht</p><h3>${formatDate(days[0].date)} - ${formatDate(endDate)}</h3></div>
      <button class="secondary-button" data-nutrition-week="1">&rarr;</button>
    </article>
    <div class="macro-grid">
      <article><strong>${weekLogs.length ? formatValue(averageFor("calories"), 0) : "-"}</strong><span>kcal Ø</span></article>
      <article><strong>${weekLogs.length ? formatValue(averageFor("protein"), 0) : "-"}</strong><span>Protein Ø</span><small>Ziel ${settings.proteinTarget} g</small></article>
      <article><strong>${weekLogs.length ? formatValue(averageFor("carbs"), 0) : "-"}</strong><span>Carbs Ø</span><small>Ziel ${settings.carbsTarget} g</small></article>
      <article><strong>${weekLogs.length ? formatValue(averageFor("fat"), 0) : "-"}</strong><span>Fette Ø</span><small>Ziel ${settings.fatTarget} g</small></article>
    </div>
    <article class="card">
      <div class="section-head"><div><p class="eyebrow">Wasserziel</p><h3>${weekLogs.length ? `${formatValue(averageFor("water"))} L Ø` : "Noch offen"}</h3></div><strong class="goal-rate">${settings.waterTarget} L / Tag</strong></div>
      <div class="progress-track"><span style="width:${Math.min(100, averageFor("water") / settings.waterTarget * 100)}%"></span></div>
    </article>
    <section class="nutrition-days">${days.map(({ date, log }) => `<article class="nutrition-day">
      <div><strong>${formatDate(date)}</strong><p>${log ? `${log.calories} kcal · ${log.protein} P · ${log.carbs} C · ${log.fat} F · ${formatValue(log.water)} L` : "Noch kein Eintrag"}</p></div>
      <button class="link-button" data-edit-nutrition="${date}">${log ? "Bearbeiten" : "+"}</button>
    </article>`).join("")}</section>
    <article class="card">
      <p class="eyebrow">Synchronisierung</p>
      <p class="helper data-copy">Makro-Einträge werden aktuell lokal gespeichert. Eine spätere Datenbankversion kann Coach-Änderungen und Benachrichtigungen synchronisieren.</p>
    </article>`;
}

function peakWeek() {
  if (!settings.prepMode) {
    return `<div class="section-head"><div><p class="eyebrow">Show Day</p><h2>Peak Week</h2></div></div>
      <article class="card"><h3>Nur für Prep-Athleten sichtbar</h3><p class="helper data-copy">Aktiviere den Prep-Modus in den Einstellungen, um Peak-Week-Plan, Wasser, Salz und Tageschecklisten zu sehen.</p><button class="primary-button peak-enable" data-enable-prep>Prep-Modus aktivieren</button></article>`;
  }
  const plan = [
    { label: "Mo · -6", water: "6.0 L", salt: "normal", carbs: "230 g", cardio: "30 min", steps: "10k" },
    { label: "Di · -5", water: "6.0 L", salt: "normal", carbs: "210 g", cardio: "30 min", steps: "10k" },
    { label: "Mi · -4", water: "6.0 L", salt: "normal", carbs: "180 g", cardio: "20 min", steps: "9k" },
    { label: "Do · -3", water: "5.0 L", salt: "normal", carbs: "320 g", cardio: "Pause", steps: "8k" },
    { label: "Fr · -2", water: "4.0 L", salt: "planmäßig", carbs: "420 g", cardio: "Pause", steps: "7k" },
    { label: "Sa · -1", water: "nach Look", salt: "Coach Call", carbs: "nach Look", cardio: "Pause", steps: "locker" },
    { label: "So · Show", water: "Sip-by-Sip", salt: "festgelegt", carbs: "Pump Meals", cardio: "Stage", steps: "-" },
  ];
  const selected = plan[Math.min(6, Math.max(0, Number(localStorage.getItem("nh-peak-day") || 4)))];
  const selectedIndex = plan.indexOf(selected);
  const tasks = ["Morgengewicht dokumentieren", "Check-in Fotos senden", "Wasser & Salz abhaken", "Look/Feedback mit Coach prüfen"];
  const completed = tasks.filter((task, index) => peakChecks[`${selectedIndex}-${index}`]).length;
  return `
    <div class="section-head"><div><p class="eyebrow">Privat · Demo-Plan</p><h2>Peak Week</h2></div><span class="status-pill">${completed}/${tasks.length}</span></div>
    <div class="peak-days">${plan.map((day, index) => `<button class="peak-day ${index === selectedIndex ? "active" : ""}" data-peak-day="${index}"><span>${day.label.split(" · ")[0]}</span><strong>${day.label.split(" · ")[1]}</strong></button>`).join("")}</div>
    <article class="card peak-summary">
      <div class="section-head"><div><p class="eyebrow">Tagesplan</p><h3>${selected.label}</h3></div><span class="private-pill">Privat</span></div>
      <div class="peak-metrics">
        <div><span>Wasser</span><strong>${selected.water}</strong></div>
        <div><span>Salz</span><strong>${selected.salt}</strong></div>
        <div><span>Carbs</span><strong>${selected.carbs}</strong></div>
        <div><span>Cardio</span><strong>${selected.cardio}</strong></div>
        <div><span>Schritte</span><strong>${selected.steps}</strong></div>
      </div>
    </article>
    <article class="card checklist-card">
      <p class="eyebrow">Show Day Checkliste</p>
      ${tasks.map((task, index) => `<button class="checklist-item ${peakChecks[`${selectedIndex}-${index}`] ? "done" : ""}" data-peak-task="${selectedIndex}-${index}"><span>${peakChecks[`${selectedIndex}-${index}`] ? "✓" : ""}</span>${task}</button>`).join("")}
      <button class="secondary-button photo-cta" data-go="chat">Fotos im Chat senden</button>
    </article>`;
}

function chat() {
  const timeline = chatTimeline();
  let previousDate = "";
  return `
    <div class="chat-head">
      <button class="coach-avatar" type="button">MK</button>
      <div><p class="eyebrow">Coach Messenger</p><h2>Marco Keller</h2><span class="online-status">Online · Antwortet meist heute</span></div>
    </div>
    <article class="chat-context">
      <span>Aktuelle Phase: ${settings.phase}</span>
      <button data-go="peak">Peak Week teilen</button>
    </article>
    <section class="chat-thread">${timeline.map((message) => {
      const dateDivider = message.date !== previousDate ? `<p class="chat-date">${formatDate(message.date)}</p>` : "";
      previousDate = message.date;
      const attachment = message.attachment ? `<div class="message-attachment ${message.attachment.image ? "with-image" : ""}">${message.attachment.image ? `<img src="${message.attachment.image}" alt="Angehängtes Bild">` : `<span class="photo-mark">▧</span>`}<div><strong>${escapeHtml(message.attachment.label)}</strong><small>${message.attachment.demo ? "Beispielanhang" : "Bild gesendet"}</small></div></div>` : "";
      return `${dateDivider}<div class="message-row ${message.sender === "me" ? "mine" : ""}"><div class="message"><p>${escapeHtml(message.text)}</p>${attachment}<time>${formatDate(message.date)}</time></div></div>`;
    }).join("")}</section>
    <form id="chat-form" class="chat-composer">
      <label class="attach-button" aria-label="Bild anhängen">+
        <input name="image" type="file" accept="image/*">
      </label>
      <label class="chat-input"><input name="text" type="text" maxlength="500" placeholder="Nachricht an Coach..."></label>
      <button class="send-button" type="submit">Senden</button>
      <p class="attachment-hint" data-attachment-hint>Fotos werden lokal in diesem Demo-Chat gespeichert.</p>
    </form>`;
}

function settingsView() {
  return `
    <div class="section-head"><div><p class="eyebrow">Personalisierung</p><h2>Mehr & Einstellungen</h2></div></div>
    <article class="card settings-card">
      <p class="eyebrow">Design</p><h3>Brandcolor</h3>
      <div class="theme-grid">${Object.entries(themes).map(([key, theme]) => `<button class="theme-option ${settings.theme === key ? "active" : ""}" data-theme="${key}"><span style="background:${theme.accent}"></span>${theme.label}</button>`).join("")}</div>
    </article>
    <article class="card settings-card">
      <p class="eyebrow">Steuerung</p><h3>Aufbau & Workout</h3>
      <form id="settings-form" class="settings-form">
        <label>Aktuelle Phase
          <select name="phase"><option ${settings.phase === "Aufbau" ? "selected" : ""}>Aufbau</option><option ${settings.phase === "Cut" ? "selected" : ""}>Cut</option><option ${settings.phase === "Prep" ? "selected" : ""}>Prep</option><option ${settings.phase === "Erhaltung" ? "selected" : ""}>Erhaltung</option></select>
        </label>
        <div class="input-row">
          <label>Ziel min kg/W<input required name="goalMin" type="number" min="-1" max="2" step="0.05" value="${settings.goalMin}"></label>
          <label>Ziel max kg/W<input required name="goalMax" type="number" min="-1" max="2" step="0.05" value="${settings.goalMax}"></label>
        </div>
        <label>Pausentimer
          <select name="restSeconds"><option value="60" ${settings.restSeconds === 60 ? "selected" : ""}>60 Sekunden</option><option value="90" ${settings.restSeconds === 90 ? "selected" : ""}>90 Sekunden</option><option value="120" ${settings.restSeconds === 120 ? "selected" : ""}>120 Sekunden</option><option value="180" ${settings.restSeconds === 180 ? "selected" : ""}>180 Sekunden</option></select>
        </label>
        <label class="toggle-row"><span>Timer nach abgeschlossenem Satz automatisch starten</span><input name="autoTimer" type="checkbox" ${settings.autoTimer ? "checked" : ""}></label>
        <label class="toggle-row"><span>Peak Week Bereich für Prep anzeigen</span><input name="prepMode" type="checkbox" ${settings.prepMode ? "checked" : ""}></label>
        <p class="eyebrow setting-divider">Makroziele</p>
        <div class="target-grid">
          <label>Protein g<input required name="proteinTarget" type="number" min="0" value="${settings.proteinTarget}"></label>
          <label>Carbs g<input required name="carbsTarget" type="number" min="0" value="${settings.carbsTarget}"></label>
          <label>Fette g<input required name="fatTarget" type="number" min="0" value="${settings.fatTarget}"></label>
          <label>Wasser L<input required name="waterTarget" type="number" min="0" step="0.1" value="${settings.waterTarget}"></label>
        </div>
        <button class="primary-button" type="submit">Einstellungen speichern</button>
      </form>
    </article>
    <article class="card settings-card">
      <p class="eyebrow">Datenschutz & Backup</p><h3>Deine lokalen Daten</h3>
      <p class="helper data-copy">Neue Check-ins, Workouts, Maße, Nährwerte und Chatbilder werden derzeit nur im Browser dieses Geräts gespeichert. Deine Excel-Ausgangsdaten sind als App-Daten eingebunden.</p>
      <div class="storage-stats"><span>${savedEntries.length} Check-ins</span><span>${workoutLogs.length} Workouts</span><span>${nutritionLogs.length} Ernährung</span><span>${chatMessages.length} Chats</span></div>
      <div class="backup-actions">
        <button class="primary-button" data-export>Backup exportieren</button>
        <label class="secondary-button file-button">Backup importieren<input id="backup-file" type="file" accept="application/json"></label>
      </div>
    </article>
    <article class="card settings-card"><p class="eyebrow">Coach Ansicht</p><h3>Analyse-Dashboard</h3><p class="helper data-copy">Die separate Webansicht für Coaches zeigt Klienten, Empfehlungen und Präsentationsmodus.</p><a class="primary-link" href="coach.html">Coach Portal öffnen</a></article>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function render() {
  chartCount = 0;
  const templates = { home: dashboard, training, progress, tracker, nutrition, peak: peakWeek, chat, settings: settingsView };
  app.innerHTML = templates[state.tab]();
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.tab === state.tab));
}

function lastExerciseLog(name) {
  for (let i = workoutLogs.length - 1; i >= 0; i -= 1) {
    const match = workoutLogs[i].exercises.find((exercise) => exercise.name === name);
    if (match) return match;
  }
  return null;
}

function openWorkout(code) {
  const session = activeSessions().find((item) => item.code === code);
  workoutForm.innerHTML = `
    <div class="live-workout-head">
      <div class="dialog-header"><div><p class="eyebrow">Live Workout - Woche ${state.week}</p><h2>${workoutName(session)}</h2></div><button type="button" class="icon-button" data-close-workout aria-label="Schließen">&times;</button></div>
      <div class="timer-card"><div><p class="eyebrow">Rest Timer</p><span class="timer-display" data-timer-display>00:00</span></div><div class="timer-buttons"><button type="button" data-timer="60">60s</button><button type="button" data-timer="90">90s</button><button type="button" data-timer="120">120s</button></div></div>
      <p class="helper">Letzte Werte sind vorbefüllt. Satz abhaken startet ${settings.autoTimer ? `automatisch ${settings.restSeconds}s Pause` : "keinen automatischen Timer"}.</p>
    </div>
    <input type="hidden" name="sessionCode" value="${session.code}">
    ${session.exercises.map((exercise, exerciseIndex) => {
      const last = lastExerciseLog(exercise.name);
      const previous = last ? `Letztes Mal: ${last.sets.map((set) => `${set.weight} kg x ${set.reps}`).join(", ")}` : `${displayReps(exercise.reps)} Wdh. - Ziel RIR ${exercise.rir ?? "-"}`;
      return `<section class="log-exercise">
        <h3>${exercise.name}</h3><p class="helper">${previous}</p>
        ${Array.from({ length: exercise.sets }, (_, setIndex) => {
          const lastSet = last?.sets[setIndex] || last?.sets.at(-1);
          const weight = lastSet?.weight ?? "";
          const reps = lastSet?.reps ?? "";
          const rir = lastSet?.rir ?? exercise.rir ?? "";
          return `<div class="set-row" data-set-row>
            <button class="set-check" type="button" data-complete-set aria-label="Satz ${setIndex + 1} abschließen">S${setIndex + 1}</button>
            <label>kg<div class="step-input"><button type="button" data-adjust="w-${exerciseIndex}-${setIndex}" data-step="-2.5">-</button><input inputmode="decimal" name="w-${exerciseIndex}-${setIndex}" type="number" step="0.25" min="0" value="${weight}"><button type="button" data-adjust="w-${exerciseIndex}-${setIndex}" data-step="2.5">+</button></div></label>
            <label>Wdh.<input inputmode="numeric" name="r-${exerciseIndex}-${setIndex}" type="number" min="0" value="${reps}"></label>
            <label>RIR<input inputmode="numeric" name="rir-${exerciseIndex}-${setIndex}" type="number" min="0" max="10" value="${rir}"></label>
          </div>`;
        }).join("")}
      </section>`;
    }).join("")}
    <div class="workout-actions"><button type="button" class="secondary-button" data-close-workout>Abbrechen</button><button type="submit" class="primary-button">Workout speichern</button></div>`;
  workoutDialog.showModal();
}

function startTimer(seconds) {
  window.clearInterval(timerHandle);
  timerRemaining = seconds;
  updateTimer();
  timerHandle = window.setInterval(() => {
    timerRemaining -= 1;
    updateTimer();
    if (timerRemaining <= 0) window.clearInterval(timerHandle);
  }, 1000);
}

function updateTimer() {
  const display = workoutForm.querySelector("[data-timer-display]");
  if (!display) return;
  const minutes = String(Math.floor(Math.max(0, timerRemaining) / 60)).padStart(2, "0");
  const seconds = String(Math.max(0, timerRemaining) % 60).padStart(2, "0");
  display.textContent = `${minutes}:${seconds}`;
}

function openEntry() {
  entryForm.reset();
  entryForm.date.value = todayIso();
  entryForm.querySelectorAll("[data-rating-output]").forEach((output) => {
    output.textContent = entryForm.elements[output.dataset.ratingOutput].value;
  });
  dialog.showModal();
}

function openMeasurement() {
  measurementForm.reset();
  measurementForm.date.value = todayIso();
  measurementDialog.showModal();
}

function openNutrition(date = todayIso()) {
  nutritionForm.reset();
  nutritionForm.date.value = date;
  const existing = nutritionLogs.find((entry) => entry.date === date);
  if (existing) {
    ["calories", "protein", "carbs", "fat", "water"].forEach((key) => {
      nutritionForm.elements[key].value = existing[key] ?? "";
    });
  }
  nutritionDialog.showModal();
}

function compressChatImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const image = new Image();
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      image.src = reader.result;
    });
    reader.addEventListener("error", reject);
    image.addEventListener("load", () => {
      const scale = Math.min(1, 900 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    });
    image.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function exportBackup() {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: savedEntries,
    workouts: workoutLogs,
    measurements,
    nutrition: nutritionLogs,
    messages: chatMessages,
    peakChecks,
    notes: improvementNotes,
    settings,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `nh-training-backup-${todayIso()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  if (!file) return;
  file.text().then((text) => {
    const backup = JSON.parse(text);
    if (!Array.isArray(backup.entries) || !Array.isArray(backup.workouts)) throw new Error("invalid");
    savedEntries.splice(0, savedEntries.length, ...backup.entries);
    workoutLogs.splice(0, workoutLogs.length, ...backup.workouts);
    measurements.splice(0, measurements.length, ...(backup.measurements || []));
    nutritionLogs.splice(0, nutritionLogs.length, ...(backup.nutrition || []));
    chatMessages.splice(0, chatMessages.length, ...(backup.messages || []));
    improvementNotes.splice(0, improvementNotes.length, ...(backup.notes || []));
    Object.keys(peakChecks).forEach((key) => delete peakChecks[key]);
    Object.assign(peakChecks, backup.peakChecks || {});
    Object.assign(settings, backup.settings || {});
    localStorage.setItem("nh-training-entries", JSON.stringify(savedEntries));
    localStorage.setItem("nh-workout-logs", JSON.stringify(workoutLogs));
    localStorage.setItem("nh-body-measurements", JSON.stringify(measurements));
    localStorage.setItem("nh-nutrition-logs", JSON.stringify(nutritionLogs));
    localStorage.setItem("nh-chat-messages", JSON.stringify(chatMessages));
    localStorage.setItem("nh-peak-checks", JSON.stringify(peakChecks));
    localStorage.setItem("nh-improvement-notes", JSON.stringify(improvementNotes));
    persistSettings();
    refreshEntries();
    applyTheme();
    render();
  }).catch(() => window.alert("Dieses Backup konnte nicht importiert werden."));
}

document.querySelector(".bottom-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  state.tab = button.dataset.tab;
  render();
});

document.querySelector("[data-open-settings]").addEventListener("click", () => {
  state.tab = "settings";
  render();
});

app.addEventListener("click", (event) => {
  const link = event.target.closest("[data-go]");
  const meso = event.target.closest("[data-meso]");
  const workout = event.target.closest("[data-expand]");
  const metric = event.target.closest("[data-metric]");
  const start = event.target.closest("[data-start-session]");
  const weekShift = event.target.closest("[data-week-shift]");
  const removeNote = event.target.closest("[data-remove-note]");
  const theme = event.target.closest("[data-theme]");
  const exercise = event.target.closest("[data-exercise]");
  const nutritionWeek = event.target.closest("[data-nutrition-week]");
  const editNutrition = event.target.closest("[data-edit-nutrition]");
  const peakDay = event.target.closest("[data-peak-day]");
  const peakTask = event.target.closest("[data-peak-task]");
  if (start) return openWorkout(start.dataset.startSession);
  if (event.target.closest("[data-new-entry]")) return openEntry();
  if (event.target.closest("[data-new-measurement]")) return openMeasurement();
  if (event.target.closest("[data-new-nutrition]")) return openNutrition();
  if (editNutrition) return openNutrition(editNutrition.dataset.editNutrition);
  if (event.target.closest("[data-export]")) return exportBackup();
  if (event.target.closest("[data-enable-prep]")) {
    settings.prepMode = true;
    settings.phase = "Prep";
    persistSettings();
    return render();
  }
  if (removeNote) {
    const index = improvementNotes.findIndex((note) => note.id === removeNote.dataset.removeNote);
    if (index >= 0) improvementNotes.splice(index, 1);
    localStorage.setItem("nh-improvement-notes", JSON.stringify(improvementNotes));
    return render();
  }
  if (theme) {
    settings.theme = theme.dataset.theme;
    persistSettings();
    applyTheme();
    return render();
  }
  if (exercise) {
    state.exerciseName = exercise.dataset.exercise;
    return render();
  }
  if (nutritionWeek) {
    state.nutritionWeek += Number(nutritionWeek.dataset.nutritionWeek);
    return render();
  }
  if (peakDay) {
    localStorage.setItem("nh-peak-day", peakDay.dataset.peakDay);
    return render();
  }
  if (peakTask) {
    const key = peakTask.dataset.peakTask;
    peakChecks[key] = !peakChecks[key];
    localStorage.setItem("nh-peak-checks", JSON.stringify(peakChecks));
    return render();
  }
  if (link) state.tab = link.dataset.go;
  if (meso) {
    state.meso = Number(meso.dataset.meso);
    localStorage.setItem("nh-active-meso", String(state.meso));
  }
  if (weekShift) {
    state.week = Math.max(1, Math.min(9, state.week + Number(weekShift.dataset.weekShift)));
    localStorage.setItem("nh-active-week", String(state.week));
  }
  if (workout) workout.closest(".workout-card").classList.toggle("open");
  if (metric) state.metric = metric.dataset.metric;
  if (link || meso || weekShift || metric) render();
});

app.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.target.id === "feedback-form") {
    const noteText = new FormData(event.target).get("note").trim();
    if (!noteText) return;
    improvementNotes.push({ id: String(Date.now()), date: todayIso(), text: noteText });
    localStorage.setItem("nh-improvement-notes", JSON.stringify(improvementNotes));
    render();
  }
  if (event.target.id === "settings-form") {
    const form = new FormData(event.target);
    settings.phase = form.get("phase");
    settings.goalMin = Number(form.get("goalMin"));
    settings.goalMax = Math.max(settings.goalMin, Number(form.get("goalMax")));
    settings.restSeconds = Number(form.get("restSeconds"));
    settings.autoTimer = form.has("autoTimer");
    settings.prepMode = form.has("prepMode");
    settings.proteinTarget = Number(form.get("proteinTarget"));
    settings.carbsTarget = Number(form.get("carbsTarget"));
    settings.fatTarget = Number(form.get("fatTarget"));
    settings.waterTarget = Number(form.get("waterTarget"));
    persistSettings();
    render();
  }
  if (event.target.id === "chat-form") {
    const form = new FormData(event.target);
    const file = event.target.elements.image.files[0];
    const text = String(form.get("text") || "").trim();
    if (!text && !file) return;
    let image = null;
    try {
      image = await compressChatImage(file);
    } catch (error) {
      window.alert("Das Bild konnte nicht verarbeitet werden.");
      return;
    }
    chatMessages.push({
      id: String(Date.now()),
      date: todayIso(),
      sender: "me",
      text: text || "Check-in Bild gesendet.",
      attachment: image ? { label: file.name, image } : null,
    });
    try {
      localStorage.setItem("nh-chat-messages", JSON.stringify(chatMessages));
    } catch (error) {
      chatMessages.pop();
      window.alert("Das Bild ist zu groß für den lokalen Speicher. Bitte ein kleineres Foto wählen.");
    }
    render();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.id === "backup-file") importBackup(event.target.files[0]);
  if (event.target.name === "image" && event.target.closest("#chat-form")) {
    const hint = event.target.closest("#chat-form").querySelector("[data-attachment-hint]");
    hint.textContent = event.target.files[0] ? `Bereit: ${event.target.files[0].name}` : "Fotos werden lokal in diesem Demo-Chat gespeichert.";
  }
});

entryForm.addEventListener("input", (event) => {
  const output = entryForm.querySelector(`[data-rating-output="${event.target.name}"]`);
  if (output) output.textContent = event.target.value;
});

document.querySelector("[data-close-dialog]").addEventListener("click", () => dialog.close());
document.querySelector("[data-close-measurement]").addEventListener("click", () => measurementDialog.close());
document.querySelector("[data-close-nutrition]").addEventListener("click", () => nutritionDialog.close());

entryForm.addEventListener("submit", () => {
  const form = new FormData(entryForm);
  savedEntries.push({
    date: form.get("date"),
    weight: Number(form.get("weight")),
    sleep: form.get("sleep") ? Number(form.get("sleep")) : null,
    calories: form.get("calories") ? Number(form.get("calories")) : null,
    steps: form.get("steps") ? Number(form.get("steps")) : null,
    energy: Number(form.get("energy")),
    stress: Number(form.get("stress")),
    digestion: Number(form.get("digestion")),
    sessionRating: Number(form.get("sessionRating")),
    session: form.get("session") || null,
  });
  localStorage.setItem("nh-training-entries", JSON.stringify(savedEntries));
  refreshEntries();
  state.tab = "tracker";
  render();
});

measurementForm.addEventListener("submit", () => {
  const form = new FormData(measurementForm);
  measurements.push({
    date: form.get("date"),
    waist: Number(form.get("waist")),
    arm: form.get("arm") ? Number(form.get("arm")) : null,
    chest: form.get("chest") ? Number(form.get("chest")) : null,
    thigh: form.get("thigh") ? Number(form.get("thigh")) : null,
    note: form.get("note") || "",
  });
  localStorage.setItem("nh-body-measurements", JSON.stringify(measurements));
  state.tab = "progress";
  render();
});

nutritionForm.addEventListener("submit", () => {
  const form = new FormData(nutritionForm);
  const entry = {
    date: form.get("date"),
    calories: Number(form.get("calories")),
    protein: Number(form.get("protein")),
    carbs: Number(form.get("carbs")),
    fat: Number(form.get("fat")),
    water: form.get("water") ? Number(form.get("water")) : 0,
  };
  const existingIndex = nutritionLogs.findIndex((log) => log.date === entry.date);
  if (existingIndex >= 0) nutritionLogs[existingIndex] = entry;
  else nutritionLogs.push(entry);
  localStorage.setItem("nh-nutrition-logs", JSON.stringify(nutritionLogs));
  state.tab = "nutrition";
  render();
});

workoutForm.addEventListener("click", (event) => {
  const timer = event.target.closest("[data-timer]");
  const complete = event.target.closest("[data-complete-set]");
  const adjust = event.target.closest("[data-adjust]");
  if (timer) startTimer(Number(timer.dataset.timer));
  if (complete) {
    complete.classList.toggle("complete");
    complete.closest("[data-set-row]").classList.toggle("complete", complete.classList.contains("complete"));
    if (complete.classList.contains("complete") && settings.autoTimer) startTimer(settings.restSeconds);
  }
  if (adjust) {
    const input = workoutForm.elements[adjust.dataset.adjust];
    const current = Number(input.value || 0);
    input.value = Math.max(0, current + Number(adjust.dataset.step));
  }
  if (event.target.closest("[data-close-workout]")) {
    window.clearInterval(timerHandle);
    workoutDialog.close();
  }
});

workoutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(workoutForm);
  const session = activeSessions().find((item) => item.code === form.get("sessionCode"));
  const exercises = session.exercises.map((exercise, exerciseIndex) => ({
    name: exercise.name,
    group: exercise.group,
    sets: Array.from({ length: exercise.sets }, (_, setIndex) => ({
      weight: Number(form.get(`w-${exerciseIndex}-${setIndex}`)),
      reps: Number(form.get(`r-${exerciseIndex}-${setIndex}`)),
      rir: Number(form.get(`rir-${exerciseIndex}-${setIndex}`)),
    })).filter((set) => set.weight > 0 && set.reps > 0),
  })).filter((exercise) => exercise.sets.length);
  const totalSets = sum(exercises.map((exercise) => exercise.sets.length));
  if (!totalSets) return;
  workoutLogs.push({
    date: todayIso(),
    meso: state.meso,
    week: state.week,
    sessionCode: session.code,
    sessionName: workoutName(session),
    exercises,
    totalSets,
    volume: sum(exercises.flatMap((exercise) => exercise.sets.map((set) => set.weight * set.reps))),
  });
  localStorage.setItem("nh-workout-logs", JSON.stringify(workoutLogs));
  window.clearInterval(timerHandle);
  workoutDialog.close();
  state.tab = "progress";
  render();
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

refreshEntries();
applyTheme();
render();
