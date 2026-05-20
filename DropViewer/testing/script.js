const WIKI = "https://runescape.wiki/api.php";
let allMonsters = [];
let inDropsView = false;
let searchTimer = null;
let currentMode = "npc";

const navHistory = { npc: null, item: null };
function saveNavState(type, name, title, scrollY) {
  navHistory[currentMode] = { mode: currentMode, type, name, title, scrollY: scrollY || 0 };
}
function getSavedNav() { return navHistory[currentMode] || null; }

// ── OCR ──────────────────────────────────────────────────────────────────────
// @alt1/ocr is a separate bundle that loads as window.OCR (not window.A1lib.ocr).
// Font definitions are also separate bundles; each exposes window.OCR_<name>.
// We load both lazily after the deferred scripts fire.
//
// The rightclick.fontmeta.json font IS useful here — it's the font RS uses in
// the context menu, including the Examine tooltip text line.
// To use it we must build a FontDefinition at runtime from the .fontmeta.json
// + .data.png pair using OCR.generatefont().

let _ocr = null;           // window.OCR once loaded
let _font = null;          // FontDefinition once ready
let _fontLoading = false;

function getOCR() {
  if (_ocr) return _ocr;
  if (typeof window.OCR !== "undefined") { _ocr = window.OCR; return _ocr; }
  return null;
}

/**
 * Load the best available FontDefinition for OCR.
 * Priority: rightclick font (custom, from your fonts/ folder) →
 *           pre-built aa_8px_mono → aa_10px_mono → aa_12px_mono
 */
async function loadFont() {
  if (_font) return _font;
  if (_fontLoading) return null;
  _fontLoading = true;

  const ocr = getOCR();
  if (!ocr) { dbg("OCR module not loaded yet"); _fontLoading = false; return null; }

  // 1) Try rightclick.fontmeta.json + rightclick.data.png (your custom font)
  try {
    const meta = await fetch("./fonts/rightclick.fontmeta.json").then(r => r.json());
    const pngUrl = "./fonts/rightclick.data.png";
    const fontDef = await buildFontFromFiles(ocr, meta, pngUrl);
    if (fontDef) {
      _font = fontDef;
      dbg("✅ Font loaded: rightclick (custom)");
      return _font;
    }
  } catch(e) { dbg("rightclick font load failed: " + e.message); }

  // 2) Fall back to pre-built fonts exposed as window.OCR_*
  const builtins = [
    { global: "OCR_aa_8px_mono",  label: "aa_8px_mono"  },
    { global: "OCR_aa_10px_mono", label: "aa_10px_mono" },
    { global: "OCR_aa_12px_mono", label: "aa_12px_mono" },
  ];
  for (const fb of builtins) {
    if (typeof window[fb.global] !== "undefined") {
      _font = window[fb.global];
      dbg("✅ Font loaded: " + fb.label + " (built-in)");
      return _font;
    }
  }

  dbg("⚠️ No font available for OCR");
  _fontLoading = false;
  return null;
}

/**
 * Build an OCR.FontDefinition from a .fontmeta.json + .data.png pair.
 * This replicates what @alt1/font-loader does at webpack build time, but at runtime.
 */
async function buildFontFromFiles(ocr, meta, pngUrl) {
  // Load the .data.png into an ImageData
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const c = document.createElement("canvas");
      c.width = image.naturalWidth;
      c.height = image.naturalHeight;
      const ctx = c.getContext("2d");
      // Disable colour-space transforms so pixel values are raw
      ctx.drawImage(image, 0, 0);
      resolve(ctx.getImageData(0, 0, c.width, c.height));
    };
    image.onerror = () => reject(new Error("Failed to load font PNG: " + pngUrl));
    image.src = pngUrl;
  });

  // Convert to an A1lib ImageData if possible (OCR functions expect it)
  let a1img;
  try {
    a1img = new window.A1lib.ImageData(img.width, img.height, img.data);
  } catch(e) {
    // Fall back: plain object with same shape
    a1img = { width: img.width, height: img.height, data: img.data };
  }

  // Determine unblend mode & colour from the meta
  const color = (meta.color && meta.color.length >= 3)
    ? meta.color
    : [255, 255, 255];

  let unblended;
  if (meta.unblendmode === "raw") {
    // Raw mode: pixels are already extracted; use unblendTrans
    unblended = ocr.unblendTrans(a1img, !!meta.shadow, color[0], color[1], color[2]);
  } else {
    // Default: black background unblend
    unblended = ocr.unblendBlackBackground(a1img, color[0], color[1], color[2]);
  }

  const chars   = meta.chars   || "";
  const seconds = meta.seconds || "";
  const basey   = meta.basey   !== undefined ? meta.basey : 10;
  const sw      = meta.spacewidth !== undefined ? meta.spacewidth : 4;
  const thresh  = meta.treshold  !== undefined ? meta.treshold   : 0.4;
  const shadow  = !!meta.shadow;

  return ocr.generatefont(unblended, chars, seconds, {}, basey, sw, thresh, shadow);
}

// ── BUCKET & WIKI GROUPING ────────────────────────────────────────────────────
//
// The bucket drop_json has these fields relevant to grouping:
//   "Drop type"  : "combat" | "thieving" | "fishing" | "reward" | etc.
//   "Rarity"     : "Always" | "1/128" | "Common" | etc.
//   "Name"       : item name (same as item_name in the row)
//
// The wiki's section headers (Unique drops, Herbs, Stone spirits, etc.) are
// NOT a field in the bucket. They are derived from the item name via the
// DropsLine template's auto-sort logic:
//
//   bones      → "Bones"
//   herbs      → "Herbs"
//   seeds      → "Seeds"
//   spirits    → "Stone Spirits"
//   runes      → "Runes & Ammunition"
//   arrows/bolts → "Runes & Ammunition"
//   gems/uncut → "Gems"
//   ores/bars  → "Ores & Bars"
//   armour/weapons → "Weapons & Armour"
//   salvage    → "Salvage"
//   Always rarity → "Always"
//   otherwise  → "Drops"    (main combat drops)
//   rare drop table → "Rare Drop Table"
//
// There is also a "Unique drops" group: these are items specific to a boss/NPC
// that don't fall into any generic category. We detect these as items whose
// "Drop type" field is absent, empty, or "unique" in the bucket JSON.

const BUCKET_API = WIKI;

async function fetchNpcDropsBucket(pageName) {
  dbg(`BUCKET: NPC fetch for "${pageName}"`);
  const canonical = await resolveCanonicalTitle(pageName);
  const query = `bucket('dropsline').select('page_name','item_name','drop_json').where('page_name','${canonical}').run()`;
  const url = `${BUCKET_API}?action=bucket&format=json&origin=*&query=${encodeURIComponent(query)}`;
  let data;
  try { const res = await fetch(url); data = await res.json(); }
  catch(e) { dbg("BUCKET ERROR: " + e.message); return []; }
  const rows = data?.bucket || [];
  dbg(`BUCKET: ${rows.length} rows for "${canonical}"`);
  return rows.map(r => {
    const drop = r.drop_json ? JSON.parse(r.drop_json) : {};
    return {
      name: r.item_name || "",
      qty: extractQtyFromDrop(drop),
      rarity: extractRarityFromDrop(drop),
      img: "",
      section: deriveSectionFromDrop(r.item_name || "", drop)
    };
  });
}

