const blue = [44, 91, 216];
const coral = [213, 88, 47];
const teal = [20, 151, 168];
const fullTurn = Math.PI * 2;
const alignedActionWeight = 0.62;
const alignedDeformation = 0.24;

const mix = (start, end, fraction) => start + (end - start) * fraction;
const clamp = (value) => Math.max(0, Math.min(value, 1));
const ease = (value) => {
  const bounded = clamp(value);
  return bounded * bounded * (3 - 2 * bounded);
};

function ink(color, alpha) {
  return `rgba(${color.join(',')},${clamp(alpha)})`;
}

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + 1) / 4294967297;
  };
}

function sampleGaussian(random) {
  const radius = Math.sqrt(-2 * Math.log(random())) * 0.35;
  const angle = random() * fullTurn;
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

function makeGaussian() {
  const random = seededRandom(423);
  return Array.from({ length: 230 }, () => {
    const [x, y] = sampleGaussian(random);
    const [z] = sampleGaussian(random);
    const cap = Math.min(1, 1.07 / Math.hypot(x, y, z));
    return {
      point: [x * cap, y * cap, z * cap],
      size: 0.49 + random() ** 2 * 1.22,
      phase: random() * fullTurn,
    };
  });
}

function actionPoint(u, v) {
  const width = (0.82 + 0.18 * Math.cos(u * 2.45)) * (0.86 - 0.13 * Math.sin(u * 2.72));
  const ridge = 0.66 * Math.sin(u * 3.65 + v * 0.68);
  const fold = 0.29 * Math.cos(u * 6.4 - v * 1.7) * (0.78 + 0.22 * v);
  return [
    u * 1.27 + 0.11 * v * Math.cos(2.1 * u),
    (ridge + fold) * (0.85 + 0.15 * v) + 0.23 * v - 0.15 * v * v,
    width * v - 0.36 * Math.sin(u * 2.55) + 0.13 * Math.cos(v * 2.3 + u * 2.5),
  ];
}

function observationPoint(u, v) {
  const twist = -0.43 + u * 1.55;
  const width = v * (0.73 + 0.22 * Math.cos(u * 2.65));
  const curl = 0.26 * Math.sin(v * 4.2 - u * 2.2);
  return [
    1.17 * u + 0.24 * Math.sin(v * 2.1 + u * 2.6),
    width * Math.sin(twist) + 0.50 * Math.cos(u * 4.65 + v * 1.27) + curl,
    width * Math.cos(twist) + 0.26 * Math.sin(u * 4.4 + v * 1.8) - 0.13 * u,
  ];
}

function evolvingSurface(towardAction, deformation) {
  return (u, v) => {
    const vision = observationPoint(u, v);
    const action = actionPoint(u, v);
    return [
      mix(vision[0], action[0], towardAction),
      mix(vision[1], action[1], towardAction) + deformation * Math.sin(2.8 * u + 0.9 * v),
      mix(vision[2], action[2], towardAction),
    ];
  };
}

function projectFrom(x, y, scale, yaw, pitch, relief = 1) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  return ([px, py, pz]) => {
    const across = px * cosYaw + pz * sinYaw;
    const depth = pz * cosYaw - px * sinYaw;
    const perspective = 5.5 / (5.5 - depth);
    return [
      x + across * scale * perspective,
      y - (py * relief * cosPitch + depth * sinPitch) * scale * perspective,
      depth,
    ];
  };
}

