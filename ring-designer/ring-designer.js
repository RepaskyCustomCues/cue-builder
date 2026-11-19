const STORAGE_KEY = "cuebuilder.ring-designer.v2";
const THICKNESS_CHOICES = {
  fiber: [0.015, 0.032, 0.063, 0.090],
  metal: [0.007, 0.015, 0.032, 0.062],
};
const DOT_DIAMETERS = [0.05, 0.078, 0.125];
const ISO_ANGLE = Math.PI / 6;
const COS30 = Math.cos(ISO_ANGLE);
const SIN30 = Math.sin(ISO_ANGLE);

const design = loadDesign();
const history = [];
let lastSnapshot = "";
let restoring = false;

const countInput = document.getElementById("groove-count");
const widthInput = document.getElementById("groove-width");
const angleInput = document.getElementById("groove-angle");
const leanInput = document.getElementById("groove-lean");
const leanOut = document.getElementById("lean-out");
const thicknessInput = document.getElementById("thickness");
const thicknessChoice = document.getElementById("thickness-choice");
const grooveControls = document.getElementById("groove-controls");
const grooveOnly = document.getElementById("groove-only");
const dotOnly = document.getElementById("dot-only");
const dotDiameterInput = document.getElementById("dot-diameter");
const stackList = document.getElementById("stack");

buildMaterials();
bindControls();
publish();
window.addEventListener("resize", paintAll);

function loadDesign() {
  const starter = { nextId: 2, centerId: 1, selectedId: 1, layers: [makeLayer(1, true)] };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || !Array.isArray(saved.layers) || !saved.layers.length) return starter;
    const layers = saved.layers.map((layer) => normalizeLayer(layer)).filter((layer) => materialById(layer.material));
    if (!layers.some((layer) => layer.id === saved.centerId)) return starter;
    return {
      nextId: Number(saved.nextId) || layers.length + 1,
      centerId: saved.centerId,
      selectedId: layers.some((layer) => layer.id === saved.selectedId) ? saved.selectedId : saved.centerId,
      showHidden: Boolean(saved.showHidden),
      layers,
    };
  } catch (error) {
    return starter;
  }
}

function makeLayer(id, grooved) {
  return normalizeLayer({
    id,
    material: "fiber-white",
    thickness: 0.09,
    face: grooved ? "grooves" : "plain",
    grooves: { count: 8, width: 0.05, axisAngle: 0 },
    dots: { count: 8, diameter: 0.078 },
  });
}

function inlayById(id) {
  const material = materialById(id);
  return material && material.kind !== "fiber" ? material : materialById("ebony");
}

function normalizeDotPattern(pattern) {
  if (!Array.isArray(pattern) || !pattern.length) return null;
  return pattern.slice(0, 9).map((size) => nearestThickness(Number.isFinite(Number(size)) ? size : 0.078, DOT_DIAMETERS));
}

function nearestThickness(value, choices) {
  const target = Number.isFinite(Number(value)) ? Number(value) : choices[choices.length - 1];
  return choices.reduce((best, size) => (Math.abs(size - target) < Math.abs(best - target) ? size : best));
}

function formatThickness(value, materialId) {
  const material = materialById(materialId);
  const places = material && THICKNESS_CHOICES[material.kind] ? 3 : (Math.round(value * 1000) % 10 ? 3 : 2);
  return value.toFixed(places);
}

function layerFace(layer) {
  if (layer.face === "plain" || layer.face === "grooves" || layer.face === "dots") return layer.face;
  return layer.grooved ? "grooves" : "plain";
}

function normalizeLayer(layer) {
  const grooves = layer.grooves || {};
  const dots = layer.dots || {};
  const count = clampInt(grooves.count, 1, 36);
  const dotCount = clampInt(Number.isFinite(Number(dots.count)) ? dots.count : count, 1, 36);
  const face = layerFace(layer);
  const material = materialForFace(materialById(layer.material) ? layer.material : "fiber-white", face);
  const dotDiameter = nearestThickness(Number.isFinite(Number(dots.diameter)) ? dots.diameter : 0.078, DOT_DIAMETERS);
  const dotPattern = normalizeDotPattern(dots.pattern);
  const minWidth = face === "dots" ? Math.round((largestDotDiameter({ diameter: dotDiameter, pattern: dotPattern }) + 0.025) * 1000) / 1000 : 0;
  const choices = THICKNESS_CHOICES[materialById(material).kind];
  const presetsFit = choices && (!minWidth || choices[choices.length - 1] + 1e-9 >= minWidth);
  const thickness = presetsFit
    ? nearestThickness(Math.max(Number(layer.thickness) || 0, minWidth), minWidth ? choices.filter((size) => size + 1e-9 >= minWidth) : choices)
    : clampNum(Math.max(Number(layer.thickness) || 0, minWidth || 0.04), minWidth || 0.04, 0.75, minWidth || 0.11);
  const width = clampNum(grooves.width, 0.05, Math.min(0.25, (Math.PI * RING_OD / count) * 0.8), 0.05);
  return {
    id: layer.id,
    material,
    thickness,
    face,
    grooved: face === "grooves",
    inlay: inlayById(layer.inlay).id,
    grooves: {
      count,
      width: Math.round(width * 1000) / 1000,
      axisAngle: clampInt(Number.isFinite(Number(grooves.axisAngle)) ? grooves.axisAngle : 0, -45, 45),
    },
    dots: {
      count: dotCount,
      diameter: dotDiameter,
      pattern: dotPattern,
    },
  };
}

