import { createTransport } from './transport.js';
import { createAlignment } from './alignment.js';

const hero = document.querySelector('.hero');
const slider = document.querySelector('#alignment-progress');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const sideBySide = matchMedia('(min-width: 901px)');
const stillTime = 2.6;

const transport = {
  canvas: document.querySelector('#transport-canvas'),
  button: document.querySelector('#transport-playback'),
  action: 'hero animation',
  time: reducedMotion.matches ? stillTime : .05,
  visible: false,
  playing: !reducedMotion.matches,
};

function comparison(canvasId, buttonId, variant, action, duration, progress = 0) {
  const canvas = document.querySelector(canvasId);
  const renderer = createAlignment(canvas, variant);
  return {
    canvas,
    button: document.querySelector(buttonId),
    action,
    time: 0,
    visible: false,
    playing: false,
    visited: false,
    duration,
    progress,
    draw() { renderer.render(this.progress, this.time); },
  };
}

const conventional = comparison('#conventional-canvas', '#conventional-playback', 'conventional', 'conventional flow', 7000);
const vita = comparison('#alignment-canvas', '#playback', 'vita', 'manifold alignment', 7900, reducedMotion.matches ? 1 : 0);
const inference = comparison('#inference-canvas', '#inference-playback', 'inference', 'one-step inference', 2400, reducedMotion.matches ? 1 : 0);
const scenes = [transport, conventional, vita, inference];
const transportRenderer = createTransport(transport.canvas);
transport.draw = () => transportRenderer.render(transport.time);

let lastTime = 0;
let frame = 0;

function syncTransportPlayback() {
  const playing = transport.visible && transport.playing && !document.hidden;
  hero.classList.toggle('is-animating', playing);
  transportRenderer.setPlaying(playing);
}

function updatePlayback(scene) {
  const mode = scene.playing ? 'pause' : scene.progress === 1 ? 'replay' : 'play';
  const label = mode[0].toUpperCase() + mode.slice(1);
  scene.button.dataset.mode = mode;
  scene.button.title = label;
  scene.button.setAttribute('aria-label', label + ' ' + scene.action);
  if (scene === transport) syncTransportPlayback();
}

function updateProgress() {
  const percentage = Math.round(vita.progress * 100);
  const state = percentage === 0 ? 'Separate manifolds' : percentage === 100 ? 'Manifolds aligned' : 'Manifolds aligning';
  slider.value = Math.round(vita.progress * 1000);
  slider.style.setProperty('--progress', (vita.progress * 100).toFixed(1) + '%');
  slider.setAttribute('aria-valuetext', state + ', ' + percentage + '%');
}

function requestFrame() {
  const hasMotion = scenes.some((scene) => scene.visible && scene.playing);
  if (!document.hidden && hasMotion && !frame) frame = requestAnimationFrame(animate);
}

function startInferenceWhenReady() {
  if (inference.visited || !inference.visible || reducedMotion.matches) return;
  if (sideBySide.matches && vita.visible && vita.progress < 1) return;
  inference.visited = true;
  inference.playing = true;
  updatePlayback(inference);
  requestFrame();
}

function animate(now) {
  frame = 0;
  const delta = lastTime ? Math.min(now - lastTime, 40) : 0;
  lastTime = now;

  for (const scene of scenes) {
    if (!scene.visible || !scene.playing) continue;
    scene.time += delta / 1000;

    if (scene.duration) {
      scene.progress = Math.min(1, scene.progress + delta / scene.duration);
      if (scene === vita) updateProgress();
      if (scene.progress === 1) {
        scene.playing = false;
        updatePlayback(scene);
        if (scene === vita) startInferenceWhenReady();
      }
    }

    scene.draw();
  }

  requestFrame();
  if (!frame) lastTime = 0;
}