function trace(context, project, pointAt, samples) {
  context.beginPath();
  for (let i = 0; i <= samples; i += 1) {
    const [x, y] = project(pointAt(i / samples));
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
}

function ellipse(context, x, y, rx, ry, fill) {
  context.beginPath();
  context.ellipse(x, y, rx, ry, 0, 0, fullTurn);
  if (fill) context.fill();
  else context.stroke();
}

function halo(context, x, y, radius, color, opacity, flatten = 1) {
  context.save();
  context.translate(x, y);
  context.scale(1, flatten);
  const light = context.createRadialGradient(0, 0, 0, 0, 0, radius);
  light.addColorStop(0, ink(color, opacity));
  light.addColorStop(1, ink(color, 0));
  context.fillStyle = light;
  context.fillRect(-radius, -radius, radius * 2, radius * 2);
  context.restore();
}

function drawFloor(context, x, y, scale, color, strength) {
  if (strength < 0.01) return;

  halo(context, x, y, scale * 1.46, color, 0.105 * strength, 0.26);
  context.strokeStyle = ink(color, 0.22 * strength);
  context.lineWidth = 0.72;
  ellipse(context, x, y, scale * 1.21, scale * 0.19);
  context.setLineDash([1, 3]);
  context.strokeStyle = ink(color, 0.23 * strength);
  ellipse(context, x, y, scale * 1.38, scale * 0.26);
  context.setLineDash([]);
}

function drawSurface(context, project, pointAt, color, wash, scale, opacity) {
  const outline = (t) => {
    if (t < 0.25) return pointAt(mix(-1, 1, t * 4), -1);
    if (t < 0.5) return pointAt(1, mix(-1, 1, t * 4 - 1));
    if (t < 0.75) return pointAt(mix(1, -1, t * 4 - 2), 1);
    return pointAt(-1, mix(1, -1, t * 4 - 3));
  };

  const [x, y] = project([0, 0, 0]);
  const colorField = context.createLinearGradient(x - scale * 0.95, y - scale, x + scale * 0.78, y + scale);
  colorField.addColorStop(0, ink(wash, opacity * 0.26));
  colorField.addColorStop(0.46, ink(color, opacity * 0.12));
  colorField.addColorStop(1, ink(color, opacity * 0.25));
  trace(context, project, outline, 92);
  context.closePath();
  context.fillStyle = colorField;
  context.fill();

  for (let i = 0; i <= 17; i += 1) {
    const u = mix(-1, 1, i / 17);
    const edge = i === 0 || i === 17;
    context.strokeStyle = ink(color, (edge ? 0.64 : 0.30) * opacity);
    context.lineWidth = edge ? 1.06 : 0.64;
    trace(context, project, (t) => pointAt(u, mix(-1, 1, t)), 20);
    context.stroke();
  }

  for (let i = 0; i <= 11; i += 1) {
    const v = mix(-1, 1, i / 11);
    const edge = i === 0 || i === 11;
    const depth = mix(0.48, 0.87, (1 - v) / 2);
    context.strokeStyle = ink(color, (edge ? depth : depth * 0.64) * opacity);
    context.lineWidth = edge ? 1.18 : 0.70;
    trace(context, project, (t) => pointAt(mix(-1, 1, t), v), 46);
    context.stroke();
  }
}

function drawGaussian(context, project, particles, seconds, scale) {
  const [x, y] = project([0, 0, 0]);
  halo(context, x, y, scale * 1.13, blue, 0.21);
  for (let i = 0; i < 3; i += 1) {
    const tilt = (i - 1) * Math.PI / 3 + seconds * 0.06;
    const radius = mix(0.82, 0.98, i / 2);
    trace(context, project, (t) => {
      const angle = t * fullTurn;
      return [Math.cos(angle) * radius, Math.sin(angle) * Math.sin(tilt) * radius, Math.sin(angle) * Math.cos(tilt) * radius];
    }, 52);
    context.strokeStyle = ink(blue, i === 1 ? 0.36 : 0.25);
    context.lineWidth = 0.75;
    context.stroke();
  }

  for (const particle of particles) {
    const breathe = 1 + 0.035 * Math.sin(seconds * 1.1 + particle.phase);
    const [dx, dy, depth] = project(particle.point.map((coordinate) => coordinate * breathe));
    const alpha = mix(0.24, 0.75, clamp((depth + 1) / 2));
    const size = particle.size * mix(0.72, 1.01, alpha);
    context.fillStyle = ink(blue, alpha);
    ellipse(context, dx, dy, size, size, true);
  }
}

function drawPassage(context, sourceProject, targetProject, source, target, approach, seconds, scale) {
  const identity = (point) => point;
  const sourceCenter = sourceProject([0, 0, 0]);
  const targetCenter = targetProject([0, 0, 0]);
  const opacity = mix(0.93, 0.49, approach);
  const sweep = Math.min(scale * 0.88, (targetCenter[0] - sourceCenter[0]) * 0.33) * (1 - 0.67 * approach);
  const pigment = context.createLinearGradient(sourceCenter[0], sourceCenter[1], targetCenter[0], targetCenter[1]);
  pigment.addColorStop(0, ink(blue, 0.21 * opacity));
  pigment.addColorStop(0.48, ink(teal, 0.46 * opacity));
  pigment.addColorStop(1, ink(coral, 0.26 * opacity));

  for (let i = 0; i < 8; i += 1) {
    const fraction = i / 7;
    const u = mix(-0.23, 0.65, (i * 3 % 8) / 7);
    const v = mix(-0.92, 0.92, fraction);
    const [startX, startY] = sourceProject(source(u, v, i));
    const [endX, endY] = targetProject(target(u, v));
    const phase = mix(-1.4, 1.4, fraction);
    const at = (t) => {
      const bend = Math.sin(t * Math.PI) * sweep;
      return [
        mix(startX, endX, t) + bend * 0.19 * Math.sin(t * fullTurn + phase),
        mix(startY, endY, t) + bend * (0.86 * Math.sin(t * 4.17 + phase + seconds * 0.3) + phase * 0.29),
      ];
    };

    trace(context, identity, at, 24);
    context.strokeStyle = pigment;
    context.lineWidth = i % 3 === 0 ? 1 : 0.68;
    context.stroke();

    for (let j = 0; j < 2; j += 1) {
      const t = (seconds * (0.26 + 0.019 * (i % 3)) + fraction * 0.73 + j / 2) % 1;
      const brightness = Math.sin(t * Math.PI) ** 0.7 * opacity;
      const trail = Math.min(t, 0.092);
      const color = t < 0.46 ? blue : teal;
      trace(context, identity, (step) => at(t - trail * step), 5);
      context.strokeStyle = ink(color, 0.60 * brightness);
      context.lineWidth = 1.35;
      context.stroke();
      const [x, y] = at(t);
      context.fillStyle = ink(color, 0.87 * brightness);
      ellipse(context, x, y, j === 0 ? 1.35 : 0.84, j === 0 ? 1.35 : 0.84, true);
    }
  }
}

const inferenceSamples = [
  [-.81, .83, -.010],
  [-.46, .61, .012],
  [-.07, .94, .018],
  [.35, .76, -.006],
  [.73, .88, -.014],
];

function drawInferenceStep(context, start, end, progress, showLabel) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  const t = ease((progress - .06) / .86);
  const head = length * t;
  const tail = Math.max(0, head - length * .48);
  const arrival = ease((t - .8) / .2);
  const color = teal.map((channel, i) => Math.round(mix(channel, coral[i], arrival)));

  context.save();
  context.translate(start[0], start[1]);
  context.rotate(Math.atan2(dy, dx));
  const filament = context.createLinearGradient(0, 0, length, 0);
  filament.addColorStop(0, '#119299');
  filament.addColorStop(.55, '#42838d');
  filament.addColorStop(1, '#d37a54');
  context.strokeStyle = filament;
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(length, 0);
  context.stroke();

  context.fillStyle = ink(teal, .9);
  ellipse(context, 0, 0, 1.8, 1.8, true);
  context.save();
  context.globalAlpha = Math.min(1, (1 - t) * 8);
  if (head > tail) {
    const wake = context.createLinearGradient(tail, 0, head, 0);
    wake.addColorStop(0, ink(color, 0));
    wake.addColorStop(.65, ink(color, .62));
    wake.addColorStop(1, ink(color, .96));
    context.fillStyle = wake;
    const shoulder = mix(tail, head, .83);
    context.beginPath();
    context.moveTo(tail, 0);
    context.bezierCurveTo(shoulder, -.35, shoulder, -2.1, head, -2.1);
    context.arc(head, 0, 2.1, -Math.PI / 2, Math.PI / 2);
    context.bezierCurveTo(shoulder, 2.1, shoulder, .35, tail, 0);
    context.fill();
  }
  halo(context, head, 0, 6, color, .30);
  context.fillStyle = ink(color, 1);
  ellipse(context, head, 0, 2.1, 2.1, true);
  context.fillStyle = '#f4fff9';
  ellipse(context, head, 0, .85, .85, true);
  context.restore();
  context.fillStyle = '#b25f41';
  context.beginPath();
  context.moveTo(length, 0);
  context.lineTo(length - 6.5, -2.85);
  context.lineTo(length - 5.3, 0);
  context.lineTo(length - 6.5, 2.85);
  context.closePath();
  context.fill();
  context.restore();

  if (!showLabel) return;
  context.font = 'italic ' + Math.max(13, Math.min(15, length * .26)) + 'px Georgia, serif';
  context.textBaseline = 'middle';
  context.fillStyle = '#235960';
  context.fillText('ODE', mix(start[0], end[0], .60) + 8, mix(start[1], end[1], .60));
}

