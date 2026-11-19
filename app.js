/* Drawing, estimate, and page behavior.
   lineItems() decides what gets charged.
   cueLayout() places the parts in real inches. */

const STATE_KEYS = [
  "name", "butt", "buttProfile", "buttCap", "capWood", "sleevePoints", "sleevePointWood", "buttRing", "sleeveRing", "wrap", "wrapColor", "handleWood", "aJointRing", "points", "pointWood", "epoxyColor", "pointReach", "veneers", "veneer1", "veneer2", "veneer3", "rings", "shaftRing",
  "joint", "jointEnd", "shaft", "shaftLength", "taper", "ferrule", "tip", "tipBrand", "tipSize", "weight",
];

const STORAGE_KEY = "cuebuilder.v1";
const RING_DESIGN_KEY = "cuebuilder.applied-ring";
const RING_POSITIONS = [
  { id: "buttRing", label: "Butt ring" },
  { id: "sleeveRing", label: "Sleeve ring" },
  { id: "aJointRing", label: "A-Joint ring" },
  { id: "rings", label: "Joint ring" },
  { id: "shaftRing", label: "Shaft ring" },
];
let appliedRings = { buttRing: null, sleeveRing: null, aJointRing: null, rings: null, shaftRing: null };
const choiceItems = new Map();
const RING_CHOICES = RING_POSITIONS.map((item) => item.id);

/* Joint diameter is 0.842 in. Length, butt, and tip use the same inch scale. */
const JOINT_DIAMETER_IN = 0.842;
const BUTT_INCHES = 29;

const catalog = window.CUE_CATALOG;
let state = loadState();
let wrapRenderedFor = null;
let buttCapRenderedFor = null;
let jointEndRenderedFor = null;
let lastItems = [];
let woodsReady = false;
let draggedWood = null;
let selectedWood = null;
let shaftShown = false;
let woodLayout = null;
let renderScene = null;
let renderPpi = 48;
let renderFitPpi = 48;
let renderPanX = 0;
let renderPanY = 0;
let renderTimer = 0;
const woodPixels = new Map();

/* Each photo is 1.2 inches of grain along the cue and 0.32 inches around it,
   one-tenth the earlier mapping. The grain lines run left to right.
   Mapping uses the cue's real circumference, so a thick butt shows more of the photo than the thin shaft. */
const WOOD_ALONG_IN = 1.2;
const WOOD_AROUND_IN = 0.32;
const WOOD_FILES = [
  "woods/maple.png",
  "woods/curly.png",
  "woods/birdseye.png",
  "woods/walnut.png",
  "woods/cocobolo.png",
  "woods/ebony.png",
  "woods/purpleheart.png",
];
const WOOD_STRIP = 128;
const RING_WOOD_PHOTO = {
  maple: "woods/maple.png",
  curly: "woods/curly.png",
  birdseye: "woods/birdseye.png",
  walnut: "woods/walnut.png",
  cocobolo: "woods/cocobolo.png",
  ebony: "woods/ebony.png",
  purpleheart: "woods/purpleheart.png",
};
const WOOD_ATLAS_H = 1024;

const nameInput = document.getElementById("cue-name");
const weightInput = document.getElementById("weight");
const weightOut = document.getElementById("weight-out");
const pointReachInput = document.getElementById("point-reach");
const pointReachOut = document.getElementById("point-reach-out");

init();

function init() {
  const rule = catalog.weightRule;
  weightInput.min = String(rule.min);
  weightInput.max = String(rule.max);
  weightInput.step = String(rule.step);
  document.getElementById("weight-help").textContent =
    `${rule.minIncluded} to ${rule.maxIncluded} oz is included. Outside that, the estimate adds ${money(rule.customPrice)} for weight-bolt work. The drawing stays the same because the bolt is inside the butt.`;

  renderPresets();
  renderChoice("opt-buttProfile", "buttProfile", catalog.buttProfiles, false);
  renderButtCaps();
  renderChoice("opt-sleevePoints", "sleevePoints", [
    { id: "none", name: "Plain", price: 0 },
    { id: "match", name: "Points", price: 0 },
  ], true);
  renderChoice("opt-wrap", "wrap", catalog.wraps, true);
  renderPointCount();
  renderChoice("opt-pointWood", "pointWood", catalog.inlays.filter((item) => !item.photo), true);
  renderWoodPalette();
  renderChoice("opt-veneers", "veneers", catalog.veneerCounts, true);
  renderVeneerSelects();
  renderChoice("opt-buttRing", "buttRing", catalog.rings, true);
  renderChoice("opt-aJointRing", "aJointRing", catalog.rings, true);
  renderChoice("opt-sleeveRing", "sleeveRing", catalog.rings, true);
  renderChoice("opt-rings", "rings", catalog.rings, true);
  renderChoice("opt-shaftRing", "shaftRing", catalog.rings, true);
  renderChoice("opt-joint", "joint", catalog.joints, true);
  renderJointEnds();
  renderChoice("opt-shaft", "shaft", catalog.shafts.map((item) => Object.assign({}, item, { photo: undefined })), true);
  renderChoice("opt-taper", "taper", catalog.tapers, false);
  renderChoice("opt-ferrule", "ferrule", catalog.ferrules, true);
  renderChoice("opt-tip", "tip", catalog.tips, false);
  renderTipBrands();
  renderChoice("opt-tipSize", "tipSize", catalog.tipSizes, false);
  renderChoice("opt-shaftLength", "shaftLength", catalog.shaftLengths, false);

  document.getElementById("point-count").addEventListener("change", () => {
    state.points = document.getElementById("point-count").value;
    commit();
  });
  document.getElementById("tip-brand").addEventListener("change", () => {
    state.tipBrand = document.getElementById("tip-brand").value;
    commit();
  });
  document.getElementById("builder").addEventListener("click", onChoice);
  document.getElementById("builder").addEventListener("click", onVeneerPick);
  document.getElementById("builder").addEventListener("click", onWrapMenu);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".veneer-label")) closeVeneerMenus();
    if (!event.target.closest(".wrap-color")) closeWrapMenu();
  });
  document.getElementById("builder").addEventListener("submit", (event) => event.preventDefault());
  document.getElementById("opt-preset").addEventListener("click", onPreset);
  nameInput.addEventListener("input", () => {
    state.name = nameInput.value;
    commit();
  });
  weightInput.addEventListener("input", () => {
    state.weight = readWeight(weightInput.value);
    commit();
  });
  pointReachInput.addEventListener("input", () => {
    state.pointReach = readPointReach(pointReachInput.value);
    commit();
  });
  document.getElementById("copy-spec").addEventListener("click", copySpec);
  document.getElementById("submit-design").addEventListener("click", submitDesign);
  document.getElementById("ring-design").addEventListener("click", openRingDesign);
  document.getElementById("ring-design-close").addEventListener("click", () => {
    document.getElementById("ring-design-dialog").close();
  });
  document.getElementById("print-spec").addEventListener("click", () => window.print());
  document.getElementById("reset-spec").addEventListener("click", resetBuild);
  document.getElementById("epoxy-color").addEventListener("input", onEpoxyColor);
  document.getElementById("epoxy-done").addEventListener("click", () => {
    document.getElementById("epoxy-dialog").close();
  });
  document.querySelector(".legend").addEventListener("click", onGoto);
  document.getElementById("shaft-toggle").addEventListener("click", () => {
    shaftShown = !shaftShown;
    paintShaftToggle();
    drawCue();
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => CueView.setView(button.dataset.view));
  });
  document.getElementById("cue-zoom-in").addEventListener("click", () => CueView.nudgeZoom(-1));
  document.getElementById("cue-zoom-out").addEventListener("click", () => CueView.nudgeZoom(1));
  CueView.watchView((name) => {
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.view === name));
    });
  });
  document.getElementById("render-model").addEventListener("click", openButtRender);
  document.getElementById("render-close").addEventListener("click", () => {
    document.getElementById("render-dialog").close();
  });
  document.getElementById("render-in").addEventListener("click", () => stepRenderZoom(1.35));
  document.getElementById("render-out").addEventListener("click", () => stepRenderZoom(1 / 1.35));
  document.getElementById("render-fit").addEventListener("click", fitRenderView);
  bindRenderView();
  bindWoodDrop();
  bindWoodTap();
  applyPhoneWoods();
  window.matchMedia("(max-width: 860px)").addEventListener("change", applyPhoneWoods);

  uploadWoodAtlas(bakeWoodAtlas());
  commit();
  loadWoodPhotos();
}

function onWrapMenu(event) {
  const current = event.target.closest(".wrap-current");
  if (!current) return;
  const menu = document.getElementById("wrap-menu");
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  current.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    const selected = menu.querySelector('[aria-pressed="true"]');
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }
}

function closeWrapMenu() {
  const menu = document.getElementById("wrap-menu");
  const current = document.getElementById("wrap-color-button");
  if (menu) menu.hidden = true;
  if (current) current.setAttribute("aria-expanded", "false");
}

function linenColorId(id) {
  const aliases = {
    natural: "white-antique",
    white: "white-antique",
    burgundy: "wine-burgundy-white",
    navy: "blue-black",
    forest: "green-black",
  };
  return aliases[id] || id;
}

function onVeneerPick(event) {
  const choice = event.target.closest(".veneer-menu button");
  if (choice) {
    const menu = choice.closest(".veneer-menu");
    const layer = menu.id.replace("veneer-menu-", "");
    state[`veneer${layer}`] = choice.dataset.id;
    closeVeneerMenus();
    commit();
    return;
  }
  const current = event.target.closest(".veneer-current");
  if (!current || current.disabled) return;
  const layer = current.id.replace("veneer-", "");
  const menu = document.getElementById(`veneer-menu-${layer}`);
  const open = menu.hidden;
  closeVeneerMenus();
  if (open) {
    menu.hidden = false;
    current.setAttribute("aria-expanded", "true");
    const selected = menu.querySelector('[aria-selected="true"]');
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }
}

function closeVeneerMenus() {
  document.querySelectorAll(".veneer-menu").forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll(".veneer-current").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function onChoice(event) {
  const button = event.target.closest("[data-group]");
  if (!button || button.disabled || button.dataset.group === "palette") return;
  if (button.dataset.group === "wrapColor") closeWrapMenu();
  const chooseEpoxy = button.dataset.group === "pointWood" && button.dataset.id === "epoxy";
  if (RING_CHOICES.includes(button.dataset.group)) clearRingPosition(button.dataset.group);
  state[button.dataset.group] = button.dataset.id;
  commit();
  if (chooseEpoxy) openEpoxyPicker();
}

function onEpoxyColor(event) {
  state.epoxyColor = readHex(event.target.value);
  commit();
}

function openEpoxyPicker() {
  const dialog = document.getElementById("epoxy-dialog");
  const input = document.getElementById("epoxy-color");
  input.value = state.epoxyColor;
  if (!dialog.open) dialog.showModal();
  if (typeof input.showPicker === "function") {
    try { input.showPicker(); } catch (error) { /* The dialog is enough if the browser blocks the picker. */ }
  }
}

function readHex(value) {
  const hex = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : "#3e8f86";
}

function pointMaterialLabel(inlay, current) {
  if (inlay.id === "epoxy") return `Epoxy ${current.epoxyColor}`;
  return inlay.name;
}

function onPreset(event) {
  const button = event.target.closest("[data-preset]");
  if (!button) return;
  const preset = catalog.presets.find((item) => item.id === button.dataset.preset);
  if (!preset) return;
  clearAppliedRing();
  applyState(preset.state);
}

function paintShaftToggle() {
  const button = document.getElementById("shaft-toggle");
  const buttOnly = state.shaft === "none";
  button.hidden = buttOnly;
  button.textContent = shaftShown ? "Hide shaft" : "Show shaft";
  button.setAttribute("aria-pressed", shaftShown ? "true" : "false");
}

function phoneLayout() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function stageCaption() {
  if (phoneLayout()) return "Drag to move the cue. Tap a wood, then tap where it goes.";
  return "Drag to rotate. Right-click drag to pan. Scroll to zoom. Drag a wood onto the cue.";
}

/* A wood swatch can be dropped on the cue. The place under the cursor
   decides which part changes. Sleeve and forearm stay the same butt wood. */
function bindWoodDrop() {
  const canvas = document.getElementById("cue");
  canvas.addEventListener("dragover", (event) => {
    if (!draggedWood) return;
    const place = placeUnderCursor(event.clientX, event.clientY);
    event.preventDefault();
    event.dataTransfer.dropEffect = place ? "copy" : "none";
    canvas.classList.toggle("is-wood-hot", Boolean(place));
    const hit = CueView.pick(event.clientX, event.clientY);
    const name = hit ? partLabel(hit.x) : null;
    document.getElementById("stage-caption").textContent = name
      ? name
      : "That wood does not go on this part of the cue.";
    canvas.setAttribute("aria-label", name || cueAriaLabel());
  });
  canvas.addEventListener("dragleave", () => {
    canvas.classList.remove("is-wood-hot");
  });
  canvas.addEventListener("drop", (event) => {
    if (!draggedWood) return;
    event.preventDefault();
    const place = placeUnderCursor(event.clientX, event.clientY);
    canvas.classList.remove("is-wood-hot");
    if (place) {
      place.apply();
      commit();
    } else {
      endWoodDrag();
    }
  });
}

function placeUnderCursor(clientX, clientY, wood = draggedWood) {
  if (!wood || !CueView.pick) return null;
  const hit = CueView.pick(clientX, clientY);
  if (!hit) return null;
  return woodPlace(wood, hit.x);
}

function bindWoodTap() {
  const canvas = document.getElementById("cue");
  let start = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (!selectedWood || event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!start || start.id !== event.pointerId || !selectedWood) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    const origin = start;
    start = null;
    if (moved > 14) return;
    const place = placeUnderCursor(origin.x, origin.y, selectedWood);
    const caption = document.getElementById("stage-caption");
    if (place) {
      place.apply();
      commit();
      caption.textContent = `${selectedWood.name} applied. Tap the cue again, or tap the wood to finish.`;
    } else {
      caption.textContent = "That wood does not go on this part of the cue.";
    }
  });
}

