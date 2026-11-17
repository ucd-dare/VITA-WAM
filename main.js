import { createTransport } from './transport.js';
import { createAlignment } from './alignment.js';

const hero = document.querySelector('.hero');
const slider = document.querySelector('#alignment-progress');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
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
const scenes = [transport, conventional, vita];
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
    if (scene.duration && scene.visible && !scene.visited) {
      scene.visited = true;
      scene.playing = !reducedMotion.matches;
      updatePlayback(scene);
    }
  }
  syncTransportPlayback();
  requestFrame();
}, { threshold: [0, .025, .45] });

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
});

reducedMotion.addEventListener('change', () => {
  if (!reducedMotion.matches) return;
  for (const scene of scenes) {
    scene.playing = false;
    updatePlayback(scene);
  }
  transport.time = Math.max(transport.time, stillTime);
  transport.draw();
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
