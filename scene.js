// 3D scenes that cycle every few seconds.
// Each scene is a photo plus a depth map (near = white). Every pixel is shifted
// in proportion to its depth, so near objects move more than far ones as the
// virtual camera follows the mouse, or the phone's tilt.

(function () {
  // Scenes, in order. Captions name each place for the footer credit line.
  const SCENES = window.AMBIDOCS_SCENES || [
    { image: 'assets/hero.jpg', depth: 'assets/hero-depth.jpg', caption: 'Grand Canyon of the Yellowstone' }
  ];
  const params = new URLSearchParams(location.search);
  // Preview aid: ?hold=1500 shortens the time each scene is shown.
  const holdParam = parseFloat(params.get('hold'));
  const HOLD_MIN = holdParam > 0 ? holdParam : 7000; // ms each scene is shown, picked at random between these
  const HOLD_MAX = holdParam > 0 ? holdParam : 10000;
  const FADE = 1800;       // ms crossfade
  const IMAGE_ASPECT = 16 / 9;

  const PATH = {
    look: 0.022,    // how far the view shifts at full mouse or tilt
    push: 0.03,     // steady push into the scene
    breathe: 0.025  // slow push-in while a scene is on screen
  };

  const canvas = document.getElementById('scene');
  const caption = document.getElementById('scene-caption');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return; // CSS background image stays as the fallback

  const VERT = `
    attribute vec2 p;
    varying vec2 v;
    void main() {
      v = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
      gl_Position = vec4(p, 0.0, 1.0);
    }`;

  const FRAG = `
    precision highp float;
    varying vec2 v;
    uniform sampler2D uImageA;
    uniform sampler2D uDepthA;
    uniform sampler2D uImageB;
    uniform sampler2D uDepthB;
    uniform float uMix;
    uniform vec2 uShift;
    uniform float uPushA;
    uniform float uPushB;
    uniform float uCanvasAspect;
    uniform float uImageAspect;

    const float FOCUS = 0.35;
    const float MARGIN = 0.88;

    vec2 coverUV() {
      vec2 uv = v - 0.5;
      if (uCanvasAspect > uImageAspect) uv.y *= uImageAspect / uCanvasAspect;
      else uv.x *= uCanvasAspect / uImageAspect;
      return uv * MARGIN + 0.5;
    }

    vec2 displace(vec2 uv, float d, float push) {
      float k = d - FOCUS;
      vec2 c = vec2(0.45, 0.55);
      vec2 q = c + (uv - c) * (1.0 - push * k);
      return q + uShift * k;
    }

    vec4 sampleScene(sampler2D img, sampler2D dep, vec2 uv, float push) {
      float d = pow(texture2D(dep, clamp(uv, 0.0, 1.0)).r, 0.65);
      vec2 q = uv;
      for (int i = 0; i < 5; i++) {
        q = displace(uv, d, push);
        d = mix(d, pow(texture2D(dep, clamp(q, 0.0, 1.0)).r, 0.65), 0.7);
      }
      return texture2D(img, clamp(q, 0.001, 0.999));
    }

    void main() {
      vec2 uv = coverUV();
      vec4 a = sampleScene(uImageA, uDepthA, uv, uPushA);
      if (uMix <= 0.0) { gl_FragColor = a; return; }
      vec4 b = sampleScene(uImageB, uDepthB, uv, uPushB);
      gl_FragColor = mix(a, b, uMix);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ['uImageA', 'uDepthA', 'uImageB', 'uDepthB', 'uMix', 'uShift', 'uPushA', 'uPushB', 'uCanvasAspect', 'uImageAspect']
    .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
  gl.uniform1i(U.uImageA, 0);
  gl.uniform1i(U.uDepthA, 1);
  gl.uniform1i(U.uImageB, 2);
  gl.uniform1i(U.uDepthB, 3);

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  function makeTexture(img) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  // Scenes load one after another so the first appears quickly.
  const loaded = []; // { image: tex, depth: tex, caption }
  function loadScene(i) {
    const s = SCENES[i];
    return Promise.all([loadImage(s.image), loadImage(s.depth)]).then(function (imgs) {
      loaded[i] = { image: makeTexture(imgs[0]), depth: makeTexture(imgs[1]), caption: s.caption || '' };
    });
  }

  function bindScene(slot, scene) {
    gl.activeTexture(gl.TEXTURE0 + slot * 2);
    gl.bindTexture(gl.TEXTURE_2D, scene.image);
    gl.activeTexture(gl.TEXTURE0 + slot * 2 + 1);
    gl.bindTexture(gl.TEXTURE_2D, scene.depth);
  }

  // ---------- state ----------
  let hasInput = false;
  let px = 0, py = 0, cx = 0, cy = 0;
  let curIdx = 0, nextIdx = -1;
  let sceneStart = performance.now();
  let fadeStart = 0;
  let holdFor = HOLD_MIN + Math.random() * (HOLD_MAX - HOLD_MIN);

  const forcedParam = params.get('progress');
  const forced = forcedParam === null ? null : Math.min(1, Math.max(0, parseFloat(forcedParam) || 0));

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function setCaption(text) {
    if (caption) caption.textContent = text;
  }

  function nextLoadedIndex(from) {
    for (let step = 1; step <= SCENES.length; step++) {
      const j = (from + step) % SCENES.length;
      if (loaded[j] && j !== from) return j;
    }
    return -1;
  }

  // ---------- phone tilt ----------
  // Android sends orientation events straight away. iPhone needs the viewer to
  // tap a button first (DeviceOrientationEvent.requestPermission), and only
  // over https. Where neither works the scene keeps its slow automatic drift.
  function setupTilt() {
    const btn = document.getElementById('tilt-button');
    let base = null;
    function onTilt(e) {
      if (e.gamma === null || e.beta === null) return;
      if (!base) base = { g: e.gamma, b: e.beta };
      hasInput = true;
      const clamp = function (v) { return Math.max(-1, Math.min(1, v)); };
      px = clamp((e.gamma - base.g) / 20);
      py = clamp((e.beta - base.b) / 20);
    }
    const D = window.DeviceOrientationEvent;
    if (!D) return;
    if (typeof D.requestPermission === 'function') {
      if (!btn || !window.matchMedia('(pointer: coarse)').matches) return;
      btn.hidden = false;
      btn.addEventListener('click', function () {
        D.requestPermission().then(function (state) {
          btn.hidden = true;
          if (state === 'granted') window.addEventListener('deviceorientation', onTilt);
        }).catch(function () { btn.hidden = true; });
      });
    } else {
      window.addEventListener('deviceorientation', onTilt);
    }
  }

  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function draw(now) {
    cx += (px - cx) * 0.06;
    cy += (py - cy) * 0.06;

    // Scene timing (the intro holds the first scene until it has finished)
    if (window.AMBIDOCS_HOLD_SCENE && nextIdx < 0) sceneStart = now;
    if (nextIdx < 0 && SCENES.length > 1 && now - sceneStart > holdFor) {
      const j = nextLoadedIndex(curIdx);
      if (j >= 0) { nextIdx = j; fadeStart = now; setCaption(loaded[j].caption); }
    }
    let mix = 0;
    if (nextIdx >= 0) {
      mix = reduceMotion ? 1 : Math.min(1, (now - fadeStart) / FADE);
      if (mix >= 1) {
        curIdx = nextIdx; nextIdx = -1; mix = 0;
        sceneStart = fadeStart; // the incoming scene's breathe started with the fade
        holdFor = HOLD_MIN + Math.random() * (HOLD_MAX - HOLD_MIN);
      }
    }

    // With no mouse or tilt (phones without motion access), drift in a slow loop.
    if (!hasInput && !reduceMotion) {
      const a = now / 9000;
      px = Math.sin(a) * 0.7;
      py = Math.sin(a * 0.7) * 0.35;
    }
    const lookX = forced !== null ? forced * 2 - 1 : cx;
    const shiftX = lookX * PATH.look;
    const shiftY = cy * PATH.look * 0.6;
    const t = 0.5;
    const breatheA = reduceMotion ? 0 : Math.min(1, (now - sceneStart) / (HOLD_MAX + FADE)) * PATH.breathe;
    const breatheB = reduceMotion || nextIdx < 0 ? 0 : Math.min(1, (now - fadeStart) / (HOLD_MAX + FADE)) * PATH.breathe;

    bindScene(0, loaded[curIdx]);
    if (nextIdx >= 0) bindScene(1, loaded[nextIdx]);
    gl.uniform1f(U.uMix, nextIdx >= 0 ? ease(mix) : 0);
    gl.uniform2f(U.uShift, shiftX, shiftY);
    gl.uniform1f(U.uPushA, t * PATH.push + breatheA);
    gl.uniform1f(U.uPushB, t * PATH.push + breatheB);
    gl.uniform1f(U.uCanvasAspect, canvas.width / canvas.height);
    gl.uniform1f(U.uImageAspect, IMAGE_ASPECT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    document.documentElement.setAttribute('data-scene', String(nextIdx >= 0 && mix > 0.5 ? nextIdx : curIdx));
    requestAnimationFrame(draw);
  }

  loadScene(0).then(function () {
    document.body.classList.add('has-scene');
    setCaption(loaded[0].caption);
    resize();
    window.addEventListener('resize', resize);
    if (!reduceMotion) {
      window.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        hasInput = true;
        px = (e.clientX / window.innerWidth) * 2 - 1;
        py = (e.clientY / window.innerHeight) * 2 - 1;
      }, { passive: true });
      setupTilt();
    }
    sceneStart = performance.now();
    requestAnimationFrame(draw);
    // Load the rest in the background, one at a time.
    let chain = Promise.resolve();
    for (let i = 1; i < SCENES.length; i++) {
      chain = chain.then(function () { return loadScene(i); }).catch(function () {});
    }
  }).catch(function () { /* keep the CSS fallback */ });
})();
