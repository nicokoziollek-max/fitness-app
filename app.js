const sourceData = window.FITNESS_DATA;
const savedEntries = JSON.parse(localStorage.getItem("nh-training-entries") || "[]");
const workoutLogs = JSON.parse(localStorage.getItem("nh-workout-logs") || "[]");
const improvementNotes = JSON.parse(localStorage.getItem("nh-improvement-notes") || "[]");
const state = {
  tab: "home",
  meso: Number(localStorage.getItem("nh-active-meso") || 4),
  week: Number(localStorage.getItem("nh-active-week") || 1),
  metric: "weight",
  entries: [...sourceData.dailyEntries, ...savedEntries].sort((a, b) => a.date.localeCompare(b.date)),
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
let timerHandle = null;
let timerRemaining = 0;

function valuesFor(metric, days) {
  return state.entries.slice(-days).map((entry) => entry[metric]).filter(Number.isFinite);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
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

function latest() {
  return state.entries[state.entries.length - 1];
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
  const previousEntries = state.entries.slice(-14, -7).map((entry) => entry.weight).filter(Number.isFinite);
  return recent - average(previousEntries);
}

function weeklySlope() {
  const recent = valuesFor("weight", 28);
  if (recent.length < 14) return 0;
  return (average(recent.slice(-7)) - average(recent.slice(0, 7))) / 3;
}

function chartSvg(values, color = "#b7f348") {
  if (!values.length) return `<p class="helper">Noch keine Daten für diesen Verlauf.</p>`;
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
  const area = `${points[0][0]},${height} ${line} ${points[points.length - 1][0]},${height}`;
  const last = points[points.length - 1];
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="Trendverlauf">
    <defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path class="grid" d="M0 28 H${width} M0 58 H${width}"></path>
    <polygon class="area" points="${area}"></polygon>
    <polyline class="line" style="stroke:${color}" points="${line}"></polyline>
    <circle class="dot" style="fill:${color}" cx="${last[0]}" cy="${last[1]}" r="5"></circle>
  </svg>`;
}

function dashboard() {
  const today = latest();
  const trend = weightTrend();
  const session = nextSession();
  const completed = currentWeekLogs().length;
  const workoutCount = activeSessions().length;
  return `
    <section class="hero">
      <p class="eyebrow">Gewichtstrend · 7 Tage</p>
      <div class="hero-title">${formatValue(today.weight)}<span class="unit">kg</span></div>
      <p class="subtle">Zuletzt erfasst am ${formatDate(today.date)}</p>
      <div class="trend">${trend >= 0 ? "↗" : "↘"} ${trend >= 0 ? "+" : ""}${formatValue(trend)} kg gegenüber Vorwoche</div>
      ${chartSvg(valuesFor("weight", 28))}
    </section>
    <article class="action-card">
      <p class="eyebrow">Heute · Meso ${state.meso} Woche ${state.week}</p>
      <h3>${workoutName(session)}</h3>
      <p class="helper">${sum(session.exercises.map((exercise) => exercise.sets))} Arbeitssätze · ${session.exercises.length} Übungen bereit</p>
      <div class="compact-progress">
        <p class="helper">${completed} von ${workoutCount} Sessions diese Woche abgeschlossen</p>
        <div class="progress-track"><span style="width:${Math.min(100, completed / workoutCount * 100)}%"></span></div>
      </div>
      <div class="action-buttons">
        <button class="primary-button" data-start-session="${session.code}">Workout starten</button>
        <button class="secondary-button" data-new-entry>Check-in</button>
      </div>
    </article>
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
      <div class="section-head"><div><p class="eyebrow">Aktueller Zyklus</p><h3>Woche ${state.week} von 9</h3></div><div class="row"><button class="secondary-button" data-week-shift="-1">−</button><button class="secondary-button" data-week-shift="1">+</button></div></div>
      <div class="progress-track"><span style="width:${state.week / 9 * 100}%"></span></div>
    </article>
    <div class="volume-grid">${setEntries.slice(0, 8).map(([muscle, sets]) => `<div class="volume-box"><strong>${sets}</strong><span>${muscle}</span></div>`).join("")}</div>
    <section>${activeSessions().map((session, index) => `
      <article class="workout-card ${index === 0 ? "open" : ""}">
        <button class="workout-head" data-expand>
          <span class="session-code">${completeCodes.has(session.code) ? "✓" : session.code}</span>
          <span class="workout-title"><strong>${workoutName(session)}</strong><span>${sum(session.exercises.map((exercise) => exercise.sets))} Sätze · ${session.exercises.length} Übungen</span></span>
          <span class="chevron">⌄</span>
        </button>
        <div class="exercise-list">
          <button class="start-session" data-start-session="${session.code}">${completeCodes.has(session.code) ? "Erneut loggen" : "Session starten"}</button>
          ${session.exercises.map((exercise) => `
          <div class="exercise"><div><p>${exercise.name}</p><small>${exercise.group} · ${displayReps(exercise.reps)} Wdh. · RIR ${exercise.rir ?? "-"}${exercise.tempo ? ` · ${exercise.tempo}` : ""}</small></div><span class="set-tag">${exercise.sets} Sets</span></div>`).join("")}</div>
      </article>`).join("")}</section>`;
}

function exerciseRecords() {
  return workoutLogs.flatMap((log) => log.exercises.flatMap((exercise) => exercise.sets.map((set) => ({
    name: exercise.name,
    date: log.date,
    volume: set.weight * set.reps,
    e1rm: set.weight * (1 + set.reps / 30),
  }))));
}

function performanceCard() {
  if (!workoutLogs.length) {
    return `<article class="card performance-card"><p class="eyebrow">Kraftprogression</p><h3>Noch keine Workouts geloggt</h3><p class="helper">Starte eine Session im Trainingsbereich, um Volumen und Bestleistungen auszuwerten.</p></article>`;
  }
  const recentLogs = workoutLogs.slice(-8);
  const volume = sum(workoutLogs.map((log) => log.volume));
  const records = exerciseRecords();
  const top = records.reduce((best, record) => !best || record.e1rm > best.e1rm ? record : best, null);
  return `<article class="card performance-card">
    <p class="eyebrow">Kraftprogression · Workouts</p>
    <div class="metric-row"><h2>${formatValue(recentLogs.at(-1).volume, 0)} <span class="unit">kg Volumen</span></h2><span class="trend">${workoutLogs.length} Logs</span></div>
    ${chartSvg(recentLogs.map((log) => log.volume), "#62d6b7")}
    <div class="log-summary">
      <div><strong>${formatValue(volume, 0)}</strong><span>Gesamtvolumen</span></div>
      <div><strong>${formatValue(top.e1rm, 1)}</strong><span>Bestes e1RM</span></div>
      <div><strong>${workoutLogs.at(-1).totalSets}</strong><span>Letzte Sets</span></div>
    </div>
    <p class="helper" style="margin-top:12px;">Bestleistung: ${top.name}</p>
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
    <article class="insight">
      <span class="insight-mark"></span>
      <div><strong>Aufbauverlauf</strong><p>Seit ${formatDate(state.entries[0].date)}: ${overallGain >= 0 ? "+" : ""}${formatValue(overallGain)} kg. Der 28-Tage-Trend liegt bei ${slope >= 0 ? "+" : ""}${formatValue(slope)} kg pro Woche.</p></div>
    </article>
    <article class="insight ${sleep < 7 ? "warning" : ""}">
      <span class="insight-mark"></span>
      <div><strong>Recovery-Signal</strong><p>Schlafschnitt der letzten 14 Tage: ${formatValue(sleep)} h. ${sleep >= 7 ? "Das unterstützt konsistente Leistungsentwicklung." : "Unter 7 h kann Progress und Trainingsqualität begrenzen."}</p></div>
    </article>
    ${lastLog ? `<article class="insight"><span class="insight-mark"></span><div><strong>Letzte Leistung</strong><p>${lastLog.sessionName}: ${formatValue(lastLog.volume, 0)} kg Volumen über ${lastLog.totalSets} ${setLabel(lastLog.totalSets)}. Weitere Logs machen den Progressionsvergleich aussagekräftiger.</p></div></article>` : ""}
    <article class="insight warning">
      <span class="insight-mark"></span>
      <div><strong>Interpretation</strong><p>Gewicht zeigt Körpermassen-Entwicklung, nicht isoliert Muskelwachstum. Kraftwerte und standardisierte Fotos ergänzen die Bewertung.</p></div>
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
      <div class="metric-row"><div><p class="eyebrow">${config.label} · 6 Wochen</p><h2>${formatValue(values.at(-1), config.digits)} <span class="unit">${config.unit}</span></h2></div><span class="trend">${delta >= 0 ? "+" : ""}${formatValue(delta, config.digits)} ${config.unit}</span></div>
      ${chartSvg(values, config.color)}
      <div class="stat-row">
        <div><strong>${formatValue(Math.min(...values), config.digits)}</strong><span>Minimum</span></div>
        <div><strong>${formatValue(average(lastSeven), config.digits)}</strong><span>Ø 7 Tage</span></div>
        <div><strong>${formatValue(Math.max(...values), config.digits)}</strong><span>Maximum</span></div>
      </div>
    </article>
    ${performanceCard()}
    <section class="section"><div class="section-head"><h2>Wachstumsanalyse</h2></div>${insightCards()}</section>`;
}

function tracker() {
  const recent = [...state.entries].reverse().slice(0, 14);
  const notes = [...improvementNotes].reverse();
  return `
    <div class="section-head"><div><p class="eyebrow">Data Tracker</p><h2>Tägliche Logs</h2></div><button class="link-button" data-new-entry>+ Neu</button></div>
    <article class="card">
      <p class="helper">${state.entries.length} Check-ins · Datenbasis ${formatDate(state.entries[0].date)} bis ${formatDate(latest().date)}</p>
    </article>
    <article class="card feedback-card">
      <div class="section-head"><div><p class="eyebrow">App Feedback</p><h3>Verbesserungen notieren</h3></div><span class="helper">${notes.length} gespeichert</span></div>
      <form id="feedback-form" class="feedback-form">
        <label>Anmerkung
          <textarea name="note" rows="3" maxlength="500" placeholder="Was soll an der App verbessert werden?" required></textarea>
        </label>
        <button class="primary-button" type="submit">Bemerkung speichern</button>
      </form>
      <p class="storage-note">Aktuell nur auf diesem Gerät gespeichert.</p>
      <div class="feedback-list">${notes.length ? notes.map((note) => `
        <div class="feedback-item">
          <div class="row"><strong>${formatDate(note.date)}</strong><button type="button" class="remove-note" data-remove-note="${note.id}">Löschen</button></div>
          <p>${escapeHtml(note.text)}</p>
        </div>`).join("") : `<p class="helper">Noch keine Bemerkungen gespeichert.</p>`}</div>
    </article>
    ${recent.map((entry) => `<article class="day-card">
      <div><strong>${formatDate(entry.date)} ${entry.session ? `· ${entry.session}` : ""}</strong>
        <div class="day-meta"><span>${entry.sleep ? `${formatValue(entry.sleep)} h Schlaf` : "Kein Schlaf"}</span><span>${entry.steps ? `${formatValue(entry.steps, 0)} Schritte` : "Keine Schritte"}</span>${entry.energy ? `<span>Energie ${entry.energy}/10</span>` : ""}</div>
      </div>
      <span class="weight">${formatValue(entry.weight)} kg</span>
    </article>`).join("")}`;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function render() {
  const templates = { home: dashboard, training, progress, tracker };
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
      <div class="dialog-header">
        <div><p class="eyebrow">Live Workout · Woche ${state.week}</p><h2>${workoutName(session)}</h2></div>
        <button type="button" class="icon-button" data-close-workout aria-label="Schließen">×</button>
      </div>
      <div class="timer-card">
        <div><p class="eyebrow">Rest Timer</p><span class="timer-display" data-timer-display>00:00</span></div>
        <div class="timer-buttons"><button type="button" data-timer="60">60s</button><button type="button" data-timer="90">90s</button><button type="button" data-timer="120">120s</button></div>
      </div>
    </div>
    <input type="hidden" name="sessionCode" value="${session.code}">
    ${session.exercises.map((exercise, exerciseIndex) => {
      const last = lastExerciseLog(exercise.name);
      const previous = last ? `Letztes Mal: ${last.sets.map((set) => `${set.weight} kg × ${set.reps}`).join(", ")}` : `${displayReps(exercise.reps)} Wdh. · Ziel RIR ${exercise.rir ?? "-"}`;
      return `<section class="log-exercise">
        <h3>${exercise.name}</h3><p class="helper">${previous}</p>
        ${Array.from({ length: exercise.sets }, (_, setIndex) => `<div class="set-row">
          <span>S${setIndex + 1}</span>
          <label>kg<input inputmode="decimal" name="w-${exerciseIndex}-${setIndex}" type="number" step="0.25" min="0"></label>
          <label>Wdh.<input inputmode="numeric" name="r-${exerciseIndex}-${setIndex}" type="number" min="0"></label>
          <label>RIR<input inputmode="numeric" name="rir-${exerciseIndex}-${setIndex}" type="number" min="0" max="10" value="${exercise.rir ?? ""}"></label>
        </div>`).join("")}
      </section>`;
    }).join("")}
    <div class="workout-actions">
      <button type="button" class="secondary-button" data-close-workout>Abbrechen</button>
      <button type="submit" class="primary-button">Workout speichern</button>
    </div>`;
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

document.querySelector(".bottom-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  state.tab = button.dataset.tab;
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
  if (start) {
    openWorkout(start.dataset.startSession);
    return;
  }
  if (event.target.closest("[data-new-entry]")) {
    openEntry();
    return;
  }
  if (removeNote) {
    const noteIndex = improvementNotes.findIndex((note) => note.id === removeNote.dataset.removeNote);
    if (noteIndex >= 0) improvementNotes.splice(noteIndex, 1);
    localStorage.setItem("nh-improvement-notes", JSON.stringify(improvementNotes));
    render();
    return;
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

app.addEventListener("submit", (event) => {
  if (event.target.id !== "feedback-form") return;
  event.preventDefault();
  const noteText = new FormData(event.target).get("note").trim();
  if (!noteText) return;
  improvementNotes.push({
    id: String(Date.now()),
    date: todayIso(),
    text: noteText,
  });
  localStorage.setItem("nh-improvement-notes", JSON.stringify(improvementNotes));
  render();
});

entryForm.addEventListener("input", (event) => {
  const output = entryForm.querySelector(`[data-rating-output="${event.target.name}"]`);
  if (output) output.textContent = event.target.value;
});

document.querySelector("[data-close-dialog]").addEventListener("click", () => dialog.close());
entryForm.addEventListener("submit", () => {
  const form = new FormData(entryForm);
  const entry = {
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
  };
  savedEntries.push(entry);
  localStorage.setItem("nh-training-entries", JSON.stringify(savedEntries));
  state.entries = [...sourceData.dailyEntries, ...savedEntries].sort((a, b) => a.date.localeCompare(b.date));
  state.tab = "tracker";
  render();
});

workoutForm.addEventListener("click", (event) => {
  const timer = event.target.closest("[data-timer]");
  if (timer) startTimer(Number(timer.dataset.timer));
  if (event.target.closest("[data-close-workout]")) {
    window.clearInterval(timerHandle);
    workoutDialog.close();
  }
});

workoutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const session = activeSessions().find((item) => item.code === new FormData(workoutForm).get("sessionCode"));
  const form = new FormData(workoutForm);
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
  const volume = sum(exercises.flatMap((exercise) => exercise.sets.map((set) => set.weight * set.reps)));
  workoutLogs.push({
    date: todayIso(),
    meso: state.meso,
    week: state.week,
    sessionCode: session.code,
    sessionName: workoutName(session),
    exercises,
    totalSets,
    volume,
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

render();