function largestDotDiameter(dots) {
  if (dots.pattern && dots.pattern.length) return Math.max(...dots.pattern);
  return dots.diameter;
}

function allowedMaterialKinds(face) {
  return face === "dots" ? ["wood"] : ["fiber", "wood", "metal"];
}

function materialForFace(materialId, face) {
  const material = materialById(materialId);
  if (material && allowedMaterialKinds(face).includes(material.kind)) return material.id;
  return "maple";
}

function bindControls() {
  document.getElementById("mode-plain").addEventListener("click", () => {
    selected().face = "plain";
    selected().grooved = false;
    fitSelected();
    publish();
  });
  document.getElementById("mode-grooved").addEventListener("click", () => {
    selected().face = "grooves";
    selected().grooved = true;
    fitSelected();
    publish();
  });
  document.getElementById("mode-dots").addEventListener("click", () => {
    selected().face = "dots";
    selected().grooved = false;
    fitSelected();
    publish();
  });
  countInput.addEventListener("input", () => {
    const count = clampInt(countInput.value, 1, 36);
    if (selected().face === "dots") selected().dots.count = count;
    else selected().grooves.count = count;
    fitSelected();
    publish();
  });
  widthInput.addEventListener("change", () => {
    selected().grooves.width = Number(widthInput.value);
    fitSelected();
    publish();
  });
  angleInput.addEventListener("change", () => {
    const spacing = clampNum(angleInput.value, 10, 360, 45);
    const count = clampInt(Math.round(360 / spacing), 1, 36);
    if (selected().face === "dots") selected().dots.count = count;
    else selected().grooves.count = count;
    fitSelected();
    publish();
  });
  dotDiameterInput.addEventListener("change", () => {
    selected().dots.diameter = Number(dotDiameterInput.value);
    fitSelected();
    publish();
  });
  document.getElementById("dot-pattern").addEventListener("change", (event) => {
    selected().dots.pattern = event.target.checked ? [0.125, 0.078, 0.05] : null;
    fitSelected();
    publish();
  });
  document.getElementById("dot-pattern-add").addEventListener("click", () => {
    const pattern = selected().dots.pattern;
    if (!pattern || pattern.length >= 9) return;
    pattern.push(0.05);
    fitSelected();
    publish();
  });
  document.getElementById("dot-pattern-list").addEventListener("change", (event) => {
    const select = event.target.closest("select");
    if (!select || !selected().dots.pattern) return;
    selected().dots.pattern[Number(select.dataset.index)] = Number(select.value);
    fitSelected();
    publish();
  });
  document.getElementById("dot-pattern-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-size]");
    const pattern = selected().dots.pattern;
    if (!button || !pattern || pattern.length <= 1) return;
    pattern.splice(Number(button.dataset.removeSize), 1);
    fitSelected();
    publish();
  });
  document.getElementById("hidden-lines").addEventListener("change", (event) => {
    design.showHidden = event.target.checked;
    publish();
  });
  leanInput.addEventListener("input", () => {
    selected().grooves.axisAngle = clampInt(leanInput.value, -45, 45);
    publish();
  });
  thicknessInput.addEventListener("change", () => {
    selected().thickness = Number(thicknessInput.value);
    fitSelected();
    publish();
  });
  thicknessChoice.addEventListener("change", () => {
    selected().thickness = Number(thicknessChoice.value);
    fitSelected();
    publish();
  });
  document.getElementById("add-left-new").addEventListener("click", () => addLayer(-1, false));
  document.getElementById("add-left-copy").addEventListener("click", () => addLayer(-1, true));
  document.getElementById("add-right-new").addEventListener("click", () => addLayer(1, false));
  document.getElementById("add-right-copy").addEventListener("click", () => addLayer(1, true));
  stackList.addEventListener("click", (event) => {
    const row = event.target.closest(".layer");
    if (!row) return;
    const id = Number(row.dataset.id);
    if (event.target.dataset.remove != null) {
      design.layers = design.layers.filter((layer) => layer.id !== id);
      if (design.selectedId === id) design.selectedId = design.centerId;
      publish();
      return;
    }
    design.selectedId = id;
    publish();
  });
  bindStackDrag();
  document.getElementById("undo-ring").addEventListener("click", undoDesign);
  document.getElementById("copy-ring").addEventListener("click", () => {
    duplicateStack();
  });
  document.getElementById("stack-positions").addEventListener("change", paintStackPrice);
  document.getElementById("add-to-cue").addEventListener("click", () => {
    const positions = [...document.querySelectorAll("#stack-positions input:checked")].map((input) => input.value);
    if (!positions.length) return;
    paintAll();
    const payload = { positions, design: exportStack() };
    window.location.href = `../index.html#ringdesign=${encodeURIComponent(JSON.stringify(payload))}`;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      window.location.href = document.getElementById("esc-cue").href;
      return;
    }
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey && !typing) {
      event.preventDefault();
      undoDesign();
    }
  });
}

function buildMaterials() {
  buildMaterialPicker("materials", (id) => {
    selected().material = id;
    fitSelected();
    publish();
  });
  buildMaterialPicker("inlays", (id) => {
    selected().inlay = id;
    publish();
  }, ["wood", "metal"]);
}

function buildMaterialPicker(rootId, onPick, kinds) {
  const root = document.getElementById(rootId);
  const tiles = rootId === "materials";
  let group = "";
  let wrap = null;
  for (const material of RING_MATERIALS) {
    if (kinds && !kinds.includes(material.kind)) continue;
    if (material.group !== group) {
      group = material.group;
      const block = document.createElement("div");
      block.className = "material-group";
      const heading = document.createElement("h3");
      heading.textContent = group;
      wrap = document.createElement("div");
      wrap.className = tiles ? "material-tiles" : "chips";
      block.append(heading, wrap);
      root.append(block);
    }
    wrap.append(tiles ? materialTile(material, onPick) : materialChip(material, onPick));
  }
}