async function resolveCanonicalTitle(title) {
  const url = `${WIKI}?action=query&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const res = await fetch(url);
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return title;
  const page = Object.values(pages)[0];
  return page?.title || title;
}

async function fetchItemSourcesBucket(itemName) {
  dbg(`BUCKET: item fetch for "${itemName}"`);
  const canonical = await resolveCanonicalTitle(itemName);
  const query = `bucket('dropsline').select('page_name','drop_json').where('item_name','${canonical}').run()`;
  const url = `${BUCKET_API}?action=bucket&format=json&origin=*&query=${encodeURIComponent(query)}`;
  let data;
  try { const res = await fetch(url); data = await res.json(); }
  catch(e) { dbg("BUCKET ERROR: " + e.message); return []; }
  const rows = data?.bucket || [];
  return rows.map(r => {
    const drop = r.drop_json ? JSON.parse(r.drop_json) : {};
    return { name: r.page_name || "", img: "", level: "", qty: extractQtyFromDrop(drop), rarity: extractRarityFromDrop(drop) };
  });
}

function extractQtyFromDrop(drop) {
  if (!drop) return "";
  // The bucket uses "Drop Quantity" (capital Q) or fallback keys
  if (drop["Drop Quantity"]) return String(drop["Drop Quantity"]);
  for (const k of Object.keys(drop))
    if (/quantity|qty/i.test(k)) return String(drop[k]);
  return "";
}

function extractRarityFromDrop(drop) {
  if (!drop) return "";
  if (drop.Rarity) return String(drop.Rarity);
  if (drop["Alt Rarities"] && drop["Alt Rarities"].length) return String(drop["Alt Rarities"][0]);
  for (const k of Object.keys(drop))
    if (/rarity|chance|rate/i.test(k)) return String(drop[k]);
  return "";
}

// ── Wiki-style section derivation ─────────────────────────────────────────────
//
// Maps item name + drop_json to one of the canonical wiki section names.
// Logic mirrors the DropsLine template's auto-sort category rules.

const TABLE_ORDER = [
  "Always",
  "Unique drops",
  "Weapons & Armour",
  "Runes & Ammunition",
  "Herbs",
  "Seeds",
  "Stone Spirits",
  "Ores & Bars",
  "Gems",
  "Bones",
  "Salvage",
  "Other",
  "Rare Drop Table"
];

const TABLE_ICONS = {
  "Always":             "⭐",
  "Unique drops":       "💎",
  "Weapons & Armour":   "🛡️",
  "Runes & Ammunition": "🔮",
  "Herbs":              "🌿",
  "Seeds":              "🌱",
  "Stone Spirits":      "🪨",
  "Ores & Bars":        "⛏️",
  "Gems":               "💍",
  "Bones":              "🦴",
  "Salvage":            "🔩",
  "Other":              "⚔️",
  "Rare Drop Table":    "🍀"
};

const TABLE_COLORS = {
  "Always":             "#f5c518",
  "Unique drops":       "#ba68c8",
  "Weapons & Armour":   "#ff9800",
  "Runes & Ammunition": "#5c9bd6",
  "Herbs":              "#4caf50",
  "Seeds":              "#81c784",
  "Stone Spirits":      "#a1887f",
  "Ores & Bars":        "#90a4ae",
  "Gems":               "#e91e63",
  "Bones":              "#c8a96e",
  "Salvage":            "#78909c",
  "Other":              "#64b5f6",
  "Rare Drop Table":    "#4caf50"
};

// Known Rare Drop Table items (items that come from the RDT, not the monster directly)
const RDT_ITEMS = new Set([
  "Uncut onyx","Uncut dragonstone","Uncut diamond","Uncut ruby","Uncut emerald","Uncut sapphire",
  "Chaos talisman","Nature talisman","Water talisman","Earth talisman","Fire talisman",
  "Loop half of key","Tooth half of key","Dragonstone","Dragon spear","Rune spear",
  "Shield left half","Dragon 2h sword","Rune javelin","Teak plank","Mahogany plank",
  "Noted coal","Noted mithril ore","Noted gold ore","Noted runite ore",
  "Phasmatite stone spirit","Necrite stone spirit","Drakolith stone spirit","Orichalcite stone spirit",
]);

function deriveSectionFromDrop(itemName, drop) {
  const name = (itemName || "").toLowerCase().trim();
  const rarity = String(drop.Rarity || "").toLowerCase();
  const dropType = String(drop["Drop type"] || "").toLowerCase();

  // Always drops (100%)
  if (rarity === "always") return "Always";

  // Rare Drop Table — by known item list or explicit flag
  if (RDT_ITEMS.has(itemName)) return "Rare Drop Table";
  if (/rare.?drop.?table|rdt/i.test(dropType)) return "Rare Drop Table";

  // Bones / ashes (always first after Always on wiki)
  if (/\bbones?\b|\bash(es)?\b|\bremains\b/i.test(name)) return "Bones";

  // Herbs (grimy or clean)
  if (/^grimy |^clean |\bherb\b/.test(name) && !/seed/i.test(name)) return "Herbs";
  if (/\bherbs?\b/.test(name) && !/seed/i.test(name)) return "Herbs";

  // Seeds
  if (/\bseed(s)?\b/.test(name)) return "Seeds";

  // Stone spirits
  if (/stone.?spirit|spirit.?stone/i.test(name)) return "Stone Spirits";

  // Runes & ammunition
  if (/\brune(s)?\b/.test(name) && !/runite/.test(name)) return "Runes & Ammunition";
  if (/\barrow(s|head)?\b|\bbolt(s|tip)?\b|\bdart(s)?\b|\bjavelin\b|\bthrowingaxe\b|\bthrown.?axe\b/i.test(name)) return "Runes & Ammunition";

  // Gems
  if (/\bgemstone\b|\bflawed gemstone\b|\bcrystal\b/i.test(name)) return "Gems";
  if (/^uncut |\bsapphire\b|\bemerald\b|\bruby\b|\bdiamond\b|\bdragonstone\b|\bonyx\b|\bzenyte\b|\bhydrix\b/i.test(name)) return "Gems";

  // Ores & bars
  if (/\bore\b|\bcoal\b|\b(runite|adamantite|mithril|steel|iron|gold|silver|orichalcite|drakolith|necrite|phasmatite|bane)\b.*\b(ore|bar|stone)\b/i.test(name)) return "Ores & Bars";
  if (/\bbar\b/i.test(name) && /(bronze|iron|steel|mithril|adamant|rune|dragon|necrit|orichalcite|drakolith|phasmatit|bane)/i.test(name)) return "Ores & Bars";

  // Salvage
  if (/\bsalvage\b/i.test(name)) return "Salvage";

  // Weapons & armour (broad catch — common equipment words)
  if (/\b(sword|scimitar|longsword|dagger|mace|halberd|spear|bow|staff|wand|crossbow|whip|flail|maul|axe|battleaxe|pickaxe|hatchet|claws?|fang)\b/i.test(name)) return "Weapons & Armour";
  if (/\b(helm|helmet|platebody|chainbody|platelegs|plateskirt|full helm|kiteshield|sq shield|shield|coif|chaps|body|legs|gloves?|boots?|cape|amulet|ring|necklace|bracelet)\b/i.test(name)) return "Weapons & Armour";

  // Unique drops: items whose Drop type is blank/missing/"unique", or that look boss-specific
  // (everything that didn't match a category and isn't "combat" generic filler)
  if (!dropType || dropType === "unique" || dropType === "reward") return "Unique drops";

  // Default: generic combat drops
  return "Other";
}

// ── Icon & misc helpers ───────────────────────────────────────────────────────

const itemIconCache = new Map();
async function fetchItemIcon(name) {
  if (!name) return "";
  if (itemIconCache.has(name)) return itemIconCache.get(name);
  try {
    const url = `${WIKI}?action=query&prop=pageimages&titles=${encodeURIComponent(name)}&pithumbsize=40&piprop=thumbnail&format=json&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) { itemIconCache.set(name, ""); return ""; }
    const src = Object.values(pages)[0]?.thumbnail?.source || "";
    itemIconCache.set(name, src);
    return src;
  } catch(e) { itemIconCache.set(name, ""); return ""; }
}

// Settings
const settings = { debugLog: false, ocrCanvas: false, opacity: 100 };
function saveSetting(k, v) {
  settings[k] = v;
  try { localStorage.setItem("dvSettings", JSON.stringify(settings)); } catch(e) {}
}
(function() {
  try {
    const s = JSON.parse(localStorage.getItem("dvSettings") || "{}");
    if (s.debugLog !== undefined) settings.debugLog = s.debugLog;
    if (s.ocrCanvas !== undefined) settings.ocrCanvas = s.ocrCanvas;
    if (typeof s.opacity === "number") settings.opacity = Math.max(30, Math.min(100, s.opacity));
  } catch(e) {}
})();
const DEBUG_OVERLAY_HEIGHT = 180;