function paintArmedWood() {
  document.querySelectorAll("#opt-woods .swatch").forEach((button) => {
    const on = Boolean(selectedWood && button.dataset.id === selectedWood.id);
    button.classList.toggle("is-armed", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function paintWoodHint() {
  const hint = document.querySelector(".stage-woods .stage-caption");
  if (!hint) return;
  hint.textContent = phoneLayout()
    ? "Tap a wood, then tap the cue where it goes."
    : "Every wood is here. Drag one onto the cue.";
}

function applyPhoneWoods() {
  const phone = phoneLayout();
  document.querySelectorAll("#opt-woods .swatch").forEach((button) => {
    button.draggable = !phone;
  });
  if (!phone) selectedWood = null;
  paintArmedWood();
  paintWoodHint();
  if (!selectedWood) document.getElementById("stage-caption").textContent = stageCaption();
}

function woodPlace(wood, x) {
  const layout = cueLayout(state);
  const region = cueRegion(x, layout);
  const buttWood = catalog.woods.some((item) => item.id === wood.id);
  const inlay = catalog.inlays.some((item) => item.id === wood.id);
  const onSleevePoints = region === "sleeve" && x >= layout.sleevePoint;
  const onForearmPoints = region === "forearm" && x <= layout.point1;
  if ((onSleevePoints || onForearmPoints) && inlay) {
    return {
      apply() {
        state.pointWood = wood.id;
        if (onForearmPoints && state.points === "none") state.points = "four";
        if (onSleevePoints && state.sleevePoints === "none") {
          if (state.points === "none") state.points = "four";
          state.sleevePoints = state.points;
        }
      },
    };
  }
  if (region === "handle" && buttWood) {
    return {
      apply() {
        state.wrap = "none";
        state.handleWood = wood.id;
      },
    };
  }
  if (region === "shaft" && wood.id === "maple") {
    return {
      apply() { state.shaft = "maple"; },
    };
  }
  if ((region === "sleeve" || region === "forearm") && buttWood) {
    return {
      apply() { state.butt = wood.id; },
    };
  }
  if (region === "cap" && buttWood) {
    return {
      apply() {
        state.buttCap = "wood";
        state.capWood = wood.id;
      },
    };
  }
  return null;
}

function partLabel(x) {
  const layout = cueLayout(state);
  const region = cueRegion(x, layout);
  const onSleevePoints = region === "sleeve" && x >= layout.sleevePoint;
  const onForearmPoints = region === "forearm" && x <= layout.point1;
  if (onSleevePoints || onForearmPoints) return "Points";
  if (region === "cap") return "Buttcap";
  if (region === "sleeve") return "Sleeve";
  if (region === "forearm") return "Forearm";
  if (region === "handle") return "Handle";
  if (region === "joint") return "Joint";
  if (region === "shaft") return "Shaft";
  return "Tip";
}

function cueAriaLabel() {
  if (phoneLayout()) return `${state.name}. Drag to move the cue. Use the view buttons to turn it.`;
  return `${state.name}. Drag to rotate the cue. Right-click drag to pan.`;
}

function cueRegion(x, layout) {
  if (x < layout.cap) return "cap";
  if (x < layout.wrap0) return "sleeve";
  if (x < layout.wrap1) return "handle";
  if (x < layout.collar0) return "forearm";
  if (x < layout.collar1) return "joint";
  if (x < layout.ferrule0) return "shaft";
  return "tip";
}

function endWoodDrag() {
  draggedWood = null;
  const canvas = document.getElementById("cue");
  canvas.classList.remove("is-wood-hot");
  canvas.setAttribute("aria-label", cueAriaLabel());
  document.getElementById("stage-caption").textContent = stageCaption();
}

function onGoto(event) {
  const target = event.target.closest("[data-goto]");
  if (!target) return;
  const section = document.getElementById(target.dataset.goto);
  if (!section) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scroller = document.getElementById("builder");
  const behavior = reduce ? "auto" : "smooth";
  if (scroller.scrollHeight > scroller.clientHeight + 2) {
    const top = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top, behavior });
  } else {
    section.scrollIntoView({ behavior, block: "start" });
  }
  section.classList.remove("is-attention");
  void section.offsetWidth;
  section.classList.add("is-attention");
}

function resetBuild() {
  clearAppliedRing();
  const preset = catalog.presets.find((item) => item.id === "four-point");
  applyState(preset.state);
}

function applyState(next) {
  state = blankState();
  for (const key of STATE_KEYS) state[key] = next[key];
  wrapRenderedFor = null;
  buttCapRenderedFor = null;
  jointEndRenderedFor = null;
  commit();
}

function commit() {
  state = normalize(state);
  if (state.shaft === "none") shaftShown = false;
  if (wrapRenderedFor !== state.wrap) {
    renderWrapColors();
    wrapRenderedFor = state.wrap;
  }
  if (buttCapRenderedFor !== state.capWood) {
    renderButtCaps();
    buttCapRenderedFor = state.capWood;
  }
  if (jointEndRenderedFor !== state.butt) {
    renderJointEnds();
    jointEndRenderedFor = state.butt;
  }
  if (nameInput.value !== state.name) nameInput.value = state.name;
  weightInput.value = String(state.weight);
  weightOut.textContent = `${formatOz(state.weight)} oz`;
  pointReachInput.value = String(state.pointReach);
  pointReachOut.textContent = `${state.pointReach} in`;
  paintSelection();
  drawCue();
  lastItems = lineItems(state);
  renderSpec(lastItems);
  document.title = `${state.name} · Repasky Custom Cues Cue Builder`;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  writeHash();
}

function blankState() {
  return Object.assign({}, catalog.presets[0].state);
}

function loadState() {
  absorbRingDesign();
  const fromHash = readHash();
  if (fromHash) return normalize(fromHash);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      if (saved.capWood == null) saved.capWood = saved.butt;
      return normalize(Object.assign(blankState(), saved));
    }
  } catch (error) {
    /* Ignore a broken saved build and use the starter. */
  }
  return normalize(blankState());
}

