"use strict";

const $ = (sel) => document.querySelector(sel);
const table = $("#table");
const deckEl = $("#deck");
const hint = $("#hint");
const RATIO = 1.7; // card height / width, paper margin included; keep in sync with --ratio in style.css
const STACK = 7;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ms = (t) => (reduceMotion ? 1 : t);
const sleep = (t) => new Promise((r) => setTimeout(r, ms(t)));
const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV",
  "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];

let DECK = null;
let busy = false;
let dealt = []; // [{el, pull, pos}]
let reading = []; // pulls in reading order, for copy-as-text
let dealtSpread = null; // spread currently on the table (the select may have changed since)

// ---------- randomness ----------

function randInt(n) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

function drawCards(count, reversals, majorOnly) {
  const pool = DECK.cards.filter((c) => !majorOnly || c.arcana === "major");
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).map((card) => ({ card, reversed: reversals && randInt(2) === 1 }));
}

// ---------- controls & persistence ----------

function loadPrefs() {
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem("tarot-prefs") || "{}"); } catch {}
  const q = new URLSearchParams(location.search);
  if (q.has("spread")) prefs.spread = q.get("spread");
  if (q.has("reversals")) prefs.reversals = q.get("reversals") !== "0";
  if (q.has("major")) prefs.major = q.get("major") !== "0";
  return prefs;
}

function savePrefs() {
  try {
    localStorage.setItem("tarot-prefs", JSON.stringify({
      spread: $("#spread").value, reversals: $("#reversals").checked, major: $("#major").checked,
    }));
  } catch {}
}

function currentSpread() {
  return DECK.spreads[$("#spread").value];
}

// ---------- geometry ----------

function tableWidth() {
  return table.clientWidth;
}

function idleLayout() {
  const w = Math.min(130, tableWidth() * 0.3);
  const h = Math.max(360, w * RATIO + 120);
  return { tableH: h, deck: { w, x: (tableWidth() - w) / 2, y: (h - w * RATIO) / 2 - 16 } };
}

function spreadLayout(spread) {
  const ps = spread.positions;
  const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = maxX - minX, dy = maxY - minY;
  const W = tableWidth();
  const pad = W < 560 ? 16 : 32;
  const labelH = 24, gapY = 14;
  // Horizontal pitch in card widths; a crossing card lies sideways, so its neighbours need more room.
  const k = ps.some((p) => p.cross) ? (1 + RATIO) / 2 + 0.14 : 1.3;
  const deckW = W < 560 ? 40 : 52;
  const strip = deckW * RATIO + 24;
  const availW = W - pad * 2;
  const availH = Math.max(520, innerHeight * 0.95) - pad * 2 - strip;
  const maxW = ps.length === 1 ? 250 : 180;
  const byW = availW / (dx * k + 1);
  const byH = (availH - labelH - dy * (labelH + gapY)) / (RATIO * (dy + 1));
  const cw = Math.max(36, Math.min(maxW, byW, byH));
  const ch = cw * RATIO;
  const pitchX = cw * k, pitchY = ch + labelH + gapY;
  const extentW = dx * pitchX + cw, extentH = dy * pitchY + ch + labelH;
  const ox = (W - extentW) / 2, oy = pad + 6;
  const tableH = oy + extentH + strip;
  return {
    tableH, cw, ch,
    slots: ps.map((p) => ({ x: ox + (p.x - minX) * pitchX, y: oy + (p.y - minY) * pitchY })),
    deck: { w: deckW, x: (W - deckW) / 2, y: tableH - strip + 8 },
  };
}

function placeDeck({ w, x, y }) {
  deckEl.style.setProperty("--deck-w", `${w}px`);
  deckEl.style.left = `${x}px`;
  deckEl.style.top = `${y}px`;
}

function deckCenter() {
  const w = parseFloat(deckEl.style.getPropertyValue("--deck-w"));
  return { x: parseFloat(deckEl.style.left) + w / 2, y: parseFloat(deckEl.style.top) + (w * RATIO) / 2, w };
}

// ---------- building elements ----------

function makeBack() {
  const back = document.createElement("div");
  back.className = "back";
  back.append($("#card-back").content.cloneNode(true));
  return back;
}

function buildStack() {
  deckEl.replaceChildren();
  for (let i = 0; i < STACK; i++) {
    const b = makeBack();
    b.classList.add("stack-card");
    b.style.transform = `translate(${-i * 0.8}px, ${-i * 0.8}px)`;
    deckEl.append(b);
  }
}