function applyToggleUI() {
  document.getElementById("toggle-debug").classList.toggle("on", settings.debugLog);
  document.getElementById("toggle-ocr-canvas").classList.toggle("on", settings.ocrCanvas);
  const sl = document.getElementById("opacity-slider"), vl = document.getElementById("opacity-value");
  if (sl) sl.value = settings.opacity;
  if (vl) vl.textContent = settings.opacity + "%";
  document.body.style.opacity = (settings.opacity / 100).toString();
  getOrCreateDebugOverlay().style.display = settings.debugLog ? "block" : "none";
  const oc = getOrCreateOcrCanvas();
  oc.style.display = settings.ocrCanvas ? "block" : "none";
  oc.style.bottom = settings.debugLog ? DEBUG_OVERLAY_HEIGHT + "px" : "0px";
}
function getOrCreateDebugOverlay() {
  let el = document.getElementById("section-debug");
  if (!el) {
    el = document.createElement("div"); el.id = "section-debug";
    el.style.cssText = `position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,.88);color:#00ff00;font-family:monospace;font-size:11px;line-height:1.5;padding:6px 8px;height:${DEBUG_OVERLAY_HEIGHT}px;overflow-y:auto;z-index:9999;white-space:pre-wrap;box-sizing:border-box;`;
    el.style.display = "none"; document.body.appendChild(el);
  }
  return el;
}
function getOrCreateOcrCanvas() {
  let el = document.getElementById("dbg-ocr-canvas");
  if (!el) {
    el = document.createElement("canvas"); el.id = "dbg-ocr-canvas";
    el.style.cssText = "position:fixed;bottom:0;right:4px;border:2px solid #f5c518;image-rendering:pixelated;z-index:9999;background:#222;max-width:98vw;min-width:40px;min-height:20px;";
    el.style.display = "none"; document.body.appendChild(el);
  }
  return el;
}
document.getElementById("settings-btn").addEventListener("click", function(e) {
  e.stopPropagation();
  const p = document.getElementById("settings-panel"), b = document.getElementById("settings-btn");
  p.classList.toggle("open"); b.classList.toggle("active", p.classList.contains("open"));
  applyToggleUI();
});
document.addEventListener("click", function() {
  document.getElementById("settings-panel").classList.remove("open");
  document.getElementById("settings-btn").classList.remove("active");
});
document.getElementById("settings-panel").addEventListener("click", e => e.stopPropagation());
document.getElementById("toggle-debug").addEventListener("click", function() { saveSetting("debugLog", !settings.debugLog); applyToggleUI(); });
document.getElementById("toggle-ocr-canvas").addEventListener("click", function() { saveSetting("ocrCanvas", !settings.ocrCanvas); applyToggleUI(); });
document.getElementById("opacity-slider").addEventListener("input", function(e) { saveSetting("opacity", parseInt(e.target.value, 10) || 100); applyToggleUI(); });

const DEBUG_MAX_LINES = 200;
function dbg(s) {
  console.log("[DropViewer]", s);
  const o = getOrCreateDebugOverlay();
  const esc = String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  o.innerHTML += esc + "<br>";
  const lines = o.innerHTML.split("<br>");
  if (lines.length > DEBUG_MAX_LINES) o.innerHTML = lines.slice(-DEBUG_MAX_LINES).join("<br>");
  o.scrollTop = o.scrollHeight;
}
function setStatus(type, msg) { const el = document.getElementById("status"); el.className = type; el.textContent = msg; }

// Mode tabs
document.querySelectorAll(".mode-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const mode = tab.dataset.mode;
    if (mode === currentMode) return;
    currentMode = mode;
    document.querySelectorAll(".mode-tab").forEach(t => t.classList.toggle("active", t === tab));
    const inp = document.getElementById("search-input");
    inp.placeholder = mode === "item" ? "Search items..." : "Search NPCs...";
    setStatus("", "");
    const saved = getSavedNav();
    if (saved && saved.type === "drops" && saved.name) {
      inp.value = saved.name;
      if (mode === "item") lookupItemSources(saved.name); else lookup(saved.name);
    } else {
      inp.value = ""; showBrowser();
      if (mode === "npc") {
        renderNpcList("");
        document.getElementById("list-label").textContent = allMonsters.length ? "All RS3 monsters" : "Loading...";
        document.getElementById("list-count").textContent = allMonsters.length ? allMonsters.length + " total" : "";
      } else {
        document.getElementById("npc-list").innerHTML = '<div id="npc-empty">Type an item name and press Search.<br><small>e.g. "Dragon bones", "Abyssal whip"</small></div>';
        document.getElementById("list-label").textContent = "Item drop source lookup";
        document.getElementById("list-count").textContent = "";
      }
    }
  });
});

function showBrowser() {
  document.getElementById("npc-browser").style.display = "flex";
  document.getElementById("disambig").style.display = "none";
  document.getElementById("drops").style.display = "none";
  document.getElementById("back-btn").style.display = "none";
  document.getElementById("subtitle").textContent = currentMode === "item" ? "Search any item" : "Search any NPC";
  document.getElementById("npc-img").style.display = "none";
  document.getElementById("titlebar-logo").style.display = "inline";
  inDropsView = false;
}
function showDisambig() {
  document.getElementById("npc-browser").style.display = "none";
  document.getElementById("disambig").style.display = "block";
  document.getElementById("drops").style.display = "none";
  document.getElementById("back-btn").style.display = "block";
  inDropsView = false;
}
function showDrops() {
  document.getElementById("npc-browser").style.display = "none";
  document.getElementById("disambig").style.display = "none";
  document.getElementById("drops").style.display = "block";
  document.getElementById("back-btn").style.display = "block";
  inDropsView = true;
}

async function loadMonsterList() {
  document.getElementById("list-status").textContent = "⏳ Loading monster list...";
  let monsters = [], offset = 0;
  const limit = 500;
  try {
    while (true) {
      const query = `[[Monster JSON::+]]|?Has name|limit=${limit}|offset=${offset}`;
      const url = `${WIKI}?action=ask&query=${encodeURIComponent(query)}&format=json&origin=*`;
      const r = await fetch(url); const d = await r.json();
      const results = d?.query?.results;
      if (!results) break;
      const keys = Object.keys(results);
      if (!keys.length) break;
      for (const key of keys) {
        const page = results[key];
        const name = page?.printouts?.["Has name"]?.[0] || page.fulltext;
        if (name && !name.includes("/")) monsters.push({ name, fulltext: page.fulltext });
      }
      dbg(`Loaded ${monsters.length} monsters (offset ${offset})`);
      document.getElementById("list-status").textContent = `⏳ Loading... ${monsters.length} found`;
      if (keys.length < limit) break;
      offset += limit;
    }
    const seen = new Set();
    allMonsters = monsters.filter(m => { if (seen.has(m.name)) return false; seen.add(m.name); return true; })
                          .sort((a, b) => a.name.localeCompare(b.name));
    document.getElementById("list-status").textContent = "";
    document.getElementById("list-label").textContent = "All RS3 monsters";
    document.getElementById("list-count").textContent = allMonsters.length + " total";
    if (currentMode === "npc") renderNpcList("");
  } catch(e) {
    dbg("Monster list load error: " + e.message);
    document.getElementById("list-status").textContent = "⚠️ Could not load full list — use search box above";
    allMonsters = POPULAR_NPCS.map(n => ({ name: n.name, fulltext: n.name, cat: n.cat, icon: n.icon }));
    if (currentMode === "npc") renderNpcList("");
  }
}

const POPULAR_NPCS = [
  { name: "Abomination", icon: "⚔️", cat: "Boss" },
  { name: "Hydrix dragon", icon: "🐲", cat: "Slayer" }
];