function readHash() {
  const raw = location.hash.replace(/^#/, "");
  if (!raw || !raw.includes("=")) return null;
  const params = new URLSearchParams(raw);
  const next = blankState();
  let found = false;
  for (const key of STATE_KEYS) {
    if (!params.has(key)) continue;
    next[key] = key === "weight" ? readWeight(params.get(key)) : params.get(key);
    found = true;
  }
  if (params.has("veneerColor")) next.veneerColor = params.get("veneerColor");
  if (!params.has("capWood")) next.capWood = next.butt;
  if (!params.has("shaftLength") && params.has("length")) {
    next.shaftLength = params.get("length") === "59" ? "30" : "29";
    found = true;
  }
  return found ? next : null;
}

function writeHash() {
  const params = new URLSearchParams();
  for (const key of STATE_KEYS) params.set(key, String(state[key]));
  history.replaceState(null, "", `#${params.toString()}`);
}

function normalize(input) {
  const next = Object.assign(blankState(), input);
  if (next.pointWood === "ivory" || next.sleevePointWood === "ivory" || next.pointWood === "white" || next.sleevePointWood === "white") next.pointWood = "tan-juma";
  if (next.pointWood === "turquoise" || next.sleevePointWood === "turquoise") next.pointWood = "epoxy";
  if (next.rings === "ivory-black") next.rings = "white-black";
  next.butt = keep(catalog.woods, next.butt, "maple");
  next.buttProfile = keep(catalog.buttProfiles, next.buttProfile, "standard");
  next.buttCap = keep(catalog.buttCaps, next.buttCap, "wood");
  if (input.capWood == null || input.capWood === "") next.capWood = next.butt;
  next.capWood = keep(catalog.woods, next.capWood, next.butt);
  next.buttRing = keep(catalog.rings, next.buttRing, "none");
  next.sleeveRing = keep(catalog.rings, next.sleeveRing, "none");
  next.wrap = keep(catalog.wraps, next.wrap, "linen");
  const wrap = find(catalog.wraps, next.wrap);
  if (wrap.colors.length) {
    if (wrap.id === "linen") next.wrapColor = linenColorId(next.wrapColor);
    next.wrapColor = keep(wrap.colors, next.wrapColor, wrap.colors[0].id);
  }
  next.handleWood = keep(catalog.woods, input.handleWood, next.butt);
  if (next.points === "seven" || next.points === "none") next.points = next.points === "seven" ? "six" : "four";
  next.points = keep(catalog.points, next.points, "four");
  const askedForButtPoints = input.sleevePoints === "match";
  const buttHadPoints = Boolean(input.sleevePoints) && input.sleevePoints !== "none" && input.sleevePoints !== "match";
  if (askedForButtPoints && next.points === "none") next.points = "four";
  next.sleevePoints = (askedForButtPoints || (buttHadPoints && next.points !== "none")) ? next.points : "none";
  next.aJointRing = keep(catalog.rings, next.aJointRing, "none");
  next.pointWood = keep(catalog.inlays, next.pointWood, "ebony");
  next.sleevePointWood = next.pointWood;
  next.epoxyColor = readHex(next.epoxyColor);
  next.pointReach = readPointReach(next.pointReach);
  next.veneers = keep(catalog.veneerCounts, next.veneers, "0");
  if (input.veneer1 == null && input.veneerColor) {
    next.veneer1 = input.veneerColor;
    next.veneer2 = input.veneerColor;
    next.veneer3 = input.veneerColor;
  }
  next.veneer1 = veneerColorId(next.veneer1);
  next.veneer2 = veneerColorId(next.veneer2);
  next.veneer3 = veneerColorId(next.veneer3);
  next.veneer1 = keep(catalog.veneerColors, next.veneer1, "crimson-red");
  next.veneer2 = keep(catalog.veneerColors, next.veneer2, "canary-yellow");
  next.veneer3 = keep(catalog.veneerColors, next.veneer3, "royal-blue");
  next.rings = keep(catalog.rings, next.rings, "white-black");
  next.shaftRing = keep(catalog.rings, next.shaftRing, "none");
  next.joint = keep(catalog.joints, next.joint, "pin-516-14");
  next.jointEnd = keep(catalog.jointEnds, next.jointEnd, "stainless");
  next.shaft = keep(catalog.shafts, next.shaft, "maple");
  if (next.taper === "euro") next.taper = "conical";
  next.taper = keep(catalog.tapers, next.taper, "pro");
  next.ferrule = keep(catalog.ferrules, next.ferrule, "white");
  next.tip = keep(catalog.tips, next.tip, "med");
  next.tipBrand = keep(catalog.tipBrands, next.tipBrand, "endurance");
  next.tipSize = keep(catalog.tipSizes, next.tipSize, "12.75");
  if (!input.shaftLength) next.shaftLength = input.length === "59" ? "30" : "29";
  next.shaftLength = keep(catalog.shaftLengths, next.shaftLength, "29");
  let weight = readWeight(next.weight);
  const rule = catalog.weightRule;
  if (Number.isNaN(weight)) weight = rule.default;
  next.weight = Math.min(rule.max, Math.max(rule.min, weight));
  next.name = String(next.name || "Untitled cue").slice(0, 40);
  return next;
}

function keep(list, id, fallback) {
  return list.some((item) => item.id === id) ? id : fallback;
}

function find(list, id) {
  const item = list.find((entry) => entry.id === id);
  if (!item) throw new Error(`Missing option ${id}`);
  return item;
}

function readWeight(value) {
  return Math.round(Number(value) * 2) / 2;
}

function readPointReach(value) {
  const inches = Math.round(Number(value));
  if (Number.isNaN(inches)) return 7;
  return Math.min(10, Math.max(5, inches));
}

function formatOz(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function money(amount) {
  const cents = Math.round(Math.abs(amount) * 100) % 100 !== 0;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

/* Shop estimate. Each chosen option adds its own price.
   Wrap color is skipped when there is no wrap.
   Point material and veneers are skipped when that section is plain.
   A point is $25. Each veneer is another $25 on that point. No veneers add nothing.
   Butt sleeve points use that same wood and those same veneers at half that price.
   The forearm and butt are one blank: $250 in hard maple, plus that wood's price for any other wood.
   Weight inside the included band does not add a charge. */
function lineItems(current, standardRings) {
  const butt = find(catalog.woods, current.butt);
  const profile = find(catalog.buttProfiles, current.buttProfile);
  const cap = find(catalog.buttCaps, current.buttCap);
  const wrap = find(catalog.wraps, current.wrap);
  const color = wrap.colors.find((item) => item.id === current.wrapColor);
  const points = find(catalog.points, current.points);
  const inlay = find(catalog.inlays, current.pointWood);
  const veneers = find(catalog.veneerCounts, current.veneers);
  const rings = find(catalog.rings, current.rings);
  const aJoint = find(catalog.rings, current.aJointRing);
  const joint = find(catalog.joints, current.joint);
  const jointEnd = find(catalog.jointEnds, current.jointEnd);
  const shaft = find(catalog.shafts, current.shaft);
  const taper = find(catalog.tapers, current.taper);
  const ferrule = find(catalog.ferrules, current.ferrule);
  const tip = find(catalog.tips, current.tip);
  const capWood = find(catalog.woods, current.capWood);
  const items = [
    { label: `Forearm/Butt blank, ${butt.name}`, amount: catalog.basePrice + butt.price },
    { label: `Forearm points, ${points.name.toLowerCase()}`, amount: pointCharge(points.count, false) },
    {
      label: Number(veneers.id) > 0 ? veneers.name : "No veneers",
      amount: veneerCharge(points.count, Number(veneers.id), false),
    },
  ];
  ["1st veneer", "2nd veneer", "3rd veneer"].slice(0, Number(veneers.id)).forEach((layer, index) => {
    const veneerColor = find(catalog.veneerColors, current[`veneer${index + 1}`]);
    items.push({ label: `${layer}, ${veneerColor.name.toLowerCase()}`, amount: 0 });
  });
  items.push(
    { label: `${pointMaterialLabel(inlay, current)} point material`, amount: inlay.price },
    { label: `Points stop ${current.pointReach} in from the handle`, amount: 0 },
    { label: profile.name, amount: profile.price },
    {
      label: cap.id === "wood" ? `${capWood.name} butt cap` : `${cap.name} butt cap`,
      amount: cap.price,
    },
  );
  const sleevePoints = find(catalog.points, current.sleevePoints);
  if (sleevePoints.id === "none") {
    items.push({ label: "Plain butt sleeve", amount: 0 });
  } else {
    items.push({ label: `Butt sleeve, ${sleevePoints.name.toLowerCase()}`, amount: pointCharge(sleevePoints.count, true) });
    items.push({ label: `${pointMaterialLabel(inlay, current)} butt sleeve points, same as the forearm`, amount: inlay.price / 2 });
    items.push({ label: "Butt sleeve points, 3/4 of the sleeve toward the cap", amount: 0 });
    items.push({
      label: Number(veneers.id) > 0 ? `Butt sleeve, ${veneers.name.toLowerCase()}` : "Butt sleeve, no veneers",
      amount: veneerCharge(sleevePoints.count, Number(veneers.id), true),
    });
  }
  pushRingLine(items, "buttRing", find(catalog.rings, current.buttRing), "No butt ring", "Butt ring", standardRings);
  pushRingLine(items, "sleeveRing", find(catalog.rings, current.sleeveRing), "No sleeve ring", "Sleeve ring", standardRings);
  pushRingLine(items, "aJointRing", aJoint, "No A-Joint ring", "A-Joint ring", standardRings);
  pushRingLine(items, "rings", rings, "No joint ring", "Joint ring", standardRings);
  if (shaftTakesRing(current)) {
    pushRingLine(items, "shaftRing", find(catalog.rings, current.shaftRing), "No shaft ring", "Shaft ring", standardRings);
  }
  items.push(
    { label: wrap.id === "none" ? "No wrap" : `${wrap.name} wrap`, amount: wrap.price },
  );
  if (wrap.id !== "none" && color) {
    items.push({ label: `${color.name} wrap color`, amount: color.price || 0 });
  }
  if (wrap.id === "none") {
    const handle = find(catalog.woods, current.handleWood);
    items.push({
      label: `${handle.name} handle`,
      amount: handle.id === butt.id ? 0 : handle.price,
    });
  }
  items.push(
    { label: `${joint.name} joint`, amount: joint.price },
    {
      label: jointEnd.id === "plain" ? "Plain joint end, same as the forearm" : `${jointEnd.name} joint end`,
      amount: jointEnd.price,
    },
    { label: shaft.name, amount: shaft.price },
    { label: "29 in butt", amount: 0 },
  );
  if (shaft.id !== "none") {
    const shaftLength = find(catalog.shaftLengths, current.shaftLength);
    items.push(
      { label: `${shaftLength.name} shaft`, amount: 0 },
      { label: taper.name, amount: taper.price },
      { label: `${ferrule.name} ferrule`, amount: ferrule.price },
      { label: `${tip.name} tip`, amount: tip.price },
      { label: `${find(catalog.tipBrands, current.tipBrand).name} tip brand`, amount: 0 },
    );
  }
  const rule = catalog.weightRule;
  if (current.weight < rule.minIncluded || current.weight > rule.maxIncluded) {
    items.push({
      label: `Weight outside ${rule.minIncluded}–${rule.maxIncluded} oz`,
      amount: rule.customPrice,
    });
  }
  return items;
}

function totalOf(items) {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

function renderPresets() {
  const mount = document.getElementById("opt-preset");
  mount.replaceChildren(...catalog.presets.map((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset";
    button.dataset.preset = preset.id;
    button.setAttribute("aria-pressed", "false");
    const name = document.createElement("span");
    name.className = "preset-name";
    name.textContent = preset.name;
    const blurb = document.createElement("span");
    blurb.className = "preset-blurb";
    blurb.textContent = preset.blurb;
    const price = document.createElement("span");
    price.className = "preset-price";
    price.textContent = money(totalOf(lineItems(normalize(preset.state), true)));
    button.append(name, blurb, price);
    return button;
  }));
}

function renderJointEnds() {
  const butt = find(catalog.woods, state.butt);
  const items = catalog.jointEnds.map((item) => (
    item.id === "plain" ? Object.assign({}, item, { photo: butt.photo, fill: butt.fill }) : item
  ));
  renderChoice("opt-jointEnd", "jointEnd", items, true);
}

function renderButtCaps() {
  const capWood = find(catalog.woods, state.capWood);
  const items = catalog.buttCaps.map((item) => (
    item.id === "wood" ? Object.assign({}, item, { photo: capWood.photo, fill: capWood.fill }) : item
  ));
  renderChoice("opt-buttCap", "buttCap", items, true);
}

function renderWoodPalette() {
  const woods = catalog.woods.map((item) => Object.assign({}, item));
  for (const inlay of catalog.inlays) {
    if (!inlay.photo || woods.some((item) => item.id === inlay.id)) continue;
    woods.push(Object.assign({}, inlay));
  }
  renderGroup("opt-woods", "palette", woods, true);
}

function renderGroup(mountId, group, items, showPrice) {
  document.getElementById(mountId).replaceChildren(
    ...items.map((item) => optionButton(group, item, showPrice)),
  );
}

function renderTipBrands() {
  const select = document.getElementById("tip-brand");
  select.replaceChildren(...catalog.tipBrands.map((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    return option;
  }));
}

function renderPointCount() {
  const select = document.getElementById("point-count");
  select.replaceChildren(...catalog.points.filter((item) => item.id !== "none").map((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    const amount = pointCharge(item.count, false);
    option.textContent = `${item.name} — ${amount ? `+${money(amount)}` : "Included"}`;
    return option;
  }));
}

function renderChoice(mountId, group, items, showPrice) {
  choiceItems.set(group, { mountId, items, showPrice });
  const select = document.getElementById(mountId);
  select.dataset.choice = group;
  if (!select.dataset.bound) {
    select.dataset.bound = "1";
    select.addEventListener("change", onChoiceSelect);
  }
  fillChoice(group);
}

function onChoiceSelect(event) {
  const select = event.currentTarget;
  const group = select.dataset.choice;
  const id = select.value;
  if (!id) return;
  const chooseEpoxy = group === "pointWood" && id === "epoxy";
  if (RING_CHOICES.includes(group)) clearRingPosition(group);
  state[group] = id;
  commit();
  if (chooseEpoxy) openEpoxyPicker();
}

function choiceText(group, item, showPrice) {
  let name = item.name;
  let amount = item.price || 0;
  if (group === "pointWood") {
    const pointsOff = state.points === "none";
    const sleeveOff = state.sleevePoints === "none";
    amount = (pointsOff ? 0 : item.price) + (sleeveOff ? 0 : item.price / 2);
    if (item.id === "epoxy") name = pointMaterialLabel(item, state);
  } else if (group === "sleevePoints") {
    const count = item.id === "none" ? 0 : (state.points === "none" ? 4 : find(catalog.points, state.points).count);
    amount = pointCharge(count, true);
  } else if (group === "veneers") {
    const forearm = find(catalog.points, state.points);
    const sleeve = find(catalog.points, state.sleevePoints);
    amount = veneerCharge(forearm.count, Number(item.id), false) + veneerCharge(sleeve.count, Number(item.id), true);
  }
  if (!showPrice) return name;
  return `${name} — ${amount ? `+${money(amount)}` : "Included"}`;
}

function fillChoice(group) {
  const spec = choiceItems.get(group);
  if (!spec) return;
  const select = document.getElementById(spec.mountId);
  if (!select || select.tagName !== "SELECT") return;
  select.replaceChildren(...spec.items.map((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = choiceText(group, item, spec.showPrice);
    return option;
  }));
  if (group === "pointWood" && !spec.items.some((item) => item.id === state.pointWood)) {
    const current = find(catalog.inlays, state.pointWood) || find(catalog.woods, state.pointWood);
    if (current) {
      const option = document.createElement("option");
      option.value = current.id;
      option.textContent = choiceText(group, current, spec.showPrice);
      select.append(option);
    }
  }
  if (appliedRings[group]) {
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Custom stack";
    select.prepend(blank);
    select.value = "";
    return;
  }
  const value = group === "sleevePoints" && state.sleevePoints !== "none" ? "match" : state[group];
  select.value = value == null ? "" : String(value);
}

function syncChoices() {
  for (const group of choiceItems.keys()) fillChoice(group);
  const pointsOff = state.points === "none";
  const sleeveOff = state.sleevePoints === "none";
  document.getElementById("opt-pointWood").disabled = pointsOff && sleeveOff;
  document.getElementById("opt-veneers").disabled = pointsOff && sleeveOff;
}

function renderWrapColors() {
  const existing = document.getElementById("wrap-color-slot");
  if (existing) existing.remove();
  const wrap = find(catalog.wraps, state.wrap);
  choiceItems.delete("wrapColor");
  if (!wrap.colors.length) return;
  const button = document.getElementById("opt-wrap");
  if (!button) return;
  const slot = document.createElement("div");
  slot.id = "wrap-color-slot";
  slot.className = "point-count wrap-color-slot";
  const label = document.createElement("span");
  label.textContent = "Wrap color";
  slot.append(label);
  if (wrap.id === "linen") {
    const menuWrap = document.createElement("div");
    menuWrap.className = "wrap-color";
    const current = document.createElement("button");
    current.type = "button";
    current.className = "wrap-current";
    current.id = "wrap-color-button";
    current.setAttribute("aria-haspopup", "listbox");
    current.setAttribute("aria-expanded", "false");
    const currentSwatch = document.createElement("span");
    currentSwatch.className = "thread-swatch";
    const currentName = document.createElement("span");
    currentName.className = "wrap-color-name";
    current.append(currentSwatch, currentName);
    const menu = document.createElement("div");
    menu.className = "wrap-menu";
    menu.id = "wrap-menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.append(...wrap.colors.map((item) => {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.dataset.group = "wrapColor";
      choice.dataset.id = item.id;
      choice.setAttribute("role", "option");
      choice.setAttribute("aria-pressed", "false");
      const swatch = document.createElement("span");
      swatch.className = "thread-swatch";
      paintThreadSwatch(swatch, item);
      const name = document.createElement("span");
      name.textContent = item.name;
      choice.append(swatch, name);
      return choice;
    }));
    menuWrap.append(current, menu);
    slot.append(menuWrap);
    button.after(slot);
    return;
  }
  const select = document.createElement("select");
  select.id = "opt-wrapColor";
  slot.append(select);
  button.after(slot);
  renderChoice("opt-wrapColor", "wrapColor", wrap.colors, true);
}

function paintThreadSwatch(swatch, color) {
  swatch.style.setProperty("--thread", color.fill);
  swatch.style.setProperty("--spec", color.spec || color.fill);
  swatch.classList.remove("is-spec", "is-double");
  if (!color.spec) {
    swatch.style.background = color.fill;
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 84;
  canvas.height = 42;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let py = 0; py < canvas.height; py += 1) {
    for (let px = 0; px < canvas.width; px += 1) {
      const sample = linenWeave(px * 0.0022, py * 0.0032, 0.55, color);
      const i = (py * canvas.width + px) * 4;
      image.data[i] = Math.round(sample.rgb[0] * 255);
      image.data[i + 1] = Math.round(sample.rgb[1] * 255);
      image.data[i + 2] = Math.round(sample.rgb[2] * 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  swatch.style.background = `url(${canvas.toDataURL()}) center / cover no-repeat`;
}

function optionButton(group, item, showPrice) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "swatch";
  button.dataset.group = group;
  button.dataset.id = item.id;
  button.setAttribute("aria-pressed", "false");
  const name = document.createElement("span");
  name.className = "swatch-name";
  name.textContent = item.name;
  const swatchColor = item.fill || item.swatch || item.collar;
  if (item.photo) {
    const photo = document.createElement("span");
    photo.className = "wood-photo";
    photo.style.backgroundImage = `url("${item.photo}")`;
    button.append(photo);
  } else if (swatchColor) {
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = swatchColor;
    button.append(dot);
  }
  button.append(name);
  if (group === "palette") {
    button.draggable = !phoneLayout();
    button.addEventListener("dragstart", (event) => {
      if (phoneLayout()) {
        event.preventDefault();
        return;
      }
      draggedWood = { group, id: item.id, name: item.name };
      event.dataTransfer.setData("text/plain", `${group}:${item.id}`);
      event.dataTransfer.effectAllowed = "copy";
    });
    button.addEventListener("dragend", endWoodDrag);
    button.addEventListener("click", () => {
      if (!phoneLayout()) return;
      selectedWood = selectedWood && selectedWood.id === item.id
        ? null
        : { group, id: item.id, name: item.name };
      paintArmedWood();
      document.getElementById("stage-caption").textContent = selectedWood
        ? `Tap the cue where ${item.name} goes.`
        : stageCaption();
    });
  }
  if (showPrice) {
    const price = document.createElement("span");
    price.className = "swatch-price";
    price.textContent = item.priceNote || (item.price ? `+${money(item.price)}` : "Included");
    button.append(price);
  }
  return button;
}

function pointCharge(count, half) {
  return count * catalog.pointEach / (half ? 2 : 1);
}

function veneerCharge(count, layers, half) {
  return count * layers * catalog.veneerEach / (half ? 2 : 1);
}

function paintSelection() {
  document.querySelectorAll("[data-group]").forEach((button) => {
    const on = String(state[button.dataset.group]) === button.dataset.id;
    button.classList.toggle("is-selected", on);
    button.setAttribute("aria-pressed", String(on));
  });
  paintArmedWood();
  const pointsOff = state.points === "none";
  const veneersOff = pointsOff && state.sleevePoints === "none";
  const veneerCount = veneersOff ? 0 : Number(state.veneers);
  const materialOff = pointsOff && sleeveOff;
  document.getElementById("point-count").value = state.points;
  document.getElementById("tip-brand").value = state.tipBrand;
  syncChoices();
  for (let layer = 1; layer <= 3; layer += 1) {
    const label = document.getElementById(`veneer-label-${layer}`);
    const button = document.getElementById(`veneer-${layer}`);
    const color = find(catalog.veneerColors, state[`veneer${layer}`]);
    const unused = layer > veneerCount;
    label.hidden = false;
    button.disabled = unused;
    if (unused) {
      document.getElementById(`veneer-menu-${layer}`).hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
    button.textContent = color.name;
    button.style.backgroundColor = color.fill;
    button.style.color = inkOn(color.fill);
    document.querySelectorAll(`#veneer-menu-${layer} button`).forEach((choice) => {
      choice.setAttribute("aria-selected", String(choice.dataset.id === color.id));
    });
  }
  const wrapColorButton = document.getElementById("wrap-color-button");
  if (wrapColorButton) {
    const wrap = find(catalog.wraps, state.wrap);
    const color = wrap.colors.find((item) => item.id === state.wrapColor);
    wrapColorButton.querySelector(".wrap-color-name").textContent = color.name;
    paintThreadSwatch(wrapColorButton.querySelector(".thread-swatch"), color);
  }
  document.getElementById("point-hint").hidden = !materialOff;
  document.getElementById("point-reach").disabled = pointsOff;
  document.getElementById("point-reach-hint").hidden = !pointsOff;
  document.getElementById("veneer-hint").hidden = !veneersOff;
  document.getElementById("veneer-color-hint").hidden = veneersOff || veneerCount !== 0;
  document.getElementById("veneer-colors").hidden = veneersOff;
  document.getElementById("veneer-order-note").hidden = veneersOff;

  const match = catalog.presets.find((preset) =>
    STATE_KEYS.every((key) => preset.state[key] === state[key]));
  document.querySelectorAll("[data-preset]").forEach((button) => {
    const on = match && button.dataset.preset === match.id;
    button.classList.toggle("is-selected", Boolean(on));
    button.setAttribute("aria-pressed", String(Boolean(on)));
  });

  document.getElementById("joint-note").textContent = find(catalog.joints, state.joint).note;
  document.getElementById("taper-note").textContent = find(catalog.tapers, state.taper).note;
  document.getElementById("shaft-ring-option").hidden = !shaftTakesRing(state);
  const buttOnly = state.shaft === "none";
  document.getElementById("shaft-details").hidden = buttOnly;
  document.getElementById("section-tip").hidden = buttOnly;
  document.getElementById("section-ferrule").hidden = buttOnly;
  document.querySelector('[data-goto="section-tip"]').hidden = buttOnly;
  document.querySelector('[data-goto="section-ferrule"]').hidden = buttOnly;
  paintShaftToggle();
}

function renderSpec(items) {
  const sum = totalOf(items);
  document.getElementById("estimate").textContent = money(sum);
  document.getElementById("bar-price").textContent = money(sum);
  document.getElementById("bar-name").textContent = state.name || "Untitled cue";
  const joint = find(catalog.joints, state.joint);
  const tipSize = find(catalog.tipSizes, state.tipSize);
  document.getElementById("playing").textContent = state.shaft === "none"
    ? `${formatOz(state.weight)} oz · ${joint.name}`
    : `${formatOz(state.weight)} oz · ${tipSize.name} tip · ${joint.name}`;
  document.getElementById("lines").replaceChildren(...items.map((item) => {
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = item.label;
    const amount = document.createElement("span");
    amount.textContent = item.amount ? money(item.amount) : "Included";
    row.append(label, amount);
    return row;
  }));
  document.getElementById("summary-live").textContent =
    `${state.name}. Estimate ${money(sum)}.`;
  syncRingDesignSheet();
}

function buildSheetText() {
  const playing = document.getElementById("playing").textContent;
  const lines = [state.name, "", playing, ""];
  for (const item of lastItems) {
    lines.push(`${item.label} — ${item.amount ? money(item.amount) : "Included"}`);
  }
  lines.push("", `Estimate — ${money(totalOf(lastItems))}`);
  return lines.join("\n");
}

function designFileName() {
  const name = (state.name || "Cue").replace(/[^\w .()-]+/g, "").trim() || "Cue";
  return `${name} build sheet.pdf`;
}

function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function buildPrintPdf() {
  const canvas = document.getElementById("cue");
  const stage = canvas.closest(".stage");
  const model = canvas.parentElement;
  const saved = {
    stageHeight: stage.style.height,
    stageOverflow: stage.style.overflow,
    modelHeight: model.style.height,
    canvasFlex: canvas.style.flex,
  };
  stage.style.height = "auto";
  stage.style.overflow = "visible";
  model.style.height = "auto";
  canvas.style.flex = "none";
  window.dispatchEvent(new Event("beforeprint"));
  await waitFrame();
  const picture = canvas.toDataURL("image/png");
  window.dispatchEvent(new Event("afterprint"));
  stage.style.height = saved.stageHeight;
  stage.style.overflow = saved.stageOverflow;
  model.style.height = saved.modelHeight;
  canvas.style.flex = saved.canvasFlex;

  const sheet = document.createElement("div");
  sheet.style.width = "720px";
  sheet.style.background = "#fff";
  sheet.style.color = "#111";

  const figure = document.createElement("div");
  figure.style.breakAfter = "page";
  figure.style.pageBreakAfter = "always";
  figure.style.background = "#fff";
  const image = document.createElement("img");
  image.src = picture;
  image.alt = "";
  image.style.display = "block";
  image.style.width = "720px";
  image.style.height = "auto";
  image.style.background = "#fff";
  figure.append(image);
  await image.decode();

  const spec = document.getElementById("spec").cloneNode(true);
  const name = spec.querySelector("#cue-name");
  if (name) name.value = state.name || "";
  spec.querySelectorAll(".actions, #submit-note").forEach((node) => node.remove());
  const ringSheet = spec.querySelector("#ring-design-sheet");
  if (ringSheet) {
    ringSheet.hidden = false;
    ringSheet.style.display = "block";
  }
  spec.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  spec.style.border = "0";
  spec.style.overflow = "visible";
  spec.style.background = "#fff";
  sheet.append(figure, spec);
  document.body.append(sheet);
  await image.decode();
  sheet.getBoundingClientRect();
  try {
    return await html2pdf().set({
      margin: [0.4, 0.4, 0.4, 0.4],
      image: { type: "jpeg", quality: 0.92 },
      html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    }).from(sheet).outputPdf("blob");
  } finally {
    sheet.remove();
  }
}

function submitDesign() {
  const button = document.getElementById("submit-design");
  const note = document.getElementById("submit-note");
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = "Preparing…";
  note.hidden = true;
  const subject = `Cue design: ${state.name || "Untitled cue"}`;
  buildPrintPdf().then((pdf) => {
    button.textContent = "Sending…";
    const form = new FormData();
    form.append("_subject", subject);
    form.append("_captcha", "false");
    form.append("message", buildSheetText());
    form.append("attachment", new File([pdf], designFileName(), { type: "application/pdf" }));
    return fetch("https://formsubmit.co/builds@repaskycustomcues.com", {
      method: "POST",
      body: form,
    });
  }).then(async (response) => {
    const body = await response.text();
    let result = {};
    try { result = JSON.parse(body); } catch (error) { result = {}; }
    const sent = String(result.success) === "true" || (response.ok && /<h1[^>]*>\s*Thanks!/i.test(body));
    if (sent) {
      button.textContent = "Sent";
      return;
    }
    if (/activ/i.test(result.message || body)) {
      button.textContent = previous;
      note.hidden = false;
      note.textContent = "Open the activation email sent to builds@repaskycustomcues.com, then submit the design again.";
      return;
    }
    throw new Error(result.message || "send failed");
  }).catch(() => {
    button.textContent = "Could not send";
  }).finally(() => {
    window.setTimeout(() => {
      button.disabled = false;
      if (button.textContent === "Sent" || button.textContent === "Could not send") {
        button.textContent = previous;
      }
    }, 1600);
  });
}

async function copySpec() {
  const button = document.getElementById("copy-spec");
  const text = buildSheetText();
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  const previous = button.textContent;
  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = previous;
  }, 1400);
}

function pushRingLine(items, position, standard, noneLabel, title, standardRings) {
  const custom = standardRings ? null : appliedRings[position];
  if (!custom) {
    items.push({
      label: standard.id === "none" ? noneLabel : `${title}, ${standard.name}`,
      amount: standard.price,
    });
    return;
  }
  const inlaid = custom.layers.filter((layer) => layer.face === "dots" || layer.grooved).length;
  items.push({ label: `${title}, custom stack`, amount: 10 });
  if (inlaid) {
    items.push({
      label: `${title}, ${inlaid} inlaid ${inlaid === 1 ? "ring" : "rings"}`,
      amount: 50 * inlaid,
    });
  }
}

function shaftTakesRing(current) {
  return find(catalog.shafts, current.shaft).kind === "wood";
}

function ringOnCue(position) {
  if (position === "shaftRing" && !shaftTakesRing(state)) return false;
  return Boolean(appliedRings[position]);
}

/* Inches from the bumper. The butt is always 29 in.
   A shaft adds its own 29 or 30 in. The full length stays in the layout
   so the ferrule and tip sit past the joint even when the shaft is hidden. */
function cueLayout(current) {
  const shaftIn = Number(find(catalog.shaftLengths, current.shaftLength).id);
  const length = BUTT_INCHES + shaftIn;
  const profile = find(catalog.buttProfiles, current.buttProfile);
  const joint = find(catalog.joints, current.joint);
  const rings = find(catalog.rings, current.rings);
  const shaftRing = find(catalog.rings, current.shaftRing);
  const allowShaftRing = shaftTakesRing(current);
  const aJoint = find(catalog.rings, current.aJointRing);
  const sleeveRing = find(catalog.rings, current.sleeveRing);
  const buttRing = find(catalog.rings, current.buttRing);
  const jointAt = BUTT_INCHES;
  const bumper = 0.35;
  const whiteRing = bumper + 0.15;
  const cap = 1;
  const wrap0 = whiteRing + 2.75;
  const wrap1 = wrap0 + 13;
  const band = 0.11;
  const buttDesign = appliedRings.buttRing;
  const sleeveDesign = appliedRings.sleeveRing;
  const aJointDesign = appliedRings.aJointRing;
  const jointDesign = appliedRings.rings;
  const shaftDesign = allowShaftRing ? appliedRings.shaftRing : null;
  const buttCustom = buttDesign && buttDesign.layers;
  const sleeveCustom = sleeveDesign && sleeveDesign.layers;
  const aJointCustom = aJointDesign && aJointDesign.layers;
  const jointCustom = jointDesign && jointDesign.layers;
  const shaftCustom = shaftDesign && shaftDesign.layers;
  const sleeveRing1 = wrap0;
  const sleeveRing0 = wrap0 - (sleeveDesign ? ringDesignSpan(sleeveDesign) : sleeveRing.bands.length * band);
  const aJoint0 = wrap1;
  const aJoint1 = wrap1 + (aJointDesign ? ringDesignSpan(aJointDesign) : aJoint.bands.length * band);
  const buttRing0 = cap;
  const buttRing1 = cap + (buttDesign ? ringDesignSpan(buttDesign) : buttRing.bands.length * band);
  const sleeve0 = buttRing1;
  const sleeve1 = sleeveRing0;
  const sleevePoint = sleeve1 - (sleeve1 - sleeve0) * 0.75;
  const tip0 = length - 0.22;
  const ferrule0 = tip0 - 0.95;
  const jointEnd = find(catalog.jointEnds, current.jointEnd);
  const collar1 = jointAt;
  const collar0 = collar1 - (jointEnd.id === "plain" ? 0 : (joint.wideCollar ? 0.9 : 0.5));
  const ring1 = collar0;
  const ring0 = jointDesign ? ring1 - ringDesignSpan(jointDesign) : ring1 - rings.bands.length * band;
  const shaftRing0 = collar1;
  const shaftSpan = allowShaftRing
    ? (shaftDesign ? ringDesignSpan(shaftDesign) : shaftRing.bands.length * band)
    : 0;
  const shaftRing1 = collar1 + shaftSpan;
  const pointReach = readPointReach(current.pointReach);
  const point1 = Math.min(wrap1 + pointReach, ring0 - 0.08);
  return {
    length,
    x0: 0,
    x1: length,
    bumper,
    whiteRing,
    cap,
    sleeve0,
    sleeve1,
    sleevePoint,
    buttRing0,
    buttRing1,
    buttBands: buttRing.bands,
    sleeveRing0,
    sleeveRing1,
    sleeveBands: sleeveRing.bands,
    wrap0,
    wrap1,
    aJoint0,
    aJoint1,
    aJointBands: aJoint.bands,
    point1,
    ring0,
    ring1,
    collar0,
    collar1,
    shaftRing0,
    shaftRing1,
    shaftBands: allowShaftRing ? shaftRing.bands : [],
    ferrule0,
    tip0,
    endDiameter: profile.endIn,
    jointDiameter: JOINT_DIAMETER_IN,
    tipDiameter: Number(current.tipSize) / 25.4,
    bands: rings.bands,
    buttCustom,
    sleeveCustom,
    aJointCustom,
    jointCustom,
    shaftCustom,
  };
}

function cueBreaks(layout) {
  const breaks = [
    layout.x0, layout.cap, layout.buttRing0, layout.buttRing1, layout.sleevePoint,
    layout.sleeveRing0, layout.sleeveRing1, layout.wrap0, layout.wrap1,
    layout.aJoint0, layout.aJoint1, layout.point1,
    layout.ring0, layout.ring1, layout.collar1, layout.shaftRing0, layout.shaftRing1, layout.ferrule0, layout.tip0, layout.x1,
  ];
  ringEdges(breaks, layout.buttRing0, layout.buttRing1, layout.buttCustom, layout.buttBands.length);
  ringEdges(breaks, layout.sleeveRing0, layout.sleeveRing1, layout.sleeveCustom, layout.sleeveBands.length);
  ringEdges(breaks, layout.aJoint0, layout.aJoint1, layout.aJointCustom, layout.aJointBands.length);
  ringEdges(breaks, layout.ring0, layout.ring1, layout.jointCustom, layout.bands.length);
  ringEdges(breaks, layout.shaftRing0, layout.shaftRing1, layout.shaftCustom, layout.shaftBands.length);
  return breaks;
}

function ringEdges(breaks, x0, x1, layers, bandCount) {
  if (layers) addLayerEdges(breaks, x0, x1, layers);
  else addBandEdges(breaks, x0, x1, bandCount);
}

function addLayerEdges(breaks, x0, x1, layers) {
  const total = layers.reduce((sum, layer) => sum + Number(layer.thickness), 0);
  if (!total || x1 <= x0) return;
  let cursor = 0;
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    const thickness = Number(layer.thickness);
    const start = x0 + (x1 - x0) * (cursor / total);
    const end = x0 + (x1 - x0) * ((cursor + thickness) / total);
    if (layer.dots) {
      const step = Math.max(0.012, smallestDot(layer) / 4);
      const count = Math.max(1, Math.ceil((end - start) / step));
      for (let i = 1; i < count; i += 1) breaks.push(start + (end - start) * (i / count));
    }
    const axisAngle = layer.grooves && Number(layer.grooves.axisAngle);
    if (axisAngle) {
      const count = Math.min(64, Math.max(8, Math.ceil((end - start) / 0.012)));
      for (let i = 1; i < count; i += 1) breaks.push(start + (end - start) * (i / count));
    }
    cursor += thickness;
    if (index < layers.length - 1) breaks.push(end);
  }
}

function addBandEdges(breaks, x0, x1, count) {
  if (!count) return;
  const width = (x1 - x0) / count;
  for (let band = 1; band < count; band += 1) breaks.push(x0 + width * band);
}

function radiusInches(x, layout, taper) {
  const jointR = layout.jointDiameter / 2;
  const buttR = layout.endDiameter / 2;
  const tipR = layout.tipDiameter / 2;
  if (x <= layout.collar1) {
    const t = x / layout.collar1;
    return buttR + (jointR - buttR) * t;
  }
  let t = (x - layout.collar1) / (layout.x1 - layout.collar1);
  t = Math.min(1, Math.max(0, t));
  /* Pro taper reaches the tip diameter halfway down the shaft, then stays thin.
     Conical falls in a straight line, so it stays thicker until the tip. */
  if (taper === "pro") t = Math.min(1, t / 0.5);
  return jointR + (tipR - jointR) * t;
}

function drawCue() {
  const butt = find(catalog.woods, state.butt);
  const wrap = find(catalog.wraps, state.wrap);
  const color = wrap.colors.find((item) => item.id === state.wrapColor);
  const sleevePoints = find(catalog.points, state.sleevePoints);
  const veneerIds = [1, 2, 3].slice(0, Number(state.veneers)).map((layer) => state[`veneer${layer}`]);
  const points = find(catalog.points, state.points);
  const inlay = find(catalog.inlays, state.pointWood);
  const rings = find(catalog.rings, state.rings);
  const joint = find(catalog.joints, state.joint);
  const shaft = find(catalog.shafts, state.shaft);
  const ferrule = find(catalog.ferrules, state.ferrule);
  const tip = find(catalog.tips, state.tip);
  const layout = cueLayout(state);
  woodLayout = layout;
  const handle = find(catalog.woods, state.handleWood);
  const capWood = find(catalog.woods, state.capWood);
  const parts = { butt, wrap, color, handle, rings, joint, jointEnd: find(catalog.jointEnds, state.jointEnd), shaft, ferrule, tip, layout, cap: find(catalog.buttCaps, state.buttCap), capWood };
  document.getElementById("cue").setAttribute("aria-label", cueAriaLabel());
  document.getElementById("stage-caption").textContent = stageCaption();
  const buttEnd = Math.max(layout.collar1, layout.shaftRing1);
  const x1 = state.shaft !== "none" && shaftShown ? layout.x1 : buttEnd;
  const breaks = cueBreaks(layout).filter((x) => x <= x1 + 0.0001);
  CueView.update({
    x0: layout.x0,
    x1,
    flatEnd: state.shaft === "none" || !shaftShown,
    breaks,
    radiusAt: (x) => radiusInches(x, layout, state.taper),
    linenDetail: wrap.id === "linen" ? { x0: layout.wrap0, x1: layout.wrap1, step: 0.005 } : null,
    colorAt: (x, angle) => surfaceColor(x, angle, parts),
    points: [
      pointSpec(points, inlay, veneerIds, layout.aJoint1, layout.point1, layout.ring0 - 0.05),
      pointSpec(sleevePoints, inlay, veneerIds, layout.sleeve1, layout.sleevePoint, layout.sleeve0 + 0.03),
    ].filter(Boolean),
  });
}

function pointSpec(style, wood, veneerIds, xWide, xTip, xLimit) {
  if (!style || style.id === "none") return null;
  const baseHalf = style.count >= 6 ? 0.22 : 0.3;
  const veneers = veneerIds.map((id) => hexToUnit(find(catalog.veneerColors, id).fill));
  const woodTip = pointWoodTip(xWide, xTip, baseHalf, veneers.length);
  return {
    count: style.count,
    x0: xWide,
    x1: woodTip,
    xLimit,
    baseHalf,
    layerEnds: veneers.map((_, index) => veneerTip(xWide, woodTip, xLimit, baseHalf, (veneers.length - index) * 0.055)),
    fill: hexToUnit(wood.id === "epoxy" ? state.epoxyColor : wood.fill),
    colorAt: wood.photo ? (x, angle) => paintWood(wood.photo, wood.fill, wood.grain || "straight", x, angle) : null,
    veneers,
  };
}

/* The set length is the whole point, veneers included. The point wood stops
   short by however far the outer veneer runs past it. */
function pointWoodTip(x0, xTip, baseHalf, veneerCount) {
  if (!veneerCount) return xTip;
  const scale = (baseHalf + veneerCount * 0.055) / baseHalf;
  return x0 + (xTip - x0) / scale;
}

/* A veneer keeps a constant width beside the point, then runs past the point
   material until its two sides meet. */
function veneerTip(x0, x1, xLimit, baseHalf, extra) {
  const scale = (baseHalf + extra) / baseHalf;
  let xEnd = x0 + (x1 - x0) * scale;
  if (xLimit == null) return xEnd;
  return x1 >= x0 ? Math.min(xEnd, xLimit) : Math.max(xEnd, xLimit);
}

function surfaceColor(x, angle, parts) {
  const { butt, wrap, color, handle, shaft, ferrule, tip, layout, cap, capWood } = parts;
  if (x < layout.cap) {
    if (cap.id === "black") return flat(hexToUnit("#161616"));
    if (cap.id === "white") return flat(hexToUnit("#f3efe4"));
    return paintWood(capWood.photo, capWood.fill, capWood.grain, x, angle);
  }
  const custom = customLayerAt(x, layout);
  if (custom) return customRingSurface(custom, x, angle);
  const buttBand = bandAt(x, layout.buttRing0, layout.buttRing1, layout.buttBands);
  if (buttBand) return flat(hexToUnit(buttBand));
  const sleeveBand = bandAt(x, layout.sleeveRing0, layout.sleeveRing1, layout.sleeveBands);
  if (sleeveBand) return flat(hexToUnit(sleeveBand));
  const aJointBand = bandAt(x, layout.aJoint0, layout.aJoint1, layout.aJointBands);
  if (aJointBand) return flat(hexToUnit(aJointBand));
  if (wrap.id === "none" && x >= layout.wrap0 && x < layout.wrap1) {
    return paintWood(handle.photo, handle.fill, handle.grain, x, angle);
  }
  if (wrap.id !== "none" && x >= layout.wrap0 && x < layout.wrap1) {
    if (wrap.id === "linen") {
      const woven = linenWeave(x, angle, radiusInches(x, layout, state.taper), color || { fill: "#e4ddd2" });
      return flat(woven.rgb);
    }
    return flat(hexToUnit(color ? color.fill : "#6a3a22"));
  }
  const jointBand = bandAt(x, layout.ring0, layout.ring1, layout.bands);
  if (jointBand) return flat(hexToUnit(jointBand));
  if (x >= layout.collar0 && x < layout.collar1) return jointEndSample(x, angle, parts);
  const shaftBand = bandAt(x, layout.shaftRing0, layout.shaftRing1, layout.shaftBands);
  if (shaftBand) return flat(hexToUnit(shaftBand));
  if (x >= layout.collar1 && x < layout.ferrule0) {
    if (!shaftShown || !shaft || shaft.id === "none") return jointEndSample(x, angle, parts);
    if (shaft.kind === "carbon") {
      const rgb = hexToUnit(shaft.fill);
      const twill = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(angle * 10 + x * 1.4));
      return flat(rgb.map((channel) => Math.min(1, channel * twill + 0.04)));
    }
    return paintWood(shaft.photo, shaft.fill, shaft.grain, x, angle);
  }
  if (x >= layout.ferrule0 && x < layout.tip0) return flat(hexToUnit(ferrule.fill));
  if (x >= layout.tip0) return flat(hexToUnit(tip.fill));
  return paintWood(butt.photo, butt.fill, butt.grain, x, angle);
}