function materialChip(material, onPick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip";
  button.dataset.material = material.id;
  button.style.background = material.fill;
  button.title = material.name;
  button.setAttribute("aria-label", material.name);
  button.addEventListener("click", () => onPick(material.id));
  return button;
}

function materialTile(material, onPick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "material-tile";
  button.dataset.material = material.id;
  button.setAttribute("aria-pressed", "false");
  if (material.kind === "wood") {
    const photo = document.createElement("span");
    photo.className = "tile-photo";
    photo.style.backgroundImage = `url("../woods/${material.id}.png")`;
    button.append(photo);
  } else {
    button.style.background = material.fill;
  }
  const name = document.createElement("span");
  name.className = "tile-name";
  name.textContent = material.name;
  button.append(name);
  button.addEventListener("click", () => onPick(material.id));
  return button;
}

function duplicateStack() {
  const copies = design.layers.map((layer) => {
    const copy = normalizeLayer({
      ...layer,
      id: design.nextId,
      grooves: { ...layer.grooves },
      dots: {
        ...layer.dots,
        pattern: layer.dots.pattern ? [...layer.dots.pattern] : null,
      },
    });
    design.nextId += 1;
    return copy;
  });
  design.layers.push(...copies);
  publish();
}

function addLayer(direction, duplicate) {
  const center = design.layers.find((layer) => layer.id === design.centerId);
  const layer = duplicate
    ? normalizeLayer({ ...center, id: design.nextId, grooves: { ...center.grooves } })
    : makeLayer(design.nextId, false);
  design.nextId += 1;
  const index = design.layers.findIndex((item) => item.id === design.centerId);
  design.layers.splice(direction < 0 ? index : index + 1, 0, layer);
  design.selectedId = layer.id;
  publish();
}

function fitSelected() {
  const layer = selected();
  const fitted = normalizeLayer(layer);
  layer.face = fitted.face;
  layer.grooved = fitted.grooved;
  layer.material = fitted.material;
  layer.thickness = fitted.thickness;
  layer.grooves = fitted.grooves;
  layer.dots = fitted.dots;
}

function undoDesign() {
  const previous = history.pop();
  if (!previous) return;
  const saved = JSON.parse(previous);
  design.nextId = saved.nextId;
  design.centerId = saved.centerId;
  design.selectedId = saved.selectedId;
  design.showHidden = saved.showHidden;
  design.layers = saved.layers;
  restoring = true;
  publish();
  restoring = false;
}

function publish() {
  const current = JSON.stringify(design);
  if (!restoring && lastSnapshot && lastSnapshot !== current) {
    history.push(lastSnapshot);
    if (history.length > 40) history.shift();
  }
  lastSnapshot = current;
  const undo = document.getElementById("undo-ring");
  if (undo) undo.disabled = history.length === 0;
  const layer = selected();
  document.getElementById("layer-heading").textContent = layer.id === design.centerId
    ? "Center layer"
    : "Selected layer";
  document.getElementById("hidden-lines").checked = Boolean(design.showHidden);
  const dotted = layer.face === "dots";
  const materialNote = document.getElementById("material-note");
  materialNote.textContent = dotted
    ? "Dots need a wood ring. Fiber and metal are too thin."
    : "The selected layer.";
  const kinds = allowedMaterialKinds(layer.face);
  for (const group of document.querySelectorAll("#materials .material-group")) {
    const tiles = [...group.querySelectorAll(".material-tile")];
    let shown = 0;
    for (const tile of tiles) {
      const allow = kinds.includes(materialById(tile.dataset.material).kind);
      tile.hidden = !allow;
      if (allow) shown += 1;
    }
    group.hidden = shown === 0;
  }
  document.getElementById("mode-plain").setAttribute("aria-pressed", String(layer.face === "plain"));
  document.getElementById("mode-grooved").setAttribute("aria-pressed", String(layer.grooved));
  document.getElementById("mode-dots").setAttribute("aria-pressed", String(dotted));
  grooveControls.hidden = layer.face === "plain";
  grooveOnly.hidden = !layer.grooved;
  dotOnly.hidden = !dotted;
  document.getElementById("count-label").textContent = dotted ? "Dots per 360°" : "Grooves per 360°";
  document.getElementById("angle-label").textContent = dotted ? "Angle between dots (degrees)" : "Angle between grooves (degrees)";
  const patterned = dotted && Array.isArray(layer.dots.pattern);
  document.getElementById("dot-pattern").checked = patterned;
  document.getElementById("dot-diameter-row").hidden = patterned;
  document.getElementById("dot-pattern-editor").hidden = !patterned;
  document.getElementById("inlay-note").textContent = patterned
    ? "The sequence starts at 12 o'clock and repeats at 3, 6, and 9. Sizes are 0.050, 0.078, or 0.125 in."
    : dotted
      ? "Spacing is the count around the ring, or the angle between dots."
      : "Spacing is the count around the ring, or the angle between grooves. 0° to the axis keeps each groove parallel to the center. It can lean up to 45° either way.";
  const count = patterned ? layer.dots.pattern.length * 4 : dotted ? layer.dots.count : layer.grooves.count;
  countInput.disabled = patterned;
  angleInput.disabled = patterned;
  if (patterned) drawDotPattern(layer);
  if (document.activeElement !== countInput) countInput.value = String(count);
  dotDiameterInput.value = layer.dots.diameter.toFixed(3);
  if (document.activeElement !== widthInput) widthInput.value = layer.grooves.width.toFixed(3);
  const minWidth = layer.face === "dots"
    ? Math.round((largestDotDiameter(layer.dots) + 0.025) * 1000) / 1000
    : 0;
  const choices = THICKNESS_CHOICES[materialById(layer.material).kind];
  const allowed = choices && (!minWidth || choices[choices.length - 1] + 1e-9 >= minWidth)
    ? choices.filter((size) => !minWidth || size + 1e-9 >= minWidth)
    : null;
  thicknessChoice.hidden = !allowed;
  thicknessInput.hidden = Boolean(allowed);
  if (allowed) {
    const sizes = allowed.map((size) => size.toFixed(3)).join(",");
    if (thicknessChoice.dataset.sizes !== sizes) {
      thicknessChoice.dataset.sizes = sizes;
      thicknessChoice.replaceChildren(...allowed.map((size) => {
        const option = document.createElement("option");
        option.value = size.toFixed(3);
        option.textContent = size.toFixed(3);
        return option;
      }));
    }
    thicknessChoice.value = layer.thickness.toFixed(3);
  } else {
    thicknessInput.min = (minWidth || 0.04).toFixed(3);
    thicknessInput.step = minWidth ? "0.001" : "0.01";
    const shown = Number(thicknessInput.value);
    if (document.activeElement !== thicknessInput || !Number.isFinite(shown) || Math.abs(shown - layer.thickness) > 0.0005) {
      thicknessInput.value = layer.thickness.toFixed(minWidth ? 3 : 2);
    }
  }
  if (document.activeElement !== angleInput) angleInput.value = (360 / count).toFixed(1);
  leanInput.value = String(layer.grooves.axisAngle);
  leanOut.textContent = `${layer.grooves.axisAngle}°`;
  for (const button of document.querySelectorAll("#materials .material-tile")) {
    button.setAttribute("aria-pressed", String(button.dataset.material === layer.material));
  }
  for (const button of document.querySelectorAll("#inlays .chip")) {
    button.setAttribute("aria-pressed", String(button.dataset.material === layer.inlay));
  }
  drawStack();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
  paintStackPrice();
  paintAll();
}

