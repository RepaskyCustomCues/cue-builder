/* Copyright 2026, Michael E. Repasky, Repasky Custom Cues. */
const RING_OD = 1;
const RING_ID = 0.625;

const RING_MATERIALS = [
  { id: "fiber-white", name: "White", fill: "#f3efe4", kind: "fiber", group: "Fiber" },
  { id: "fiber-black", name: "Black", fill: "#161616", kind: "fiber", group: "Fiber" },
  { id: "fiber-natural", name: "Natural", fill: "#efe6cf", kind: "fiber", group: "Fiber" },
  { id: "fiber-red", name: "Red", fill: "#9e2b2f", kind: "fiber", group: "Fiber" },
  { id: "fiber-orange", name: "Orange", fill: "#d15a26", kind: "fiber", group: "Fiber" },
  { id: "fiber-yellow", name: "Yellow", fill: "#e2c84a", kind: "fiber", group: "Fiber" },
  { id: "fiber-green", name: "Green", fill: "#2f7a3a", kind: "fiber", group: "Fiber" },
  { id: "fiber-blue", name: "Blue", fill: "#225296", kind: "fiber", group: "Fiber" },
  { id: "fiber-purple", name: "Purple", fill: "#5c3d86", kind: "fiber", group: "Fiber" },
  { id: "fiber-brown", name: "Brown", fill: "#78411f", kind: "fiber", group: "Fiber" },
  { id: "maple", name: "Hard maple", fill: "#f3e6c8", kind: "wood", group: "Wood" },
  { id: "curly", name: "Curly maple", fill: "#e4cf9e", kind: "wood", group: "Wood" },
  { id: "birdseye", name: "Birdseye maple", fill: "#f6e8c6", kind: "wood", group: "Wood" },
  { id: "walnut", name: "Walnut", fill: "#6b4423", kind: "wood", group: "Wood" },
  { id: "cocobolo", name: "Cocobolo", fill: "#7a2e22", kind: "wood", group: "Wood" },
  { id: "ebony", name: "Ebony", fill: "#221c19", kind: "wood", group: "Wood" },
  { id: "purpleheart", name: "Purpleheart", fill: "#6d3a62", kind: "wood", group: "Wood" },
  { id: "bocote", name: "Bocote", fill: "#c6a15b", kind: "wood", group: "Wood" },
  { id: "padauk", name: "Padauk", fill: "#b84324", kind: "wood", group: "Wood" },
  { id: "nickel-silver", name: "Nickel/Silver", fill: "#c5c9ce", kind: "metal", group: "Metal" },
  { id: "copper", name: "Copper", fill: "#b87333", kind: "metal", group: "Metal" },
  { id: "brass", name: "Brass", fill: "#c6a15a", kind: "metal", group: "Metal" },
  { id: "silver", name: "Silver", fill: "#e4e7ea", kind: "metal", group: "Metal" },
];