function renderNpcList(filter) {
  const list = document.getElementById("npc-list");
  const q = filter.toLowerCase().trim();
  const source = allMonsters.length > 0 ? allMonsters : POPULAR_NPCS;
  const filtered = q ? source.filter(n => n.name.toLowerCase().includes(q)).slice(0, 100) : source.slice(0, 200);
  if (!filtered.length) {
    list.innerHTML = `<div id="npc-empty">No matches for "<strong>${filter}</strong>"<br><small>Press Search to look it up on the wiki</small></div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const npc of filtered) {
    const el = document.createElement("div"); el.className = "npc-item";
    el.innerHTML = `<span class="npc-icon">${npc.icon || "👾"}</span><span class="npc-name">${npc.name}</span>${npc.cat ? `<span class="npc-cat">${npc.cat}</span>` : ""}`;
    el.addEventListener("click", () => lookup(npc.fulltext || npc.name));
    frag.appendChild(el);
  }
  list.innerHTML = ""; list.appendChild(frag);
}

async function checkDisambig(title) {
  const url = `${WIKI}?action=query&titles=${encodeURIComponent(title)}&prop=pageprops&ppprop=disambiguation&format=json&origin=*`;
  const r = await fetch(url); const d = await r.json();
  const pages = d?.query?.pages;
  if (!pages) return false;
  return Object.values(pages)[0]?.pageprops?.hasOwnProperty("disambiguation") ?? false;
}
async function getDisambigLinks(title) {
  const url = `${WIKI}?action=parse&page=${encodeURIComponent(title)}&prop=links&format=json&origin=*`;
  const r = await fetch(url); const d = await r.json();
  return (d?.parse?.links || []).filter(l => l.ns === 0).map(l => l["*"]).filter(l => !l.includes("disambiguation"));
}
function showDisambigOptions(title, links, msg) {
  document.getElementById("disambig-msg").textContent = msg || `"${title}" refers to multiple pages. Which one?`;
  const c = document.getElementById("disambig-options"); c.innerHTML = "";
  for (const link of links) {
    const el = document.createElement("div"); el.className = "disambig-option"; el.textContent = link;
    el.addEventListener("click", () => currentMode === "item" ? lookupItemSources(link) : lookupPage(link));
    c.appendChild(el);
  }
  showDisambig();
  document.getElementById("subtitle").textContent = "Choose a page";
  setStatus("", "");
}

function editDistance(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_,i) => Array.from({length: n+1}, (_,j) => i||j));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}
function scoreAlternative(s, q) {
  const sl = s.toLowerCase().trim(), ql = q.toLowerCase().trim();
  const meta = /\(storyline\)|\(book\)|\(music\)|\(recipe\)|\(item\)|\(quest\)|\(object\)|\(disambiguation\)/i.test(s) ? 500 : 0;
  const base = sl.replace(/\s*\([^)]*\)\s*/g,"").trim();
  if (base === ql) return -200 + meta;
  if (sl.startsWith(ql+" ") || sl === ql) return -100 + editDistance(sl,ql) + meta;
  const re = new RegExp("\\b" + ql.replace(/[.*+?^${}()|[\]\\]/g,"\\$&") + "\\b", "i");
  if (re.test(sl)) return editDistance(sl,ql) + meta;
  return editDistance(sl,ql) + sl.length * 0.3 + meta;
}
async function suggestAlternatives(title) {
  try {
    const url = `${WIKI}?action=opensearch&search=${encodeURIComponent(title)}&limit=30&namespace=0&format=json&origin=*`;
    const r = await fetch(url); const d = await r.json();
    let suggestions = (d[1]||[]).filter(s => s !== title);
    if (!suggestions.length) { setStatus("err", `⚠️ No drop table found for "${title}".`); return; }
    suggestions.sort((a,b) => scoreAlternative(a,title) - scoreAlternative(b,title));
    suggestions = suggestions.slice(0, 12);
    setStatus("busy", `No drops on "${title}" — pick a related page:`);
    showDisambigOptions(title, suggestions, `"${title}" has no drop table. Did you mean one of these?`);
  } catch(e) { setStatus("err", `⚠️ No drop table found for "${title}".`); }
}

function rarityClass(r) {
  if (!r) return { label: "?", cls: "b-unknown" };
  const s = r.toLowerCase().trim();
  if (s === "always") return { label: "Always", cls: "b-always" };
  const m = s.match(/(\d[\d,.]*)\/(\d[\d,.]*)/);
  if (m) {
    const chance = parseFloat(m[1].replace(/,/g,"")) / parseFloat(m[2].replace(/,/g,""));
    const label = r.split(/[;(]/)[0].trim();
    if (chance >= 0.25) return { label, cls: "b-common" };
    if (chance >= 0.03) return { label, cls: "b-uncommon" };
    if (chance >= 0.003) return { label, cls: "b-rare" };
    if (chance >= 0.0003) return { label, cls: "b-vr" };
    return { label, cls: "b-ultra" };
  }
  if (s.includes("very rare")||s.includes("ultra")) return { label: r, cls: "b-vr" };
  if (s.includes("rare")) return { label: r, cls: "b-rare" };
  if (s.includes("uncommon")) return { label: r, cls: "b-uncommon" };
  if (s.includes("common")) return { label: r, cls: "b-common" };
  return { label: r, cls: "b-unknown" };
}

function stripLevelSuffix(raw) {
  if (!raw) return { text: raw, hadLevel: false };
  raw = raw.trim(); var hadLevel = false;
  var bracketMatch = raw.match(/\s*[\(\[{<][^\)\]}>]*\d[^\)\]}>]*[\)\]}>]\s*$/);
  if (bracketMatch) { raw = raw.slice(0, raw.length - bracketMatch[0].length).trim(); hadLevel = true; }
  var dm = raw.match(/\d+/);
  if (dm) {
    var i = dm.index - 1;
    while (i >= 0 && /[\s\-:.,;(]/.test(raw[i])) i--;
    var we = i + 1;
    while (i >= 0 && /[a-zA-Z]/.test(raw[i])) i--;
    var ws = i + 1;
    var word = raw.slice(ws, we);
    if (word.length >= 3 && word.length <= 8 && /[eua]/i.test(word) && /[lsvy]$/i.test(word)) {
      var ca = ws - 1;
      while (ca >= 0 && /[\s\-:.,;(]/.test(raw[ca])) ca--;
      raw = raw.slice(0, ca + 1); hadLevel = true;
    } else if (dm) {
      raw = raw.replace(/[\s\-]+\d+\s*$/, "").trim();
      if (raw.length < dm.index + dm[0].length) hadLevel = true;
    }
  }
  raw = raw.replace(/(?<=[a-zA-Z\d])\s+[lLjJiI1]\s*$/, "").trim();
  raw = raw.replace(/[\s\-|_.,;:!?]+$/, "").trim();
  return { text: raw, hadLevel };
}
function resolveOcrName(raw) {
  if (!raw) return raw;
  var stripped = stripLevelSuffix(raw).text;
  stripped = stripped.trim().replace(/(\s+\d+)+\s*$/,"").trim().replace(/\s+[lLjJiI1]\s*$/,"").trim();
  if (!allMonsters.length) return stripped;
  const lower = stripped.toLowerCase();
  for (const m of allMonsters) if (m.name.toLowerCase() === lower) return m.name;
  const parts = stripped.split(/\s+/);
  while (parts.length > 1) {
    parts.pop();
    const sub = parts.join(" ").toLowerCase();
    for (const m of allMonsters) {
      if (m.name.toLowerCase() === sub) { dbg('OCR "'+stripped+'"→"'+m.name+'"'); return m.name; }
    }
  }
  return stripped;
}

// Main lookup
async function lookup(name) {
  if (!name) return;
  setStatus("busy", `🔍 Searching for "${name}"...`);
  showDrops();
  document.getElementById("subtitle").textContent = name;
  document.getElementById("search-input").value = name;
  document.getElementById("drops").innerHTML = "";
  let title = null;
  try {
    const r = await fetch(`${WIKI}?action=opensearch&search=${encodeURIComponent(name)}&limit=5&format=json&origin=*`);
    const d = await r.json();
    if (d[1]?.length) title = d[1][0];
  } catch(e) { setStatus("err","❌ Network error: " + e.message); return; }
  if (!title) { setStatus("err", `⚠️ "${name}" not found.`); return; }
  await lookupPage(title);
}

async function lookupPage(title) {
  setStatus("busy", `📄 Loading: ${title}...`);
  document.getElementById("subtitle").textContent = title;
  const npcImg = document.getElementById("npc-img"), logo = document.getElementById("titlebar-logo");
  npcImg.style.display = "none"; logo.style.display = "inline";
  try { const isD = await checkDisambig(title); if (isD) { const links = await getDisambigLinks(title); showDisambigOptions(title, links); return; } } catch(e) {}
  const imgUrl = await fetchNpcImage(title);
  if (imgUrl) {
    npcImg.src = imgUrl; npcImg.style.display = "block"; logo.style.display = "none";
    npcImg.onerror = () => { npcImg.style.display = "none"; logo.style.display = "inline"; };
  }
  const rows = await fetchNpcDropsBucket(title);
  const uniqueNames = Array.from(new Set(rows.map(r => r.name).filter(Boolean)));
  const iconMap = new Map();
  await Promise.all(uniqueNames.map(async n => { iconMap.set(n, await fetchItemIcon(n)); }));
  rows.forEach(r => { r.img = iconMap.get(r.name) || ""; });
  dbg(`LOOKUP: ${rows.length} rows for "${title}"`);
  if (!rows.length) { await suggestAlternatives(title); return; }

  // ── Build wiki-style ordered sections ───────────────────────────────────
  const sectionsMap = new Map();
  for (const row of rows) {
    const key = row.section;
    if (!sectionsMap.has(key)) sectionsMap.set(key, []);
    sectionsMap.get(key).push({ name: row.name, qty: row.qty, rarity: row.rarity, img: row.img });
  }
  const sections = Array.from(sectionsMap.entries())
    .sort(([a],[b]) => {
      const ai = TABLE_ORDER.indexOf(a), bi = TABLE_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    .map(([name, secRows]) => ({ name, rows: secRows }));
  // ────────────────────────────────────────────────────────────────────────

  setStatus("ok", `✅ ${rows.length} drops for ${title}`);
  showDrops();
  renderAllSections([{ label: "Drops", isHard: false, sections }]);
  saveNavState("drops", title, title, 0);
}

async function fetchNpcImage(title) {
  try {
    const r = await fetch(`${WIKI}?action=query&prop=pageimages&titles=${encodeURIComponent(title)}&pithumbsize=80&piprop=thumbnail&format=json&origin=*`);
    const d = await r.json();
    const pages = d?.query?.pages;
    if (!pages) return null;
    return Object.values(pages)[0]?.thumbnail?.source || null;
  } catch(e) { return null; }
}

function renderAllSections(variants) {
  const container = document.getElementById("drops"); container.innerHTML = "";
  const showLabels = variants.length > 1;
  for (const variant of variants) {
    if (!variant.sections.length) continue;
    if (showLabels) {
      const color = variant.isHard ? "#5c1a1a" : "#1a3a5c";
      const hdr = document.createElement("div");
      hdr.style.cssText = `background:${color};padding:5px 12px;font-size:11px;font-weight:700;letter-spacing:1px;color:#fff;border-bottom:2px solid rgba(0,0,0,.3);text-transform:uppercase;position:sticky;top:0;z-index:2;`;
      hdr.textContent = (variant.isHard ? "💀 " : "⚔ ") + variant.label;
      container.appendChild(hdr);
    }
    for (const sec of variant.sections) {
      if (!sec.rows.length) continue;
      container.appendChild(makeSectionBlock(sec));
    }
  }
}

