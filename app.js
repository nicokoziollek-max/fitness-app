const sourceData = window.FITNESS_DATA;

function readStore(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch (error) {
    return fallback;
  }
}

const workoutLogs = readStore("nh-workout-logs", []);
const savedEntries = readStore("nh-training-entries", []);
const trackerEdits = readStore("nh-tracker-edits", {});
const nutritionLogs = readStore("nh-nutrition-logs", []);
const chatMessages = readStore("nh-chat-messages", []);
const settings = Object.assign({
  theme: "lime",
  phase: "Aufbau",
  cycleWeeks: 12,
  restSeconds: 90,
  autoTimer: true,
  calorieTarget: 2500,
  proteinTarget: 180,
  carbsTarget: 350,
  fatsTarget: 70,
  waterTarget: 4,
}, readStore("nh-client-settings", {}));

const themes = {
  lime: { label: "Neon", accent: "#b7f348", rgb: "183, 243, 72", dark: "#102005" },
  cyan: { label: "Aqua", accent: "#53e3d3", rgb: "83, 227, 211", dark: "#052321" },
  blue: { label: "Ice", accent: "#78a9ff", rgb: "120, 169, 255", dark: "#09162b" },
  orange: { label: "Ember", accent: "#ffab5c", rgb: "255, 171, 92", dark: "#281407" },
};

const state = {
  tab: "home",
  meso: Number(localStorage.getItem("nh-active-meso") || 4),
  week: Number(localStorage.getItem("nh-active-week") || 1),
  trackerView: "day",
  selectedDate: todayIso(),
  chatExpanded: false,
  entries: [],
};

const app = document.getElementById("app");
const workoutDialog = document.getElementById("workout-dialog");
const workoutForm = document.getElementById("workout-form");
let timerHandle = null;
let timerRemaining = 0;
let chartCount = 0;
let pullStartY = null;

function todayIso() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dateShift(date, offset) {
  const shifted = new Date(`${date}T12:00:00`);
  shifted.setDate(shifted.getDate() + offset);
  return shifted.toISOString().slice(0, 10);
}

