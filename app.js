'use strict';

const STORAGE_KEY = 'crono_maquina_single_v1';

const elements = {
  machineName: document.getElementById('machineName'),
  timerDisplay: document.getElementById('timerDisplay'),
  statusDisplay: document.getElementById('statusDisplay'),
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  resetBtn: document.getElementById('resetBtn')
};

const state = {
  machineName: '',
  elapsedMs: 0,
  running: false,
  startedAt: null,
  tickInterval: null
};

function formatTime(totalMs) {
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

function getDisplayElapsedMs() {
  if (!state.running || state.startedAt === null) {
    return state.elapsedMs;
  }

  return state.elapsedMs + (Date.now() - state.startedAt);
}

function render() {
  const displayMs = getDisplayElapsedMs();
  elements.timerDisplay.textContent = formatTime(displayMs);
  elements.statusDisplay.textContent = state.running ? 'Rodando' : 'Parado';

  elements.startBtn.disabled = state.running;
  elements.pauseBtn.disabled = !state.running;
}

function persist() {
  const payload = {
    machineName: state.machineName,
    elapsedMs: state.elapsedMs,
    running: state.running,
    startedAt: state.startedAt
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function stopTicking() {
  if (!state.tickInterval) {
    return;
  }

  clearInterval(state.tickInterval);
  state.tickInterval = null;
}

function startTicking() {
  stopTicking();

  state.tickInterval = setInterval(() => {
    render();
  }, 250);
}

function startTimer() {
  if (state.running) {
    return;
  }

  state.running = true;
  state.startedAt = Date.now();

  startTicking();
  render();
  persist();
}

function pauseTimer() {
  if (!state.running || state.startedAt === null) {
    return;
  }

  state.elapsedMs += Date.now() - state.startedAt;
  state.startedAt = null;
  state.running = false;

  stopTicking();
  render();
  persist();
}

function resetTimer() {
  state.elapsedMs = 0;
  state.startedAt = state.running ? Date.now() : null;
  render();
  persist();
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return;
  }

  try {
    const saved = JSON.parse(raw);
    state.machineName = typeof saved.machineName === 'string' ? saved.machineName : '';
    state.elapsedMs = Number.isFinite(saved.elapsedMs) ? saved.elapsedMs : 0;
    state.running = Boolean(saved.running);
    state.startedAt = Number.isFinite(saved.startedAt) ? saved.startedAt : null;

    elements.machineName.value = state.machineName;

    if (state.running && state.startedAt !== null) {
      startTicking();
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function bindEvents() {
  elements.startBtn.addEventListener('click', startTimer);
  elements.pauseBtn.addEventListener('click', pauseTimer);
  elements.resetBtn.addEventListener('click', resetTimer);

  elements.machineName.addEventListener('input', (event) => {
    state.machineName = event.target.value.trimStart();
    persist();
  });

  window.addEventListener('beforeunload', () => {
    if (state.running && state.startedAt !== null) {
      state.elapsedMs += Date.now() - state.startedAt;
      state.startedAt = Date.now();
    }

    persist();
  });
}

loadState();
bindEvents();
render();