function makeSectionBlock(sec, onRowClick) {
  const wrapper = document.createElement("div"); wrapper.className = "section-wrapper";
  const startCollapsed = sec.rows.length > 25;
  const icon = TABLE_ICONS[sec.name] || "📦";
  const accentColor = TABLE_COLORS[sec.name] || "var(--bg3)";
  const hdr = document.createElement("div");
  hdr.className = "section-hdr" + (startCollapsed ? " collapsed" : "");
  hdr.style.borderLeft = `3px solid ${accentColor}`;
  hdr.innerHTML = `<span class="hdr-left"><span class="chevron">▼</span><span>${icon} ${sec.name}</span></span><span class="row-count">${sec.rows.length} items</span>`;
  const body = document.createElement("div");
  body.className = "section-body" + (startCollapsed ? " collapsed" : "");
  for (const row of sec.rows) body.appendChild(makeDropRow(row, onRowClick));
  if (!startCollapsed) requestAnimationFrame(() => { body.style.maxHeight = body.scrollHeight + "px"; });
  hdr.addEventListener("click", () => {
    const collapsed = hdr.classList.toggle("collapsed");
    if (collapsed) { body.style.maxHeight = body.scrollHeight + "px"; requestAnimationFrame(() => body.classList.add("collapsed")); }
    else {
      body.classList.remove("collapsed"); body.style.maxHeight = body.scrollHeight + "px";
      body.addEventListener("transitionend", () => { if (!hdr.classList.contains("collapsed")) body.style.maxHeight = "none"; }, { once: true });
    }
  });
  wrapper.appendChild(hdr); wrapper.appendChild(body); return wrapper;
}

function makeDropRow(row, onRowClick) {
  const el = document.createElement("div"); el.className = "drop-row clickable";
  el.title = 'Find all sources for "' + row.name + '"';
  el.addEventListener("click", () => {
    if (onRowClick) { onRowClick(row); return; }
    currentMode = "item";
    document.querySelectorAll(".mode-tab").forEach(t => t.classList.toggle("active", t.dataset.mode === "item"));
    document.getElementById("search-input").placeholder = "Search items...";
    lookupItemSources(row.name);
  });
  if (row.img) {
    const img = document.createElement("img"); img.className = "item-img"; img.src = row.img; img.alt = row.name;
    img.onerror = function() { this.replaceWith(placeholder(row.name)); }; el.appendChild(img);
  } else el.appendChild(placeholder(row.name));
  const info = document.createElement("div"); info.className = "item-info";
  const nm = document.createElement("div"); nm.className = "item-name"; nm.textContent = row.name; info.appendChild(nm);
  if (row.qty) { const q = document.createElement("div"); q.className = "item-qty"; q.textContent = "x"+row.qty; info.appendChild(q); }
  el.appendChild(info);
  if (row.rarity) {
    const { label, cls } = rarityClass(row.rarity);
    const wrap = document.createElement("div"); wrap.className = "rarity";
    const badge = document.createElement("span"); badge.className = "badge " + cls; badge.textContent = label;
    wrap.appendChild(badge); el.appendChild(wrap);
  }
  const arrow = document.createElement("span"); arrow.style.cssText = "color:var(--dim);font-size:10px;flex-shrink:0;margin-left:1px;"; arrow.textContent = "›";
  el.appendChild(arrow); return el;
}
function placeholder(name) {
  const d = document.createElement("div"); d.className = "item-placeholder"; d.textContent = (name||"?").charAt(0).toUpperCase(); return d;
}

function rarityToChance(r) {
  if (!r) return -1;
  const s = r.toLowerCase().trim();
  if (s === "always") return 2;
  const m = s.match(/(\d[\d,.]*)\/(\d[\d,.]*)/);
  if (m) { const n = parseFloat(m[1].replace(/,/g,"")), d = parseFloat(m[2].replace(/,/g,"")); if (d > 0) return n/d; }
  if (s.includes("always")) return 2;
  if (s.includes("very rare")) return 0.001;
  if (s.includes("rare")) return 0.01;
  if (s.includes("uncommon")) return 0.1;
  if (s.includes("common")) return 0.5;
  return -1;
}