function paintStackPrice() {
  const inlaid = design.layers.filter((layer) => layer.face === "dots" || layer.grooved).length;
  const price = document.getElementById("stack-price");
  price.textContent = inlaid
    ? `${inlaid} inlaid ${inlaid === 1 ? "ring" : "rings"} · $10 + $${50 * inlaid}`
    : "Straight rings · $10";
  document.getElementById("add-to-cue").disabled = !document.querySelector("#stack-positions input:checked");
}

function bindStackDrag() {
  let dragId = null;
  const clearMarks = () => {
    for (const item of stackList.children) item.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
  };
  stackList.addEventListener("dragstart", (event) => {
    const row = event.target.closest("li");
    if (!row || event.target.closest("[data-remove]")) {
      event.preventDefault();
      return;
    }
    dragId = Number(row.dataset.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", row.dataset.id);
    row.classList.add("is-dragging");
  });
  stackList.addEventListener("dragover", (event) => {
    const row = event.target.closest("li");
    if (!row || dragId == null) return;
    event.preventDefault();
    const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
    for (const item of stackList.children) {
      item.classList.toggle("is-drop-before", item === row && !after && dragId !== Number(row.dataset.id));
      item.classList.toggle("is-drop-after", item === row && after && dragId !== Number(row.dataset.id));
    }
  });
  stackList.addEventListener("drop", (event) => {
    const row = event.target.closest("li");
    if (!row || dragId == null) return;
    event.preventDefault();
    const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
    const targetId = Number(row.dataset.id);
    clearMarks();
    moveLayer(dragId, targetId, after);
    dragId = null;
  });
  stackList.addEventListener("dragend", () => {
    dragId = null;
    clearMarks();
  });
}

function moveLayer(id, targetId, after) {
  if (id === targetId) return;
  const from = design.layers.findIndex((layer) => layer.id === id);
  if (from < 0) return;
  const [layer] = design.layers.splice(from, 1);
  let to = design.layers.findIndex((item) => item.id === targetId);
  if (to < 0) {
    design.layers.splice(from, 0, layer);
    return;
  }
  if (after) to += 1;
  design.layers.splice(to, 0, layer);
  publish();
}

function drawStack() {
  const centerIndex = design.layers.findIndex((layer) => layer.id === design.centerId);
  stackList.replaceChildren(...design.layers.map((layer, index) => {
    const material = materialById(layer.material);
    const row = document.createElement("li");
    row.draggable = true;
    row.dataset.id = String(layer.id);
    const button = document.createElement("div");
    button.className = `layer${layer.id === design.selectedId ? " is-selected" : ""}`;
    button.dataset.id = String(layer.id);
    button.tabIndex = 0;
    button.setAttribute("role", "button");
    const swatch = document.createElement("i");
    swatch.style.background = material.fill;
    const text = document.createElement("span");
    const title = document.createElement("b");
    const place = layer.id === design.centerId ? "Center" : index < centerIndex ? "Butt side" : "Joint side";
    title.textContent = `${place} · ${material.name}`;
    const detail = document.createElement("small");
    const inlay = inlayById(layer.inlay);
    const size = formatThickness(layer.thickness, layer.material);
    detail.textContent = layer.face === "dots"
      ? layer.dots.pattern
        ? `${size} in · ${layer.dots.pattern.map((diameter) => diameter.toFixed(3)).join(" / ")} in, repeated in each quadrant · ${inlay.name} inlay`
        : `${size} in · ${layer.dots.count} dots, ${(360 / layer.dots.count).toFixed(0)}° apart, ${layer.dots.diameter.toFixed(3)} in · ${inlay.name} inlay`
      : layer.grooved
        ? `${size} in · ${layer.grooves.count} grooves, ${grooveSpacing(layer).toFixed(0)}° apart, ${layer.grooves.axisAngle}° to the axis · ${inlay.name} inlay`
        : `${size} in · Plain`;
    text.append(title, detail);
    button.append(swatch, text);
    if (layer.id !== design.centerId) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.remove = "";
      remove.textContent = "Remove";
      button.append(remove);
    }
    row.append(button);
    return row;
  }));
}

