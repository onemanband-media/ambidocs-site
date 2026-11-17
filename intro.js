// Scroll-driven intro: a headset faces the viewer over the AMBIDOCS wordmark,
// turns round as the page scrolls, and the camera flies in through its two
// lenses into the first scene.
// The headset is original geometry built here, not a manufacturer's model.

(function () {
  const intro = document.getElementById('intro');
  const space = document.querySelector('.intro-space');
  const canvas = document.getElementById('headset');
  const hint = document.querySelector('.intro-hint');
  const word = document.querySelector('.intro-word');
  if (!intro || !space || !canvas) return;

  function bail() { document.documentElement.classList.add('no-intro'); }
  const T = window.THREE;
  if (!T) return bail();

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  } catch (e) { return bail(); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  // Preview aid: ?intro=0.6 pins the intro at that point of the scroll.
  const forcedParam = params.get('intro');
  const forced = forcedParam === null ? null : Math.min(1, Math.max(0, parseFloat(forcedParam) || 0));

  const scene = new T.Scene();
  const FOV = 32;
  const camera = new T.PerspectiveCamera(FOV, 1, 0.01, 100);

  // ---------- studio reflections ----------
  // The first scene sits in front of the headset in the reflected
  // surroundings, so it shows up in the black glass.
  function buildEnv(img) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 512);
    bg.addColorStop(0, '#3a3f47');
    bg.addColorStop(0.5, '#15171a');
    bg.addColorStop(1, '#050506');
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 512);
    if (img) {
      const w = 620, h = 330;
      const m = document.createElement('canvas');
      m.width = w; m.height = h;
      const mg = m.getContext('2d');
      mg.drawImage(img, 0, 0, w, h);
      mg.globalCompositeOperation = 'destination-in';
      const fx = mg.createLinearGradient(0, 0, w, 0);
      fx.addColorStop(0, 'rgba(0,0,0,0)'); fx.addColorStop(0.18, '#000'); fx.addColorStop(0.82, '#000'); fx.addColorStop(1, 'rgba(0,0,0,0)');
      mg.fillStyle = fx; mg.fillRect(0, 0, w, h);
      const fy = mg.createLinearGradient(0, 0, 0, h);
      fy.addColorStop(0, 'rgba(0,0,0,0)'); fy.addColorStop(0.2, '#000'); fy.addColorStop(0.8, '#000'); fy.addColorStop(1, 'rgba(0,0,0,0)');
      mg.fillStyle = fy; mg.fillRect(0, 0, w, h);
      g.drawImage(m, 768 - w / 2, 256 - h / 2); // u = 0.75 faces the camera
    }
    function light(x, y, w, h, color) {
      const r = g.createRadialGradient(x, y, 0, x, y, w);
      r.addColorStop(0, color);
      r.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.translate(x, y); g.scale(1, h / w); g.translate(-x, -y);
      g.fillStyle = r;
      g.fillRect(x - w, y - w, w * 2, w * 2);
      g.restore();
    }
    light(240, 120, 180, 80, 'rgba(255,255,255,0.95)');
    light(660, 70, 200, 40, 'rgba(255,236,205,0.8)');
    light(900, 240, 100, 140, 'rgba(200,220,255,0.5)');
    light(460, 300, 120, 40, 'rgba(242,192,120,0.5)');
    const tex = new T.CanvasTexture(c);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.encoding = T.sRGBEncoding;
    const pmrem = new T.PMREMGenerator(renderer);
    const old = scene.environment;
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    if (old) old.dispose();
    tex.dispose();
    pmrem.dispose();
  }
  buildEnv(null);
  if ((window.AMBIDOCS_SCENES || [])[0]) {
    const envImg = new Image();
    envImg.onload = function () { buildEnv(envImg); };
    envImg.src = window.AMBIDOCS_SCENES[0].image;
  }

  // A woven fabric for the face padding, in place of the model's speckled one.
  function fabricTexture(repeatX, repeatY) {
    const n = 64, c = document.createElement('canvas');
    c.width = n; c.height = n;
    const g = c.getContext('2d');
    g.fillStyle = '#2b2d31';
    g.fillRect(0, 0, n, n);
    const cell = 16;
    for (let y = 0; y < n; y += cell) for (let x = 0; x < n; x += cell) {
      const over = ((x + y) / cell) % 2 === 0;
      for (let k = 0; k < 2; k++) {
        const horizontal = over ? k === 0 : k === 1;
        const px = x + (k ? cell / 2 : 0);
        const gr = horizontal ? g.createLinearGradient(0, y, 0, y + cell) : g.createLinearGradient(px, 0, px + cell / 2, 0);
        gr.addColorStop(0, '#191a1d'); gr.addColorStop(0.5, '#4a4d54'); gr.addColorStop(1, '#191a1d');
        g.fillStyle = gr;
        g.fillRect(px, y, cell / 2, cell);
      }
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(repeatX || FABRIC_REPEAT, repeatY || FABRIC_REPEAT);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }
  const FABRIC_REPEAT = parseFloat(params.get('fabric')) || 60;

  scene.add(new T.AmbientLight(0xffffff, 0.25));
  const key = new T.DirectionalLight(0xffffff, 1.1);
  key.position.set(2, 3, 4);
  scene.add(key);

  // Lenses show the first scene in screen space, so that when they fill the
  // view the picture lines up with the real scene behind the intro.
  const scenes = window.AMBIDOCS_SCENES || [];
  const lensUniforms = {
    uTex: { value: null },
    uRes: { value: new T.Vector2(1, 1) },
    uImageAspect: { value: 16 / 9 },
    uOn: { value: 0 },
    uOpen: { value: 0 }
  };
  if (scenes[0]) {
    new T.TextureLoader().load(scenes[0].image, function (tex) {
      tex.flipY = false;
      tex.minFilter = T.LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      lensUniforms.uTex.value = tex;
    });
  }
  const lensMat = new T.ShaderMaterial({
    uniforms: lensUniforms,
    side: T.DoubleSide,
    transparent: true,
    depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'precision highp float;',
      'varying vec2 vUv;',
      'uniform sampler2D uTex; uniform vec2 uRes; uniform float uImageAspect; uniform float uOn; uniform float uOpen;',
      'void main(){',
      '  vec2 v = gl_FragCoord.xy / uRes; v.y = 1.0 - v.y;',
      '  vec2 uv = v - 0.5; float ca = uRes.x / uRes.y;',
      '  if (ca > uImageAspect) uv.y *= uImageAspect / ca; else uv.x *= ca / uImageAspect;',
      '  uv = uv * 0.88 + 0.5;',
      '  vec3 c = texture2D(uTex, uv).rgb;',
      '  float r = distance(vUv, vec2(0.5)) * 2.0;',
      '  float rim = mix(smoothstep(1.0, 0.8, r) * 0.65 + 0.35, 1.0, uOpen);',
      '  float edge = smoothstep(1.0, mix(0.86, 0.45, uOpen), r);',
      '  gl_FragColor = vec4(c * rim * mix(0.1, 1.0, uOn), edge);',
      '}'
    ].join('\n')
  });
  const headset = new T.Group();
  scene.add(headset);
  const lenses = [];
  const fadeUniform = { value: 1 };
  const fading = []; // parts that fade out of the camera's way (the rear band)
  let lensZ = 0.13, lensY = 0.02, frontZ = 0.26, ready = false;

  function addLens(parent, x, y, z, r) {
    const disc = new T.Mesh(new T.CircleGeometry(r, 64), lensMat);
    disc.position.set(x, y, z);
    disc.userData.z0 = z;
    parent.add(disc);
    lenses.push(disc);
  }

  function start() {
    ready = true;
    canvas.classList.add('is-ready');
  }

  const GLASS_PART = 'Object_74', PADDING = (params.get('pad') || 'WicotZnvNvRZKUL').split(',');
  const GLASS_COLOR = '#' + (params.get('glass') || '3c4048');

  const REMOVED = /^Object_(60|61|62|3[2-9])$/, BAND = /^Object_3[2-9]$/;
  const GRAPHITE = 0x121316, GUNMETAL = 0x25272b, DARK_FABRIC = 0x2a2c30;

  // Dissolve with a fine dither, so inner layers never show through.
  function dissolving(m) {
    m.onBeforeCompile = function (shader) {
      shader.uniforms.uFade = fadeUniform;
      shader.fragmentShader = shader.fragmentShader.replace('void main() {',
        'uniform float uFade;\nvoid main() {\n  if (uFade < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;');
    };
    m.customProgramCacheKey = function () { return 'dissolve'; };
    return m;
  }

  // ---------- the headset model ----------
  // Adapted from a model by pravinvamp (Sketchfab), CC BY 4.0: parts removed,
  // band replaced and finish changed.
  function useModel(gltf) {
    const model = gltf.scene;
    const holder = new T.Group();
    holder.add(model);
    holder.rotation.y = MODEL_TURN;
    headset.add(holder);
    headset.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(holder);
    holder.scale.setScalar(2.2 / box.getSize(new T.Vector3()).x);
    headset.updateMatrixWorld(true);
    box.setFromObject(holder);
    holder.position.sub(box.getCenter(new T.Vector3()));
    headset.updateMatrixWorld(true);
    box.setFromObject(holder);
    frontZ = box.max.z;
    const eyes = [];
    const parts = [];
    const bandBox = new T.Box3();
    model.traverse(function (o) {
      if (!o.isMesh) return;
      const b = new T.Box3().setFromObject(o);
      // Leave out the dial, the top button and the ribbed band; a plain strap
      // of our own replaces the band below.
      if (REMOVED.test(o.name)) {
        if (BAND.test(o.name)) bandBox.union(b);
        o.visible = false;
        return;
      }
      if (/^Object_(53|57)$/.test(o.name)) eyes.push(b);
      else parts.push({ mesh: o, z: b.getCenter(new T.Vector3()).z });
      if (params.get('tint')) {
        const ti = params.get('tint').split(',').indexOf(o.material.name);
        if (ti >= 0) o.material = new T.MeshBasicMaterial({ color: [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff][ti % 6] });
      }
      else if (o.name !== GLASS_PART && PADDING.indexOf(o.material.name) < 0) {
        // Our own darker finish: bright metal becomes gunmetal, pale fabric
        // becomes dark grey, and nothing glows.
        const m = o.material.clone();
        const bright = (m.color.r + m.color.g + m.color.b) / 3 > 0.35;
        if (m.map) m.color.set(DARK_FABRIC);
        else if (bright) m.color.set(GUNMETAL);
        if (m.emissive) m.emissive.set(0x000000);
        m.emissiveMap = null;
        o.material = m;
      }
      if (o.name === GLASS_PART) {
        // Lift the glass from near-black so the scene reads in its reflection.
        o.material = o.material.clone();
        o.material.color.set(GLASS_COLOR);
        o.material.envMapIntensity = 1.3;
      }
      if (PADDING.indexOf(o.material.name) >= 0) {
        const weave = fabricTexture();
        o.material = o.material.clone();
        o.material.map = weave;
        o.material.bumpMap = weave;
        o.material.bumpScale = 0.004;
        o.material.normalMap = null;
        o.material.color.set(0x5a5d63);
        o.material.metalness = 0;
        o.material.roughness = 0.95;
        o.material.needsUpdate = true;
      }
    });
    // Everything well behind the lenses (the band and its fittings) fades
    // away as the camera flies in from the back.
    const backLimit = (eyes[0] ? eyes[0].min.z : box.min.z + (box.max.z - box.min.z) * 0.6) - 0.25;
    parts.forEach(function (part) {
      if (part.z >= backLimit) return;
      const m = dissolving(part.mesh.material.clone());
      // Our own finish: plain graphite in place of the pale knit.
      m.map = null;
      m.color.set(GRAPHITE);
      m.metalness = 0.15;
      m.roughness = 0.85;
      part.mesh.material = m;
      fading.push(part.mesh);
    });
    if (!bandBox.isEmpty()) {
      // A plain strap round the back, where the ribbed band was.
      const c = bandBox.getCenter(new T.Vector3()), sz = bandBox.getSize(new T.Vector3());
      const a = sz.x / 2, h = sz.y * 0.5, N = 48, pos = [], uv = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI;
        const x = c.x + a * Math.cos(th), z = bandBox.max.z - sz.z * Math.sin(th);
        pos.push(x, c.y - h / 2, z, x, c.y + h / 2, z);
        uv.push(i / N, 0, i / N, 1);
        if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const weave = fabricTexture(48, 6);
      const strap = new T.Mesh(g, dissolving(new T.MeshStandardMaterial({ color: 0x2c2e33, map: weave, bumpMap: weave, bumpScale: 0.004, roughness: 0.95, metalness: 0, side: T.DoubleSide })));
      headset.add(strap);
      fading.push(strap);
    }
    eyes.forEach(function (b) {
      const c = b.getCenter(new T.Vector3());
      const sz = b.getSize(new T.Vector3());
      const z = b.min.z - 0.006;
      addLens(headset, c.x, c.y, z, Math.min(sz.x, sz.y) * 0.47);
      lensZ = -z;
      lensY = c.y;
    });
    if (params.get('debug')) parts.forEach(function (part) {
      const b = new T.Box3().setFromObject(part.mesh), m = part.mesh.material;
      if (m.normalMap || m.map) console.log('FRONT', part.mesh.name, m.name, m.type, '#' + m.color.getHexString(), 'r', m.roughness, 'm', m.metalness, 'tr', m.transparent, m.opacity, 'map', !!m.map, 'z', b.min.z.toFixed(2), b.max.z.toFixed(2), 'w', (b.max.x - b.min.x).toFixed(2), 'h', (b.max.y - b.min.y).toFixed(2), 'nm', !!m.normalMap);
    });
    start();
  }

  // ---------- stand-in headset, used only if the model fails to load ----------
  function buildFallback() {
  const A = 1.1, B = 0.56, POWER = 3.4, SEG = 120;
  const BEND = 0.22; // how far the visor wraps round the face

  function outline(i, s) {
    const th = (i / SEG) * Math.PI * 2;
    const c = Math.cos(th), sn = Math.sin(th);
    const x = A * Math.sign(c) * Math.pow(Math.abs(c), 2 / POWER);
    let y = B * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / POWER);
    if (y < 0) y += 0.2 * Math.exp(-Math.pow(x / 0.26, 2)) * (-y / B); // nose notch
    return [x * s, y * s];
  }

  // A surface lofted through rings of [scale, z], bent round the face.
  function surface(rings, material) {
    const pos = [], idx = [];
    rings.forEach(function (ring) {
      for (let i = 0; i <= SEG; i++) {
        const p = outline(i, ring[0]);
        pos.push(p[0], p[1], ring[1] - BEND * p[0] * p[0]);
      }
    });
    const row = SEG + 1;
    for (let j = 0; j < rings.length - 1; j++) {
      for (let i = 0; i < SEG; i++) {
        const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new T.Mesh(geo, material);
  }

  const DS = T.DoubleSide;
  const glassMat = new T.MeshPhysicalMaterial({ color: 0x07080a, metalness: 0.4, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.5, side: DS });
  const frameMat = new T.MeshStandardMaterial({ color: 0xcfd2d6, metalness: 1, roughness: 0.28, side: DS });
  const sealMat = new T.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0, roughness: 0.95, side: DS });
  const plateMat = new T.MeshStandardMaterial({ color: 0x050505, metalness: 0.2, roughness: 0.8, side: DS });
  const bandMat = new T.MeshStandardMaterial({ color: 0xb9bcc1, metalness: 0.15, roughness: 0.75 });
  const ringMat = new T.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 0.9, roughness: 0.35 });

  const dome = [];
  [0.001, 0.2, 0.4, 0.6, 0.8, 0.9, 0.97].forEach(function (s) { dome.push([s, 0.26 - 0.07 * s * s]); });
  headset.add(surface(dome, glassMat));
  headset.add(surface([[0.97, 0.194], [1.0, 0.17], [1.01, 0.1], [1.0, 0.0], [0.96, -0.02]], frameMat));
  headset.add(surface([[0.96, -0.02], [0.93, -0.2], [0.9, -0.32], [0.86, -0.34], [0.81, -0.32], [0.84, -0.05]], sealMat));
  headset.add(surface([[0.84, -0.05], [0.5, -0.05], [0.001, -0.05]], plateMat));

  [-1, 1].forEach(function (side) {
    const arm = new T.Mesh(new T.BoxGeometry(0.05, 0.2, 1.1), bandMat);
    arm.position.set(side * 1.05, 0.02, -0.8);
    arm.rotation.y = -side * 0.06;
    headset.add(arm);
  });
  const knob = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.05, 32), frameMat);
  knob.position.set(0.72, 0.535, -0.02);
  headset.add(knob);

  [-1, 1].forEach(function (side) {
    const ring = new T.Mesh(new T.TorusGeometry(0.22, 0.018, 16, 64), ringMat);
    ring.position.set(side * 0.3, 0.02, -0.13);
    headset.add(ring);
    addLens(headset, side * 0.3, 0.02, -0.13, 0.21);
  });
    start();
  }

  const MODEL_TURN = (parseFloat(params.get('modelturn')) || -90) * Math.PI / 180;
  if (T.GLTFLoader) new T.GLTFLoader().load(window.AMBIDOCS_HEADSET || 'assets/headset.glb', useModel, undefined, buildFallback);
  else buildFallback();

  // ---------- layout ----------
  let startDist = 6;
  function resize() {
    const w = intro.clientWidth, h = intro.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const fill = camera.aspect > 1 ? 0.52 : 0.8; // share of the width the headset takes
    startDist = 2.3 / (fill * 2 * Math.tan((FOV * Math.PI) / 360) * camera.aspect);
    renderer.getDrawingBufferSize(lensUniforms.uRes.value);
  }
  resize();
  window.addEventListener('resize', resize);

  let mx = 0, my = 0, cmx = 0, cmy = 0;
  if (!reduceMotion) {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function smooth(v) { v = clamp01(v); return v * v * (3 - 2 * v); }

  // ---------- wordmark that breaks into dust ----------
  // The word is cut into small grains. Each grain's flight depends only on how
  // far the page has scrolled, so scrolling back up puts the word together again.
  const dust = document.getElementById('dust');
  const dctx = dust ? dust.getContext('2d') : null;
  const STRIPS = 48;
  let strips = [], grainSize = 2, dustDpr = 1, reach = 600;
  let crisp = null, crispX = 0, crispY = 0, crispW = 1;
  function gold(f) {
    const e = 1 - Math.pow(Math.abs(2 * f - 1), 2);
    return 'rgb(' + ((190 + 52 * e) | 0) + ',' + ((154 + 38 * e) | 0) + ',' + ((104 + 16 * e) | 0) + ')';
  }
  function buildDust() {
    if (!dctx || !word) return;
    const w = intro.clientWidth, h = intro.clientHeight;
    if (!w || !h) return;
    dustDpr = Math.min(window.devicePixelRatio || 1, 2);
    dust.width = Math.round(w * dustDpr);
    dust.height = Math.round(h * dustDpr);
    reach = Math.max(w, h) * 0.6;
    const cs = getComputedStyle(word);
    const size = parseFloat(cs.fontSize);
    const spacing = parseFloat(cs.letterSpacing) || 0;
    const bandH = Math.ceil(size * 1.4);
    const off = document.createElement('canvas');
    off.width = w; off.height = bandH;
    const o = off.getContext('2d');
    o.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + size + 'px ' + cs.fontFamily;
    o.textBaseline = 'alphabetic';
    o.fillStyle = '#fff';
    const chars = word.textContent.trim().split('');
    const widths = chars.map(function (ch) { return o.measureText(ch).width; });
    const total = widths.reduce(function (a, b) { return a + b; }, 0) + spacing * (chars.length - 1);
    const m = o.measureText('AMBIDOCS');
    const ascent = m.fontBoundingBoxAscent || size * 0.9, descent = m.fontBoundingBoxDescent || size * 0.25;
    const base = bandH / 2 + (ascent - descent) / 2; // centre the font box, as CSS does
    const x0 = (w - total) / 2;
    let x = x0;
    chars.forEach(function (ch, i) { o.fillText(ch, x, base); x += widths[i] + spacing; });
    const data = o.getImageData(0, 0, w, bandH).data;
    // A sharp copy of the word, for the letters the dust has not reached yet.
    crisp = document.createElement('canvas');
    crisp.width = Math.round(w * dustDpr); crisp.height = Math.round(bandH * dustDpr);
    const cc = crisp.getContext('2d');
    cc.scale(dustDpr, dustDpr);
    cc.font = o.font;
    cc.textBaseline = 'alphabetic';
    const grad = cc.createLinearGradient(x0, 0, x0 + total, 0);
    for (let i = 0; i <= 8; i++) grad.addColorStop(i / 8, gold(i / 8));
    cc.fillStyle = grad;
    x = x0;
    chars.forEach(function (ch, i) { cc.fillText(ch, x, base); x += widths[i] + spacing; });
    crispX = x0; crispW = total; crispY = (h - bandH) / 2;
    grainSize = size < 90 ? 1 : size > 150 ? 3 : 2;
    const y0 = (h - bandH) / 2;
    strips = [];
    for (let i = 0; i < STRIPS; i++) strips.push([]);
    const half = grainSize >> 1;
    for (let y = 0; y < bandH; y += grainSize) {
      for (let gx = Math.floor(x0); gx < x0 + total; gx += grainSize) {
        if (gx + half >= w || data[((y + half) * w + gx + half) * 4 + 3] < 110) continue;
        const f = (gx - x0) / total;
        const ang = -0.55 + (Math.random() - 0.5) * 1.7;
        const dist = 0.15 + Math.random() * 0.55;
        strips[Math.max(0, Math.min(STRIPS - 1, Math.floor(f * STRIPS)))].push({
          x: gx, y: y0 + y,
          delay: f * 0.5 + Math.random() * 0.14,
          dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist,
          ph: Math.random() * 6.283
        });
      }
    }
  }
  buildDust();
  window.addEventListener('resize', buildDust);

  function drawDust(d, now) {
    if (!dctx || !word) return;
    word.style.visibility = d > 0 ? 'hidden' : '';
    dctx.clearRect(0, 0, dust.width, dust.height);
    if (d <= 0 || d >= 1) return;
    const k = dustDpr, tm = reduceMotion ? 0 : now * 0.0012;
    // Letters right of the front are still whole: draw them sharp.
    const front = Math.min(1, d / 0.5);
    if (crisp && front < 1) {
      const sx = Math.round((crispX + crispW * front) * k);
      dctx.drawImage(crisp, sx, 0, crisp.width - sx, crisp.height, sx, Math.round(crispY * k), crisp.width - sx, crisp.height);
    }
    for (let i = 0; i < STRIPS; i++) {
      const f = (i + 0.5) / STRIPS;
      if (i / STRIPS > front) break;
      dctx.fillStyle = gold(f);
      const list = strips[i];
      for (let n = 0; n < list.length; n++) {
        const q = list[n];
        let t = (d - q.delay) / 0.32;
        if (t >= 1) continue;
        if (t < 0) t = 0;
        const e = t * t;
        const sz = grainSize * (1 - t * 0.8) * k;
        const wob = Math.sin(tm + q.ph) * 7 * t;
        dctx.fillRect((q.x + q.dx * reach * e + wob) * k, (q.y + q.dy * reach * e + wob * 0.6) * k, sz, sz);
      }
    }
  }

  let hidden = false, glided = false, lastP = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const p = forced !== null ? forced : clamp01(window.scrollY / Math.max(1, space.offsetHeight));
    drawDust(clamp01((p - 0.02) / 0.3), now);

    // Once through the eyepieces, carry on to the opening text without
    // waiting for more scrolling. Re-arms when the viewer scrolls back up.
    if (forced === null && !reduceMotion) {
      if (p < 0.8) glided = false;
      else if (!glided && p >= 0.86 && p < 1 && p > lastP) {
        glided = true;
        window.scrollTo({ top: space.offsetHeight, behavior: 'smooth' });
      }
      lastP = p;
    }
    if (!ready) return;

    // The scene behind waits on its first picture until the intro is over.
    window.AMBIDOCS_HOLD_SCENE = p < 1;
    if (p >= 1) {
      if (!hidden) { intro.style.visibility = 'hidden'; hidden = true; }
      return;
    }
    if (hidden) { intro.style.visibility = ''; hidden = false; }

    const t = reduceMotion ? 0 : now / 1000;
    cmx += (mx - cmx) * 0.06;
    cmy += (my - cmy) * 0.06;

    const turn = smooth(p / 0.5);
    const zoom = smooth((p - 0.42) / 0.5);
    const open = smooth((p - 0.7) / 0.2);
    const idle = 1 - turn;

    headset.rotation.y = turn * Math.PI + idle * (cmx * 0.28 + Math.sin(t * 0.5) * 0.08);
    headset.rotation.x = idle * (cmy * 0.12 + Math.sin(t * 0.4) * 0.03);
    headset.position.y = (1 - zoom) * Math.sin(t * 0.8) * 0.03;

    // Fly from in front of the headset to just short of the lenses.
    const far = frontZ + startDist * (1 - 0.15 * turn) - lensZ;
    camera.position.set(0, lensY * zoom, lensZ + far * Math.pow(0.42 / far, zoom));
    camera.rotation.set(0, 0, 0);

    const bandOpacity = 1 - smooth((p - 0.2) / 0.28);
    fadeUniform.value = bandOpacity;
    fading.forEach(function (o) { o.visible = bandOpacity > 0.01; });

    lensUniforms.uOn.value = smooth((p - 0.25) / 0.3);
    lensUniforms.uOpen.value = open;
    lenses.forEach(function (disc) {
      const s = 1 + 4 * open;
      disc.scale.set(s, s, 1);
      disc.position.z = disc.userData.z0 - 0.3 * open;
    });

    intro.style.opacity = String(1 - smooth((p - 0.88) / 0.12));
    if (hint) hint.style.opacity = String(1 - clamp01(p / 0.06));

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
})();
