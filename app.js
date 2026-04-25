'use strict';

const STORAGE_KEY = 'crono_maquina_single_v1';

const elements = {
  machineName: document.getElementById('machineName'),
  feedback: document.getElementById('feedback'),
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

function sanitizeMachineName(value) {
  return value.trim().slice(0, 80);
}

function formatTime(totalMs) {
  const safeMs = Math.max(0, Math.floor(totalMs));
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

function getDisplayElapsedMs(now = Date.now()) {
  if (!state.running || state.startedAt === null) {
    return state.elapsedMs;
  }

  return state.elapsedMs + (now - state.startedAt);
}

function setFeedback(message = '') {
  elements.feedback.textContent = message;
}

function updateControls() {
  const hasMachineName = state.machineName.length > 0;

  elements.startBtn.disabled = state.running || !hasMachineName;
  elements.pauseBtn.disabled = !state.running;
}

function render() {
  const displayMs = getDisplayElapsedMs();
  elements.timerDisplay.textContent = formatTime(displayMs);
  elements.statusDisplay.textContent = state.running ? 'Rodando' : 'Parado';

  updateControls();
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

  if (!state.machineName) {
    setFeedback('Informe a máquina/contexto antes de iniciar.');
    updateControls();
    return;
  }

  setFeedback('');
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

  setFeedback('');
  render();
  persist();
}

function isValidSavedState(saved) {
  if (!saved || typeof saved !== 'object') {
    return false;
  }

  const elapsedIsValid = Number.isFinite(saved.elapsedMs) && saved.elapsedMs >= 0;
  const startedAtIsValid = saved.startedAt === null || Number.isFinite(saved.startedAt);

  return elapsedIsValid && startedAtIsValid;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return;
  }

  try {
    const saved = JSON.parse(raw);

    if (!isValidSavedState(saved)) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    state.machineName = typeof saved.machineName === 'string'
      ? sanitizeMachineName(saved.machineName)
      : '';
    state.elapsedMs = saved.elapsedMs;
    state.running = Boolean(saved.running) && saved.startedAt !== null;
    state.startedAt = state.running ? saved.startedAt : null;

    elements.machineName.value = state.machineName;

    if (state.running) {
      startTicking();
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveRunningSnapshot() {
  if (state.running && state.startedAt !== null) {
    const now = Date.now();
    state.elapsedMs += now - state.startedAt;
    state.startedAt = now;
  }

  persist();
}

function bindEvents() {
  elements.startBtn.addEventListener('click', startTimer);
  elements.pauseBtn.addEventListener('click', pauseTimer);
  elements.resetBtn.addEventListener('click', resetTimer);

  elements.machineName.addEventListener('input', (event) => {
    state.machineName = sanitizeMachineName(event.target.value);
    event.target.value = state.machineName;

    if (state.machineName) {
      setFeedback('');
    }

    render();
    persist();
  });

  elements.machineName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      startTimer();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveRunningSnapshot();
    }
  });

  window.addEventListener('beforeunload', saveRunningSnapshot);
}

loadState();
bindEvents();
render();
