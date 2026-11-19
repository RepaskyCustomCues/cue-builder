/* Rotatable cue. Drag to turn it. Right-drag to pan. Scroll to zoom. */

function createCueView() {
  /* Same scale for length and thickness, so a 58 in cue is 2.2 units long. */
  const INCH = 2.2 / 58;
  const AROUND = 48;
  let span = 2.2;

  const canvas = document.getElementById("cue");
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: true });
  const MIN_ZOOM = 0.055;
  let yaw = 0.55;
  let roll = 0.4;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let mesh = null;
  let dragging = false;
  let panning = false;
  let lastX = 0;
  let lastY = 0;
  let pickBuild = null;

  if (!gl) {
    const note = document.getElementById("stage-caption");
    if (note) note.textContent = "This browser cannot show the 3D cue.";
    return { update() {}, setAtlas() {}, setAtlasPixels() {}, setWoodImages() {}, pick() { return null; }, setView() {}, watchView() {}, nudgeZoom() {} };
  }

  const program = programFrom(gl, VERT_SRC, FRAG_SRC);
  const buffer = gl.createBuffer();
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);

  const uMvp = gl.getUniformLocation(program, "uMvp");
  const uModel = gl.getUniformLocation(program, "uModel");
  const aPos = gl.getAttribLocation(program, "aPos");
  const aNormal = gl.getAttribLocation(program, "aNormal");
  const aColor = gl.getAttribLocation(program, "aColor");
  const aUv = gl.getAttribLocation(program, "aUv");
  const uAtlas = gl.getUniformLocation(program, "uAtlas");
  let atlas = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atlas);
  gl.uniform1i(uAtlas, 0);

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.button !== 2) return;
    dragging = true;
    panning = event.button === 2;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (panning) {
      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width / Math.max(1, rect.height);
      const distance = frameDistance(Math.max(aspect, 0.5)) * zoom;
      const halfH = Math.tan(0.24) * distance * Math.hypot(0.08, 1);
      const halfW = halfH * aspect;
      panX -= dx / rect.width * 2 * halfW;
      panY += dy / rect.height * 2 * halfH;
      clampPan();
      return;
    }
    yaw += dx * 0.01;
    roll += dy * 0.01;
    clearPreset();
  });
  canvas.addEventListener("pointerup", () => {
    dragging = false;
    panning = false;
  });
  canvas.addEventListener("pointercancel", () => {
    dragging = false;
    panning = false;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const next = Math.min(2.4, Math.max(MIN_ZOOM, zoom + event.deltaY * 0.0022));
    if (next === zoom) return;
    const rect = canvas.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    const aspect = rect.width / Math.max(1, rect.height);
    const distance = frameDistance(Math.max(aspect, 0.5)) * zoom;
    const halfH = Math.tan(0.24) * distance * Math.hypot(0.08, 1);
    const halfW = halfH * aspect;
    if (next > zoom) {
      const pull = zoom / next;
      panX *= pull;
      panY *= pull;
    } else {
      panX += nx * halfW * (1 - next / zoom);
      panY += ny * halfH * (1 - next / zoom);
    }
    clampPan();
    zoom = next;
  }, { passive: false });

  function nudgeZoom(direction) {
    const next = Math.min(2.4, Math.max(MIN_ZOOM, zoom * (direction < 0 ? 0.8 : 1.25)));
    if (next === zoom) return;
    if (next > zoom) {
      const pull = zoom / next;
      panX *= pull;
      panY *= pull;
    }
    zoom = next;
    clampPan();
  }
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") yaw -= 0.14;
    else if (event.key === "ArrowRight") yaw += 0.14;
    else if (event.key === "ArrowUp") roll -= 0.14;
    else if (event.key === "ArrowDown") roll += 0.14;
    else return;
    clearPreset();
    event.preventDefault();
  });

  new ResizeObserver(() => resize()).observe(canvas);
  resize();
  requestAnimationFrame(frame);
  window.addEventListener("beforeprint", beginPrintView);
  window.addEventListener("afterprint", endPrintView);
  window.matchMedia("print").addEventListener("change", (event) => {
    if (event.matches) beginPrintView();
    else endPrintView();
  });

  let preset = null;
  let viewListener = () => {};
  let printing = false;
  let screenCamera = null;

  function setView(name) {
    preset = name;
    panX = 0;
    panY = 0;
    if (name === "top") {
      yaw = 0;
      roll = -Math.PI / 2;
    } else if (name === "right") {
      yaw = 0;
      roll = 0;
    } else if (name === "iso") {
      yaw = Math.PI / 4;
      roll = Math.asin(1 / Math.sqrt(3));
    }
    viewListener(preset);
  }

  function clearPreset() {
    if (!preset) return;
    preset = null;
    viewListener(null);
  }

  function beginPrintView() {
    if (printing || !mesh || !pickBuild) return;
    printing = true;
    screenCamera = { yaw, roll, zoom, panX, panY };
    yaw = Math.PI / 4;
    roll = Math.asin(1 / Math.sqrt(3));
    panX = 0;
    panY = 0;
    canvas.style.width = "100%";
    canvas.style.height = "7.4in";
    resize();
    const aspect = canvas.width / Math.max(1, canvas.height);
    zoom = fitZoom(aspect);
    gl.clearColor(1, 1, 1, 1);
    draw();
  }

  function endPrintView() {
    if (!printing || !screenCamera) return;
    printing = false;
    yaw = screenCamera.yaw;
    roll = screenCamera.roll;
    zoom = screenCamera.zoom;
    panX = screenCamera.panX;
    panY = screenCamera.panY;
    screenCamera = null;
    canvas.style.width = "";
    canvas.style.height = "";
    gl.clearColor(0, 0, 0, 0);
    resize();
    draw();
  }

  function fitZoom(aspect) {
    const samples = cueSamples();
    let near = MIN_ZOOM;
    let far = 2.4;
    for (let step = 0; step < 18; step += 1) {
      const mid = (near + far) / 2;
      const extent = cueExtent(viewMatrices(aspect, mid).mvp, samples);
      if (extent > 0.9) near = mid;
      else far = mid;
    }
    return far;
  }

  function viewMatrices(aspect, viewZoom) {
    const distance = frameDistance(aspect) * viewZoom;
    let model;
    let eye;
    let target;
    if (printing || preset === "iso") {
      const elev = Math.asin(1 / Math.sqrt(3));
      const azim = -Math.PI / 4;
      const flat = Math.cos(elev) * distance;
      eye = [panX + flat * Math.sin(azim), panY + Math.sin(elev) * distance, flat * Math.cos(azim)];
      target = [panX, panY, 0];
      model = rotY(0);
    } else {
      model = multiply(rotY(yaw), rotX(roll));
      eye = [panX, panY + distance * 0.08, distance];
      target = [panX, panY, 0];
    }
    const view = lookAt(eye, target, [0, 1, 0]);
    const proj = perspective(0.48, aspect, Math.max(0.008, distance * 0.02), 40);
    return { model, mvp: multiply(proj, multiply(view, model)) };
  }

  function cueSamples() {
    const points = [];
    const mid = (pickBuild.x0 + pickBuild.x1) / 2;
    const steps = 16;
    for (let i = 0; i <= steps; i += 1) {
      const x = pickBuild.x0 + (pickBuild.x1 - pickBuild.x0) * (i / steps);
      const wx = (x - mid) * INCH;
      const wr = Math.max(0.0004, pickBuild.radiusAt(x) * INCH);
      for (let turn = 0; turn < 8; turn += 1) {
        const angle = (turn / 8) * Math.PI * 2;
        points.push([wx, Math.cos(angle) * wr, Math.sin(angle) * wr]);
      }
    }
    return points;
  }

  function cueExtent(mvp, samples) {
    let extent = 0;
    for (const point of samples) {
      const x = mvp[0] * point[0] + mvp[4] * point[1] + mvp[8] * point[2] + mvp[12];
      const y = mvp[1] * point[0] + mvp[5] * point[1] + mvp[9] * point[2] + mvp[13];
      const w = mvp[3] * point[0] + mvp[7] * point[1] + mvp[11] * point[2] + mvp[15];
      if (w <= 0) return Infinity;
      extent = Math.max(extent, Math.abs(x / w), Math.abs(y / w));
    }
    return extent;
  }

  function update(build) {
    pickBuild = build;
    mesh = buildMesh(build);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.DYNAMIC_DRAW);
    if (window.matchMedia("print").matches) {
      printing = false;
      beginPrintView();
      return;
    }
    draw();
  }

  function frame() {
    requestAnimationFrame(frame);
    draw();
  }

  function clampPan() {
    const limit = span * 0.62;
    panX = Math.min(limit, Math.max(-limit, panX));
    panY = Math.min(limit, Math.max(-limit, panY));
  }

  /* Inches from the bumper where the cursor meets the cue, or null on a miss. */
  function pick(clientX, clientY) {
    if (!pickBuild) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const aspect = canvas.width / canvas.height;
    const distance = frameDistance(aspect) * zoom;
    const model = multiply(rotY(yaw), rotX(roll));
    const eye = [panX, panY + distance * 0.08, distance];
    const view = lookAt(eye, [panX, panY, 0], [0, 1, 0]);
    const proj = perspective(0.48, aspect, Math.max(0.008, distance * 0.02), 40);
    const mvp = multiply(proj, multiply(view, model));
    const mid = (pickBuild.x0 + pickBuild.x1) / 2;
    const sx = (clientX - rect.left) * (canvas.width / rect.width);
    const sy = (clientY - rect.top) * (canvas.height / rect.height);
    let best = null;
    const steps = 96;
    for (let i = 0; i <= steps; i += 1) {
      const x = pickBuild.x0 + (pickBuild.x1 - pickBuild.x0) * (i / steps);
      const wx = (x - mid) * INCH;
      const wr = Math.max(0.0004, pickBuild.radiusAt(x) * INCH);
      const center = projectPoint(mvp, [wx, 0, 0], canvas.width, canvas.height);
      const up = projectPoint(mvp, [wx, wr, 0], canvas.width, canvas.height);
      const side = projectPoint(mvp, [wx, 0, wr], canvas.width, canvas.height);
      if (!center || !up || !side) continue;
      const reach = Math.max(screenDistance(center, up), screenDistance(center, side), 6);
      const offset = screenDistance(center, { sx, sy });
      if (offset > reach * 1.35) continue;
      if (!best || center.depth < best.depth) best = { x, depth: center.depth };
    }
    return best ? { x: best.x } : null;
  }

  function frameDistance(aspect) {
    const half = span * 0.5 + span * 0.06;
    const tanH = Math.tan(0.24) * Math.max(aspect, 0.5);
    return (half / tanH) * 1.45;
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function draw() {
    if (!mesh) return;
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const aspect = canvas.width / canvas.height;
    const { model, mvp } = viewMatrices(aspect, zoom);
    gl.uniformMatrix4fv(uMvp, false, mvp);
    gl.uniformMatrix4fv(uModel, false, model);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNormal);
    gl.enableVertexAttribArray(aColor);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, stride, 12);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 24);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, stride, 36);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.length / 11);
  }

  function buildMesh(build) {
    const data = [];
    const x0 = build.x0;
    const x1 = build.x1;
    const mid = (x0 + x1) / 2;
    span = (x1 - x0) * INCH;
    const rings = sampleAxis(build.breaks, build.linenDetail).map((x) => ({
      x,
      wx: (x - mid) * INCH,
      wr: Math.max(0.0004, build.radiusAt(x) * INCH),
    }));
    for (let i = 0; i < rings.length; i += 1) {
      const prev = rings[Math.max(0, i - 1)];
      const next = rings[Math.min(rings.length - 1, i + 1)];
      const dx = next.wx - prev.wx;
      const dr = next.wr - prev.wr;
      const len = Math.hypot(dx, dr) || 1;
      rings[i].nAx = -dr / len;
      rings[i].nRad = dx / len;
    }
    for (let i = 0; i < rings.length - 1; i += 1) {
      const span = rings[i + 1].x - rings[i].x;
      const eps = Math.min(0.00015, span * 0.2);
      const xNear = rings[i].x + eps;
      const xFar = rings[i + 1].x - eps;
      const xMid = (rings[i].x + rings[i + 1].x) / 2;
      const probe = build.colorAt(xMid, 0);
      const around = Math.max(AROUND, probe.detail || 0);
      for (let j = 0; j < around; j += 1) {
        const a0 = (j / around) * Math.PI * 2;
        const a1 = ((j + 1) / around) * Math.PI * 2;
        const left = build.colorAt(xMid, a0);
        const right = build.colorAt(xMid, a1);
        const uvJump = Math.abs((left.uv ? left.uv[1] : 0) - (right.uv ? right.uv[1] : 0)) > 0.5;
        if (left.flat || right.flat || uvJump) {
          const sample = build.colorAt(xMid, (a0 + a1) / 2);
          pushTri(data, placed(rings[i], a0, sample), placed(rings[i], a1, sample), placed(rings[i + 1], a1, sample));
          pushTri(data, placed(rings[i], a0, sample), placed(rings[i + 1], a1, sample), placed(rings[i + 1], a0, sample));
        } else {
          const p00 = ringVert(rings[i], a0, build, xNear);
          const p10 = ringVert(rings[i], a1, build, xNear);
          const p01 = ringVert(rings[i + 1], a0, build, xFar);
          const p11 = ringVert(rings[i + 1], a1, build, xFar);
          pushTri(data, p00, p10, p11);
          pushTri(data, p00, p11, p01);
        }
      }
    }
    addFlatCap(data, rings[0], build, -1);
    if (build.flatEnd) addFlatCap(data, rings[rings.length - 1], build, 1);
    else addCap(data, rings[rings.length - 1], build, 1);
    if (build.points) for (const spec of build.points) addPoints(data, build, mid, spec);
    return new Float32Array(data);
  }

  function sampleAxis(breaks, fine) {
    const edges = [...breaks].sort((a, b) => a - b);
    const xs = [];
    for (let i = 0; i < edges.length - 1; i += 1) {
      const start = edges[i];
      const end = edges[i + 1];
      const width = end - start;
      const onWrap = fine && start >= fine.x0 - 0.0001 && end <= fine.x1 + 0.0001;
      const steps = Math.max(2, Math.ceil(width / (onWrap ? fine.step : 0.15)));
      for (let step = 0; step < steps; step += 1) xs.push(start + width * step / steps);
    }
    xs.push(edges[edges.length - 1]);
    return xs;
  }

  function ringVert(ring, angle, build, xSample) {
    return placed(ring, angle, build.colorAt(xSample == null ? ring.x : xSample, angle));
  }

  function placed(ring, angle, sample) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      p: [ring.wx, ring.wr * cos, ring.wr * sin],
      n: [ring.nAx, ring.nRad * cos, ring.nRad * sin],
      c: sample.rgb,
      uv: sample.uv,
    };
  }

  function addFlatCap(data, ring, build, direction) {
    const steps = 8;
    const color = build.colorAt(ring.x, 0);
    for (let s = 0; s < steps; s += 1) {
      const r0 = ring.wr * (s / steps);
      const r1 = ring.wr * ((s + 1) / steps);
      for (let j = 0; j < AROUND; j += 1) {
        const a0 = (j / AROUND) * Math.PI * 2;
        const a1 = ((j + 1) / AROUND) * Math.PI * 2;
        const v00 = flatCapVert(ring, r0, a0, direction, color);
        const v10 = flatCapVert(ring, r0, a1, direction, color);
        const v01 = flatCapVert(ring, r1, a0, direction, color);
        const v11 = flatCapVert(ring, r1, a1, direction, color);
        if (direction > 0) {
          pushTri(data, v00, v11, v10);
          pushTri(data, v00, v01, v11);
        } else {
          pushTri(data, v00, v10, v11);
          pushTri(data, v00, v11, v01);
        }
      }
    }
  }

  function flatCapVert(ring, radius, angle, direction, color) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      p: [ring.wx, radius * cos, radius * sin],
      n: [direction, 0, 0],
      c: color.rgb,
      uv: color.uv,
    };
  }

  function addCap(data, ring, build, direction) {
    const steps = 10;
    const color = build.colorAt(ring.x, 0);
    for (let s = 0; s < steps; s += 1) {
      const t0 = (s / steps) * (Math.PI / 2);
      const t1 = ((s + 1) / steps) * (Math.PI / 2);
      for (let j = 0; j < AROUND; j += 1) {
        const a0 = (j / AROUND) * Math.PI * 2;
        const a1 = ((j + 1) / AROUND) * Math.PI * 2;
        const v00 = capVert(ring, t0, a0, direction, color);
        const v10 = capVert(ring, t0, a1, direction, color);
        const v01 = capVert(ring, t1, a0, direction, color);
        const v11 = capVert(ring, t1, a1, direction, color);
        if (direction > 0) {
          pushTri(data, v00, v11, v10);
          pushTri(data, v00, v01, v11);
        } else {
          pushTri(data, v00, v10, v11);
          pushTri(data, v00, v11, v01);
        }
      }
    }
  }

  function capVert(ring, theta, angle, direction, color) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const axial = ring.wx + direction * Math.sin(theta) * ring.wr;
    const rad = Math.cos(theta) * ring.wr;
    const nx = direction * Math.sin(theta);
    const nr = Math.cos(theta);
    return {
      p: [axial, rad * cos, rad * sin],
      n: [nx, nr * cos, nr * sin],
      c: color.rgb,
      uv: color.uv,
    };
  }

  function addPoints(data, build, mid, spec) {
    const count = spec.count;
    const baseHalf = count >= 6 ? 0.22 : 0.3;
    const layers = spec.veneers.map((color, index) => ({
      color,
      extra: (spec.veneers.length - index) * 0.055,
      lift: 0.004 + index * 0.003,
    }));
    layers.push({
      color: spec.fill,
      colorAt: spec.colorAt,
      extra: 0,
      lift: 0.004 + spec.veneers.length * 0.003 + 0.003,
    });
    const start = Math.PI / 2;
    for (let point = 0; point < count; point += 1) {
      const center = start + point * (Math.PI * 2 / count);
      for (const layer of layers) {
        const half0 = baseHalf + layer.extra;
        const xEnd = layer.extra === 0 ? spec.x1 : spec.layerEnds[layers.indexOf(layer)];
        addWedge(data, build, mid, spec.x0, xEnd, center, half0, 0, layer.lift, layer.color, layer.colorAt);
      }
    }
  }

  function addWedge(data, build, mid, x0, x1, center, half0, half1, lift, color, colorAt) {
    const along = 28;
    const across = 6;
    const grid = [];
    for (let i = 0; i <= along; i += 1) {
      const row = [];
      const t = i / along;
      const x = x0 + (x1 - x0) * t;
      const wr = (build.radiusAt(x) + lift) * INCH;
      const wx = (x - mid) * INCH;
      const half = half0 + (half1 - half0) * t;
      for (let j = 0; j <= across; j += 1) {
        const angle = center + (j / across - 0.5) * 2 * half;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const sample = colorAt ? colorAt(x, angle) : { rgb: color, uv: [-1, 0] };
        row.push({
          p: [wx, wr * cos, wr * sin],
          n: [0, cos, sin],
          c: sample.rgb,
          uv: sample.uv,
        });
      }
      grid.push(row);
    }
    for (let i = 0; i < along; i += 1) {
      for (let j = 0; j < across; j += 1) {
        pushTri(data, grid[i][j], grid[i][j + 1], grid[i + 1][j + 1]);
        pushTri(data, grid[i][j], grid[i + 1][j + 1], grid[i + 1][j]);
      }
    }
  }

  function pushTri(data, a, b, c) {
    for (const vert of [a, b, c]) {
      const uv = vert.uv || [-1, 0];
      data.push(
        vert.p[0], vert.p[1], vert.p[2],
        vert.n[0], vert.n[1], vert.n[2],
        vert.c[0], vert.c[1], vert.c[2],
        uv[0], uv[1]
      );
    }
  }

  function setAtlas(source) {
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function setAtlasPixels(pixels, width, height) {
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /* Places each 512×64 wood photo on a new atlas without reading its pixels.
     The current atlas stays in place if the upload fails. */
  function setWoodImages(images) {
    const next = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, next);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 1024, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    images.forEach((image, index) => {
      if (!image || !image.width) return;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, index * 64, gl.RGBA, gl.UNSIGNED_BYTE, image);
    });
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.deleteTexture(atlas);
    atlas = next;
  }

  return { update, setAtlas, setAtlasPixels, setWoodImages, pick, setView, nudgeZoom, watchView(fn) { viewListener = fn; } };
}