/* Side photograph of the 29 in butt. Grain is drawn at the size on screen,
   so zooming in stays smooth instead of enlarging pixels. */
function openButtRender() {
  const button = document.getElementById("render-model");
  button.disabled = true;
  button.textContent = "Rendering…";
  window.setTimeout(() => {
    renderScene = buildRenderScene();
    button.disabled = false;
    button.textContent = "Render Model";
    const dialog = document.getElementById("render-dialog");
    if (!dialog.open) dialog.showModal();
    sizeRenderView();
    fitRenderView();
  }, 30);
}

function buildRenderScene() {
  const layout = cueLayout(state);
  woodLayout = layout;
  const butt = find(catalog.woods, state.butt);
  const wrap = find(catalog.wraps, state.wrap);
  const sleevePoints = find(catalog.points, state.sleevePoints);
  const veneerIds = [1, 2, 3].slice(0, Number(state.veneers)).map((layer) => state[`veneer${layer}`]);
  const points = find(catalog.points, state.points);
  const inlay = find(catalog.inlays, state.pointWood);
  const parts = {
    butt,
    wrap,
    color: wrap.colors.find((item) => item.id === state.wrapColor),
    handle: find(catalog.woods, state.handleWood),
    rings: find(catalog.rings, state.rings),
    joint: find(catalog.joints, state.joint),
    jointEnd: find(catalog.jointEnds, state.jointEnd),
    shaft: find(catalog.shafts, state.shaft),
    ferrule: find(catalog.ferrules, state.ferrule),
    tip: find(catalog.tips, state.tip),
    layout,
    cap: find(catalog.buttCaps, state.buttCap),
    capWood: find(catalog.woods, state.capWood),
  };
  const pointSpecs = [
    pointSpec(points, inlay, veneerIds, layout.aJoint1, layout.point1, layout.ring0 - 0.05),
    pointSpec(sleevePoints, inlay, veneerIds, layout.sleeve1, layout.sleevePoint, layout.sleeve0 + 0.03),
  ].filter(Boolean);
  pointSpecs.forEach((spec) => { spec.wood = inlay; });
  return { parts, pointSpecs, length: Math.max(layout.collar1, layout.shaftRing1), maxDiameter: layout.endDiameter };
}