function exportStack() {
  const centerIndex = design.layers.findIndex((layer) => layer.id === design.centerId);
  return {
    od: RING_OD,
    id: RING_ID,
    center: centerIndex,
    layers: design.layers.map((layer, index) => {
      const material = materialById(layer.material);
      const inlay = layer.face === "plain" ? null : inlayById(layer.inlay);
      return {
        place: index < centerIndex ? "Butt side" : index === centerIndex ? "Center" : "Joint side",
        material: material.id,
        name: materialNote(material),
        kind: material.kind,
        fill: material.fill,
        thickness: layer.thickness,
        face: layer.face,
        grooved: layer.grooved,
        grooves: layer.grooved ? { ...layer.grooves } : null,
        dots: layer.face === "dots" ? {
          count: layer.dots.pattern ? layer.dots.pattern.length * 4 : layer.dots.count,
          diameter: layer.dots.diameter,
          pattern: layer.dots.pattern ? [...layer.dots.pattern] : null,
        } : null,
        inlay: inlay ? inlay.id : null,
        inlayName: inlay ? materialNote(inlay) : null,
        inlayFill: inlay ? inlay.fill : null,
        spec: layerSpecText(layer, inlay),
      };
    }),
    drawing: ["view-front", "view-top", "view-iso"].map((id) => sheetImage(id)),
  };
}

function materialNote(material) {
  const kind = { fiber: "Fiber", wood: "Wood", metal: "Metal" }[material.kind] || "Material";
  return `${kind}, ${material.name.toLowerCase()}`;
}

function sheetImage(id) {
  const source = document.getElementById(id);
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  const ctx = copy.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, copy.width, copy.height);
  ctx.drawImage(source, 0, 0);
  return copy.toDataURL("image/png");
}

function layerSpecText(layer, inlay) {
  const size = formatThickness(layer.thickness, layer.material);
  const inlayNote = inlay ? `${materialNote(inlay)} inlay` : "";
  if (layer.face === "dots") {
    return layer.dots.pattern
      ? `${size} in · ${layer.dots.pattern.map((diameter) => diameter.toFixed(3)).join(" / ")} in, repeated in each quadrant · ${inlayNote}`
      : `${size} in · ${layer.dots.count} dots, ${(360 / layer.dots.count).toFixed(0)}° apart, ${layer.dots.diameter.toFixed(3)} in · ${inlayNote}`;
  }
  if (layer.grooved) {
    return `${size} in · ${layer.grooves.count} grooves, ${grooveSpacing(layer).toFixed(0)}° apart, ${layer.grooves.axisAngle}° to the axis · ${inlayNote}`;
  }
  return `${size} in · Plain`;
}

function paintAll() {
  paintFront(document.getElementById("view-front"), selected());
  paintTop(document.getElementById("view-top"), selected());
  paintIso(document.getElementById("view-iso"));
}

function paintFront(canvas, layer) {
  const { ctx, w, h } = prep(canvas);
  clear(ctx, w, h);
  const ppi = Math.min((w - 48) / (RING_OD + 0.2), (h - 48) / (RING_OD + 0.2));
  const cx = w / 2;
  const cy = h / 2 + 4;
  const outer = (RING_OD / 2) * ppi;
  const inner = (RING_ID / 2) * ppi;
  centerlines(ctx, cx, cy, outer + 16);
  traceAnnulus(ctx, cx, cy, outer, inner);
  ctx.lineWidth = 2;
  fillMaterial(ctx, layer.material);
  if (layer.grooved) {
    const depth = 0.07 * ppi;
    const half = grooveHalfAngle(layer);
    for (const angle of grooveAngles(layer)) {
      const face = grooveTheta(layer, angle, layerOrigin(layer).x1, 0);
      traceNotch(ctx, cx, cy, outer, depth, face, half);
      fillGroove(ctx, layer);
    }
  }
  if (layer.face === "dots" && design.showHidden) {
    for (const dot of dotLayout(layer)) drawHiddenHole(ctx, layer, cx, cy, outer, dot.angle, dot.diameter, ppi);
  }
  traceAnnulus(ctx, cx, cy, outer, inner);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111";
  ctx.stroke();
}