function programFrom(gl, vert, frag) {
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(program));
  return program;
}

function shader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(shader));
  return shader;
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function rotX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

function rotY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

function lookAt(eye, target, up) {
  const z = norm([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norm(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function projectPoint(mvp, point, width, height) {
  const x = mvp[0] * point[0] + mvp[4] * point[1] + mvp[8] * point[2] + mvp[12];
  const y = mvp[1] * point[0] + mvp[5] * point[1] + mvp[9] * point[2] + mvp[13];
  const z = mvp[2] * point[0] + mvp[6] * point[1] + mvp[10] * point[2] + mvp[14];
  const w = mvp[3] * point[0] + mvp[7] * point[1] + mvp[11] * point[2] + mvp[15];
  if (w <= 0) return null;
  return {
    sx: (x / w * 0.5 + 0.5) * width,
    sy: (1 - (y / w * 0.5 + 0.5)) * height,
    depth: z / w,
  };
}

function screenDistance(a, b) {
  return Math.hypot(a.sx - b.sx, a.sy - b.sy);
}

const VERT_SRC = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute vec2 aUv;
uniform mat4 uMvp;
uniform mat4 uModel;
varying vec3 vColor;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vColor = aColor;
  vUv = aUv;
  vNormal = uModel[0].xyz * aNormal.x + uModel[1].xyz * aNormal.y + uModel[2].xyz * aNormal.z;
  gl_Position = uMvp * vec4(aPos, 1.0);
}`;

const FRAG_SRC = `
precision mediump float;
varying vec3 vColor;
varying vec3 vNormal;
varying vec2 vUv;
uniform sampler2D uAtlas;
void main() {
  vec3 albedo = vColor;
  if (vUv.x >= 0.0) {
    float strip = floor(vUv.y * 0.5 + 0.0001);
    float around = vUv.y - strip * 2.0;
    float v = (strip * 128.0 + 0.5 + fract(around) * 127.0) / 1024.0;
    albedo = texture2D(uAtlas, vec2(vUv.x, v)).rgb;
  }
  vec3 n = normalize(vNormal);
  float key = max(dot(n, normalize(vec3(0.25, 0.82, 0.5))), 0.0);
  float fill = max(dot(n, normalize(vec3(-0.45, 0.15, 0.35))), 0.0);
  gl_FragColor = vec4(albedo * (0.42 + key * 0.62 + fill * 0.14), 1.0);
}`;

window.CueView = createCueView();
