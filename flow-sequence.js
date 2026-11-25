const section = document.querySelector('.flow-sequence');
const stages = [...section.querySelectorAll('li')];
const find = selector => section.querySelector(selector);
const motion = matchMedia('(prefers-reduced-motion: reduce)');

function makeSvg(parent, tag, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  parent.append(node);
  return node;
}

function smooth(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

const loss = find('.loss-curve');
const lossLength = loss.getTotalLength();
const lossClip = find('#loss-clip rect');
const lossPoint = find('.loss-point');
loss.style.strokeDasharray = '1';

function drawLoss(t) {
  const point = loss.getPointAtLength(t * lossLength);
  loss.style.strokeDashoffset = 1 - t;
  lossClip.setAttribute('width', point.x);
  lossPoint.setAttribute('cx', point.x);
  lossPoint.setAttribute('cy', point.y);
}

const layers = ['#d98965', '#248c90'].map(color => {
  const parent = find('.sequence-manifolds');
  return {
    surface: makeSvg(parent, 'path', {fill: color, 'fill-opacity': .23}),
    mesh: makeSvg(parent, 'path', {fill: 'none', stroke: color, 'stroke-width': .68, 'stroke-opacity': .8}),
    rim: makeSvg(parent, 'path', {fill: 'none', stroke: color, 'stroke-width': 1.45})
  };
});

function drawManifolds(t) {
  layers.forEach(({surface, mesh, rim}, index) => {
    const sign = index ? -1 : 1;
    function point(u, v) {
      const x = 14 + 144 * u + 16 * v + sign * (2 + 3 * (1 - t));
      const aligned = 50 - 13 * Math.sin(2 * Math.PI * u + .45 * v) + (v - .5) * 13;
      const difference = 9 + 9 * Math.sin(2 * Math.PI * u + 2 * v);
      const y = aligned + sign * ((1 - t) * difference + 13);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }
    function row(v, reverse = false) {
      return Array.from({length: 25}, (_, i) => point(reverse ? 1 - i / 24 : i / 24, v)).join('L');
    }
    const lines = [];
    for (let j = 0; j <= 3; j++) lines.push('M' + row(j / 3));
    for (let i = 0; i <= 12; i++) {
      lines.push('M' + Array.from({length: 6}, (_, j) => point(i / 12, j / 5)).join('L'));
    }
    surface.setAttribute('d', 'M' + row(0) + 'L' + row(1, true) + 'Z');
    mesh.setAttribute('d', lines.join(''));
    rim.setAttribute('d', 'M' + row(1));
  });
}

const ode = find('.ode-path');
const tracer = find('.ode-tracer');
const nodes = Array.from({length: 9}, () => makeSvg(find('.ode-nodes'), 'circle', {r: 3.6}));

function drawSteps(t) {
  const straight = smooth(t / .72);
  const travel = smooth((t - .57) / .43);
  const from = [40,77,42,22,85,29,118,71];
  const to = [40,70,62,62,85,54,144,32];
  const p = from.map((n, i) => (n + straight * (to[i] - n)).toFixed(2));
  ode.setAttribute('d', 'M20 77C' + p.slice(0,6).join(' ') + 'S' + p.slice(6).join(' ') + ' 170 23');
  const length = ode.getTotalLength();
  nodes.forEach((node, i) => {
    const station = Math.round(i / 4) * 4;
    const position = (i + (station - i) * straight) / 8;
    const point = ode.getPointAtLength(position * length);
    node.setAttribute('cx', point.x);
    node.setAttribute('cy', point.y);
    node.setAttribute('opacity', i % 4 === 0 ? 1 : 1 - straight);
  });
  const tip = ode.getPointAtLength(travel * length);
  tracer.setAttribute('cx', tip.x);
  tracer.setAttribute('cy', tip.y);
  tracer.setAttribute('opacity', Math.sin(Math.PI * travel));
}

const arm = find('.robot-arm');
const armOutline = find('.robot-arm-shadow');
const elbow = find('.elbow');
const claw = find('.robot-claw');
const block = find('.robot-object');

function drawRobot(t) {
  const approach = smooth(t / .29);
  const grip = smooth((t - .29) / .14);
  const lift = smooth((t - .43) / .57);
  const x = 110 + 8 * approach + 43 * lift;
  const y = 45 + 24 * approach - 34 * lift - 12 * Math.sin(Math.PI * lift);
  const dx = x - 45, dy = y - 74;
  const distance = Math.hypot(dx, dy);
  const height = Math.sqrt(64 * 64 - distance * distance / 4);
  const ex = 45 + dx / 2 + dy / distance * height;
  const ey = 74 + dy / 2 - dx / distance * height;
  const path = 'M45 74L' + ex + ' ' + ey + 'L' + x + ' ' + y;
  arm.setAttribute('d', path);
  armOutline.setAttribute('d', path);
  elbow.setAttribute('cx', ex);
  elbow.setAttribute('cy', ey);
  const opening = 10 - grip * 3;
  claw.setAttribute('d', 'M' + (x - opening) + ' ' + (y + 9) + 'v-7L' + x + ' ' + y + 'l' + opening + ' 2v7');
  block.setAttribute('x', 112 + 43 * lift);
  block.setAttribute('y', 72 - 34 * lift - 12 * Math.sin(Math.PI * lift));
}

const phases = [
  [0, 1550, drawLoss],
  [1280, 2030, drawManifolds],
  [3030, 1680, drawSteps],
  [4430, 1830, drawRobot]
];
const duration = 6260;
const previous = [];
function render(time) {
  phases.forEach(([start, length, draw], index) => {
    const progress = smooth((time - start) / length);
    if (previous[index] === progress) return;
    draw(progress);
    if (index < stages.length - 1) {
      const handoff = smooth((progress - .72) / .26);
      stages[index].style.setProperty('--link-fill', (handoff * 100).toFixed(1) + '%');
    }
    previous[index] = progress;
  });
}

let elapsed = 0;
let lastFrame;
let frame = 0;
let visible = false;
function tick(now) {
  frame = 0;
  if (lastFrame !== undefined) elapsed = Math.min(duration, elapsed + now - lastFrame);
  lastFrame = now;
  render(elapsed);
  if (elapsed < duration) frame = requestAnimationFrame(tick);
}
function sync() {
  cancelAnimationFrame(frame);
  lastFrame = undefined;
  if (motion.matches) elapsed = duration;
  render(elapsed);
  if (visible && !document.hidden && elapsed < duration) frame = requestAnimationFrame(tick);
}
new IntersectionObserver(([entry]) => {
  visible = entry.intersectionRatio >= .45;
  sync();
}, {threshold: .45}).observe(section);
find('.sequence-replay').addEventListener('click', () => { elapsed = 0; sync(); });
document.addEventListener('visibilitychange', sync);
motion.addEventListener('change', sync);
sync();