// Item sources
async function lookupItemSources(name) {
  if (!name) return;
  setStatus("busy", `🔍 Finding drop sources for "${name}"...`);
  showDrops();
  document.getElementById("subtitle").textContent = name;
  document.getElementById("search-input").value = name;
  document.getElementById("drops").innerHTML = "";
  document.getElementById("npc-img").style.display = "none";
  document.getElementById("titlebar-logo").style.display = "inline";
  let title = null;
  try {
    const r = await fetch(`${WIKI}?action=opensearch&search=${encodeURIComponent(name)}&limit=5&format=json&origin=*`);
    const d = await r.json(); if (d[1]?.length) title = d[1][0];
  } catch(e) { setStatus("err","❌ Network error: " + e.message); return; }
  if (!title) { setStatus("err", `⚠️ "${name}" not found.`); return; }
  try { const isD = await checkDisambig(title); if (isD) { const links = await getDisambigLinks(title); showDisambigOptions(title, links, `"${title}" could be multiple items. Which one?`); return; } } catch(e) {}
  const imgUrl = await fetchNpcImage(title);
  if (imgUrl) {
    const ni = document.getElementById("npc-img"); ni.src = imgUrl; ni.style.display = "block";
    document.getElementById("titlebar-logo").style.display = "none";
    ni.onerror = () => { ni.style.display = "none"; document.getElementById("titlebar-logo").style.display = "inline"; };
  }
  let sources;
  try { sources = await fetchItemSourcesBucket(title); }
  catch(e) { dbg("Bucket item sources error: " + e.message); setStatus("err","❌ Error loading drop sources."); return; }
  if (!sources || !sources.length) {
    setStatus("err", `⚠️ No drop sources found for "${title}".`);
    document.getElementById("drops").innerHTML = `<div style="padding:16px;text-align:center;color:var(--dim);font-size:11px;"><div style="font-size:24px;margin-bottom:8px;">🔍</div><div style="color:var(--text);margin-bottom:4px;">${title}</div><div>No drop sources found on the wiki for this item.</div><div style="margin-top:8px;">Try the <strong>NPC Drops</strong> tab to look up a monster directly.</div></div>`;
    return;
  }
  setStatus("ok", `✅ ${sources.length} source${sources.length===1?"":"s"} drop "${title}"`);
  renderDropSources(sources, title);
  saveNavState("drops", title, title, 0);
}

function renderDropSources(sources, itemTitle) {
  const container = document.getElementById("drops"); container.innerHTML = "";
  const banner = document.createElement("div");
  banner.style.cssText = "background:#1a3a5c;padding:5px 12px;font-size:11px;font-weight:700;letter-spacing:1px;color:#fff;border-bottom:2px solid rgba(0,0,0,.3);text-transform:uppercase;position:sticky;top:0;z-index:2;";
  banner.textContent = "🎒 Drop Sources — " + itemTitle; container.appendChild(banner);
  const hint = document.createElement("div");
  hint.style.cssText = "padding:4px 12px;font-size:10px;color:var(--dim);border-bottom:1px solid var(--border);background:var(--bg2);";
  hint.textContent = "Tap a monster to view its full drop table →"; container.appendChild(hint);
  const BUCKETS = [
    {key:"always",label:"Always",icon:"⭐",min:2,max:Infinity},
    {key:"high",label:"High",icon:"🟢",min:0.8,max:2},
    {key:"medium",label:"Medium",icon:"🟡",min:0.5,max:0.8},
    {key:"low",label:"Low",icon:"🔴",min:-1,max:0.5}
  ];
  const withChance = sources.map(s => ({...s, _chance: rarityToChance(s.rarity)}));
  withChance.sort((a,b) => { const ac=a._chance<0?-2:a._chance, bc=b._chance<0?-2:b._chance; return bc-ac; });
  const bucketMap = {}; for (const b of BUCKETS) bucketMap[b.key] = [];
  for (const src of withChance) {
    const c = src._chance;
    if (c >= 2) bucketMap.always.push(src);
    else if (c >= 0.8) bucketMap.high.push(src);
    else if (c >= 0.5) bucketMap.medium.push(src);
    else bucketMap.low.push(src);
  }
  const onRowClick = src => { currentMode = "npc"; document.querySelectorAll(".mode-tab").forEach(t => t.classList.toggle("active", t.dataset.mode==="npc")); document.getElementById("search-input").placeholder = "Search NPCs..."; lookup(src.name); };
  function makeSourceRow(src) {
    const el = document.createElement("div"); el.className = "drop-row clickable"; el.title = "View full drops for " + src.name;
    el.addEventListener("click", () => onRowClick(src));
    if (src.img) { const img = document.createElement("img"); img.className = "item-img"; img.src = src.img; img.alt = src.name; img.onerror = function(){this.replaceWith(placeholder(src.name));}; el.appendChild(img); }
    else el.appendChild(placeholder(src.name));
    const info = document.createElement("div"); info.className = "item-info";
    const nm = document.createElement("div"); nm.className = "item-name"; nm.textContent = src.name; info.appendChild(nm);
    const sub = []; if (src.level) sub.push("Lvl "+src.level); if (src.qty) sub.push("Qty: "+src.qty);
    if (sub.length) { const q = document.createElement("div"); q.className = "item-qty"; q.textContent = sub.join(" · "); info.appendChild(q); }
    el.appendChild(info);
    if (src.rarity) { const {label,cls} = rarityClass(src.rarity); const wrap = document.createElement("div"); wrap.className = "rarity"; const badge = document.createElement("span"); badge.className = "badge "+cls; badge.textContent = label; wrap.appendChild(badge); el.appendChild(wrap); }
    const arrow = document.createElement("span"); arrow.style.cssText = "color:var(--dim);font-size:11px;flex-shrink:0;margin-left:2px;"; arrow.textContent = "›"; el.appendChild(arrow); return el;
  }
  const borderColors = {always:"#4caf50",high:"#81c784",medium:"#ffb74d",low:"#e57373"};
  let anyRendered = false;
  for (const b of BUCKETS) {
    const rows = bucketMap[b.key]; if (!rows.length) continue; anyRendered = true;
    const wrapper = document.createElement("div"); wrapper.className = "section-wrapper";
    const hdr = document.createElement("div"); hdr.className = "section-hdr"; hdr.style.borderLeft = `3px solid ${borderColors[b.key]}`;
    hdr.innerHTML = `<span class="hdr-left"><span class="chevron">▼</span><span>${b.icon} ${b.label}</span></span><span class="row-count">${rows.length}</span>`;
    const body = document.createElement("div"); body.className = "section-body";
    for (const src of rows) body.appendChild(makeSourceRow(src));
    requestAnimationFrame(() => { body.style.maxHeight = body.scrollHeight + "px"; });
    hdr.addEventListener("click", () => {
      const c = hdr.classList.toggle("collapsed");
      if (c) { body.style.maxHeight = body.scrollHeight + "px"; requestAnimationFrame(() => body.classList.add("collapsed")); }
      else { body.classList.remove("collapsed"); body.style.maxHeight = body.scrollHeight + "px"; body.addEventListener("transitionend", () => { if (!hdr.classList.contains("collapsed")) body.style.maxHeight = "none"; }, {once:true}); }
    });
    wrapper.appendChild(hdr); wrapper.appendChild(body); container.appendChild(wrapper);
  }
  if (!anyRendered) container.innerHTML += '<div style="padding:16px;text-align:center;color:var(--dim);font-size:11px;">No sources to display.</div>';
}

