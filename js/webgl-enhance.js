(() => {
  const oldCanvas = document.getElementById('space');
  if (!oldCanvas) return;

  const canvas = oldCanvas.cloneNode(false);
  canvas.setAttribute('aria-label', 'Simulador 3D WebGL del sistema Sol Tierra');
  canvas.style.touchAction = 'none';

  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false });
  if (!gl) {
    console.warn('WebGL no está disponible; se mantiene el simulador original.');
    return;
  }
  oldCanvas.replaceWith(canvas);

  const dayS = document.getElementById('day');
  const hourS = document.getElementById('hour');
  const dayLab = document.getElementById('dayLab');
  const hourLab = document.getElementById('hourLab');
  const read = document.getElementById('read');
  const panel = document.querySelector('.panel');

  const DEG = Math.PI / 180;
  const TILT = 23.44 * DEG;
  const ORBIT_R = 3.35;
  const EARTH_R = 0.82;
  const SUN_R = 0.44;

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function earthPos(doy) {
    const ang = 2 * Math.PI * (doy - cycleStart) / 365;
    return [ORBIT_R * Math.cos(ang), 0, ORBIT_R * Math.sin(ang)];
  }

  function surfVec(latDeg, lonDeg) {
    const lat = latDeg * DEG;
    const lon = lonDeg * DEG;
    return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
  }

  const camera = { yaw: -0.85, pitch: 0.42, dist: 8.4, target: [0, 0, 0], focusMode: 'system', dragMode: 'orbit' };
  let drag = null;
  let earthScreen = { x: 0, y: 0, r: 0 };

  function updateFocusTarget() {
    const ep = earthPos(+dayS.value);
    if (camera.focusMode === 'sun') camera.target = [0, 0, 0];
    else if (camera.focusMode === 'earth') camera.target = ep;
    else if (camera.focusMode === 'system') camera.target = mul(ep, 0.5);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  const style = document.createElement('style');
  style.textContent = `
    .webgl-extra{margin-top:10px;padding-top:10px;border-top:1px solid #d8e4ec}
    .webgl-extra .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
    .webgl-extra button{padding:9px 11px;min-height:40px;font-size:13px}
    .webgl-chip{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#eef5fb;border:1px solid #d4e3ef;font-size:12px;font-weight:700;color:#264256;margin-top:8px}
  `;
  document.head.appendChild(style);

  let modeButtons = [], focusButtons = [];
  if (panel) {
    const box = document.createElement('div');
    box.className = 'webgl-extra';
    box.innerHTML = `
      <div class="small"><b>Controles:</b> mouse arrastra para orbitar; rueda = zoom; modo “Trasladar vista” + arrastrar = mover el foco. Teclado: O orbitar, P trasladar, 1 sistema, 2 Sol, 3 Tierra, 4 libre, R reset, flechas rotan, Shift+flechas trasladan, +/− zoom, [/ ] fecha, ,/. hora. En móvil, toca un modo y luego arrastra.</div>
      <div class="row" id="cameraModeRow">
        <button type="button" id="camModeOrbit">Orbitar</button>
        <button type="button" id="camModePan">Trasladar vista</button>
        <button type="button" id="camZoomIn">Zoom +</button>
        <button type="button" id="camZoomOut">Zoom −</button>
      </div>
      <div class="row" id="cameraFocusRow">
        <button type="button" id="focusSystem">Foco sistema</button>
        <button type="button" id="focusSun">Foco Sol</button>
        <button type="button" id="focusEarth">Foco Tierra</button>
        <button type="button" id="focusFree">Foco libre</button>
      </div>
      <div class="webgl-chip" id="cameraStatus">Modo: orbitar · Foco: sistema</div>
    `;
    panel.appendChild(box);
    modeButtons = [box.querySelector('#camModeOrbit'), box.querySelector('#camModePan')];
    focusButtons = [box.querySelector('#focusSystem'), box.querySelector('#focusSun'), box.querySelector('#focusEarth'), box.querySelector('#focusFree')];

    box.querySelector('#camModeOrbit').onclick = () => { camera.dragMode = 'orbit'; refreshCameraButtons(); };
    box.querySelector('#camModePan').onclick = () => { camera.dragMode = 'pan'; refreshCameraButtons(); };
    box.querySelector('#camZoomIn').onclick = () => { camera.dist = clamp(camera.dist * 0.88, 3.4, 20); redraw(); };
    box.querySelector('#camZoomOut').onclick = () => { camera.dist = clamp(camera.dist * 1.14, 3.4, 20); redraw(); };
    box.querySelector('#focusSystem').onclick = () => { camera.focusMode = 'system'; updateFocusTarget(); refreshCameraButtons(); redraw(); };
    box.querySelector('#focusSun').onclick = () => { camera.focusMode = 'sun'; updateFocusTarget(); refreshCameraButtons(); redraw(); };
    box.querySelector('#focusEarth').onclick = () => { camera.focusMode = 'earth'; updateFocusTarget(); refreshCameraButtons(); redraw(); };
    box.querySelector('#focusFree').onclick = () => { camera.focusMode = 'free'; refreshCameraButtons(); redraw(); };
  }

  function refreshCameraButtons() {
    const status = document.getElementById('cameraStatus');
    modeButtons.forEach(btn => {
      const active = (btn.id === 'camModeOrbit' && camera.dragMode === 'orbit') || (btn.id === 'camModePan' && camera.dragMode === 'pan');
      btn.style.background = active ? '#dceefc' : 'white';
      btn.style.borderColor = active ? '#81b5df' : '#cbd9e2';
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    focusButtons.forEach(btn => {
      const active = (btn.id === 'focusSystem' && camera.focusMode === 'system') || (btn.id === 'focusSun' && camera.focusMode === 'sun') || (btn.id === 'focusEarth' && camera.focusMode === 'earth') || (btn.id === 'focusFree' && camera.focusMode === 'free');
      btn.style.background = active ? '#dceefc' : 'white';
      btn.style.borderColor = active ? '#81b5df' : '#cbd9e2';
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (status) status.textContent = `Modo: ${camera.dragMode === 'orbit' ? 'orbitar' : 'trasladar vista'} · Foco: ${camera.focusMode === 'system' ? 'sistema' : camera.focusMode === 'sun' ? 'Sol' : camera.focusMode === 'earth' ? 'Tierra' : 'libre'}`;
  }

  function m4() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function mul4(a, b) {
    const o = new Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[c * 4 + r] = a[0 * 4 + r] * b[c * 4 + 0] + a[1 * 4 + r] * b[c * 4 + 1] + a[2 * 4 + r] * b[c * 4 + 2] + a[3 * 4 + r] * b[c * 4 + 3];
    return o;
  }
  function tr(v) { const o = m4(); o[12] = v[0]; o[13] = v[1]; o[14] = v[2]; return o; }
  function sc(s) { const o = m4(); o[0] = o[5] = o[10] = s; return o; }
  function rx(a) { const c = Math.cos(a), s = Math.sin(a), o = m4(); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; }
  function ry(a) { const c = Math.cos(a), s = Math.sin(a), o = m4(); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; }
  function persp(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(eye, center, up) {
    const z = norm(sub(eye, center)), x = norm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  }
  function transformVec(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]]; }
  function transformPoint(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]; }
  function projectPoint(vp, p) {
    const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
    const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
    const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    return { x: (x / w * 0.5 + 0.5) * canvas.clientWidth, y: (-0.5 * y / w + 0.5) * canvas.clientHeight, w };
  }
  function earthModel(doy, hour) { const daily = -hour / 24 * 2 * Math.PI; return mul4(tr(earthPos(doy)), mul4(rx(TILT), mul4(ry(daily), sc(EARTH_R)))); }
  function inverseDailyTilt(hour) { return mul4(ry(hour / 24 * 2 * Math.PI), rx(-TILT)); }
  function cameraData() {
    updateFocusTarget();
    const eye = add(camera.target, [camera.dist * Math.cos(camera.pitch) * Math.sin(camera.yaw), camera.dist * Math.sin(camera.pitch), camera.dist * Math.cos(camera.pitch) * Math.cos(camera.yaw)]);
    const view = lookAt(eye, camera.target, [0, 1, 0]);
    const proj = persp(44 * DEG, canvas.width / canvas.height, 0.1, 80);
    return { eye, view, proj, vp: mul4(proj, view), right: norm([view[0], view[4], view[8]]), up: norm([view[1], view[5], view[9]]) };
  }

  function shader(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function program(vs, fs) { const p = gl.createProgram(); gl.attachShader(p, shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
  function buffer(data, target = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, usage); return b; }

  const earthProgram = program(`
    attribute vec3 aPos; attribute vec2 aUv; uniform mat4 uM; uniform mat4 uVP; varying vec3 vLocal; varying vec3 vWorldN; varying vec2 vUv;
    void main(){ vLocal = normalize(aPos); vec4 world = uM * vec4(aPos, 1.0); vWorldN = normalize((uM * vec4(aPos, 0.0)).xyz); vUv = aUv; gl_Position = uVP * world; }
  `, `
    precision mediump float;
    varying vec3 vLocal; varying vec3 vWorldN; varying vec2 vUv; uniform sampler2D uTex; uniform vec3 uLightWorld; uniform float uSubLat;
    void main(){
      vec3 N = normalize(vWorldN); vec3 L = normalize(uLightWorld); float ndl = dot(N, L); float diffuse = max(ndl, 0.0); float daylight = smoothstep(-0.20, 0.12, ndl);
      vec3 tex = texture2D(uTex, vUv).rgb; vec3 night = tex * vec3(0.32, 0.36, 0.46) + vec3(0.015, 0.025, 0.05); vec3 day = tex * (0.58 + 0.52 * diffuse);
      float lat = asin(clamp(vLocal.y, -1.0, 1.0)); float directBand = exp(-pow((lat - uSubLat) / 0.24, 2.0)); float hemiBand = exp(-pow((lat - uSubLat) / 0.72, 2.0)); float twilight = exp(-pow(ndl / 0.08, 2.0));
      vec3 radiation = vec3(1.0, 0.73, 0.22) * (0.62 * directBand * (0.25 + 0.75 * diffuse) + 0.18 * hemiBand * daylight); vec3 terminator = vec3(0.92, 0.95, 1.0) * (0.14 * twilight) + vec3(1.0, 0.87, 0.38) * (0.08 * twilight);
      vec3 color = mix(night, day, daylight); color += radiation; color += terminator; gl_FragColor = vec4(color, 1.0);
    }
  `);
  const colorProgram = program(`attribute vec3 aPos; uniform mat4 uM; uniform mat4 uVP; uniform float uPointSize; void main(){ gl_Position = uVP * uM * vec4(aPos, 1.0); gl_PointSize = uPointSize; }`, `precision mediump float; uniform vec4 uColor; void main(){ gl_FragColor = uColor; }`);
  const sunProgram = program(`attribute vec3 aPos; uniform mat4 uM; uniform mat4 uVP; varying vec3 vN; void main(){ vN = normalize(aPos); gl_Position = uVP * uM * vec4(aPos, 1.0); }`, `precision mediump float; varying vec3 vN; void main(){ float g = 0.72 + 0.28 * dot(normalize(vN), normalize(vec3(-0.4, 0.7, 0.6))); gl_FragColor = vec4(vec3(1.0, 0.74, 0.14) * g + vec3(0.22, 0.10, 0.0), 1.0); }`);

  function makeSphere(latN = 72, lonN = 108) {
    const pos = [], uv = [], idx = [];
    for (let y = 0; y <= latN; y++) { const v = y / latN, lat = Math.PI / 2 - v * Math.PI; for (let x = 0; x <= lonN; x++) { const u = x / lonN, lon = u * Math.PI * 2 - Math.PI; pos.push(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)); uv.push(u, 1 - v); } }
    for (let y = 0; y < latN; y++) for (let x = 0; x < lonN; x++) { const a = y * (lonN + 1) + x, b = a + lonN + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    return { pos: new Float32Array(pos), uv: new Float32Array(uv), idx: new Uint16Array(idx), count: idx.length };
  }
  const sphere = makeSphere(); sphere.posB = buffer(sphere.pos); sphere.uvB = buffer(sphere.uv); sphere.idxB = buffer(sphere.idx, gl.ELEMENT_ARRAY_BUFFER);
  function lineBuffer(points) { return { buf: buffer(new Float32Array(points.flat())), count: points.length }; }
  const orbitPoints = []; for (let i = 0; i <= 360; i++) { const a = i / 360 * 2 * Math.PI; orbitPoints.push([ORBIT_R * Math.cos(a), 0, ORBIT_R * Math.sin(a)]); }
  const orbitBuffer = lineBuffer(orbitPoints), axisBuffer = lineBuffer([[0, -1.38, 0], [0, 1.38, 0]]);
  const equatorBuffer = lineBuffer(Array.from({ length: 241 }, (_, i) => surfVec(0, -180 + i * 360 / 240)));
  const tropicNBuffer = lineBuffer(Array.from({ length: 241 }, (_, i) => surfVec(23.44, -180 + i * 360 / 240)));
  const tropicSBuffer = lineBuffer(Array.from({ length: 241 }, (_, i) => surfVec(-23.44, -180 + i * 360 / 240)));
  const pointBuffer = buffer(new Float32Array([0, 0, 0]));
  function dynamicLatBuffer(latDeg) { return lineBuffer(Array.from({ length: 241 }, (_, i) => surfVec(latDeg, -180 + i * 360 / 240))); }

  function textureFromContinents() {
    const cnv = document.createElement('canvas'); cnv.width = 2048; cnv.height = 1024; const c = cnv.getContext('2d');
    c.fillStyle = '#2d7bb7'; c.fillRect(0, 0, cnv.width, cnv.height); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) { const x = (lon + 180) / 360 * cnv.width; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, cnv.height); c.stroke(); }
    for (let lat = -60; lat <= 60; lat += 30) { const y = (90 - lat) / 180 * cnv.height; c.beginPath(); c.moveTo(0, y); c.lineTo(cnv.width, y); c.stroke(); }
    const xy = (lat, lon) => [(lon + 180) / 360 * cnv.width, (90 - lat) / 180 * cnv.height];
    c.fillStyle = '#63a14a'; c.strokeStyle = '#2f5f24'; c.lineWidth = 2.2;
    Object.values(continents).forEach(poly => { c.beginPath(); poly.forEach((p, i) => { const q = xy(p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); c.fill(); c.stroke(); });
    const ch = xy(-33.45, -70.66); c.fillStyle = '#ff1744'; c.beginPath(); c.arc(ch[0], ch[1], 8, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.stroke();
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.generateMipmap(gl.TEXTURE_2D); return tex;
  }
  const earthTex = textureFromContinents();
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.clearColor(0.03, 0.06, 0.12, 1.0);

  function useAttr(prog, name, buf, size) { const loc = gl.getAttribLocation(prog, name); if (loc < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); }
  function setMat(prog, name, m) { const loc = gl.getUniformLocation(prog, name); if (loc) gl.uniformMatrix4fv(loc, false, new Float32Array(m)); }
  function setVec3(prog, name, v) { const loc = gl.getUniformLocation(prog, name); if (loc) gl.uniform3fv(loc, new Float32Array(v)); }
  function setFloat(prog, name, v) { const loc = gl.getUniformLocation(prog, name); if (loc) gl.uniform1f(loc, v); }
  function setColor(v) { gl.uniform4fv(gl.getUniformLocation(colorProgram, 'uColor'), new Float32Array(v)); }
  function drawLine(bufObj, model, vp, color, width = 1) { gl.useProgram(colorProgram); useAttr(colorProgram, 'aPos', bufObj.buf, 3); setMat(colorProgram, 'uM', model); setMat(colorProgram, 'uVP', vp); setFloat(colorProgram, 'uPointSize', 4); setColor(color); gl.lineWidth(width); gl.drawArrays(gl.LINE_STRIP, 0, bufObj.count); }
  function drawPoint(worldPos, vp, color, size) { gl.useProgram(colorProgram); useAttr(colorProgram, 'aPos', pointBuffer, 3); setMat(colorProgram, 'uM', tr(worldPos)); setMat(colorProgram, 'uVP', vp); setFloat(colorProgram, 'uPointSize', size); setColor(color); gl.drawArrays(gl.POINTS, 0, 1); }
  function drawPointCloud(points, vp, color, size) { if (!points.length) return; const tmp = buffer(new Float32Array(points.flat())); gl.useProgram(colorProgram); useAttr(colorProgram, 'aPos', tmp, 3); setMat(colorProgram, 'uM', m4()); setMat(colorProgram, 'uVP', vp); setFloat(colorProgram, 'uPointSize', size); setColor(color); gl.drawArrays(gl.POINTS, 0, points.length); gl.deleteBuffer(tmp); }
  function beamParticleCloud(ep) {
    const axis = norm(ep); let u = norm(cross(axis, [0, 1, 0])); if (len(u) < 0.01) u = [1, 0, 0]; const v = norm(cross(axis, u)); const pts = [];
    for (let i = 0; i < 620; i++) { const a = i * 2.3999632297; const h1 = (Math.sin(i * 12.9898) * 43758.5453) % 1; const h2 = (Math.sin(i * 78.233) * 24634.6345) % 1; const r1 = Math.abs(h1); const t = 0.05 + 0.90 * ((i * 37 % 620) / 619); const sigma = EARTH_R * (0.10 + 0.62 * t); const radial = sigma * Math.sqrt(-2.0 * Math.log(Math.max(0.015, 1.0 - r1))) * 0.44; const coreBias = (i % 5 === 0) ? 0.22 : 1.0; const rr = radial * coreBias; const center = mul(ep, t); pts.push(add(center, add(mul(u, Math.cos(a) * rr), mul(v, Math.sin(a) * rr)))); }
    return pts;
  }
  function drawEarth(ep, model, vp, lightWorld, subLatRad) { gl.useProgram(earthProgram); useAttr(earthProgram, 'aPos', sphere.posB, 3); useAttr(earthProgram, 'aUv', sphere.uvB, 2); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphere.idxB); setMat(earthProgram, 'uM', model); setMat(earthProgram, 'uVP', vp); setVec3(earthProgram, 'uLightWorld', lightWorld); setFloat(earthProgram, 'uSubLat', subLatRad); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, earthTex); gl.uniform1i(gl.getUniformLocation(earthProgram, 'uTex'), 0); gl.drawElements(gl.TRIANGLES, sphere.count, gl.UNSIGNED_SHORT, 0); }

  function drawScene() {
    const doy = +dayS.value, hour = +hourS.value, row = byDoy[doy], ep = earthPos(doy), cam = cameraData();
    const lightWorld = norm(mul(ep, -1)); // direction from Earth surface toward the Sun
    const model = earthModel(doy, hour), inverse = inverseDailyTilt(hour), lightLocal = norm(transformVec(inverse, lightWorld));
    const subLatRad = Math.asin(clamp(lightLocal[1], -1, 1)), subLatDeg = subLatRad / DEG;
    resize(); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawLine(orbitBuffer, m4(), cam.vp, [0.62, 0.83, 1.0, 0.55], 1);
    [[79, [0.96, 0.75, 0.38, 1]], [172, [0.55, 0.84, 1, 1]], [265, [0.70, 1, 0.38, 1]], [355, [0.45, 0.92, 0.48, 1]]].forEach(([d, col]) => drawPoint(earthPos(d), cam.vp, col, 9));
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    drawPointCloud(beamParticleCloud(ep), cam.vp, [1.0, 0.82, 0.22, 0.040], 2.2);
    drawPointCloud(beamParticleCloud(mul(ep, 0.985)), cam.vp, [1.0, 0.92, 0.46, 0.025], 3.8);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);
    gl.useProgram(sunProgram); useAttr(sunProgram, 'aPos', sphere.posB, 3); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphere.idxB); setMat(sunProgram, 'uM', mul4(tr([0, 0, 0]), sc(SUN_R))); setMat(sunProgram, 'uVP', cam.vp); gl.drawElements(gl.TRIANGLES, sphere.count, gl.UNSIGNED_SHORT, 0);
    drawEarth(ep, model, cam.vp, lightWorld, subLatRad);
    drawLine(equatorBuffer, model, cam.vp, [1, 1, 1, 0.55], 1); drawLine(row.declination >= 0 ? tropicNBuffer : tropicSBuffer, model, cam.vp, [1, 0.90, 0.18, 0.65], 1);
    const directLat = dynamicLatBuffer(subLatDeg); drawLine(directLat, model, cam.vp, [1, 0.92, 0.36, 0.98], 3); gl.deleteBuffer(directLat.buf); drawLine(axisBuffer, model, cam.vp, [1, 1, 1, 0.95], 2);
    drawPoint(transformPoint(model, surfVec(-33.45, -70.66)), cam.vp, [1, 0.06, 0.20, 1], 9);
    const projected = projectPoint(cam.vp, ep); earthScreen = { x: projected.x, y: projected.y, r: Math.max(55, canvas.clientWidth / camera.dist * 0.16) };
    const hemi = row.declination < -0.4 ? 'sur' : (row.declination > 0.4 ? 'norte' : 'ninguno');
    dayLab.textContent = `${fmtDate(row.date)} · día ${row.doy}`; hourLab.textContent = `${(+hourS.value).toFixed(2)} h`;
    const srPct = clamp(row.sunriseDec / 24 * 100, 0, 100), ssPct = clamp(row.sunsetDec / 24 * 100, 0, 100), widthPct = Math.max(0, ssPct - srPct);
    read.innerHTML = `<b>${fmtDate(row.date)} de 2026</b><div class="kv"><div>Estación en Chile</div><div>${row.season}</div><div>Salida del sol</div><div>${row.sunrise}</div><div>Puesta del sol</div><div>${row.sunset}</div><div>Duración del día</div><div>${row.daylight}</div><div>Hemisferio con más radiación</div><div>${hemi === 'ninguno' ? 'ninguno (equinoccio)' : hemi}</div><div>Latitud de rayos más directos</div><div>${subLatDeg.toFixed(1)}°</div><div>Motor visual</div><div>WebGL luz volumétrica</div></div><div class="sunbar"><div class="mini" style="left:${srPct}%;width:${widthPct}%"></div></div><div class="small2" style="display:flex;justify-content:space-between;margin-top:4px"><span>00:00</span><span>salida ${row.sunrise}</span><span>puesta ${row.sunset}</span><span>24:00</span></div><p class="small" style="margin:.65em 0 0">La cara diurna se calcula con la normal de la Tierra mirando hacia el Sol. El camino de luz usa puntos con densidad radial: más concentrado en el eje central y más difuso hacia afuera.</p>`;
  }

  drawSystem = drawScene;
  window.__estacionesWebGL = { draw: drawScene, version: 'v5-volumetric-light' };

  function setView(which) { if (which === 'top') { camera.yaw = 0; camera.pitch = 1.26; camera.dist = 8.6; camera.focusMode = 'system'; } else if (which === 'side') { camera.yaw = -Math.PI / 2; camera.pitch = 0.06; camera.dist = 8.0; camera.focusMode = 'system'; } else if (which === 'free') { camera.yaw = -0.85; camera.pitch = 0.42; camera.dist = 8.4; camera.focusMode = 'free'; } else if (which === 'radiation') { camera.yaw = -1.10; camera.pitch = 0.52; camera.dist = 4.8; camera.focusMode = 'earth'; } else if (which === 'chile') { dayS.value = 172; hourS.value = 12; cycleAnimIndex = cycleIndexByDoy[172] || 0; camera.yaw = -0.18; camera.pitch = 0.30; camera.dist = 5.0; camera.focusMode = 'earth'; } updateFocusTarget(); refreshCameraButtons(); redraw(); }
  function dragStartAction(x, y) { const nearEarth = Math.hypot(x - earthScreen.x, y - earthScreen.y) < Math.max(76, earthScreen.r * 1.2); if (camera.dragMode === 'pan') return 'pan'; if (nearEarth) return 'earth'; return 'orbit'; }
  canvas.addEventListener('pointerdown', e => { const rect = canvas.getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top; drag = { x, y, action: dragStartAction(x, y), startYaw: camera.yaw, startPitch: camera.pitch, startTarget: [...camera.target], startDoy: +dayS.value }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!drag) return; const rect = canvas.getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top, dx = x - drag.x, dy = y - drag.y; if (drag.action === 'earth') { const currentIndex = cycleIndexByDoy[drag.startDoy] || 0; const nextIndex = (Math.round(currentIndex + dx * 0.45) % cycleRows.length + cycleRows.length) % cycleRows.length; dayS.value = cycleRows[nextIndex].doy; cycleAnimIndex = nextIndex; } else if (drag.action === 'pan') { camera.focusMode = 'free'; const cam = cameraData(); const scale = camera.dist / 520; camera.target = add(drag.startTarget, add(mul(cam.right, -dx * scale), mul(cam.up, dy * scale))); } else { camera.yaw = drag.startYaw + dx * 0.0085; camera.pitch = clamp(drag.startPitch + dy * 0.0065, -1.36, 1.36); } refreshCameraButtons(); redraw(); });
  canvas.addEventListener('pointerup', () => { drag = null; }); canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); camera.dist = clamp(camera.dist * (e.deltaY > 0 ? 1.08 : 0.92), 3.4, 20); redraw(); }, { passive: false });
  const topBtn = document.getElementById('top'); if (topBtn) topBtn.onclick = () => setView('top');
  const sideBtn = document.getElementById('side'); if (sideBtn) sideBtn.onclick = () => setView('side');
  const freeBtn = document.getElementById('free'); if (freeBtn) freeBtn.onclick = () => setView('free');
  const radBtn = document.getElementById('radiation'); if (radBtn) radBtn.onclick = () => setView('radiation');
  const chileBtn = document.getElementById('chile'); if (chileBtn) chileBtn.onclick = () => setView('chile');
  const yrBtn = document.getElementById('yr'); if (yrBtn) yrBtn.onclick = e => { playY = !playY; e.target.textContent = playY ? 'Pausar año' : 'Animar año'; e.target.setAttribute('aria-pressed', playY ? 'true' : 'false'); };
  const dyBtn = document.getElementById('dy'); if (dyBtn) dyBtn.onclick = e => { playD = !playD; e.target.textContent = playD ? 'Pausar día' : 'Animar día'; e.target.setAttribute('aria-pressed', playD ? 'true' : 'false'); };
  dayS.addEventListener('input', () => { cycleAnimIndex = cycleIndexByDoy[+dayS.value] || 0; if (camera.focusMode !== 'free') updateFocusTarget(); redraw(); }); hourS.addEventListener('input', redraw);
  window.addEventListener('keydown', e => { const tag = document.activeElement && document.activeElement.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; let used = true; const stepPan = camera.dist * 0.055; const cam = cameraData(); if (e.key === 'o' || e.key === 'O') camera.dragMode = 'orbit'; else if (e.key === 'p' || e.key === 'P') camera.dragMode = 'pan'; else if (e.key === '1') { camera.focusMode = 'system'; updateFocusTarget(); } else if (e.key === '2') { camera.focusMode = 'sun'; updateFocusTarget(); } else if (e.key === '3') { camera.focusMode = 'earth'; updateFocusTarget(); } else if (e.key === '4') camera.focusMode = 'free'; else if (e.key === 'r' || e.key === 'R') { camera.yaw = -0.85; camera.pitch = 0.42; camera.dist = 8.4; camera.focusMode = 'system'; updateFocusTarget(); } else if (e.key === '+' || e.key === '=') camera.dist = clamp(camera.dist * 0.90, 3.4, 20); else if (e.key === '-' || e.key === '_') camera.dist = clamp(camera.dist * 1.10, 3.4, 20); else if (e.key === '[') { const i = cycleIndexByDoy[+dayS.value] || 0; const ni = (i - 1 + cycleRows.length) % cycleRows.length; dayS.value = cycleRows[ni].doy; cycleAnimIndex = ni; } else if (e.key === ']') { const i = cycleIndexByDoy[+dayS.value] || 0; const ni = (i + 1) % cycleRows.length; dayS.value = cycleRows[ni].doy; cycleAnimIndex = ni; } else if (e.key === ',') hourS.value = ((+hourS.value + 23.75) % 24).toFixed(2); else if (e.key === '.') hourS.value = ((+hourS.value + 0.25) % 24).toFixed(2); else if (e.key === 'ArrowLeft') { if (e.shiftKey) { camera.focusMode = 'free'; camera.target = add(camera.target, mul(cam.right, -stepPan)); } else camera.yaw -= 0.08; } else if (e.key === 'ArrowRight') { if (e.shiftKey) { camera.focusMode = 'free'; camera.target = add(camera.target, mul(cam.right, stepPan)); } else camera.yaw += 0.08; } else if (e.key === 'ArrowUp') { if (e.shiftKey) { camera.focusMode = 'free'; camera.target = add(camera.target, mul(cam.up, stepPan)); } else camera.pitch = clamp(camera.pitch + 0.06, -1.36, 1.36); } else if (e.key === 'ArrowDown') { if (e.shiftKey) { camera.focusMode = 'free'; camera.target = add(camera.target, mul(cam.up, -stepPan)); } else camera.pitch = clamp(camera.pitch - 0.06, -1.36, 1.36); } else used = false; if (used) { e.preventDefault(); refreshCameraButtons(); redraw(); } });
  refreshCameraButtons(); updateFocusTarget(); redraw();
})();