function formatDate(date, long = false) {
  return new Intl.DateTimeFormat("de-DE", long
    ? { weekday: "short", day: "2-digit", month: "short" }
    : { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`));
}

function formatValue(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function average(values) {
  const usable = values.filter((value) => value !== null && value !== "" && Number.isFinite(Number(value)));
  return usable.length ? sum(usable) / usable.length : null;
}

function calculateCalories(entry) {
  if (![entry.protein, entry.carbs, entry.fats ?? entry.fat].some((value) => Number.isFinite(Number(value)))) return null;
  const protein = Number(entry.protein || 0);
  const carbs = Number(entry.carbs || 0);
  const fats = Number(entry.fats || entry.fat || 0);
  return protein * 4.1 + carbs * 4.1 + fats * 9.3;
}

function percentOf(actual, target) {
  return target && Number.isFinite(Number(actual)) ? Math.round(Number(actual) / Number(target) * 100) : 0;
}

function remainingOf(actual, target, digits = 0) {
  const remaining = Number(target) - Number(actual || 0);
  return `${remaining < 0 ? "+" : ""}${formatValue(Math.abs(remaining), digits)}`;
}

function refreshEntries() {
  const records = new Map();
  sourceData.dailyEntries.forEach((entry) => records.set(entry.date, { ...entry }));
  savedEntries.forEach((entry) => records.set(entry.date, { ...(records.get(entry.date) || {}), ...entry }));
  nutritionLogs.filter((entry) => entry.date).forEach((entry) => records.set(entry.date, { date: entry.date, ...(records.get(entry.date) || {}), ...entry, fats: entry.fat ?? entry.fats }));
  Object.entries(trackerEdits).forEach(([date, entry]) => records.set(date, { date, ...(records.get(date) || {}), ...entry }));
  if (!records.has(todayIso())) records.set(todayIso(), { date: todayIso() });
  state.entries = [...records.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function entryFor(date) {
  return state.entries.find((entry) => entry.date === date) || { date };
}

function latestEntry() {
  return [...state.entries].reverse().find((entry) => Number.isFinite(entry.weight)) || state.entries.at(-1);
}

function saveTrackerField(date, field, rawValue) {
  const value = rawValue === "" ? null : Number(rawValue);
  trackerEdits[date] = { ...(trackerEdits[date] || {}), [field]: value };
  if (field === "fat") {
    trackerEdits[date].fats = value;
    delete trackerEdits[date].fat;
  }
  localStorage.setItem("nh-tracker-edits", JSON.stringify(trackerEdits));
  refreshEntries();
}

function persistSettings() {
  localStorage.setItem("nh-client-settings", JSON.stringify(settings));
}

function applyTheme() {
  const theme = themes[settings.theme] || themes.lime;
  document.documentElement.style.setProperty("--accent", theme.accent);
  document.documentElement.style.setProperty("--accent-rgb", theme.rgb);
  document.documentElement.style.setProperty("--accent-dark", theme.dark);
}

function currentPlan() {
  return sourceData.mesocycles.find((meso) => meso.id === state.meso) || sourceData.mesocycles.at(-1);
}

function activeSessions() {
  return currentPlan().sessions.filter((session) => session.exercises.length);
}

function workoutName(session) {
  return session?.name === "Rest" && session.exercises.length ? `Workout ${session.code}` : session?.name || "Rest Day";
}

function displayReps(reps) {
  const serial = Number(reps);
  if (serial > 40000) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return `${date.getUTCDate()}-${date.getUTCMonth() + 1}`;
  }
  return reps;
}

function weekLogs() {
  return workoutLogs.filter((log) => log.meso === state.meso && log.week === state.week);
}

function todaysSession() {
  const sessions = activeSessions();
  const completed = new Set(weekLogs().map((log) => log.sessionCode));
  return sessions.find((session) => !completed.has(session.code)) || sessions[0];
}

function scheduleForSevenDays() {
  const sessions = activeSessions();
  const pattern = [sessions[0], sessions[1], null, sessions[2], sessions[3], null, sessions[4]];
  return pattern.map((session, index) => ({ date: dateShift(todayIso(), index), session }));
}

function chartSvg(values, color = "var(--accent)", small = false) {
  const usable = values.filter((value) => value !== null && value !== "").map((value) => Number(value)).filter(Number.isFinite);
  if (!usable.length) return `<div class="empty-chart">Keine Daten</div>`;
  chartCount += 1;
  const id = `fill-${chartCount}`;
  const width = 330;
  const height = small ? 48 : 82;
  const pad = 5;
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const range = max - min || 1;
  const points = usable.map((value, index) => {
    const x = pad + index * (width - pad * 2) / Math.max(usable.length - 1, 1);
    const y = height - pad - (value - min) / range * (height - pad * 2);
    return [x, y];
  });
  const line = points.map((point) => point.join(",")).join(" ");
  const area = `${points[0][0]},${height} ${line} ${points.at(-1)[0]},${height}`;
  return `<svg class="spark-chart ${small ? "small" : ""}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <defs><linearGradient id="${id}" y2="1"><stop stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${area}" fill="url(#${id})"></polygon>
    <polyline points="${line}" style="stroke:${color}"></polyline>
    <circle cx="${points.at(-1)[0]}" cy="${points.at(-1)[1]}" r="4" style="fill:${color}"></circle>
  </svg>`;
}

function pageTitle(eyebrow, title, action = "") {
  return `<div class="page-title"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div>${action}</div>`;
}

function dashboard() {
  const entry = entryFor(todayIso());
  const display = Number.isFinite(entry.weight) ? entry : latestEntry();
  const session = todaysSession();
  const calories = calculateCalories(entry);
  return `
    ${pageTitle(settings.phase, "Heute")}
    <article class="today-hero premium-card">
      <div class="today-weight"><p class="eyebrow">Gewicht</p><strong>${formatValue(display.weight)} <small>kg</small></strong><span>${formatDate(display.date, true)}</span></div>
      ${chartSvg(state.entries.slice(-14).map((item) => item.weight), "var(--accent)", true)}
    </article>
    <article class="focus-workout premium-card">
      <div class="card-top"><p class="eyebrow">Heutige Einheit</p><button class="ghost-link" data-go="training">Plan</button></div>
      <h3>${workoutName(session)}</h3>
      <p>${session.exercises.length} Übungen · ${sum(session.exercises.map((exercise) => exercise.sets))} Sätze</p>
      <button class="primary-button" data-start-session="${session.code}">Training starten</button>
    </article>
    <div class="today-grid">
      <button class="metric-tile" data-go="tracker"><span>Kalorien</span><strong>${calories ? formatValue(calories, 0) : "-"}</strong><small>kcal</small></button>
      <button class="metric-tile" data-go="tracker"><span>Wasser</span><strong>${formatValue(entry.water)}</strong><small>Liter</small></button>
      <button class="metric-tile" data-go="tracker"><span>Schritte</span><strong>${formatValue(entry.steps, 0)}</strong><small>Steps</small></button>
      <button class="metric-tile" data-go="tracker"><span>Schlaf</span><strong>${formatValue(entry.sleep)}</strong><small>Stunden</small></button>
    </div>
    <button class="quick-track" data-go="tracker"><span>Data Tracker</span><strong>Heutige Werte eintragen</strong><span class="arrow">→</span></button>`;
}

function trackerNumber(field, value, unit, step = "1") {
  return `<label class="inline-input"><input data-track-input="${field}" type="number" inputmode="decimal" step="${step}" value="${Number.isFinite(Number(value)) ? value : ""}" placeholder="-"><span>${unit}</span></label>`;
}

function qualitySlider(label, field, value) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : 5;
  return `<label class="quality-row">
    <div><strong>${label}</strong><output data-slider-output="${field}">${numeric}</output></div>
    <input class="glow-slider" data-track-input="${field}" type="range" min="1" max="10" value="${numeric}">
  </label>`;
}

function trackerDay() {
  const entry = entryFor(state.selectedDate);
  const calories = calculateCalories(entry);
  const caloriePercent = Math.min(100, percentOf(calories, settings.calorieTarget));
  const nutrients = [
    { label: "Proteine", field: "protein", value: entry.protein, target: settings.proteinTarget, unit: "g" },
    { label: "Kohlenhydrate", field: "carbs", value: entry.carbs, target: settings.carbsTarget, unit: "g" },
    { label: "Fette", field: "fats", value: entry.fats, target: settings.fatsTarget, unit: "g" },
    { label: "Wasser", field: "water", value: entry.water, target: settings.waterTarget, unit: "l", step: "0.1" },
  ];
  return `
    <article class="macro-card premium-card">
      <div class="card-top"><p class="eyebrow">Nährwerte & Wasser</p><span class="edit-icon">✎</span></div>
      <div class="nutrition-layout">
        <div class="calorie-ring" data-calorie-ring style="--progress:${caloriePercent}%">
          <div><strong data-calorie-total>${formatValue(calories, 0)}</strong><small>kcal</small><span data-calorie-percent>${percentOf(calories, settings.calorieTarget)} %</span></div>
        </div>
        <div class="nutrient-rows">
          ${nutrients.map((item) => `<div class="nutrient-row" data-nutrient-row="${item.field}">
            <span class="nutrient-name">${item.label}</span>
            <label><input data-track-input="${item.field}" type="number" step="${item.step || "1"}" value="${Number.isFinite(Number(item.value)) ? item.value : ""}" placeholder="-"><small>${item.unit}</small></label>
            <div class="target-data"><strong><span data-actual="${item.field}">${formatValue(item.value, item.step ? 1 : 0)}</span> / ${formatValue(item.target, item.step ? 1 : 0)} ${item.unit}</strong><em data-rest="${item.field}">Rest ${remainingOf(item.value, item.target, item.step ? 1 : 0)} ${item.unit}</em></div>
          </div>`).join("")}
        </div>
      </div>
      <div class="calorie-target"><span>Ziel ${formatValue(settings.calorieTarget, 0)} kcal</span><span data-calorie-rest>Rest ${remainingOf(calories, settings.calorieTarget)} kcal</span></div>
      <p class="formula">Kalorien: (Proteine × 4,1) + (Kohlenhydrate × 4,1) + (Fette × 9,3)</p>
    </article>
    <div class="body-input-grid daily-parameters">
      <article class="data-card"><div class="card-top"><span>Schritte</span><i>✎</i></div><b>⌁</b>${trackerNumber("steps", entry.steps, "", "1")}</article>
      <article class="data-card"><div class="card-top"><span>Gewicht</span><i>✎</i></div><b>▣</b>${trackerNumber("weight", entry.weight, "kg", "0.1")}</article>
      <article class="data-card sleep-card"><div class="card-top"><span>Schlaf</span><i>✎</i></div>${trackerNumber("sleep", entry.sleep, "h", "0.1")}<div class="sleep-quality-inline">${trackerNumber("sleepQuality", entry.sleepQuality, "/10", "1")}<small>Qualität</small></div></article>
    </div>
    <article class="quality-card premium-card">
      <div class="quality-grid">
        ${qualitySlider("Verdauungsqualität", "digestion", entry.digestion)}
        ${qualitySlider("Energielevel", "energy", entry.energy)}
        ${qualitySlider("Stresslevel", "stress", entry.stress)}
        ${qualitySlider("Trainingsqualität", "sessionRating", entry.sessionRating)}
        <div class="wide-quality">${qualitySlider("Qualität des Essens", "foodQuality", entry.foodQuality ?? entry.appetite)}</div>
      </div>
    </article>
    <button class="edit-all-button" data-edit-all><span>✎</span> Alle Einträge bearbeiten</button>
    <p class="save-status" data-save-status>Änderungen speichern automatisch</p>`;
}

function weeklyDates() {
  const current = new Date(`${state.selectedDate}T12:00:00`);
  const day = current.getDay() || 7;
  const monday = dateShift(state.selectedDate, 1 - day);
  return Array.from({ length: 7 }, (_, index) => dateShift(monday, index));
}

function weeklyMetricCard(label, values, unit, digits, color) {
  return `<article class="week-metric premium-card">
    <div class="card-top"><span>${label}</span><strong>${formatValue(average(values), digits)} <small>${unit}</small></strong></div>
    ${chartSvg(values, color, true)}
  </article>`;
}

function trackerWeek() {
  const dates = weeklyDates();
  const entries = dates.map(entryFor);
  const summaryRows = [
    { label: "Kalorien", values: entries.map(calculateCalories), target: settings.calorieTarget, unit: "kcal", digits: 0 },
    { label: "Proteine", values: entries.map((entry) => entry.protein), target: settings.proteinTarget, unit: "g", digits: 0 },
    { label: "Kohlenhydrate", values: entries.map((entry) => entry.carbs), target: settings.carbsTarget, unit: "g", digits: 0 },
    { label: "Fette", values: entries.map((entry) => entry.fats), target: settings.fatsTarget, unit: "g", digits: 0 },
    { label: "Wasser", values: entries.map((entry) => entry.water), target: settings.waterTarget, unit: "l", digits: 1 },
  ];
  return `
    <div class="week-days premium-card">${dates.map((date, index) => {
      const entry = entryFor(date);
      const missing = !Number.isFinite(Number(entry.protein)) && !Number.isFinite(Number(entry.weight));
      const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(new Date(`${date}T12:00:00`));
      return `<button class="${date === state.selectedDate ? "active" : ""} ${missing ? "missing" : ""}" data-select-date="${date}"><span>${weekday}</span><strong>${new Date(`${date}T12:00:00`).getDate()}.</strong><i></i></button>`;
    }).join("")}</div>
    <article class="weekly-summary premium-card">
      <div class="card-top"><div><p class="eyebrow">Wochenzusammenfassung</p><h3>Nährwerte · Durchschnitt pro Tag</h3></div><small>Ziel (Coach)</small></div>
      ${summaryRows.map((row) => {
        const value = average(row.values);
        const pct = percentOf(value, row.target);
        return `<div class="target-row"><span>${row.label}</span><div class="target-bar"><i style="width:${Math.min(100, pct)}%"></i></div><strong>${formatValue(value, row.digits)} ${row.unit}</strong><em>/ ${formatValue(row.target, row.digits)} ${row.unit}</em><b>${pct} %</b></div>`;
      }).join("")}
    </article>
    <article class="premium-card weekly-body">
      <p class="eyebrow">Körper & Aktivität</p>
      <div class="weekly-metrics">
        ${weeklyMetricCard("Schritte", entries.map((entry) => entry.steps), "", 0, "var(--accent)")}
        ${weeklyMetricCard("Gewicht", entries.map((entry) => entry.weight), "kg", 1, "var(--accent)")}
        ${weeklyMetricCard("Schlafdauer", entries.map((entry) => entry.sleep), "h", 1, "#d9e6d5")}
        ${weeklyMetricCard("Schlafqualität", entries.map((entry) => entry.sleepQuality), "/10", 1, "var(--accent)")}
        ${weeklyMetricCard("Energielevel", entries.map((entry) => entry.energy), "/10", 1, "var(--accent)")}
        ${weeklyMetricCard("Stresslevel", entries.map((entry) => entry.stress), "/10", 1, "#d9e6d5")}
        ${weeklyMetricCard("Trainingsqualität", entries.map((entry) => entry.sessionRating), "/10", 1, "var(--accent)")}
        ${weeklyMetricCard("Qualität des Essens", entries.map((entry) => entry.foodQuality ?? entry.appetite), "/10", 1, "var(--accent)")}
      </div>
    </article>
    <article class="comparison-card premium-card">
      <div class="card-top"><p class="eyebrow">Tageswerte</p><span class="edit-tag">Fehlende Einträge markiert</span></div>
      ${dates.map((date) => {
        const entry = entryFor(date);
        const missing = !Number.isFinite(Number(entry.protein)) && !Number.isFinite(Number(entry.weight));
        return `<button class="day-compare ${missing ? "missing" : ""}" data-select-date="${date}">
          <strong>${formatDate(date)}</strong><span>${formatValue(entry.weight)} kg</span><span>${formatValue(calculateCalories(entry), 0)} kcal</span><span>${missing ? "Fehlt" : "Öffnen"}</span>
        </button>`;
      }).join("")}
    </article>`;
}

function trackerHeader() {
  const dates = weeklyDates();
  const title = state.trackerView === "day"
    ? `${state.selectedDate === todayIso() ? "Heute, " : ""}${new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${state.selectedDate}T12:00:00`))}`
    : `Woche ${new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(new Date(`${dates[0]}T12:00:00`))} – ${new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${dates.at(-1)}T12:00:00`))}`;
  return `<header class="tracker-header">
    <p class="eyebrow">Data Tracker</p>
    <div><h2 class="${state.trackerView === "week" ? "week-title" : ""}">${title} <small>⌄</small></h2><label class="calendar-button" aria-label="Datum wählen">□<input data-date-picker type="date" value="${state.selectedDate}"></label></div>
  </header>`;
}

function tracker() {
  return `
    ${trackerHeader()}
    <div class="view-toggle"><button class="${state.trackerView === "day" ? "active" : ""}" data-tracker-view="day">Tagessicht</button><button class="${state.trackerView === "week" ? "active" : ""}" data-tracker-view="week">Wochenansicht</button></div>
    ${state.trackerView === "day" ? trackerDay() : trackerWeek()}`;
}

function training() {
  const session = todaysSession();
  const totalSets = sum(session.exercises.map((exercise) => exercise.sets));
  const schedule = scheduleForSevenDays();
  const cycleWeeks = Math.max(1, Number(settings.cycleWeeks) || 12);
  return `
    ${pageTitle("Workout Plan", "Training")}
    <article class="training-hero premium-card">
      <p class="eyebrow">Heutige Einheit</p>
      <h2>${workoutName(session)}</h2>
      <p>${session.exercises.length} Übungen · ${totalSets} Sätze</p>
      <div class="exercise-preview">${session.exercises.map((exercise) => `<span>${exercise.name}</span>`).join("")}</div>
      <button class="primary-button" data-start-session="${session.code}">Workout starten</button>
    </article>
    <section class="outlook">
      <div class="card-top"><div><p class="eyebrow">Ausblick</p><h3>Nächste 7 Tage</h3></div></div>
      <div class="schedule-strip">${schedule.map(({ date, session: item }, index) => `<article class="schedule-day ${index === 0 ? "today" : ""}">
        <span>${new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(new Date(`${date}T12:00:00`))}</span>
        <strong>${item ? item.code : "Rest"}</strong>
        <small>${item ? workoutName(item) : "Ruhetag"}</small>
      </article>`).join("")}</div>
    </section>
    <article class="cycle-card premium-card">
      <div class="card-top"><div><p class="eyebrow">Zyklus</p><h3>Woche ${state.week} von ${cycleWeeks}</h3></div><label class="cycle-edit">Dauer <input data-cycle-weeks type="number" min="1" max="52" value="${cycleWeeks}"> W</label></div>
      <div class="progress-track"><span style="width:${Math.min(100, state.week / cycleWeeks * 100)}%"></span></div>
      <div class="cycle-controls"><button data-week-shift="-1">Vorherige Woche</button><button data-week-shift="1">Nächste Woche</button></div>
    </article>
    <section class="session-list">${activeSessions().map((item) => `<article class="session-row"><span class="session-code">${item.code}</span><div><strong>${workoutName(item)}</strong><small>${sum(item.exercises.map((exercise) => exercise.sets))} Sätze · ${item.exercises.length} Übungen</small></div><button data-start-session="${item.code}">Start</button></article>`).join("")}</section>`;
}

function trainingAnalysis() {
  const plan = currentPlan();
  const groups = Object.entries(plan.weeklySets).filter(([, sets]) => sets > 0);
  const totalSets = sum(groups.map(([, sets]) => sets));
  const recent = workoutLogs.slice(-8);
  const frequency = activeSessions().length;
  const volume = sum(workoutLogs.map((log) => log.volume));
  return `
    ${pageTitle("Training Data", "Trainingsanalyse")}
    <div class="analysis-stats">
      <article><span>Volumen gesamt</span><strong>${formatValue(volume, 0)}</strong><small>kg</small></article>
      <article><span>Sätze / Woche</span><strong>${totalSets}</strong><small>Sätze</small></article>
      <article><span>Frequenz</span><strong>${frequency}</strong><small>Einheiten / W</small></article>
    </div>
    <article class="premium-card volume-card">
      <div class="card-top"><div><p class="eyebrow">Trainingsvolumen</p><h3>Letzte Einheiten</h3></div><span>${recent.length} Logs</span></div>
      ${chartSvg(recent.map((log) => log.volume), "var(--accent)")}
    </article>
    <article class="premium-card distribution-card">
      <div class="card-top"><div><p class="eyebrow">Muskelgruppen</p><h3>Satzverteilung pro Woche</h3></div></div>
      ${groups.map(([group, sets]) => `<div class="distribution-row"><span>${group}</span><div><i style="width:${sets / Math.max(...groups.map((entry) => entry[1])) * 100}%"></i></div><strong>${sets}</strong></div>`).join("")}
    </article>
    <p class="data-only-note">Nur erfasste Trainingsdaten</p>`;
}

function calendar() {
  const schedule = scheduleForSevenDays();
  const loggedDates = new Set(state.entries.filter((entry) => Number.isFinite(entry.weight)).map((entry) => entry.date));
  return `
    ${pageTitle("Plan & Logs", "Kalender")}
    <article class="premium-card calendar-week">
      <p class="eyebrow">Nächste 7 Tage</p>
      ${schedule.map(({ date, session }, index) => `<div class="calendar-row ${index === 0 ? "today" : ""}">
        <div><strong>${formatDate(date, true)}</strong><span>${session ? workoutName(session) : "Ruhetag"}</span></div>
        <small>${session ? `${sum(session.exercises.map((exercise) => exercise.sets))} Sätze` : "Recovery"}</small>
      </div>`).join("")}
    </article>
    <article class="premium-card log-calendar">
      <div class="card-top"><p class="eyebrow">Tracking History</p><strong>${loggedDates.size} Tage</strong></div>
      <div class="history-dots">${state.entries.slice(-28).map((entry) => `<button class="${loggedDates.has(entry.date) ? "logged" : ""}" data-select-date="${entry.date}" title="${formatDate(entry.date)}"></button>`).join("")}</div>
      <button class="secondary-wide" data-go="tracker">Daten öffnen</button>
    </article>`;
}

function chatTimeline() {
  const demo = [
    { id: "1", date: dateShift(todayIso(), -18), sender: "coach", text: "Check-in erhalten. Dein neuer Plan ist hochgeladen." },
    { id: "2", date: dateShift(todayIso(), -10), sender: "me", text: "Perfekt, ich logge die nächste Einheit direkt in der App." },
    { id: "3", date: dateShift(todayIso(), -3), sender: "coach", text: "Bitte sende beim nächsten Check-in deine Fotos mit.", attachment: { label: "Check-in Guide", demo: true } },
  ];
  return [...demo, ...chatMessages].sort((a, b) => a.date.localeCompare(b.date));
}

function chat() {
  const messages = state.chatExpanded ? chatTimeline() : chatTimeline().slice(-4);
  return `
    ${pageTitle("Inbox", "Coach Chat", `<button class="back-button" data-go="profile">Zurück</button>`)}
    ${!state.chatExpanded && chatTimeline().length > messages.length ? `<button class="history-button" data-show-history>Ältere Nachrichten</button>` : ""}
    <section class="chat-thread">${messages.map((message) => `<div class="message-row ${message.sender === "me" ? "mine" : ""}"><div class="message"><p>${escapeHtml(message.text)}</p>${message.attachment ? `<div class="message-attachment">${message.attachment.image ? `<img src="${message.attachment.image}" alt="Bildanhang">` : `<span>▧</span>`}<small>${escapeHtml(message.attachment.label)}</small></div>` : ""}<time>${formatDate(message.date)}</time></div></div>`).join("")}</section>
    <form id="chat-form" class="chat-composer"><label class="attach-button">+<input name="image" type="file" accept="image/*"></label><input name="text" placeholder="Nachricht schreiben..."><button class="send-button" type="submit">Senden</button></form>`;
}

function profile() {
  const theme = themes[settings.theme] || themes.lime;
  return `
    ${pageTitle("Account", "Profil")}
    <article class="profile-card premium-card"><img src="assets/profile-nicolas.jpg" alt=""><div><h3>Nicolas Hollendung</h3><p>${settings.phase} · Athlete Account</p></div></article>
    <button class="inbox-card premium-card" data-go="chat"><div><p class="eyebrow">Kommunikation</p><h3>Coach Chat</h3><small>Nachrichten & Bilder senden</small></div><span>→</span></button>
    <article class="premium-card profile-settings">
      <p class="eyebrow">Einstellungen</p>
      <label>Phase<select data-setting="phase"><option ${settings.phase === "Aufbau" ? "selected" : ""}>Aufbau</option><option ${settings.phase === "Cut" ? "selected" : ""}>Cut</option><option ${settings.phase === "Prep" ? "selected" : ""}>Prep</option><option ${settings.phase === "Erhaltung" ? "selected" : ""}>Erhaltung</option></select></label>
      <div class="coach-targets">
        <p class="eyebrow">Coach Vorgaben · Tagesziele</p>
        <div>
          <label>Kalorien<input data-setting-number="calorieTarget" type="number" value="${settings.calorieTarget}"><small>kcal</small></label>
          <label>Proteine<input data-setting-number="proteinTarget" type="number" value="${settings.proteinTarget}"><small>g</small></label>
          <label>Carbs<input data-setting-number="carbsTarget" type="number" value="${settings.carbsTarget}"><small>g</small></label>
          <label>Fette<input data-setting-number="fatsTarget" type="number" value="${settings.fatsTarget}"><small>g</small></label>
          <label>Wasser<input data-setting-number="waterTarget" type="number" step="0.1" value="${settings.waterTarget}"><small>l</small></label>
        </div>
      </div>
      <div class="theme-grid">${Object.entries(themes).map(([key, item]) => `<button class="${settings.theme === key ? "active" : ""}" data-theme="${key}"><i style="background:${item.accent}"></i>${item.label}</button>`).join("")}</div>
      <p class="storage-copy">Neue Eingaben werden lokal auf diesem Gerät gespeichert.</p>
      <button class="secondary-wide" data-export>Backup exportieren</button>
    </article>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function render() {
  chartCount = 0;
  const screens = { home: dashboard, training, "training-analysis": trainingAnalysis, tracker, calendar, profile, chat };
  app.innerHTML = (screens[state.tab] || dashboard)();
  document.querySelector(".app-shell").classList.toggle("tracker-screen", state.tab === "tracker");
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.tab === state.tab));
}