const visibility = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const scene = scenes.find((candidate) => candidate.canvas === entry.target);
    scene.visible = entry.intersectionRatio >= (scene === transport ? .025 : .45);
    if (scene !== inference && scene.duration && scene.visible && !scene.visited) {
      scene.visited = true;
      scene.playing = !reducedMotion.matches;
      updatePlayback(scene);
    }
  }
  startInferenceWhenReady();
  syncTransportPlayback();
  requestFrame();
}, { threshold: [0, .025, .45] });

sideBySide.addEventListener('change', startInferenceWhenReady);

const resize = new ResizeObserver((entries) => {
  for (const entry of entries) scenes.find((scene) => scene.canvas === entry.target).draw();
});

for (const scene of scenes) {
  visibility.observe(scene.canvas);
  resize.observe(scene.canvas);
  updatePlayback(scene);

  scene.button.addEventListener('click', () => {
    scene.visited = true;
    if (scene.progress === 1) {
      scene.progress = 0;
      scene.time = 0;
      scene.draw();
    }
    scene.playing = !scene.playing;
    updatePlayback(scene);
    if (scene === vita) updateProgress();
    requestFrame();
  });
}

slider.addEventListener('input', () => {
  vita.visited = true;
  vita.playing = false;
  vita.progress = Number(slider.value) / 1000;
  vita.draw();
  updateProgress();
  updatePlayback(vita);
  startInferenceWhenReady();
});

reducedMotion.addEventListener('change', () => {
  if (!reducedMotion.matches) return;
  for (const scene of scenes) {
    scene.playing = false;
    updatePlayback(scene);
  }
  transport.time = Math.max(transport.time, stillTime);
  transport.draw();
  inference.progress = 1;
  inference.draw();
  updatePlayback(inference);
  vita.progress = 1;
  vita.draw();
  updateProgress();
  updatePlayback(vita);
});

document.addEventListener('visibilitychange', () => {
  syncTransportPlayback();
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  } else {
    requestFrame();
  }
});

updateProgress();

const resultPanels = document.querySelectorAll('.results-head, .results-grid article');
const resultEntrance = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('result-enter');
    resultEntrance.unobserve(entry.target);
  }
}, { threshold: 0.18 });

for (const panel of resultPanels) resultEntrance.observe(panel);

document.querySelector('.results-replay').addEventListener('click', () => {
  for (const panel of resultPanels) {
    for (const animation of panel.getAnimations({ subtree: true })) {
      animation.currentTime = 0;
      animation.play();
    }
  }
});

const timing = document.querySelector('.timing-result');
const timingModes = timing.querySelectorAll('.timing-modes button');
const timingRows = timing.querySelectorAll('.timing-row');

for (const button of timingModes) {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    const [vitaMs, fastMs] = Array.from(timingRows, row => {
      const ms = Number(row.dataset[mode]);
      row.querySelector('strong').textContent = ms.toFixed(2) + ' ms';
      row.querySelector('.timing-track i').style.width = (ms / 220 * 100) + '%';
      return ms;
    });
    timing.querySelector('.speed-ratio').textContent = (fastMs / vitaMs).toFixed(2);
    timing.querySelector('h3').textContent = button.textContent + ' latency';
    for (const option of timingModes) option.setAttribute('aria-pressed', String(option === button));
  });
}

const citation = document.getElementById('bibtex-entry');
const copyCitation = document.getElementById('copy-citation');
const citationStatus = document.getElementById('citation-status');
let citationReset;

copyCitation.addEventListener('click', async () => {
  clearTimeout(citationReset);
  try {
    await navigator.clipboard.writeText(citation.textContent);
    copyCitation.textContent = 'Copied';
    citationStatus.textContent = 'BibTeX copied to clipboard.';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(citation);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    copyCitation.textContent = 'Text selected';
    citationStatus.textContent = 'Citation selected. Use your browser’s Copy command.';
  }
  citationReset = setTimeout(() => {
    copyCitation.textContent = 'Copy BibTeX';
    citationStatus.textContent = '';
  }, 2500);
});