// UI events
const searchInput = document.getElementById("search-input");
searchInput.addEventListener("input", () => { if (inDropsView || currentMode === "item") return; clearTimeout(searchTimer); searchTimer = setTimeout(() => renderNpcList(searchInput.value), 150); });
document.getElementById("search-btn").addEventListener("click", () => { const v = searchInput.value.trim(); if (!v) return; if (currentMode === "item") lookupItemSources(v); else lookup(v); });
searchInput.addEventListener("keydown", e => { if (e.key !== "Enter") return; const v = searchInput.value.trim(); if (!v) return; if (currentMode === "item") lookupItemSources(v); else lookup(v); });
document.getElementById("back-btn").addEventListener("click", () => { navHistory[currentMode] = null; showBrowser(); searchInput.value = ""; if (currentMode === "npc") renderNpcList(""); else document.getElementById("npc-list").innerHTML = '<div id="npc-empty">Type an item name and press Search.<br><small>e.g. "Dragon bones", "Abyssal whip"</small></div>'; setStatus("",""); });
document.getElementById("close").addEventListener("click", () => { fetch("https://bolt-api/close", {method:"POST"}).catch(()=>{}); });

function handleMsg(text) {
  if (text.startsWith("LOOKUP:")) lookup(text.slice(7));
  else if (text === "FOCUS_SEARCH") { searchInput.value = ""; searchInput.focus(); if (inDropsView) { showBrowser(); renderNpcList(""); } }
}
window.addEventListener("message", evt => {
  if (!evt.data) return;
  if (evt.data.type === "pluginMessage" && evt.data.content) handleMsg(new TextDecoder().decode(new Uint8Array(evt.data.content)).trim());
  else if (typeof evt.data === "string") handleMsg(evt.data.trim());
});

// ── Alt1 Integration ──────────────────────────────────────────────────────────
let _alt1Badge = null;
function flashBadge(color) { if (!_alt1Badge) return; _alt1Badge.style.background = color||"#4caf50"; setTimeout(()=>{ _alt1Badge.style.background="#e94560"; }, 1500); }
let alt1InitDone = false;
function tryInitAlt1() {
  if (alt1InitDone || typeof window.alt1 === "undefined") return;
  alt1InitDone = true;

  // Hide close button — Bolt-only feature
  const closeBtn = document.getElementById("close");
  if (closeBtn) closeBtn.style.display = "none";

  const badge = document.createElement("div"); badge.id = "alt1badge";
  badge.style.cssText = "position:fixed;top:4px;right:30px;background:#e94560;color:#fff;font-size:9px;padding:1px 5px;border-radius:2px;font-weight:700;z-index:100;cursor:pointer;";
  badge.textContent = "ALT1"; badge.title = "Click to manually read screen";
  document.body.appendChild(badge); _alt1Badge = badge;
  dbg("alt1 v" + window.alt1.version);
  try { window.alt1.identifyAppUrl("./appconfig.json"); } catch(e) { dbg("identifyApp err: " + e.message); }

  var a1lib = null, a1script = document.createElement("script");
  a1script.src = "./alt1base.bundle.js";
  a1script.onload = function() {
    var attempts = 0;
    function tryA1lib() {
      a1lib = window.A1lib;
      if (a1lib && typeof a1lib.captureHoldFullRs === "function") {
        dbg("A1lib loaded");
        loadAnchors();
        a1lib.on("alt1pressed", function(e) {
          dbg("alt1pressed x=" + e.x + " y=" + e.y);
          readExamineWindow();
        });
        dbg("Alt+1 hook registered");

        // Log OCR readiness
        const ocr = getOCR();
        dbg(ocr ? "✅ window.OCR loaded" : "⏳ window.OCR not ready yet — will retry on first Alt+1");

      } else if (attempts < 30) { attempts++; setTimeout(tryA1lib, 100); }
      else dbg("A1lib unavailable");
    }
    tryA1lib();
  };
  a1script.onerror = function() {
    dbg("Failed to load alt1base.bundle.js");
    setStatus("ok", "Alt1 — right-click NPC, hover Examine, press Alt+1");
  };
  document.head.appendChild(a1script);

  function processOpenInfo(info) {
    if (!info) return false;
    let text = info;
    if (typeof info === "string") { try { const p = JSON.parse(info); text = p.text||p.match||p.string||JSON.stringify(p); } catch(e) {} }
    const parsed = parseExamineText(text);
    if (parsed) {
      const stripped = stripLevelSuffix(parsed);
      const name = resolveOcrName(stripped.text);
      dbg('openInfo: "'+parsed+'" -> "'+name+'" hadLevel='+stripped.hadLevel);
      flashBadge("#4caf50");
      if (stripped.hadLevel) {
        currentMode = "npc"; document.querySelectorAll(".mode-tab").forEach(t => t.classList.toggle("active", t.dataset.mode==="npc"));
        document.getElementById("search-input").placeholder = "Search NPCs..."; document.getElementById("search-input").value = name;
        setStatus("busy","NPC: "+name);
        setTimeout(() => { showDrops(); document.getElementById("subtitle").textContent = name; document.getElementById("drops").innerHTML = ""; lookupPage(name); }, 200);
      } else {
        currentMode = "item"; document.querySelectorAll(".mode-tab").forEach(t => t.classList.toggle("active", t.dataset.mode==="item"));
        document.getElementById("search-input").placeholder = "Search items..."; document.getElementById("search-input").value = name;
        setStatus("busy","Item: "+name); setTimeout(() => lookupItemSources(name), 200);
      }
      return true;
    }
    return false;
  }

  if (!processOpenInfo(window.alt1.openInfo)) setStatus("ok","Alt1 — right-click NPC, hover Examine, press Alt+1");
  let lastOpenInfo = JSON.stringify(window.alt1.openInfo);
  setInterval(() => { const cur = JSON.stringify(window.alt1.openInfo); if (cur !== lastOpenInfo) { lastOpenInfo = cur; processOpenInfo(window.alt1.openInfo); } }, 200);
  badge.addEventListener("click", () => { flashBadge("#f5c518"); if (a1lib) readExamineWindow(); else dbg("A1lib not loaded yet"); });
}
tryInitAlt1();
(function() { var elapsed=0, poll=setInterval(()=>{ elapsed+=500; if(alt1InitDone||elapsed>=30000) clearInterval(poll); else tryInitAlt1(); }, 500); })();

// Anchors + OCR
var anchorTL=null, anchorBR=null, anchorExamine=null, anchorsLoading=false;
async function loadAnchors() {
  if (anchorTL && anchorBR && anchorExamine) return true;
  if (anchorsLoading) return false;
  anchorsLoading = true;
  try {
    const ID = window.A1lib.ImageDetect;
    anchorTL = await ID.imageDataFromUrl("./TopLeft.png");
    anchorBR = await ID.imageDataFromUrl("./BottomRight.png");
    anchorExamine = await ID.imageDataFromUrl("./Examine.png");
    dbg("Anchors loaded"); return true;
  } catch(e) { dbg("Anchor load error: " + e.message); anchorsLoading = false; return false; }
}

function imgDataToCanvas(d) {
  const c = document.createElement("canvas"); c.width=d.width; c.height=d.height;
  const ctx = c.getContext("2d"); const id = ctx.createImageData(d.width,d.height);
  id.data.set(d.data); ctx.putImageData(id,0,0); return c;
}
function scaleCanvas(src, scale) {
  const dst = document.createElement("canvas"); dst.width=src.width*scale; dst.height=src.height*scale;
  const ctx = dst.getContext("2d"); ctx.imageSmoothingEnabled=false; ctx.drawImage(src,0,0,dst.width,dst.height); return dst;
}