function paintTop(canvas, layer) {
  const { ctx, w, h } = prep(canvas);
  clear(ctx, w, h);
  const ppi = Math.min((w - 64) / Math.max(layer.thickness + 0.45, 0.9), (h - 56) / (RING_OD + 0.35));
  const rw = layer.thickness * ppi;
  const rh = RING_OD * ppi;
  const x0 = (w - rw) / 2;
  const y0 = (h - rh) / 2;
  centerlines(ctx, x0 + rw / 2, y0 + rh / 2, Math.max(rw, rh) / 2 + 18);
  ctx.beginPath();
  ctx.rect(x0, y0, rw, rh);
  ctx.lineWidth = 2;
  fillMaterial(ctx, layer.material);
  if (layer.grooved) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, rw, rh);
    ctx.clip();
    const radius = RING_OD / 2;
    const depth = 0.07;
    const half = grooveHalfAngle(layer);
    const midY = y0 + rh / 2;
    const x1 = x0 + rw;
    const slotY = (theta, radial) => midY + Math.sin(theta) * radial * ppi;
    const rise = layer.thickness * Math.tan((layer.grooves.axisAngle || 0) * Math.PI / 180) * ppi;
    for (const angle of grooveAngles(layer)) {
      const theta = grooveTheta(layer, angle, layerOrigin(layer).mid, 0);
      if (!facesFront(theta)) continue;
      const center = slotY(theta, radius);
      const opening = Math.abs(slotY(theta - half, radius) - slotY(theta + half, radius));
      const edgeOn = opening < 1.5;
      const band = edgeOn ? depth * ppi : opening;
      const inward = edgeOn ? (Math.sign(midY - center) || 1) * band / 2 : 0;
      const y0c = center + inward - rise / 2;
      const y1c = center + inward + rise / 2;
      const halfBand = band / 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0c - halfBand);
      ctx.lineTo(x1, y1c - halfBand);
      ctx.lineTo(x1, y1c + halfBand);
      ctx.lineTo(x0, y0c + halfBand);
      ctx.closePath();
      fillGroove(ctx, layer);
    }
    ctx.restore();
  }
  if (layer.face === "dots") {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, rw, rh);
    ctx.clip();
    const mid = y0 + rh / 2;
    const x = x0 + rw / 2;
    for (const dot of dotLayout(layer)) {
      const visible = facesFront(dot.angle);
      if (!visible && !design.showHidden) continue;
      drawRadialOval(ctx, layer, x, mid, dot.angle, dot.diameter, ppi, visible);
    }
    ctx.restore();
  }
  ctx.beginPath();
  ctx.rect(x0, y0, rw, rh);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111";
  ctx.stroke();
}

function paintIso(canvas) {
  const { ctx, w, h } = prep(canvas);
  clear(ctx, w, h);
  const total = design.layers.reduce((sum, layer) => sum + layer.thickness, 0);
  const radius = RING_OD / 2;
  const scale = Math.min((w - 70) / (total * COS30 + radius * 2.4), (h - 64) / (radius * 2.5 + total * SIN30));
  const origin = [w * 0.46 - (total * scale * COS30) / 2, h * 0.58];
  let x = -total / 2;
  design.layers.forEach((layer, index) => {
    drawIsoLayer(ctx, layer, x, x + layer.thickness, radius, origin, scale, index === design.layers.length - 1);
    x += layer.thickness;
  });
}

function drawIsoLayer(ctx, layer, x0, x1, radius, origin, scale, showFace) {
  const selected = layer.id === design.selectedId;
  const silhouettes = silhouetteAngles();
  const edge = selected ? 2.75 : 2;
  traceEllipse(ctx, x0, radius, origin, scale);
  ctx.lineWidth = edge;
  ctx.strokeStyle = "#111";
  ctx.stroke();
  traceSide(ctx, x0, x1, radius, silhouettes, origin, scale);
  ctx.lineWidth = edge;
  fillMaterial(ctx, layer.material);
  if (layer.grooved) {
    ctx.save();
    traceSide(ctx, x0, x1, radius, silhouettes, origin, scale);
    ctx.clip();
    const half = grooveHalfAngle(layer);
    for (const angle of grooveAngles(layer)) {
      drawAxialGroove(ctx, layer, x0, x1, angle, half, radius, origin, scale);
    }
    ctx.restore();
    traceSide(ctx, x0, x1, radius, silhouettes, origin, scale);
    ctx.lineWidth = edge;
    ctx.strokeStyle = "#111";
    ctx.stroke();
  }
  if (layer.face === "dots") drawSideDots(ctx, layer, x0, x1, radius, origin, scale, false);
  if (layer.face === "dots" && design.showHidden) drawSideDots(ctx, layer, x0, x1, radius, origin, scale, true);
  if (!showFace) return;
  traceEllipse(ctx, x1, radius, origin, scale);
  ctx.lineWidth = edge;
  fillMaterial(ctx, layer.material);
  if (layer.grooved) {
    ctx.save();
    traceEllipse(ctx, x1, radius, origin, scale);
    ctx.clip();
    const half = grooveHalfAngle(layer);
    for (const angle of grooveAngles(layer)) {
      const face = grooveTheta(layer, angle, x1, 0);
      drawGrooveEnd(ctx, layer, x1, face, half, radius, 0.07, origin, scale);
    }
    ctx.restore();
    traceEllipse(ctx, x1, radius, origin, scale);
    ctx.lineWidth = edge;
    ctx.strokeStyle = "#111";
    ctx.stroke();
  }
  traceEllipse(ctx, x1, RING_ID / 2, origin, scale);
  ctx.fillStyle = "#2a2724";
  ctx.fill();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = "#111";
  ctx.stroke();
}