function updateTrackerLiveValues() {
  if (state.tab !== "tracker" || state.trackerView !== "day") return;
  const current = entryFor(state.selectedDate);
  const calories = calculateCalories(current);
  const caloriePercent = percentOf(calories, settings.calorieTarget);
  const calorieOutput = app.querySelector("[data-calorie-total]");
  const ring = app.querySelector("[data-calorie-ring]");
  const percent = app.querySelector("[data-calorie-percent]");
  const rest = app.querySelector("[data-calorie-rest]");
  if (calorieOutput) calorieOutput.textContent = formatValue(calories, 0);
  if (ring) ring.style.setProperty("--progress", `${Math.min(100, caloriePercent)}%`);
  if (percent) percent.textContent = `${caloriePercent} %`;
  if (rest) rest.textContent = `Rest ${remainingOf(calories, settings.calorieTarget)} kcal`;
  [
    ["protein", settings.proteinTarget, 0],
    ["carbs", settings.carbsTarget, 0],
    ["fats", settings.fatsTarget, 0],
    ["water", settings.waterTarget, 1],
  ].forEach(([field, target, digits]) => {
    const value = current[field];
    const actual = app.querySelector(`[data-actual="${field}"]`);
    const remaining = app.querySelector(`[data-rest="${field}"]`);
    if (actual) actual.textContent = formatValue(value, digits);
    if (remaining) remaining.textContent = `Rest ${remainingOf(value, target, digits)} ${field === "water" ? "l" : "g"}`;
  });
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
    <div class="live-workout-head"><div class="dialog-header"><div><p class="eyebrow">Live Workout · Woche ${state.week}</p><h2>${workoutName(session)}</h2></div><button type="button" class="icon-button" data-close-workout aria-label="Schließen">&times;</button></div>
      <div class="timer-card"><div><p class="eyebrow">Rest Timer</p><strong data-timer-display>00:00</strong></div><div><button type="button" data-timer="60">60s</button><button type="button" data-timer="90">90s</button><button type="button" data-timer="120">120s</button></div></div>
    </div>
    <input type="hidden" name="sessionCode" value="${session.code}">
    ${session.exercises.map((exercise, exerciseIndex) => {
      const last = lastExerciseLog(exercise.name);
      return `<section class="log-exercise"><div class="card-top"><h3>${exercise.name}</h3><span>${displayReps(exercise.reps)} Wdh.</span></div>
        ${Array.from({ length: exercise.sets }, (_, setIndex) => {
          const set = last?.sets[setIndex] || last?.sets.at(-1) || {};
          return `<div class="set-row"><button type="button" class="set-check" data-complete-set>S${setIndex + 1}</button><label>kg<input name="w-${exerciseIndex}-${setIndex}" type="number" step="0.25" value="${set.weight ?? ""}"></label><label>Wdh.<input name="r-${exerciseIndex}-${setIndex}" type="number" value="${set.reps ?? ""}"></label><label>RIR<input name="rir-${exerciseIndex}-${setIndex}" type="number" value="${set.rir ?? exercise.rir ?? ""}"></label></div>`;
        }).join("")}</section>`;
    }).join("")}
    <div class="workout-actions"><button type="button" class="secondary-button" data-close-workout>Abbrechen</button><button class="primary-button" type="submit">Speichern</button></div>`;
  workoutDialog.showModal();
}

function compressChatImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    const image = new Image();
    reader.addEventListener("load", () => { image.src = reader.result; });
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

function startTimer(seconds) {
  clearInterval(timerHandle);
  timerRemaining = seconds;
  updateTimer();
  timerHandle = setInterval(() => {
    timerRemaining -= 1;
    updateTimer();
    if (timerRemaining <= 0) clearInterval(timerHandle);
  }, 1000);
}

function updateTimer() {
  const display = workoutForm.querySelector("[data-timer-display]");
  if (!display) return;
  display.textContent = `${String(Math.floor(timerRemaining / 60)).padStart(2, "0")}:${String(Math.max(0, timerRemaining % 60)).padStart(2, "0")}`;
}

document.querySelector(".bottom-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  state.tab = button.dataset.tab;
  render();
});

app.addEventListener("click", (event) => {
  const go = event.target.closest("[data-go]");
  const start = event.target.closest("[data-start-session]");
  const view = event.target.closest("[data-tracker-view]");
  const shift = event.target.closest("[data-date-shift]");
  const selectDate = event.target.closest("[data-select-date]");
  const weekShift = event.target.closest("[data-week-shift]");
  const theme = event.target.closest("[data-theme]");
  if (start) return openWorkout(start.dataset.startSession);
  if (go) {
    state.tab = go.dataset.go;
    return render();
  }
  if (view) {
    state.trackerView = view.dataset.trackerView;
    return render();
  }
  if (shift) {
    state.selectedDate = dateShift(state.selectedDate, Number(shift.dataset.dateShift));
    return render();
  }
  if (selectDate) {
    state.selectedDate = selectDate.dataset.selectDate;
    state.tab = "tracker";
    state.trackerView = "day";
    return render();
  }
  if (weekShift) {
    const cycleWeeks = Math.max(1, Number(settings.cycleWeeks) || 12);
    state.week = Math.min(cycleWeeks, Math.max(1, state.week + Number(weekShift.dataset.weekShift)));
    localStorage.setItem("nh-active-week", String(state.week));
    return render();
  }
  if (theme) {
    settings.theme = theme.dataset.theme;
    persistSettings();
    applyTheme();
    return render();
  }
  if (event.target.closest("[data-show-history]")) {
    state.chatExpanded = true;
    return render();
  }
  if (event.target.closest("[data-export]")) exportBackup();
  if (event.target.closest("[data-edit-all]")) {
    app.querySelector("[data-track-input]")?.focus();
  }
});

app.addEventListener("input", (event) => {
  const input = event.target.closest("[data-track-input]");
  if (input) {
    saveTrackerField(state.selectedDate, input.dataset.trackInput, input.value);
    updateTrackerLiveValues();
    const sliderOutput = app.querySelector(`[data-slider-output="${input.dataset.trackInput}"]`);
    if (sliderOutput) sliderOutput.textContent = input.value;
    const status = app.querySelector("[data-save-status]");
    if (status) {
      status.textContent = "Gespeichert";
      status.classList.add("saved");
    }
  }
  if (event.target.matches("[data-cycle-weeks]")) {
    settings.cycleWeeks = Math.max(1, Number(event.target.value) || 12);
    persistSettings();
  }
  if (event.target.matches("[data-setting-number]")) {
    settings[event.target.dataset.settingNumber] = Number(event.target.value);
    persistSettings();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.matches("[data-date-picker]")) {
    state.selectedDate = event.target.value;
    render();
  }
  if (event.target.matches("[data-setting='phase']")) {
    settings.phase = event.target.value;
    persistSettings();
    render();
  }
  if (event.target.matches("[data-setting-number]")) render();
  if (event.target.matches("[data-cycle-weeks]")) render();
});

app.addEventListener("submit", async (event) => {
  if (event.target.id !== "chat-form") return;
  event.preventDefault();
  const form = new FormData(event.target);
  const text = String(form.get("text") || "").trim();
  const file = event.target.elements.image.files[0];
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
    text: text || "Bild gesendet.",
    attachment: image ? { image, label: file.name } : null,
  });
  try {
    localStorage.setItem("nh-chat-messages", JSON.stringify(chatMessages));
  } catch (error) {
    chatMessages.pop();
    window.alert("Das Bild ist zu groß für den lokalen Speicher.");
  }
  render();
});

workoutForm.addEventListener("click", (event) => {
  const timer = event.target.closest("[data-timer]");
  const complete = event.target.closest("[data-complete-set]");
  if (timer) startTimer(Number(timer.dataset.timer));
  if (complete) {
    complete.classList.toggle("complete");
    if (complete.classList.contains("complete") && settings.autoTimer) startTimer(settings.restSeconds);
  }
  if (event.target.closest("[data-close-workout]")) {
    clearInterval(timerHandle);
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
  if (!exercises.length) return;
  workoutLogs.push({
    date: todayIso(),
    meso: state.meso,
    week: state.week,
    sessionCode: session.code,
    sessionName: workoutName(session),
    exercises,
    totalSets: sum(exercises.map((exercise) => exercise.sets.length)),
    volume: sum(exercises.flatMap((exercise) => exercise.sets.map((set) => set.weight * set.reps))),
  });
  localStorage.setItem("nh-workout-logs", JSON.stringify(workoutLogs));
  clearInterval(timerHandle);
  workoutDialog.close();
  state.tab = "training-analysis";
  render();
});

function exportBackup() {
  const backup = { exportedAt: new Date().toISOString(), trackerEdits, workouts: workoutLogs, settings, chatMessages };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `nh-performance-backup-${todayIso()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

document.addEventListener("touchstart", (event) => {
  if (window.scrollY === 0) pullStartY = event.touches[0].clientY;
}, { passive: true });

document.addEventListener("touchend", (event) => {
  if (pullStartY === null) return;
  const distance = event.changedTouches[0].clientY - pullStartY;
  pullStartY = null;
  if (distance < 70 || window.scrollY > 0) return;
  refreshEntries();
  render();
  const indicator = document.getElementById("pull-refresh");
  indicator.classList.add("visible");
  window.setTimeout(() => indicator.classList.remove("visible"), 850);
}, { passive: true });

refreshEntries();
applyTheme();
render();