function buttPhotoRadius(x, layout) {
  const body = radiusInches(Math.max(x, 0.001), layout, state.taper);
  const nose = 0.22;
  if (x < nose) return body * Math.sin((x / nose) * (Math.PI / 2));
  return body;
}

function colorOnButt(x, angle, parts, pointSpecs, radius, pixelInches, octaves) {
  for (const spec of pointSpecs) {
    const hit = pointLayerAt(spec, x, angle, radius, octaves, pixelInches);
    if (!hit) continue;
    if (hit.cover >= 0.995) return hit;
    const surface = photoSurface(x, angle, parts, radius, pixelInches, octaves);
    return {
      rgb: surface.rgb.map((channel, index) => channel * (1 - hit.cover) + hit.rgb[index] * hit.cover),
      kind: hit.kind,
      nyShift: surface.nyShift,
    };
  }
  const surface = photoSurface(x, angle, parts, radius, pixelInches, octaves);
  const logo = capLogo(x, angle, radius, parts.layout);
  if (!logo) return surface;
  return { rgb: logo.ink ? [0.07, 0.06, 0.05] : [0.96, 0.94, 0.9], kind: "cap" };
}

/* 10 mm badge on the side of the butt cap. The crown points toward the joint. */
const LOGO_DIAMETER_IN = 10 / 25.4;
let logoBits = null;

function capLogo(x, angle, radius, layout) {
  const mark = window.RC_LOGO;
  if (!mark || x < 0 || x > layout.cap) return null;
  const along = x - layout.cap * 0.5;
  const around = (Math.PI / 2 - angle) * Math.max(radius, 0.05);
  const reach = LOGO_DIAMETER_IN * 0.5;
  if (along * along + around * around > reach * reach) return null;
  if (!logoBits) logoBits = Uint8Array.from(atob(mark.bits), (char) => char.charCodeAt(0));
  const u = 0.5 - around / LOGO_DIAMETER_IN;
  const v = 0.5 - along / LOGO_DIAMETER_IN;
  const px = Math.min(mark.size - 1, Math.max(0, Math.floor(u * mark.size)));
  const py = Math.min(mark.size - 1, Math.max(0, Math.floor(v * mark.size)));
  const index = py * mark.size + px;
  return { ink: (logoBits[index >> 3] >> (7 - (index & 7))) & 1 };
}