function drawAxialGroove(ctx, layer, x0, x1, angle, half, radius, origin, scale) {
  const steps = 12;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const theta = grooveTheta(layer, angle, x, 0) + Math.PI - half;
    const point = project(x, Math.cos(theta) * radius, Math.sin(theta) * radius, origin, scale);
    if (i === 0) ctx.moveTo(point[0], point[1]);
    else ctx.lineTo(point[0], point[1]);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const theta = grooveTheta(layer, angle, x, 0) + Math.PI + half;
    const point = project(x, Math.cos(theta) * radius, Math.sin(theta) * radius, origin, scale);
    ctx.lineTo(point[0], point[1]);
  }
  ctx.closePath();
  fillGroove(ctx, layer);
}

function facesFront(theta) {
  const side = Math.cos(theta);
  if (side > 1e-4) return true;
  if (side < -1e-4) return false;
  return -Math.sin(theta) > 0;
}

function layerOrigin(layer) {
  const total = design.layers.reduce((sum, item) => sum + item.thickness, 0);
  let x = -total / 2;
  for (const item of design.layers) {
    const x1 = x + item.thickness;
    if (item.id === layer.id) return { x0: x, x1, mid: (x + x1) / 2 };
    x = x1;
  }
  return { x0: -layer.thickness / 2, x1: layer.thickness / 2, mid: 0 };
}

function grooveTheta(layer, angle, x, xMid) {
  const lean = Math.tan((layer.grooves.axisAngle || 0) * Math.PI / 180) / (RING_OD / 2);
  return angle + (x - xMid) * lean;
}

function traceSide(ctx, x0, x1, radius, silhouettes, origin, scale) {
  const steps = 24;
  const [start, end] = silhouettes;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const t = start + ((end - start) * i) / steps;
    const point = project(x0, Math.cos(t) * radius, Math.sin(t) * radius, origin, scale);
    if (i === 0) ctx.moveTo(point[0], point[1]);
    else ctx.lineTo(point[0], point[1]);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const t = start + ((end - start) * i) / steps;
    const point = project(x1, Math.cos(t) * radius, Math.sin(t) * radius, origin, scale);
    ctx.lineTo(point[0], point[1]);
  }
  ctx.closePath();
}

function traceEllipse(ctx, x, radius, origin, scale) {
  ctx.beginPath();
  for (let i = 0; i <= 48; i += 1) {
    const t = (i / 48) * Math.PI * 2;
    const point = project(x, Math.cos(t) * radius, Math.sin(t) * radius, origin, scale);
    if (i === 0) ctx.moveTo(point[0], point[1]);
    else ctx.lineTo(point[0], point[1]);
  }
  ctx.closePath();
}

function silhouetteAngles() {
  return [-Math.PI / 4, (3 * Math.PI) / 4];
}

function project(x, y, z, origin, scale) {
  return [
    origin[0] + (x - y) * COS30 * scale,
    origin[1] + (x + y) * SIN30 * scale - z * scale,
  ];
}

function dotLayout(layer) {
  const pattern = layer.dots.pattern;
  const count = pattern ? pattern.length * 4 : layer.dots.count;
  const step = (Math.PI * 2) / count;
  const dots = [];
  for (let i = 0; i < count; i += 1) {
    dots.push({
      angle: -Math.PI / 2 + i * step,
      diameter: pattern ? pattern[i % pattern.length] : layer.dots.diameter,
    });
  }
  return dots;
}

function drawDotPattern(layer) {
  const list = document.getElementById("dot-pattern-list");
  const pattern = layer.dots.pattern;
  list.replaceChildren(...pattern.map((diameter, index) => {
    const row = document.createElement("li");
    row.className = "pattern-row";
    const select = document.createElement("select");
    select.dataset.index = String(index);
    select.setAttribute("aria-label", `Size ${index + 1} in the quadrant`);
    for (const size of DOT_DIAMETERS) {
      const option = document.createElement("option");
      option.value = size.toFixed(3);
      option.textContent = size.toFixed(3);
      option.selected = Math.abs(size - diameter) < 0.0001;
      select.append(option);
    }
    const unit = document.createElement("span");
    unit.textContent = "in";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.removeSize = String(index);
    remove.textContent = "Remove";
    remove.disabled = pattern.length <= 1;
    row.append(select, unit, remove);
    return row;
  }));
  document.getElementById("dot-pattern-add").disabled = pattern.length >= 9;
}

function onVisibleSide(t) {
  const start = -Math.PI / 4;
  let angle = t;
  while (angle < start) angle += Math.PI * 2;
  while (angle >= start + Math.PI * 2) angle -= Math.PI * 2;
  return angle <= (3 * Math.PI) / 4;
}

function hiddenLineColor(materialId) {
  const hex = materialById(materialId).fill.slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 48 ? "#f2f5f7" : "#111";
}

function drawHiddenHole(ctx, layer, cx, cy, outer, angle, diameter, ppi) {
  const depth = Math.min(diameter, (RING_OD - RING_ID) / 2 - 0.01);
  const half = (diameter / 2) * ppi;
  const outerR = outer;
  const innerR = Math.max(outer - depth * ppi, (RING_ID / 2) * ppi + 2);
  const acrossX = -Math.sin(angle);
  const acrossY = Math.cos(angle);
  const alongX = Math.cos(angle);
  const alongY = Math.sin(angle);
  const corner = (radial, side) => [
    cx + alongX * radial + acrossX * half * side,
    cy + alongY * radial + acrossY * half * side,
  ];
  ctx.beginPath();
  let point = corner(outerR, 1);
  ctx.moveTo(point[0], point[1]);
  point = corner(innerR, 1);
  ctx.lineTo(point[0], point[1]);
  point = corner(innerR, -1);
  ctx.lineTo(point[0], point[1]);
  point = corner(outerR, -1);
  ctx.lineTo(point[0], point[1]);
  ctx.closePath();
  ctx.save();
  ctx.setLineDash([5, 3]);
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = hiddenLineColor(layer.material);
  ctx.stroke();
  ctx.restore();
}