function makeCard(pull, pos, index, slot, size, showPos) {
  const el = document.createElement("div");
  el.className = "card" + (pos.cross ? " crossing" : "") + (pull.reversed ? " reversed" : "");
  Object.assign(el.style, { left: `${slot.x}px`, top: `${slot.y}px`, width: `${size.cw}px`, height: `${size.ch}px` });
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `${pos.name}: face-down card`);

  const rot = document.createElement("div");
  rot.className = "rot";
  const inner = document.createElement("div");
  inner.className = "inner";
  const back = makeBack();
  back.classList.add("face");
  const front = document.createElement("div");
  front.className = "face front";
  const img = new Image();
  img.src = `img/${pull.card.id}.jpg`;
  img.alt = pull.card.name + (pull.reversed ? " (reversed)" : "");
  img.draggable = false;
  front.append(img);
  inner.append(back, front);
  rot.append(inner);

  if (showPos) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = index + 1;
    rot.append(badge);
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = pos.name;
    el.append(label);
  }
  el.append(rot);

  const reveal = () => {
    if (!el.classList.contains("flipped")) return;
    const entry = document.getElementById(`entry-${index}`);
    if (!entry) return;
    entry.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    entry.classList.remove("flash");
    void entry.offsetWidth;
    entry.classList.add("flash");
    dealt.forEach((d) => d.el.classList.toggle("active", d.el === el));
  };
  el.addEventListener("click", reveal);
  el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") reveal(); });
  return el;
}

function subtitle(card) {
  if (card.arcana === "major") return `Major Arcana ${ROMAN[card.number]}`;
  const s = DECK.suits[card.suit];
  return `${s.name} · ${s.element} · ${s.domain}`;
}

function makeEntry(pull, pos, index, showPos) {
  const { card, reversed } = pull;
  const side = reversed ? card.reversed : card.upright;
  const li = document.createElement("li");
  li.className = "entry" + (reversed ? " reversed" : "");
  li.id = `entry-${index}`;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  li.innerHTML = `
    <img src="img/${card.id}.jpg" alt="">
    <div>
      ${showPos ? `<p class="pos">${index + 1}. ${esc(pos.name)} <small>— ${esc(pos.meaning)}</small></p>` : ""}
      <h3>${esc(card.name)}${reversed ? '<span class="rev">reversed</span>' : ""}</h3>
      <p class="sub">${esc(subtitle(card))}</p>
      <ul class="chips">${side.keywords.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
      <p class="meaning">${esc(side.meaning)}</p>
      <p class="imagery">${esc(card.imagery)}</p>
      <p class="prompt">${esc(card.prompt)}</p>
    </div>`;
  return li;
}

// ---------- animation steps ----------