function pointLayerAt(spec, x, angle, radius, octaves, pixelInches) {
  const span = spec.x1 - spec.x0;
  if (!span) return null;
  const t = (x - spec.x0) / span;
  if (t < -0.002) return null;
  const baseHalf = spec.baseHalf || (spec.count >= 6 ? 0.22 : 0.3);
  const feather = Math.max(0.0035, (pixelInches || 0.01) / (Math.max(radius, 0.05) * Math.max(0.28, Math.sin(angle))));
  const start = Math.PI / 2;
  let best = null;
  for (let point = 0; point < spec.count; point += 1) {
    const center = start + point * (Math.PI * 2 / spec.count);
    let delta = Math.abs(angle - center) % (Math.PI * 2);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    const layers = spec.veneers.map((rgb, index) => ({
      rgb,
      extra: (spec.veneers.length - index) * 0.055,
      lift: 0.004 + index * 0.003,
      tEnd: (spec.layerEnds[index] - spec.x0) / span,
    }));
    layers.push({
      wood: true,
      extra: 0,
      lift: 0.004 + spec.veneers.length * 0.003 + 0.003,
      tEnd: 1,
    });
    for (const layer of layers) {
      layer.half = layer.tEnd <= 0 || t > layer.tEnd ? 0 : (baseHalf + layer.extra) * (1 - Math.max(0, t) / layer.tEnd);
    }
    const visible = layers.filter((layer) => layer.half > 0 && delta <= layer.half + feather);
    if (!visible.length) continue;
    visible.sort((a, b) => b.lift - a.lift);
    const inside = visible[0];
    const cover = Math.max(0, Math.min(1, (inside.half - delta) / feather + 0.5));
    const colorOf = (layer) => (layer.wood
      ? { rgb: photoWoodRgb(spec.wood, x, angle, radius, octaves), kind: "wood" }
      : { rgb: photoFinish(layer.rgb, x, angle, octaves), kind: "veneer" });
    if (!best || inside.lift > best.lift) {
      const top = colorOf(inside);
      if (cover >= 0.995) {
        best = { rgb: top.rgb, kind: top.kind, cover: 1, lift: inside.lift };
      } else {
        const under = visible.find((layer) => layer.lift < inside.lift);
        if (under) {
          const below = colorOf(under);
          best = {
            rgb: top.rgb.map((channel, index) => below.rgb[index] * (1 - cover) + channel * cover),
            kind: top.kind,
            cover: 1,
            lift: inside.lift,
          };
        } else {
          best = { rgb: top.rgb, kind: top.kind, cover, lift: inside.lift };
        }
      }
    }
  }
  if (!best) return null;
  return { rgb: best.rgb, kind: best.kind, cover: best.cover };
}

function photoSurface(x, angle, parts, radius, pixelInches, octaves) {
  const { butt, wrap, color, handle, layout, cap, capWood } = parts;
  if (x < layout.cap) {
    if (cap.id === "black") return { rgb: hexToUnit("#141210"), kind: "cap" };
    if (cap.id === "white") return { rgb: hexToUnit("#f4efe6"), kind: "cap" };
    return { rgb: photoWoodRgb(capWood, x, angle, radius, octaves), kind: "wood" };
  }
  const custom = customLayerAt(x, layout);
  if (custom) return customRingPhoto(custom, angle, radius);
  const buttBand = photoRing(x, layout.buttRing0, layout.buttRing1, layout.buttBands);
  if (buttBand) return buttBand;
  const sleeveBand = photoRing(x, layout.sleeveRing0, layout.sleeveRing1, layout.sleeveBands);
  if (sleeveBand) return sleeveBand;
  const aJointBand = photoRing(x, layout.aJoint0, layout.aJoint1, layout.aJointBands);
  if (aJointBand) return aJointBand;
  if (x >= layout.wrap0 && x < layout.wrap1) {
    if (wrap.id === "none") return { rgb: photoWoodRgb(handle, x, angle, radius, octaves), kind: "wood" };
    if (wrap.id === "linen" && color) return filteredLinen(x, angle, radius, color, pixelInches);
    return { rgb: photoLeather(color ? color.fill : "#6a3a22", x, angle, octaves), kind: "leather" };
  }
  const jointBand = photoRing(x, layout.ring0, layout.ring1, layout.bands);
  if (jointBand) return jointBand;
  const shaftBand = photoRing(x, layout.shaftRing0, layout.shaftRing1, layout.shaftBands);
  if (shaftBand) return shaftBand;
  if (x >= layout.collar0) return photoJointEnd(x, angle, parts, radius, octaves);
  return { rgb: photoWoodRgb(butt, x, angle, radius, octaves), kind: "wood" };
}

function photoRing(x, x0, x1, bands) {
  const hex = bandAt(x, x0, x1, bands);
  if (!hex) return null;
  return { rgb: hexToUnit(hex), kind: "ring" };
}

function linenWeave(x, angle, radius, color) {
  const base = hexToUnit(color.fill);
  const around = angle * Math.max(radius, 0.05);
  const coursePitch = 0.022;
  const course = Math.floor(x / coursePitch);
  const courseCenter = (course + 0.5) * coursePitch;
  let rgb = base;
  if (color.spec) {
    const spec = hexToUnit(color.spec);
    const double = color.pattern === "double";
    const specThread = double ? (photoMod(course, 3) !== 2) : (photoMod(course, 2) === 0);
    if (specThread) {
      const span = (double ? 0.1 : 0.13) * (0.86 + photoHash(course, 8) * 0.28);
      const stagger = photoMod(course, 2) * span * 0.5;
      const jitter = (photoHash(course, 4) - 0.5) * span * 0.2;
      const cell = Math.floor((around + jitter - stagger) / span);
      const center = (cell + 0.5) * span - jitter + stagger;
      const across = around - center;
      const along = (x - courseCenter) - 0.12 * across;
      const rx = (double ? 0.0065 : 0.0052) * (0.85 + photoHash(cell, course + 5) * 0.3);
      const ry = (double ? 0.026 : 0.022) * (0.8 + photoHash(cell, course) * 0.35);
      const field = (along / rx) * (along / rx) + (across / ry) * (across / ry);
      if (field < 1.35) {
        const cover = field < 0.55 ? 1 : Math.max(0, 1 - (field - 0.55) / 0.8);
        rgb = base.map((channel, index) => channel * (1 - cover) + spec[index] * cover);
      }
    }
  }
  const alongGroove = Math.max(0, (x / coursePitch) - course);
  const groove = 0.93 + 0.07 * Math.sin(alongGroove * Math.PI);
  return {
    rgb: rgb.map((channel) => channel * groove),
    nyShift: Math.cos(alongGroove * Math.PI * 2) * 0.03,
  };
}

function filteredLinen(x, angle, radius, color, pixelInches) {
  if (!color.spec || pixelInches < 0.008) {
    return { ...linenWeave(x, angle, radius, color), kind: "linen" };
  }
  let red = 0;
  let green = 0;
  let blue = 0;
  const steps = 3;
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const sample = linenWeave(
        x + (i / (steps - 1) - 0.5) * pixelInches,
        angle + (j / (steps - 1) - 0.5) * pixelInches / Math.max(radius, 0.05),
        radius,
        color,
      );
      red += sample.rgb[0];
      green += sample.rgb[1];
      blue += sample.rgb[2];
    }
  }
  const count = steps * steps;
  return { rgb: [red / count, green / count, blue / count], kind: "linen" };
}

function photoLeather(fill, x, angle, octaves) {
  const base = hexToUnit(fill);
  const grain = photoFbm(x * 22, angle * 9, 6, 5, Math.max(1, octaves));
  const pores = photoFbm(x * 90, angle * 36, 8, 8, 1);
  const crease = Math.abs(Math.sin((x * 6 + (grain - 0.5) * 3) * Math.PI));
  const shade = (0.78 + 0.22 * grain) * (0.88 + 0.12 * crease) * (pores > 0.82 ? 0.8 : 1);
  return base.map((channel) => channel * shade);
}

function photoFinish(rgb, x, angle, octaves) {
  const fiber = photoFbm(x * 7, angle * 2.4, 5, 4, Math.max(1, octaves));
  const fine = photoFbm(x * 46, angle * 1.2, 8, 3, 1);
  const shade = 0.9 + 0.1 * (fiber * 0.6 + fine * 0.4);
  return rgb.map((channel) => channel * shade);
}

function photoWoodRgb(wood, x, angle, radius, octaves) {
  const paint = wood && PHOTO_WOOD[wood.id];
  if (!paint) return hexToUnit(wood && wood.fill ? wood.fill : "#c4a574");
  let along = (x / WOOD_ALONG_IN) % 1;
  if (along < 0) along += 1;
  let around = (angle * Math.max(radius, 0.05)) / WOOD_AROUND_IN;
  around %= 1;
  if (around < 0) around += 1;
  return paint(along, around, octaves);
}

function photoHash(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return ((n >>> 0) & 0xffffff) / 0xffffff;
}

function photoMod(n, m) {
  const r = n % m;
  return r < 0 ? r + m : r;
}

function photoNoise(x, y, px, py) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = photoHash(photoMod(x0, px), photoMod(y0, py));
  const b = photoHash(photoMod(x0 + 1, px), photoMod(y0, py));
  const c = photoHash(photoMod(x0, px), photoMod(y0 + 1, py));
  const d = photoHash(photoMod(x0 + 1, px), photoMod(y0 + 1, py));
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function photoFbm(u, v, cu, cv, octaves) {
  let n = 0;
  let amp = 0.5;
  let sum = 0;
  let freqU = cu;
  let freqV = cv;
  for (let i = 0; i < octaves; i += 1) {
    n += amp * photoNoise(u * freqU, v * freqV, freqU, freqV);
    sum += amp;
    amp *= 0.5;
    freqU *= 2;
    freqV *= 2;
  }
  return sum ? n / sum : 0.5;
}

function photoFiber(u, v, octaves, ribbonScale) {
  const oct = Math.max(1, octaves);
  const flow = photoFbm(u * 3.4, v * 8, 3, 3, Math.min(oct, 3));
  const along = u * ribbonScale + (flow - 0.5) * 1.4;
  const across = v * 16 + (flow - 0.5) * 5;
  const ribbon = photoFbm(along, across * 0.35, 2, 2, oct);
  const vein = Math.abs(Math.sin((across + (photoFbm(u * 9, v * 5, 4, 3, Math.min(oct, 2)) - 0.5) * 4) * Math.PI));
  const fiber = photoFbm(u * 70, v * 28 + flow * 3, 6, 3, Math.max(1, oct - 1));
  const pore = photoFbm(u * 160, v * 90, 5, 5, 1);
  return { ribbon, vein, fiber, pore };
}

function photoWoodTone(light, mid, dark, sample, poreStrength) {
  const tone = sample.ribbon * 0.72 + sample.vein * 0.28;
  const rgb = tone < 0.45
    ? dark.map((channel, index) => channel + (mid[index] - channel) * (tone / 0.45))
    : mid.map((channel, index) => channel + (light[index] - channel) * ((tone - 0.45) / 0.55));
  const fiber = 0.84 + 0.16 * sample.fiber;
  const pores = sample.pore > 0.74 ? 1 - poreStrength : 1;
  const lines = 0.78 + 0.22 * (sample.vein ** 0.55);
  return rgb.map((channel) => (channel / 255) * fiber * pores * lines);
}

const PHOTO_WOOD = {
  maple: (u, v, octaves) => photoWoodTone([236, 222, 196], [214, 190, 156], [176, 146, 108], photoFiber(u, v, octaves, 3.2), 0.08),
  curly: (u, v, octaves) => {
    const base = photoWoodTone([214, 186, 140], [176, 140, 92], [132, 96, 54], photoFiber(u, v, octaves, 2.6), 0.06);
    const figure = photoFbm(u * 2.4, v * 1.6, 3, 3, Math.min(Math.max(1, octaves), 3));
    const band = 0.5 + 0.5 * Math.sin((u * 16 + (figure - 0.5) * 7) * Math.PI * 2);
    const chat = 0.8 + 0.26 * (band ** 1.35);
    return base.map((channel) => channel * chat);
  },
  birdseye: (u, v, octaves) => {
    const base = photoWoodTone([236, 220, 192], [206, 176, 136], [168, 132, 88], photoFiber(u, v, octaves, 2.8), 0.05);
    const nx = 9;
    const ny = 4;
    const su = u * nx;
    const sv = v * ny;
    const ix = Math.floor(su);
    const iy = Math.floor(sv);
    let nearest = 99;
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        const cx = ix + ox;
        const cy = iy + oy;
        const mx = photoMod(cx, nx);
        const my = photoMod(cy, ny);
        const ex = cx + 0.28 + 0.44 * photoHash(mx, my);
        const ey = cy + 0.28 + 0.44 * photoHash(mx + 7, my + 3);
        const dx = (su - ex) * (12 / nx);
        const dy = (sv - ey) * (3.2 / ny);
        const d = dx * dx + dy * dy;
        if (d < nearest) nearest = d;
      }
    }
    const eye = 1 - 0.34 * Math.exp(-nearest / (0.11 * 0.11));
    return base.map((channel) => channel * eye);
  },
  walnut: (u, v, octaves) => photoWoodTone([146, 96, 58], [96, 60, 34], [48, 28, 16], photoFiber(u, v, octaves, 2.2), 0.16),
  cocobolo: (u, v, octaves) => photoWoodTone([186, 72, 40], [112, 40, 26], [38, 14, 12], photoFiber(u, v, octaves, 1.5), 0.2),
  ebony: (u, v, octaves) => photoWoodTone([62, 54, 48], [32, 28, 24], [14, 12, 11], photoFiber(u, v, octaves, 2.4), 0.1),
  purpleheart: (u, v, octaves) => photoWoodTone([156, 70, 128], [108, 44, 86], [64, 26, 52], photoFiber(u, v, octaves, 2.4), 0.12),
};

function exposePhoto(channel) {
  const value = Math.max(0, channel);
  if (value < 0.82) return value;
  return 0.82 + (1 - Math.exp(-(value - 0.82) * 2.4)) * 0.18;
}

function shadeButtPixel(rgb, ny, px, py, kind) {
  const nz = Math.sqrt(Math.max(0, 1 - ny * ny));
  const lightY = 0.79;
  const lightZ = 0.61;
  const lightLen = Math.hypot(lightY, lightZ);
  const ndotl = Math.max(0, ny * (lightY / lightLen) + nz * (lightZ / lightLen));
  const diffuse = 0.2 + 0.8 * (ndotl * 0.74 + 0.26) + Math.max(0, -ny) * 0.16;
  const rough = { leather: 0.46, linen: 0.62, ring: 0.055, collar: 0.08, cap: 0.1, veneer: 0.13, wood: 0.14 }[kind] || 0.14;
  const glossy = kind === "leather" || kind === "linen" ? 0.06 : kind === "ring" ? 0.78 : kind === "collar" ? 0.5 : kind === "cap" ? 0.42 : 0.36;
  const wander = (photoNoise(px * 0.0035, 2.7, 9000, 4) - 0.5) * 0.22;
  const flicker = 0.72 + 0.28 * photoNoise(px * 0.008, 8.1, 7000, 4);
  const streak = Math.exp(-((ny - 0.4 - wander) ** 2) / (2 * rough * rough)) * flicker;
  const ripple = 0.86 + 0.14 * photoNoise(px * 0.11, py * 0.035, 4096, 1024);
  const fresnel = (1 - nz) ** 2.4;
  const spec = streak * ripple * glossy + fresnel * (glossy * 0.35);
  const bounce = Math.exp(-((ny + 0.62) ** 2) / 0.08) * glossy * 0.22;
  const shadow = Math.max(0, 0.62 - ndotl);
  let red = rgb[0] * diffuse * (1 - shadow * 0.05);
  let green = rgb[1] * diffuse;
  let blue = rgb[2] * diffuse * (1 + shadow * 0.09);
  red += (spec + bounce) * (0.93 + rgb[0] * 0.12);
  green += (spec + bounce) * (0.88 + rgb[1] * 0.08);
  blue += (spec + bounce) * (0.78 + rgb[2] * 0.06);
  const grit = (photoNoise(px * 0.42, py * 0.42, 8192, 8192) - 0.5) * 0.018;
  return [exposePhoto(red + grit), exposePhoto(green + grit), exposePhoto(blue + grit * 0.85)];
}