function drawRadialOval(ctx, layer, x, mid, angle, diameter, ppi, visible) {
  const radius = (diameter / 2) * ppi;
  const minor = Math.max(radius * Math.abs(Math.cos(angle)), 0.6);
  const y = mid + Math.sin(angle) * (RING_OD / 2) * ppi;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, minor, 0, 0, Math.PI * 2);
  if (visible) {
    fillGroove(ctx, layer);
    return;
  }
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = hiddenLineColor(layer.material);
  ctx.stroke();
  ctx.restore();
}

function drawSideDots(ctx, layer, x0, x1, radius, origin, scale, hidden) {
  const x = (x0 + x1) / 2;
  for (const dot of dotLayout(layer)) {
    const t = dot.angle + Math.PI;
    if (onVisibleSide(t) === hidden) continue;
    traceSurfaceHole(ctx, x, t, radius, dot.diameter / 2, origin, scale);
    if (hidden) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = hiddenLineColor(layer.material);
      ctx.stroke();
      ctx.restore();
    } else {
      fillGroove(ctx, layer);
    }
  }
}

function traceSurfaceHole(ctx, x, t, radius, hole, origin, scale) {
  const steps = 20;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const phi = (i / steps) * Math.PI * 2;
    const axial = Math.cos(phi) * hole;
    const around = Math.sin(phi) * hole;
    const point = project(
      x + axial,
      Math.cos(t) * radius - Math.sin(t) * around,
      Math.sin(t) * radius + Math.cos(t) * around,
      origin,
      scale,
    );
    if (i === 0) ctx.moveTo(point[0], point[1]);
    else ctx.lineTo(point[0], point[1]);
  }
  ctx.closePath();
}

function grooveAngles(layer) {
  const step = (Math.PI * 2) / layer.grooves.count;
  const angles = [];
  for (let i = 0; i < layer.grooves.count; i += 1) angles.push(-Math.PI / 2 + i * step);
  return angles;
}

function grooveHalfAngle(layer) {
  return layer.grooves.width / RING_OD;
}

function grooveSpacing(layer) {
  return 360 / layer.grooves.count;
}

function traceNotch(ctx, cx, cy, outer, depth, angle, half) {
  ctx.beginPath();
  ctx.arc(cx, cy, outer, angle - half, angle + half);
  ctx.arc(cx, cy, Math.max(1, outer - depth), angle + half, angle - half, true);
  ctx.closePath();
}

function fillMaterial(ctx, id) {
  const material = materialById(id);
  ctx.fillStyle = material.fill;
  ctx.fill();
  ctx.strokeStyle = "#111";
  ctx.stroke();
  if (material.kind === "fiber") return;
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  const bounds = 800;
  ctx.lineWidth = 1;
  if (material.kind === "metal") {
    ctx.strokeStyle = "rgba(20, 24, 28, 0.35)";
    for (let line = -bounds; line < bounds; line += 5) {
      ctx.moveTo(line, 0);
      ctx.lineTo(line + bounds, bounds);
    }
  } else {
    ctx.strokeStyle = "rgba(40, 24, 12, 0.22)";
    for (let line = 8; line < bounds; line += 7) {
      ctx.moveTo(0, line);
      ctx.lineTo(bounds, line);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function fillGroove(ctx, layer) {
  ctx.fillStyle = inlayById(layer.inlay).fill;
  ctx.fill();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = "#111";
  ctx.stroke();
}

function drawGrooveEnd(ctx, layer, x, angle, half, radius, depth, origin, scale) {
  const t0 = angle + Math.PI - half;
  const t1 = angle + Math.PI + half;
  const inner = radius - depth;
  ctx.beginPath();
  let point = project(x, Math.cos(t0) * radius, Math.sin(t0) * radius, origin, scale);
  ctx.moveTo(point[0], point[1]);
  point = project(x, Math.cos(t1) * radius, Math.sin(t1) * radius, origin, scale);
  ctx.lineTo(point[0], point[1]);
  point = project(x, Math.cos(t1) * inner, Math.sin(t1) * inner, origin, scale);
  ctx.lineTo(point[0], point[1]);
  point = project(x, Math.cos(t0) * inner, Math.sin(t0) * inner, origin, scale);
  ctx.lineTo(point[0], point[1]);
  ctx.closePath();
  fillGroove(ctx, layer);
}

function traceAnnulus(ctx, cx, cy, outer, inner) {
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
}

function centerlines(ctx, cx, cy, reach) {
  ctx.save();
  ctx.strokeStyle = "#3d6d92";
  ctx.lineWidth = 1;
  ctx.setLineDash([10, 3, 2, 3]);
  ctx.beginPath();
  ctx.moveTo(cx - reach, cy);
  ctx.lineTo(cx + reach, cy);
  ctx.moveTo(cx, cy - reach);
  ctx.lineTo(cx, cy + reach);
  ctx.stroke();
  ctx.restore();
}

function clear(ctx, w, h) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
}

function prep(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineJoin = "miter";
  ctx.lineCap = "square";
  return { ctx, w, h };
}

function selected() {
  return design.layers.find((layer) => layer.id === design.selectedId) || design.layers[0];
}

function materialById(id) {
  return RING_MATERIALS.find((material) => material.id === id);
}

function clampNum(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampInt(value, min, max) {
  return Math.round(clampNum(value, min, max, min));
}