export function createAlignment(canvas, variant = 'vita') {
  const context = canvas.getContext('2d');
  const conventional = variant === 'conventional';
  const inference = variant === 'inference';
  const particles = conventional ? makeGaussian() : null;

  function render(progress, seconds) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewportWidth = Math.round(width * dpr);
    const viewportHeight = Math.round(height * dpr);
    if (canvas.width !== viewportWidth || canvas.height !== viewportHeight) {
      canvas.width = viewportWidth;
      canvas.height = viewportHeight;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineJoin = 'round';
    context.lineCap = 'round';

    const alignment = inference ? 1 : progress;
    const approach = conventional ? 0 : ease((alignment - 0.07) / 0.91);
    const startScale = Math.min(width * 0.156, height * 0.28);
    const finalScale = Math.min(width * 0.29, height * 0.39);
    const scale = mix(startScale, finalScale, approach);
    const yaw = mix(-0.39, -0.20, approach) + 0.045 * (1 - approach) * Math.sin(seconds * 0.71);
    const pitch = mix(0.46, -0.18, approach) + 0.036 * (1 - approach) * Math.cos(seconds * 0.57);
    const xSource = mix(width * (conventional ? .239 : .244), width * .5 - scale * .035, approach);
    const xTarget = mix(width * .743, width * .5 + scale * .035, approach);
    const ySource = mix(height * (conventional ? .423 : .472), height * .49 - scale * .27, approach);
    const yTarget = mix(height * .496, height * .49 + scale * .27, approach);
    const sourceYaw = mix(yaw - (conventional ? 0 : 0.34), yaw, approach);
    const relief = mix(1, .56, approach);
    const sourceProject = projectFrom(xSource, ySource, scale, sourceYaw, pitch, relief);
    const targetProject = projectFrom(xTarget, yTarget, scale, yaw, pitch, relief);
    const sourceColor = conventional ? blue : teal;

    halo(context, xSource, ySource, scale * 1.44, sourceColor, 0.095);
    halo(context, xTarget, yTarget, scale * 1.51, coral, 0.11);
    drawFloor(context, xSource, ySource + scale * 0.91, scale, sourceColor, 0.89 * (1 - approach));
    drawFloor(context, xTarget, yTarget + scale * 0.79, scale, coral, 0.83 * (1 - approach));

    if (conventional) {
      const fromGaussianEdge = (_, v, i) => [0.27 + 0.07 * Math.cos(i * 3.1), v * 0.52, 0.29 * Math.sin(i * 2.13)];
      drawPassage(context, sourceProject, targetProject, fromGaussianEdge, actionPoint, 0, seconds, scale);
      drawSurface(context, targetProject, actionPoint, coral, [242, 146, 82], scale, 1);
      drawGaussian(context, sourceProject, particles, seconds, scale);
      return;
    }

    const shape = ease(alignment);
    const deformation = alignedDeformation * shape;
    const currentSource = evolvingSurface(mix(0, alignedActionWeight, shape), deformation);
    const currentTarget = evolvingSurface(mix(1, alignedActionWeight, shape), deformation);
    if (!inference && approach < 1) {
      context.save();
      context.globalAlpha = 1 - approach;
      drawPassage(context, sourceProject, targetProject, currentSource, currentTarget, approach, seconds, scale);
      context.restore();
    }
    drawSurface(context, targetProject, currentTarget, coral, [242, 146, 82], scale, 0.98);
    drawSurface(context, sourceProject, currentSource, teal, [107, 183, 245], scale, 0.97);
    if (inference) {
      for (const [index, [u, v, targetOffset]] of inferenceSamples.entries()) {
        const source = sourceProject(currentSource(u, v));
        const target = targetProject(currentTarget(u + targetOffset, v));
        drawInferenceStep(context, source, target, progress, index === inferenceSamples.length - 1);
      }
    }
  }

  return { render };
}