function bindRenderView() {
  const canvas = document.getElementById("render-view");
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener("pointerdown", (event) => {
    if (!renderScene || event.button !== 0) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    renderPanX += (event.clientX - lastX) * dpr;
    renderPanY += (event.clientY - lastY) * dpr;
    lastX = event.clientX;
    lastY = event.clientY;
    scheduleRender();
  });
  canvas.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    scheduleRender();
  });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("wheel", (event) => {
    if (!renderScene) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomRenderAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  window.addEventListener("resize", () => {
    const dialog = document.getElementById("render-dialog");
    if (!dialog.open || !renderScene) return;
    sizeRenderView();
    scheduleRender();
  });
}

function sizeRenderView() {
  const canvas = document.getElementById("render-view");
  const dialog = document.getElementById("render-dialog");
  const bar = dialog.querySelector(".render-bar");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = dialog.clientWidth;
  const height = Math.max(1, dialog.clientHeight - bar.offsetHeight);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
}

function fitRenderView() {
  const canvas = document.getElementById("render-view");
  const margin = 28 * (canvas.width / Math.max(1, canvas.clientWidth));
  renderFitPpi = Math.min(
    (canvas.width - margin * 2) / renderScene.length,
    (canvas.height * 0.72) / renderScene.maxDiameter,
  );
  renderPpi = renderFitPpi;
  renderPanX = (canvas.width - renderScene.length * renderPpi) / 2;
  renderPanY = canvas.height / 2;
  paintRenderView(false);
}

function stepRenderZoom(factor) {
  const canvas = document.getElementById("render-view");
  zoomRenderAt(factor, canvas.clientWidth / 2, canvas.clientHeight / 2);
}

function zoomRenderAt(factor, cssX, cssY) {
  const canvas = document.getElementById("render-view");
  const dpr = canvas.width / Math.max(1, canvas.clientWidth);
  const px = cssX * dpr;
  const py = cssY * dpr;
  const xInch = (px - renderPanX) / renderPpi;
  const yInch = (renderPanY - py) / renderPpi;
  renderPpi = Math.min(renderFitPpi * 18, Math.max(renderFitPpi, renderPpi * factor));
  renderPanX = px - xInch * renderPpi;
  renderPanY = py + yInch * renderPpi;
  scheduleRender();
}

function scheduleRender() {
  paintRenderView(true);
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => paintRenderView(false), 90);
}

