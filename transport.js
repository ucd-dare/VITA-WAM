const vertexShader = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    vUv = vec2(aPosition.x * .5 + .5, .5 - aPosition.y * .5);
    gl_Position = vec4(aPosition, 0., 1.);
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform float uPortrait;

  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * .1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    vec2 w = f * f * (3. - 2. * f);
    return mix(
      mix(hash(cell), hash(cell + vec2(1., 0.)), w.x),
      mix(hash(cell + vec2(0., 1.)), hash(cell + 1.), w.x),
      w.y
    );
  }

  float current(float x, float t) {
    return .766 + .059 * sin(6.3 * x + .12) +
      .013 * sin(x * 13. - t * .79) +
      .007 * sin(x * 24. - t * 1.18);
  }

  vec4 tributary(vec2 uv, float center, float source, float t, float bank) {
    float x = uv.x;
    float approach = smoothstep(.031, source + .012, x);
    float upper = step(bank, 0.);
    float offset = mix(.086, .125, upper) * bank * (1. - approach);
    float motion = x * 23. - t * 3.8 + bank * 1.7;
    float swell = sin(motion + .7 * sin(motion * .47));
    float bend = offset + (.004 + .004 * upper) * swell * (1. - approach);
    float width = mix(.017, .026, approach) * (1. + .16 * swell);
    float crossSection = (uv.y - center - bend) / width;
    float core = exp(-1.35 * crossSection * crossSection);
    float vapor = exp(-.47 * crossSection * crossSection);
    float crest = .5 + .5 * sin(motion * 1.85 - crossSection * 2.1);
    float light = .18 * crest + .23 * pow(crest, 4.);
    vec3 pigment = mix(vec3(.16, .55, .77), vec3(.10, .68, .56), upper);
    vec3 color = mix(pigment, vec3(.88, .97, .97), .20 + light);
    float lead = smoothstep(.006 + .012 * upper, .061, x);
    float merge = 1. - smoothstep(source - .050, source + .026, x);
    float opacity = lead * merge * (.39 * core + .12 * vapor) * (.84 + .16 * swell);
    return vec4(color, opacity);
  }

  vec4 layer(vec4 front, vec4 back) {
    float visibleBack = back.a * (1. - front.a);
    float alpha = front.a + visibleBack;
    return vec4((front.rgb * front.a + back.rgb * visibleBack) / max(alpha, .001), alpha);
  }

  void main() {
    vec2 uv = vUv;
    float x = uv.x;
    float t = uTime;
    float center = mix(current(x, t), .747 + .049 * sin(5.9 * x + .1), uPortrait * .63);
    float width = mix(.091 + .044 * sin(3.1 * x + .23), .084 + .028 * sin(3.6 * x + .17), uPortrait);
    float source = mix(.225, .255, uPortrait);
    float opening = smoothstep(source - .035, source + .13, x);
    float outlet = smoothstep(.83, 1.02, x);
    width *= mix(.22, 1., opening) * (1. - .50 * outlet);
    float q = (uv.y - center) / width;
    float reveal = smoothstep(-.55, 1.85, t);
    float reach = 1. - smoothstep(reveal * 1.68 - .34, reveal * 1.68 + .19, x);
    vec4 inlets = vec4(0.);
    if (x < source + .026 && abs(uv.y - center) < .24 && reach >= .001) {
      inlets = layer(tributary(uv, center, source, t, -1.), tributary(uv, center, source, t, 1.));
      inlets.a *= reach;
    }

    if (abs(q) > 2.65 || reach < .001) {
      gl_FragColor = inlets;
      return;
    }

    float plume = noise(vec2(7. * x - t * .44, q * 1.87 + t * .026));
    float fringe = noise(vec2(12. * x - t * .7, 3.1 * q));
    float spread = 1. + .32 * (plume - .5);
    float lateral = (q + .34 * (plume - .5) + .16 * (fringe - .5)) / spread;
    float density = exp(-1.08 * lateral * lateral);
    float depth = density * density;
    float taper = 1. - smoothstep(1.9, 2.65, abs(q));
    float drift = x * (mix(9.2, 5.8, uPortrait)) - t * .79;
    float bend = q * 3.95 + .33 * sin(1.57 * drift + 2.4 * q);
    vec2 p = vec2(drift, bend);
    vec2 curl = vec2(noise(.68 * p + vec2(.7, 1.1)), noise(.73 * p + vec2(6.2, 4.4))) - .5;
    vec2 plane = p * vec2(1.34, .92) + curl * 2.08;
    vec2 surface = plane + 1.15 * vec2(
      noise(1.6 * plane + vec2(7.8, -4.1)) - .5,
      noise(1.32 * plane + vec2(-4.6, 7.3)) - .5
    );

    float broad = noise(plane);
    float fine = noise(surface * 2.9);
    float primaryPhase = 1.35 * surface.x + 2.25 * surface.y + 2.3 * broad;
    float crossPhase = 2.15 * surface.x - .53 * surface.y + 2. * fine;
    float longPhase = .68 * plane.x - .49 * plane.y + 1.6 * broad;
    float ridges = sin(primaryPhase);
    float crossRipple = sin(crossPhase);
    vec2 slope = .33 * cos(primaryPhase) * vec2(.78, .63) +
      .24 * cos(crossPhase) * vec2(.75, -.42) +
      .34 * cos(longPhase) * vec2(.31, -.92);

    vec3 normal = normalize(vec3(-slope.x + .13 * curl.x, -slope.y + .11 * q, .91));
    vec3 illumination = normalize(vec3(-.44, .46, .81));
    vec3 halfway = normalize(illumination + vec3(0., 0., 1.));
    float reflected = pow(max(0., dot(normal, halfway)), 19.);
    float reflectedBlue = pow(max(0., dot(normal, normalize(vec3(.5, -.2, .9)))), 10.);
    float lightWeb = exp(-11. * ridges * ridges);
    float foam = lightWeb * (.19 + .81 * smoothstep(-.50, .89, crossRipple));
    float glint = reflected * (.38 + .62 * fine);
    float fold = sin(1.58 * surface.x - 1.14 * surface.y + 2.1 * broad);
    float refracted = smoothstep(.52, .96, fold) * smoothstep(.24, .74, broad);
    float bands = .5 + .5 * sin(drift * 1.46 - q * 5.9 + 3.4 * curl.y);

    vec3 green = vec3(.04, .66, .57);
    vec3 blue = vec3(.14, .41, .80);
    vec3 wash = vec3(.64, .86, .93);
    float hue = smoothstep(.16, 1., x + .27 * (broad - .5) + .06 * q);
    vec3 deepInk = mix(green, blue, hue);
    vec3 base = mix(wash, deepInk, .33 + .57 * depth * (1. - .51 * reflectedBlue));
    base *= .90 + .20 * bands + .10 * dot(normal, illumination);
    float cycle = fract(t * .20);
    float pulse = (x - mix(-.06, 1.02, cycle)) * 12.;
    float carry = exp(-pulse * pulse) * smoothstep(source - .08, source + .06, x);
    float light = (.36 * foam + .65 * glint + .31 * refracted + .24 * carry) * (.25 + .75 * density);
    base = mix(base, vec3(.94, 1., .99), min(light, .92));

    float bendMist = (q + .72 + .67 * (broad - .5)) * .88;
    float ghost = exp(-bendMist * bendMist) * (.25 + .75 * broad) * (.55 + .45 * bands);
    float haze = exp(-.62 * (q - .23) * (q - .23)) * (.35 + .65 * plume);
    float intake = smoothstep(.012, .060, x) * mix(.63, 1., opening);
    float eddy = .7 + .3 * smoothstep(-.19, .72, q);
    float mist = (.16 * haze + .14 * ghost) * (1. - depth);
    float body = density * (.35 + .61 * depth) * (.84 + .16 * broad);
    float opacity = (body * eddy + mist) * intake * (1. - .83 * outlet) * reach * taper;
    vec3 diffuse = mix(vec3(.46, .82, .76), vec3(.51, .67, .91), hue);
    gl_FragColor = layer(vec4(mix(diffuse, base, density), opacity), inlets);
  }
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function createWater(gl) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  gl.useProgram(program);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const vertexPosition = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(vertexPosition);
  gl.vertexAttribPointer(vertexPosition, 2, gl.FLOAT, false, 0, 0);

  const portrait = gl.getUniformLocation(program, 'uPortrait');
  const time = gl.getUniformLocation(program, 'uTime');

  return (width, height, seconds, ratio) => {
    gl.viewport(0, 0, width, height);
    gl.uniform1f(portrait, Math.max(0, Math.min(1, 1.75 - ratio * 1.20)));
    gl.uniform1f(time, seconds);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

export function createTransport(canvas) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  let draw = gl && createWater(gl);
  let previousTime = 0;
  let playing = false;
  let video;
  let videoType;

  function setPlaying(active) {
    playing = active;
    if (!video?.isConnected) return;

    if (active) {
      if (video.paused) video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  function showVideo(ratio) {
    if (!video) {
      video = document.createElement('video');
      video.className = 'transport-video';
      video.setAttribute('aria-hidden', 'true');
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
    }

    if (!video.isConnected) {
      canvas.after(video);
      canvas.parentElement.classList.add('transport-with-video');
    }

    const nextType = ratio < .92 ? 'mobile' : 'wide';
    if (nextType === videoType && video.getAttribute('src')) return;
    videoType = nextType;
    video.poster = new URL('./assets/water-' + videoType + '.webp', import.meta.url).href;
    video.src = new URL('./assets/water-' + videoType + '.mp4', import.meta.url).href;
    setPlaying(playing);
  }

  function render(time) {
    previousTime = time;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (!cssWidth || !cssHeight) return;

    if (!draw || gl.isContextLost()) {
      showVideo(cssWidth / cssHeight);
      return;
    }

    const scale = Math.min(window.devicePixelRatio || 1, 1.35, 1500 / cssWidth, 1080 / cssHeight);
    const width = Math.max(1, Math.round(cssWidth * scale));
    const height = Math.max(1, Math.round(cssHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    draw(width, height, time, cssWidth / cssHeight);
  }

  if (gl) {
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      render(previousTime);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      draw = createWater(gl);
      if (draw && video?.isConnected) {
        video.pause();
        video.remove();
        video.removeAttribute('src');
        video.load();
        canvas.parentElement.classList.remove('transport-with-video');
      }
      render(previousTime);
    });
  }

  return { render, setPlaying };
}