async function readExamineWindow() {
  if (!window.alt1 || !window.alt1.permissionPixel) { setStatus("err","Pixel permission not granted"); return; }
  setStatus("busy","Scanning for Examine window...");
  if (!(await loadAnchors())) { setStatus("err","Anchor images missing"); return; }
  try {
    const a1lib = window.A1lib, screen = a1lib.captureHoldFullRs();
    if (!screen) { setStatus("err","Screen capture failed"); return; }
    const tlHits=screen.findSubimage(anchorTL), brHits=screen.findSubimage(anchorBR), exHits=screen.findSubimage(anchorExamine);
    dbg("Hits TL:"+tlHits.length+" BR:"+brHits.length+" Ex:"+exHits.length);
    if (!tlHits.length) { setStatus("err","Examine window not found"); return; }
    let bestMatch = null;
    if (brHits.length) {
      for (const t of tlHits) for (const b of brHits) {
        if (b.x<t.x||b.y<t.y+anchorTL.height) continue;
        const w=b.x+anchorBR.width-t.x, h=b.y+anchorBR.height-t.y;
        if (w>800||h>500) continue;
        let ex=null;
        for (const e of exHits) { if (e.x>=t.x&&e.x+anchorExamine.width<=b.x+anchorBR.width&&e.y>=t.y+anchorTL.height&&e.y+anchorExamine.height<=b.y) { ex=e; break; } }
        const score=(ex?0:1e9)+w*h;
        if (!bestMatch||score<bestMatch.score) bestMatch={tl:t,br:b,ex,score};
      }
    }
    if (!bestMatch&&tlHits.length) { const t=tlHits[0]; const ex=exHits.find(e=>e.y>t.y&&e.x>=t.x)||exHits[0]||null; dbg("No BR — TL-only fallback"); bestMatch={tl:t,br:null,ex,score:0}; }
    if (!bestMatch) { setStatus("err","Examine window not found"); return; }
    const {tl,br,ex} = bestMatch;
    const PAD=3; let nameAbsX,nameAbsY,nameW,nameH;
    if (ex) { nameAbsX=ex.x+anchorExamine.width+3; nameAbsY=ex.y-PAD; nameH=anchorExamine.height+PAD*2; nameW=br?br.x+anchorBR.width-nameAbsX:Math.min(screen.width-nameAbsX,400); }
    else if (br) { nameAbsX=tl.x; nameAbsY=tl.y+anchorTL.height-PAD; nameW=br.x+anchorBR.width-tl.x; nameH=br.y-(tl.y+anchorTL.height)+PAD*2; }
    else { nameAbsX=tl.x; nameAbsY=tl.y+anchorTL.height-PAD; nameW=Math.min(screen.width-tl.x,400); nameH=30+PAD*2; }
    if (nameAbsY<0){nameH+=nameAbsY;nameAbsY=0;}
    if (nameAbsX<0){nameW+=nameAbsX;nameAbsX=0;}
    if (nameAbsX+nameW>screen.width) nameW=screen.width-nameAbsX;
    if (nameAbsY+nameH>screen.height) nameH=screen.height-nameAbsY;
    if (nameW<=0){setStatus("err","Name crop zero-width");return;}
    const stripRaw=screen.toData(nameAbsX,nameAbsY,nameW,nameH);
    const SW=stripRaw.width||nameW, SH=stripRaw.height||nameH, SD=stripRaw.data;
    const colBright=new Uint8Array(SW);
    for(let cx=0;cx<SW;cx++) for(let cy=0;cy<SH;cy++){const si=(cy*SW+cx)*4;if((SD[si]+SD[si+1]+SD[si+2])/3>55){colBright[cx]=1;break;}}
    const gaps=[]; let inGap=false,gapStart=0;
    for(let gx=0;gx<SW;gx++){if(!colBright[gx]&&!inGap){inGap=true;gapStart=gx;}else if(colBright[gx]&&inGap){gaps.push({start:gapStart,end:gx-1});inGap=false;}}
    if(inGap) gaps.push({start:gapStart,end:SW-1});
    let clipCol=SW;
    for(let gi=gaps.length-1;gi>=0;gi--){const g=gaps[gi];if(g.end-g.start+1<2)continue;let hL=false,hR=false;for(let lx=g.start-1;lx>=0;lx--)if(colBright[lx]){hL=true;break;}for(let rx=g.end+1;rx<SW;rx++)if(colBright[rx]){hR=true;break;}if(hL&&hR){clipCol=g.start;break;}}
    const cW=Math.max(1,clipCol), cD={width:cW,height:SH,data:new Uint8ClampedArray(cW*SH*4)};
    for(let r=0;r<SH;r++) for(let c=0;c<cW;c++){const s=(r*SW+c)*4,d=(r*cW+c)*4;cD.data[d]=SD[s];cD.data[d+1]=SD[s+1];cD.data[d+2]=SD[s+2];cD.data[d+3]=255;}
    const scaled=scaleCanvas(imgDataToCanvas(cD),4);
    const ctx=scaled.getContext("2d"), px=ctx.getImageData(0,0,scaled.width,scaled.height);
    let avg=0; for(let i=0;i<px.data.length;i+=4) avg+=(px.data[i]+px.data[i+1]+px.data[i+2])/3;
    avg/=px.data.length/4;
    if(avg<128){const inv=ctx.createImageData(scaled.width,scaled.height);for(let i=0;i<px.data.length;i+=4){inv.data[i]=255-px.data[i];inv.data[i+1]=255-px.data[i+1];inv.data[i+2]=255-px.data[i+2];inv.data[i+3]=255;}ctx.putImageData(inv,0,0);}
    const oc=getOrCreateOcrCanvas(); oc.width=scaled.width; oc.height=scaled.height;
    oc.getContext("2d").drawImage(scaled,0,0); oc.style.bottom=settings.debugLog?DEBUG_OVERLAY_HEIGHT+"px":"0px";
    if(settings.ocrCanvas) oc.style.display="block";
    setStatus("busy","Running OCR...");

    // ── OCR using window.OCR + loaded font ──────────────────────────────────
    const ocr = getOCR();
    if (!ocr) { setStatus("err","OCR module not loaded"); return; }
    const font = await loadFont();
    if (!font) { setStatus("err","OCR font not available"); return; }

    const ocrImgData = ctx.getImageData(0,0,scaled.width,scaled.height);
    // Build an A1lib ImageData from the canvas pixels
    const a1Img = new window.A1lib.ImageData(scaled.width, scaled.height, ocrImgData.data);

    // The rightclick font uses white text on the dark RS background.
    // For the examine tooltip strip we scan with white [255,255,255].
    const textColor = [255, 255, 255];

    let result;
    try {
      // findReadLine scans the strip for the best character start position automatically
      result = ocr.findReadLine(a1Img, font, [textColor], Math.floor(a1Img.width/2), Math.floor(a1Img.height/2));
    } catch(e) { dbg("OCR error: " + e.message); setStatus("err","OCR error: " + e.message.slice(0,60)); return; }

    const tesseractRaw = (result?.text || "").trim();
    dbg('OCR raw: "' + tesseractRaw + '"');
    // ──────────────────────────────────────────────────────────────────────

    const stripped = stripLevelSuffix(tesseractRaw);
    dbg('rawAfter="'+stripped.text+'" levelWasStripped='+stripped.hadLevel);
    if (!stripped.text || stripped.text.length < 2) { setStatus("err","OCR returned no text"); return; }
    const resolved = resolveOcrName(stripped.text);
    dbg('resolved="'+resolved+'"'); flashBadge("#4caf50");
    if (stripped.hadLevel) {
      currentMode="npc"; document.querySelectorAll(".mode-tab").forEach(t=>t.classList.toggle("active",t.dataset.mode==="npc"));
      document.getElementById("search-input").placeholder="Search NPCs..."; document.getElementById("search-input").value=resolved;
      setStatus("busy","NPC: "+resolved); showDrops(); document.getElementById("subtitle").textContent=resolved; document.getElementById("drops").innerHTML=""; lookupPage(resolved);
    } else {
      currentMode="item"; document.querySelectorAll(".mode-tab").forEach(t=>t.classList.toggle("active",t.dataset.mode==="item"));
      document.getElementById("search-input").placeholder="Search items..."; document.getElementById("search-input").value=resolved;
      setStatus("busy","Item: "+resolved); lookupItemSources(resolved);
    }
  } catch(e) { dbg("readExamineWindow error: " + e.message); setStatus("err","Error: " + e.message.slice(0,80)); }
}

function parseExamineText(text) {
  if (!text) return null;
  const m = text.match(/Examine[^a-z]+(.+)/i);
  return m ? m[1].trim() : null;
}

// Init
applyToggleUI(); showBrowser(); searchInput.focus(); loadMonsterList();