function paintRenderView(draft) {
  if (!renderScene) return;
  const canvas = document.getElementById("render-view");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const width = canvas.width;
  const height = canvas.height;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let py = 0; py < height; py += 1) {
    const t = py / Math.max(1, height - 1);
    const index = py * width * 4;
    const vignetteY = (py / height - 0.48) ** 2;
    for (let px = 0; px < width; px += 1) {
      const paper = draft ? 0.5 : photoNoise(px * 0.018, py * 0.018, 6000, 6000);
      const vignette = 1 - 0.22 * ((px / width - 0.5) ** 2 * 1.4 + vignetteY);
      const i = index + px * 4;
      data[i] = (232 + (208 - 232) * t + (paper - 0.5) * 10) * vignette;
      data[i + 1] = (224 + (198 - 224) * t + (paper - 0.5) * 8) * vignette;
      data[i + 2] = (210 + (182 - 210) * t + (paper - 0.5) * 6) * vignette;
      data[i + 3] = 255;
    }
  }
  const { parts, pointSpecs, length } = renderScene;
  const layout = parts.layout;
  const pixelInches = 1 / renderPpi;
  const octaves = draft ? 1 : (pixelInches > 0.02 ? 2 : 3);
  const step = draft ? 2 : 1;
  const x0 = Math.max(0, Math.floor(renderPanX));
  const x1 = Math.min(width - 1, Math.ceil(renderPanX + length * renderPpi));
  for (let px = x0; px <= x1; px += step) {
    const x = (px - renderPanX) / renderPpi;
    if (x < -0.02 || x > length + 0.02) continue;
    const radius = buttPhotoRadius(x, layout);
    const radiusPx = radius * renderPpi;
    const center = renderPanY;
    const top = Math.max(0, Math.floor(center - radiusPx - renderPpi * 0.22));
    const bottom = Math.min(height - 1, Math.ceil(center + radiusPx + renderPpi * 0.22));
    for (let py = top; py <= bottom; py += step) {
      const yInch = (center - py) / renderPpi;
      const ny = radiusPx > 0.5 ? yInch / radius : 0;
      const edge = Math.abs(center - py);
      let cover = Math.min(1, Math.max(0, (radiusPx - edge + 1.15) / 1.15));
      let red;
      let green;
      let blue;
      if (cover > 0 && ny >= -1 && ny <= 1) {
        const angle = Math.acos(Math.max(-1, Math.min(1, ny)));
        const sample = colorOnButt(x, angle, parts, pointSpecs, radius, pixelInches, octaves);
        const lit = Math.max(-1, Math.min(1, ny + (sample.nyShift || 0)));
        const rgb = shadeButtPixel(sample.rgb, lit, px, py, sample.kind);
        red = rgb[0] * 255;
        green = rgb[1] * 255;
        blue = rgb[2] * 255;
      } else if (yInch < 0) {
        const gap = Math.abs(yInch) - radius;
        if (gap < 0 || gap > 0.46) continue;
        const shade = (1 - gap / 0.46) ** 1.7 * 0.42;
        const i = (py * width + px) * 4;
        red = data[i] * (1 - shade * 0.92);
        green = data[i + 1] * (1 - shade);
        blue = data[i + 2] * (1 - shade * 0.82);
        cover = 1;
      } else {
        continue;
      }
      for (let ox = 0; ox < step && px + ox < width; ox += 1) {
        for (let oy = 0; oy < step && py + oy < height; oy += 1) {
          const i = ((py + oy) * width + px + ox) * 4;
          data[i] = Math.round(data[i] * (1 - cover) + red * cover);
          data[i + 1] = Math.round(data[i + 1] * (1 - cover) + green * cover);
          data[i + 2] = Math.round(data[i + 2] * (1 - cover) + blue * cover);
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

function loadWoodPhotos() {
  const atlas = document.createElement("canvas");
  atlas.width = 512;
  atlas.height = WOOD_ATLAS_H;
  const ctx = atlas.getContext("2d");
  const images = new Array(WOOD_FILES.length);
  const loaded = new Set();
  let copied = 0;
  let remaining = WOOD_FILES.length;
  WOOD_FILES.forEach((file, index) => {
    const image = new Image();
    image.onload = () => {
      images[index] = image;
      const tile = document.createElement("canvas");
      tile.width = image.naturalWidth || image.width;
      tile.height = image.naturalHeight || image.height;
      const tileCtx = tile.getContext("2d");
      try {
        tileCtx.drawImage(image, 0, 0);
        woodPixels.set(file, tileCtx.getImageData(0, 0, tile.width, tile.height));
        ctx.drawImage(image, 0, index * WOOD_STRIP, 512, WOOD_STRIP);
        copied += 1;
      } catch (error) {
        woodPixels.set(file, null);
      }
      loaded.add(file);
      finish();
    };
    image.onerror = finish;
    image.src = file;
  });
  function finish() {
    remaining -= 1;
    if (remaining > 0) return;
    if (loaded.size !== WOOD_FILES.length) return;
    woodsReady = copied === WOOD_FILES.length;
    drawCue();
  }
}

function bakeWoodAtlas() {
  const pixels = new Uint8Array(512 * WOOD_ATLAS_H * 4);
  WOOD_FILES.forEach((file, index) => {
    for (let y = 0; y < WOOD_STRIP; y += 1) {
      for (let x = 0; x < 512; x += 1) {
        const rgb = proceduralWood(file, x / 512, y / (WOOD_STRIP - 1)) || [0.5, 0.4, 0.3];
        const offset = ((index * WOOD_STRIP + y) * 512 + x) * 4;
        pixels[offset] = Math.round(rgb[0] * 255);
        pixels[offset + 1] = Math.round(rgb[1] * 255);
        pixels[offset + 2] = Math.round(rgb[2] * 255);
        pixels[offset + 3] = 255;
      }
    }
  });
  return pixels;
}

function uploadWoodAtlas(pixels) {
  if (CueView.setAtlasPixels) CueView.setAtlasPixels(pixels, 512, WOOD_ATLAS_H);
}

function woodMap(photo, x, angle, radius) {
  let along = (x / WOOD_ALONG_IN) % 1;
  if (along < 0) along += 1;
  let around = (angle * Math.max(radius, 0)) / WOOD_AROUND_IN;
  if (around < 0) around += Math.ceil(-around);
  const aroundUnit = around % 1;
  const strip = WOOD_FILES.indexOf(photo);
  const uv = strip < 0 ? [-1, 0] : [along, strip * 2 + aroundUnit];
  return { along, around: aroundUnit, uv };
}

function woodSample(photo, x, angle, radius) {
  const pixels = woodPixels.get(photo);
  const map = woodMap(photo, x, angle, radius);
  if (!pixels) return map.uv[0] < 0 ? null : { rgb: null, ...map };
  const px = Math.min(pixels.width - 1, Math.floor(map.along * pixels.width));
  const py = Math.min(pixels.height - 1, Math.floor(map.around * (pixels.height - 1)));
  const i = (py * pixels.width + px) * 4;
  const rgb = [pixels.data[i] / 255, pixels.data[i + 1] / 255, pixels.data[i + 2] / 255];
  return { rgb, uv: map.uv };
}

function bandAt(x, x0, x1, bands) {
  if (!bands.length || x < x0 || x >= x1) return null;
  const width = (x1 - x0) / bands.length;
  const index = Math.min(bands.length - 1, Math.floor((x - x0) / width));
  return bands[index];
}

function jointEndSample(x, angle, parts) {
  const end = parts.jointEnd;
  if (!end || end.id === "plain") return paintWood(parts.butt.photo, parts.butt.fill, parts.butt.grain, x, angle);
  return flat(hexToUnit(end.fill));
}

function photoJointEnd(x, angle, parts, radius, octaves) {
  const end = parts.jointEnd;
  if (!end || end.id === "plain") return { rgb: photoWoodRgb(parts.butt, x, angle, radius, octaves), kind: "wood" };
  return { rgb: hexToUnit(end.fill), kind: end.metal ? "collar" : "cap" };
}

function flat(rgb) {
  return { rgb, uv: [-1, 0] };
}

function paintWood(photo, fallback, grain, x, angle) {
  const radius = woodLayout ? radiusInches(x, woodLayout, state.taper) : JOINT_DIAMETER_IN / 2;
  const sampled = photo ? woodSample(photo, x, angle, radius) : null;
  if (sampled && sampled.rgb) return { rgb: sampled.rgb, uv: sampled.uv };
  if (sampled && sampled.uv[0] >= 0) return { rgb: hexToUnit(fallback), uv: sampled.uv };
  return flat(varyWood(hexToUnit(fallback), x, angle, grain));
}

function grainShade(u, v, lanes, contrast) {
  const warp = (photoFbm(u, v, 3, 5, 4) - 0.5) * 0.15;
  const g = (v + warp) * lanes;
  const dist = Math.abs((g - Math.floor(g)) - 0.5) * 2;
  const line = dist ** 0.45;
  const fine = photoFbm(u, v, 10, Math.max(8, Math.round(lanes * 2)), 4);
  const pores = photoHash(Math.floor(u * 180), Math.floor(v * lanes * 4)) > 0.975 ? 0.72 : 1;
  return ((1 - contrast) + contrast * line) * (0.9 + 0.1 * fine) * pores;
}

function mixWood(light, dark, shade) {
  const t = Math.max(0, Math.min(1, shade));
  return dark.map((channel, index) => (channel + (light[index] - channel) * t) / 255);
}

function proceduralWood(photo, u, v) {
  const id = (photo || "").replace(/^.*\//, "").replace(/\.png$/, "");
  if (id === "maple") return mixWood([236, 219, 186], [186, 156, 112], grainShade(u, v, 22, 0.42));
  if (id === "walnut") return mixWood([128, 84, 48], [62, 36, 20], grainShade(u, v, 16, 0.5));
  if (id === "cocobolo") return mixWood([156, 62, 40], [48, 18, 14], grainShade(u, v, 9, 0.62));
  if (id === "ebony") return mixWood([58, 50, 44], [18, 16, 14], grainShade(u, v, 14, 0.55));
  if (id === "purpleheart") return mixWood([142, 62, 118], [78, 32, 64], grainShade(u, v, 18, 0.4));
  if (id === "curly") {
    let shade = grainShade(u, v, 20, 0.34);
    const band = 0.5 + 0.5 * Math.sin((u * 14 + (photoFbm(u, v, 2, 3, 4) - 0.5) * 0.45) * Math.PI * 2);
    shade *= 0.72 + 0.28 * band;
    return mixWood([214, 186, 132], [150, 112, 62], shade);
  }
  if (id === "birdseye") {
    let shade = grainShade(u, v, 18, 0.28);
    const nx = 9;
    const ny = 4;
    const su = u * nx;
    const sv = v * ny;
    const ix = Math.floor(su);
    const iy = Math.floor(sv);
    let nearest = 99;
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        const cx = ix + ox;
        const cy = iy + oy;
        const ex = cx + 0.3 + 0.4 * photoHash(photoMod(cx, nx), photoMod(cy, ny));
        const ey = cy + 0.3 + 0.4 * photoHash(photoMod(cx, nx) + 7, photoMod(cy, ny) + 3);
        const dx = (su - ex) * (12 / nx);
        const dy = (sv - ey) * (3.2 / ny);
        const d = dx * dx + dy * dy;
        if (d < nearest) nearest = d;
      }
    }
    shade *= 1 - 0.42 * Math.exp(-nearest / (0.09 * 0.09));
    return mixWood([240, 224, 194], [176, 142, 96], shade);
  }
  return null;
}

function varyWood(rgb, x, angle, grain) {
  let shade = 0.97 + 0.03 * Math.sin(x * 0.7);
  if (grain === "curly") shade = 0.9 + 0.1 * Math.sin(x * 0.62);
  else if (grain === "eyes") shade = 0.94 + 0.06 * Math.sin(angle * 16) * Math.sin(x * 1.4);
  else if (grain === "streak") shade = 0.92 + 0.08 * Math.sin(x * 0.15 + angle);
  return rgb.map((channel) => channel * shade);
}

function hexToUnit(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function renderVeneerSelects() {
  for (let layer = 1; layer <= 3; layer += 1) {
    const menu = document.getElementById(`veneer-menu-${layer}`);
    menu.replaceChildren(...catalog.veneerColors.map((color) => {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.dataset.id = color.id;
      choice.textContent = color.name;
      choice.setAttribute("role", "option");
      choice.style.backgroundColor = color.fill;
      choice.style.color = inkOn(color.fill);
      return choice;
    }));
  }
}

function veneerColorId(id) {
  const aliases = { red: "crimson-red", yellow: "canary-yellow", blue: "royal-blue" };
  return aliases[id] || id;
}

function inkOn(fill) {
  const value = parseInt(fill.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#241c15" : "#ffffff";
}

function absorbRingDesign() {
  let incoming = null;
  try {
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (params.has("ringdesign")) {
      incoming = JSON.parse(params.get("ringdesign"));
      params.delete("ringdesign");
      const rest = params.toString();
      history.replaceState(null, "", `${location.pathname}${location.search}${rest ? `#${rest}` : ""}`);
    }
  } catch (error) {
    incoming = null;
  }
  appliedRings = loadAppliedRings();
  if (incoming && Array.isArray(incoming.positions) && incoming.design) {
    const design = parseRingDesign(incoming.design);
    if (design) {
      incoming.positions.forEach((position) => {
        if (RING_CHOICES.includes(position)) appliedRings[position] = design;
      });
    }
  } else if (incoming) {
    const legacy = parseRingDesign(incoming);
    if (legacy) RING_CHOICES.forEach((position) => { appliedRings[position] = legacy; });
  }
  saveAppliedRings();
  return appliedRings;
}

function loadAppliedRings() {
  const map = { buttRing: null, sleeveRing: null, aJointRing: null, rings: null, shaftRing: null };
  try {
    const raw = localStorage.getItem(RING_DESIGN_KEY);
    if (!raw) return map;
    const stored = JSON.parse(raw);
    const legacy = parseRingDesign(stored);
    if (legacy && !stored.positions) {
      RING_CHOICES.forEach((position) => { map[position] = legacy; });
      return map;
    }
    RING_CHOICES.forEach((position) => {
      map[position] = parseRingDesign(stored[position]);
    });
  } catch (error) {
    return map;
  }
  return map;
}

function saveAppliedRings() {
  try { localStorage.setItem(RING_DESIGN_KEY, JSON.stringify(appliedRings)); } catch (error) { /* shown for this visit */ }
}

function parseRingDesign(raw) {
  if (!raw) return null;
  const design = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!design || !Array.isArray(design.layers) || !design.layers.length) return null;
  const od = Number(design.od) || 1;
  const layers = design.layers.filter((layer) => layer && Number(layer.thickness) > 0 && layer.fill);
  if (!layers.length) return null;
  layers.forEach((layer) => { layer.od = od; });
  return {
    od,
    id: Number(design.id) || 0.625,
    center: Number.isFinite(Number(design.center)) ? Number(design.center) : 0,
    layers,
    drawing: Array.isArray(design.drawing) ? design.drawing.filter((src) => typeof src === "string" && src.startsWith("data:image")) : [],
  };
}

function clearRingPosition(position) {
  if (!appliedRings[position]) return;
  appliedRings[position] = null;
  saveAppliedRings();
}

function clearAppliedRing() {
  RING_CHOICES.forEach((position) => { appliedRings[position] = null; });
  try { localStorage.removeItem(RING_DESIGN_KEY); } catch (error) { /* the model still clears */ }
}

function ringDesignSpan(design) {
  return design.layers.reduce((sum, layer) => sum + Number(layer.thickness), 0);
}

function ringMaterialNote(layer) {
  const kind = { fiber: "Fiber", wood: "Wood", metal: "Metal" }[layer.kind];
  const name = layer.name || layer.material || "Ring";
  if (!kind || /^(Fiber|Wood|Metal), /i.test(name)) return name;
  return `${kind}, ${name.toLowerCase()}`;
}

function ringLayerLine(layer) {
  const place = layer.place || "Layer";
  const detail = layer.spec || `${Number(layer.thickness).toFixed(3)} in`;
  return `${place} · ${ringMaterialNote(layer)}, ${detail}`;
}

function syncRingDesignSheet() {
  const any = RING_POSITIONS.some((item) => ringOnCue(item.id));
  const sheet = document.getElementById("ring-design-sheet");
  if (sheet) sheet.hidden = !any;
  renderRingDesignBook(document.getElementById("ring-design-print"));
}

function renderRingDesignBook(root) {
  if (!root) return;
  const entries = RING_POSITIONS.filter((item) => ringOnCue(item.id));
  root.hidden = entries.length === 0;
  root.replaceChildren(...entries.map((item) => ringDesignBlock(item.label, appliedRings[item.id])));
}

function ringDesignBlock(label, design) {
  const inlaid = design.layers.filter((layer) => layer.face === "dots" || layer.grooved).length;
  const block = document.createElement("section");
  block.className = "ring-design-block";
  const heading = document.createElement("h3");
  heading.textContent = inlaid ? `${label} · $10 + $${50 * inlaid}` : `${label} · $10`;
  const list = document.createElement("ol");
  fillRingDesignList(list, design);
  const views = document.createElement("div");
  views.className = "ring-design-views";
  ["Top", "Front", "3D isometric"].forEach((caption, index) => {
    const figure = document.createElement("figure");
    if (index === 2) figure.className = "wide";
    const figcaption = document.createElement("figcaption");
    figcaption.textContent = caption;
    const image = document.createElement("img");
    image.alt = `${caption} of the ${label}`;
    const src = design.drawing && design.drawing[index];
    if (src) {
      image.src = src;
      whitenDrawing(src).then((whitened) => { image.src = whitened; });
    }
    figure.append(figcaption, image);
    views.append(figure);
  });
  block.append(heading, list, views);
  return block;
}

function fillRingDesignList(list, design) {
  if (!list) return;
  list.replaceChildren(...((design && design.layers) || []).map((layer) => {
    const item = document.createElement("li");
    item.textContent = ringLayerLine(layer);
    return item;
  }));
}

function setRingView(id, src) {
  const image = document.getElementById(id);
  if (!image) return;
  if (!src) {
    image.removeAttribute("src");
    return;
  }
  whitenDrawing(src).then((whitened) => {
    if (image.dataset.sheetSrc === src) image.src = whitened;
  });
  image.dataset.sheetSrc = src;
  image.src = src;
}

function whitenDrawing(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || 1;
      canvas.height = image.naturalHeight || 1;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = frame.data;
      const width = canvas.width;
      const height = canvas.height;
      const seen = new Uint8Array(width * height);
      const stack = [];
      const dark = (index) => {
        const offset = index * 4;
        return pixels[offset] < 10 && pixels[offset + 1] < 10 && pixels[offset + 2] < 10;
      };
      const push = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const index = y * width + x;
        if (seen[index] || !dark(index)) return;
        seen[index] = 1;
        stack.push(index);
      };
      for (let x = 0; x < width; x += 1) {
        push(x, 0);
        push(x, height - 1);
      }
      for (let y = 0; y < height; y += 1) {
        push(0, y);
        push(width - 1, y);
      }
      while (stack.length) {
        const index = stack.pop();
        const offset = index * 4;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = 255;
        const x = index % width;
        const y = (index - x) / width;
        push(x + 1, y);
        push(x - 1, y);
        push(x, y + 1);
        push(x, y - 1);
      }
      ctx.putImageData(frame, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => resolve(src);
    image.src = src;
  });
}

function openRingDesign() {
  const any = RING_POSITIONS.some((item) => ringOnCue(item.id));
  document.getElementById("ring-design-empty").hidden = any;
  const detail = document.getElementById("ring-design-detail");
  detail.hidden = !any;
  renderRingDesignBook(detail);
  const dialog = document.getElementById("ring-design-dialog");
  if (!dialog.open) dialog.showModal();
}

function customLayerAt(x, layout) {
  const spots = [
    [layout.buttRing0, layout.buttRing1, layout.buttCustom],
    [layout.sleeveRing0, layout.sleeveRing1, layout.sleeveCustom],
    [layout.aJoint0, layout.aJoint1, layout.aJointCustom],
    [layout.ring0, layout.ring1, layout.jointCustom],
    [layout.shaftRing0, layout.shaftRing1, layout.shaftCustom],
  ];
  for (const [x0, x1, layers] of spots) {
    if (!layers) continue;
    const hit = layerInSpan(x, x0, x1, layers);
    if (hit) return hit;
  }
  return null;
}

function layerInSpan(x, x0, x1, layers) {
  if (x < x0 || x >= x1 || x1 <= x0) return null;
  const total = layers.reduce((sum, layer) => sum + Number(layer.thickness), 0) || 1;
  const span = x1 - x0;
  const along = x - (x0 + x1) / 2;
  let cursor = x0;
  for (const layer of layers) {
    const width = span * (Number(layer.thickness) / total);
    if (x < cursor + width) return { layer, local: (x - cursor) / Math.max(width, 1e-6), along };
    cursor += width;
  }
  return { layer: layers[layers.length - 1], local: 1, along };
}

function layerFaceColor(layer, angle, hit, radius) {
  if (layer.grooves && layer.inlayFill && inGroove(layer, angle, hit.along)) return layer.inlayFill;
  if (layer.dots && layer.inlayFill && inDot(layer, angle, hit.local, radius)) return layer.inlayFill;
  return layer.fill || "#888888";
}

function ringAngle(angle) {
  const turn = Math.PI * 2;
  let value = angle + Math.PI / 2;
  value %= turn;
  if (value < 0) value += turn;
  return value;
}

function inGroove(layer, angle, along) {
  const count = Math.max(1, Number(layer.grooves.count) || 1);
  const od = Number(layer.od) || 1;
  const half = (Number(layer.grooves.width) || 0) / od;
  const step = (Math.PI * 2) / count;
  const axis = Number(layer.grooves.axisAngle) || 0;
  const shift = (Number(along) || 0) * Math.tan((axis * Math.PI) / 180) / (od / 2);
  let mod = (ringAngle(angle) - shift) % step;
  if (mod < 0) mod += step;
  return Math.min(mod, step - mod) <= half + 1e-6;
}

function inDot(layer, angle, local, radius) {
  const dots = layer.dots;
  const pattern = dots.pattern;
  const count = Math.max(1, pattern ? pattern.length * 4 : Number(dots.count) || 1);
  const step = (Math.PI * 2) / count;
  const around = ringAngle(angle);
  const mod = around % step;
  const delta = Math.min(mod, step - mod);
  const index = Math.round(around / step) % count;
  const diameter = pattern ? Number(pattern[index % pattern.length]) : Number(dots.diameter) || 0;
  const reach = diameter / 2;
  const axial = ((local == null ? 0.5 : local) - 0.5) * (Number(layer.thickness) || diameter);
  const arc = delta * (radius > 0 ? radius : 0.5);
  return axial * axial + arc * arc <= reach * reach + 1e-8;
}

function smallestDot(layer) {
  const pattern = layer.dots && layer.dots.pattern;
  if (pattern && pattern.length) return Math.min(...pattern.map(Number));
  return Number(layer.dots && layer.dots.diameter) || 0.078;
}

function customRingSurface(hit, x, angle) {
  const layer = hit.layer;
  const detail = ringFacetCount(layer);
  const radius = woodLayout ? radiusInches(x, woodLayout, state.taper) : JOINT_DIAMETER_IN / 2;
  if (layer.grooves && layer.inlayFill && inGroove(layer, angle, hit.along)) return flatFacet(layer.inlayFill, detail);
  if (layer.dots && layer.inlayFill && inDot(layer, angle, hit.local, radius)) return flatFacet(layer.inlayFill, detail);
  const photo = layer.kind === "wood" ? RING_WOOD_PHOTO[layer.material] : null;
  if (photo) {
    const painted = paintWood(photo, layer.fill, "straight", x, angle);
    painted.detail = detail;
    return painted;
  }
  return flatFacet(layer.fill || "#888888", detail);
}

function flatFacet(hex, detail) {
  return { rgb: hexToUnit(hex), uv: [-1, 0], flat: true, detail };
}

function ringFacetCount(layer) {
  const od = Number(layer.od) || 1;
  let feature = Infinity;
  if (layer.grooves && layer.grooves.count) {
    feature = Math.min(feature, 2 * (Number(layer.grooves.width) || 0.05) / od);
  }
  if (layer.dots) {
    const pattern = layer.dots.pattern;
    const diameter = pattern && pattern.length ? Math.min(...pattern.map(Number)) : Number(layer.dots.diameter) || 0.078;
    feature = Math.min(feature, 2 * diameter);
  }
  if (!Number.isFinite(feature) || feature <= 0) return 0;
  return Math.min(720, Math.max(144, Math.ceil((Math.PI * 2) / (feature / 8))));
}

function customRingPhoto(hit, angle, radius) {
  const hex = layerFaceColor(hit.layer, angle, hit, radius);
  return { rgb: hexToUnit(hex), kind: "ring" };
}