async function gather() {
  if (!dealt.length) return;
  dealt.forEach(({ el }) => el.classList.remove("flipped", "active"));
  await sleep(450);
  const c = deckCenter();
  await Promise.all(dealt.map(({ el }, i) => {
    const r = el.getBoundingClientRect(), t = table.getBoundingClientRect();
    const tx = c.x - (r.left - t.left + r.width / 2), ty = c.y - (r.top - t.top + r.height / 2);
    const scale = c.w / el.offsetWidth;
    const turn = el.classList.contains("crossing") ? -90 : 0;
    return el.animate(
      [{ transform: "none" }, { transform: `translate(${tx}px, ${ty}px) rotate(${turn}deg) scale(${scale})` }],
      { duration: ms(420), delay: ms(i * 40), easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" },
    ).finished;
  }));
  dealt.forEach(({ el }) => el.remove());
  dealt = [];
}

async function shuffle() {
  const cards = [...deckEl.children];
  for (let round = 0; round < 3; round++) {
    await Promise.all(cards.map((b, i) => {
      const base = `translate(${-i * 0.8}px, ${-i * 0.8}px)`;
      const side = (i + round) % 2 ? 1 : -1;
      return b.animate([
        { transform: base },
        { transform: `${base} translateX(${side * 58}%) translateY(-4%) rotate(${side * 7}deg)`, offset: 0.45 },
        { transform: `${base} translateX(${side * 52}%) rotate(${side * 5}deg)`, offset: 0.6 },
        { transform: base },
      ], { duration: ms(520), delay: ms(i * 22), easing: "ease-in-out" }).finished;
    }));
  }
}

async function deal(pulls, spread, lay) {
  const c = deckCenter();
  const showPos = spread.positions.length > 1;
  for (let i = 0; i < pulls.length; i++) {
    const pos = spread.positions[i];
    const el = makeCard(pulls[i], pos, i, lay.slots[i], lay, showPos);
    table.append(el);
    dealt.push({ el, pull: pulls[i], pos });
    const tx = c.x - (lay.slots[i].x + lay.cw / 2), ty = c.y - (lay.slots[i].y + lay.ch / 2);
    const scale = c.w / lay.cw;
    const turn = pos.cross ? -90 : 0;
    el.animate([
      { transform: `translate(${tx}px, ${ty}px) rotate(${turn}deg) scale(${scale})` },
      { transform: `translate(${tx * 0.15}px, ${ty * 0.15 - 14}px) rotate(${(i % 2 ? 4 : -4)}deg)`, offset: 0.8 },
      { transform: "none" },
    ], { duration: ms(560), easing: "cubic-bezier(.2,.7,.3,1)" });
    await sleep(pulls.length > 5 ? 170 : 260);
    el.classList.add("dealt");
  }
  await sleep(450);

  const entries = $("#entries");
  for (let i = 0; i < dealt.length; i++) {
    const { el, pull, pos } = dealt[i];
    el.classList.add("flipped");
    el.setAttribute("aria-label", `${pos.name}: ${pull.card.name}${pull.reversed ? ", reversed" : ""}`);
    entries.append(makeEntry(pull, pos, i, showPos));
    await sleep(pulls.length > 5 ? 320 : 480);
  }
}

// ---------- main flow ----------

async function run() {
  if (busy) return;
  busy = true;
  $("#draw").disabled = true;
  hint.style.opacity = 0;
  const spread = currentSpread();
  const pulls = drawCards(spread.positions.length, $("#reversals").checked, $("#major").checked);
  reading = pulls.map((p, i) => ({ ...p, pos: spread.positions[i] }));

  await gather();
  $("#entries").replaceChildren();
  $("#reading").hidden = false;
  $("#reading-title").textContent = spread.positions.length > 1 ? spread.name : "Your card";

  const idle = idleLayout();
  table.style.height = `${idle.tableH}px`;
  placeDeck(idle.deck);
  await sleep(500);
  await shuffle();

  dealtSpread = spread;
  const lay = spreadLayout(spread);
  table.style.height = `${lay.tableH}px`;
  placeDeck(lay.deck);
  await sleep(550);
  await deal(pulls, spread, lay);

  busy = false;
  $("#draw").disabled = false;
}

function relayout() {
  if (busy) return;
  if (!dealt.length) {
    const idle = idleLayout();
    table.style.height = `${idle.tableH}px`;
    placeDeck(idle.deck);
    return;
  }
  const lay = spreadLayout(dealtSpread);
  table.style.height = `${lay.tableH}px`;
  placeDeck(lay.deck);
  dealt.forEach(({ el }, i) => Object.assign(el.style, {
    left: `${lay.slots[i].x}px`, top: `${lay.slots[i].y}px`, width: `${lay.cw}px`, height: `${lay.ch}px`,
  }));
}

function readingText() {
  const lines = [];
  for (const [i, { card, reversed, pos }] of reading.entries()) {
    const side = reversed ? card.reversed : card.upright;
    if (reading.length > 1) lines.push(`${i + 1}. ${pos.name} (${pos.meaning})`);
    lines.push(`${card.name}${reversed ? " (reversed)" : ""} · ${subtitle(card)}`);
    lines.push(`Keywords: ${side.keywords.join(", ")}`);
    lines.push(`Imagery: ${card.imagery}`);
    lines.push(`Meaning: ${side.meaning}`);
    lines.push(`Prompt: ${card.prompt}`, "");
  }
  return lines.join("\n").trim();
}

async function init() {
  try {
    DECK = await (await fetch("deck.json")).json();
  } catch {
    hint.innerHTML = "Couldn't load <code>deck.json</code>. Serve this folder over HTTP: <code>python3 tarot.py serve</code>";
    hint.style.color = "#f0a";
    return;
  }
  const sel = $("#spread");
  for (const [key, s] of Object.entries(DECK.spreads)) {
    sel.append(new Option(`${s.name} (${s.positions.length})`, key));
  }
  const prefs = loadPrefs();
  if (prefs.spread in DECK.spreads) sel.value = prefs.spread;
  $("#reversals").checked = !!prefs.reversals;
  $("#major").checked = !!prefs.major;
  const describe = () => { $("#spread-desc").textContent = currentSpread().description; };
  describe();

  buildStack();
  relayout();
  requestAnimationFrame(() => deckEl.style.transition = "left .55s ease, top .55s ease, width .55s ease, height .55s ease");

  $("#controls").addEventListener("change", () => { savePrefs(); describe(); });
  $("#controls").addEventListener("submit", (ev) => {
    ev.preventDefault();
    run();
  });
  deckEl.addEventListener("click", () => $("#controls").requestSubmit());
  document.addEventListener("keydown", (ev) => {
    if (ev.code === "Space" && !["SELECT", "BUTTON", "INPUT"].includes(document.activeElement.tagName)) {
      ev.preventDefault();
      $("#controls").requestSubmit();
    }
  });
  $("#copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(readingText());
      $("#copy").textContent = "Copied ✓";
    } catch {
      $("#copy").textContent = "Copy failed";
    }
    setTimeout(() => ($("#copy").textContent = "Copy as text"), 1500);
  });
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(relayout, 150); });
}

init();
