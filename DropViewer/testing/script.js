// Drop Viewer - Alt1 OCR Version
// State & Helpers

// --- Global state ---
const dvState = {
    alt1Ready: false,
    ocrFont: null,
    ocrInitialized: false,

    menuRegion: null,
    lastMenuItems: [],
    lastMenuRawText: "",
    polling: false,
    pollIntervalId: null,

    currentNpc: null,
    npcList: [],
    drops: [],
    filteredDrops: [],
    searchQuery: "",

    el: {}
};

// --- Simple placeholder NPC list ---
const POPULAR_NPCS = [
    { id: "nex", name: "Nex" },
    { id: "vindicta", name: "Vindicta" },
    { id: "kree", name: "Kree'arra" },
    { id: "graardor", name: "General Graardor" }
];

// --- Helpers ---
function dvLog(...args) {
    console.log("[DropViewer]", ...args);
}

function $(sel) {
    return document.querySelector(sel);
}

function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
}

function formatTime(ts) {
    const d = ts instanceof Date ? ts : new Date(ts);
    return d.toLocaleTimeString();
}

function debounce(fn, delay) {
    let t = null;
    return function (...args) {
        if (t) clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), delay);
    };
}

// UI Wiring & Rendering

function initUiRefs() {
    dvState.el.titleNpcName = $("#npc-name");
    dvState.el.titleSubtitle = $("#subtitle");
    dvState.el.npcImg = $("#npc-img");
    dvState.el.closeBtn = $("#close");

    dvState.el.searchInput = $("#search-input");
    dvState.el.npcList = $("#npc-list");
    dvState.el.dropTableBody = $("#drop-tbody");
    dvState.el.status = $("#status");
    dvState.el.menuPreview = $("#menu-preview");
}

function renderNpcList() {
    const listEl = dvState.el.npcList;
    if (!listEl) return;

    listEl.innerHTML = "";
    dvState.npcList.forEach(npc => {
        const row = createEl("div", "npc-item");
        row.dataset.id = npc.id;

        const nameEl = createEl("div", "npc-name", npc.name);
        row.appendChild(nameEl);

        if (dvState.currentNpc && dvState.currentNpc.id === npc.id) {
            row.classList.add("active");
        }

        row.addEventListener("click", () => setCurrentNpc(npc));
        listEl.appendChild(row);
    });
}

function setCurrentNpc(npc) {
    dvState.currentNpc = npc;
    renderNpcList();
    updateTitlebar();
    filterDrops();
}

function updateTitlebar() {
    if (dvState.el.titleNpcName) {
        dvState.el.titleNpcName.textContent = dvState.currentNpc
            ? dvState.currentNpc.name
            : "No NPC Selected";
    }
    if (dvState.el.titleSubtitle) {
        dvState.el.titleSubtitle.textContent = dvState.alt1Ready
            ? "Alt1 OCR active - Right-click menu to record drops"
            : "Waiting for Alt1 / OCR...";
    }
}

function renderDrops() {
    const tbody = dvState.el.dropTableBody;
    if (!tbody) return;

    tbody.innerHTML = "";

    const rows = dvState.filteredDrops.length
        ? dvState.filteredDrops
        : dvState.drops;

    rows.forEach(drop => {
        const tr = createEl("tr", "drop-row");

        tr.appendChild(createEl("td", "drop-time", formatTime(drop.ts)));
        tr.appendChild(createEl("td", "drop-npc", drop.npc));
        tr.appendChild(createEl("td", "drop-item", drop.item));
        tr.appendChild(createEl("td", "drop-qty", drop.qty != null ? String(drop.qty) : ""));

        tbody.appendChild(tr);
    });
}

function setStatus(msg) {
    if (dvState.el.status) dvState.el.status.textContent = msg;
}

function setSearchQuery(q) {
    dvState.searchQuery = q.trim().toLowerCase();
    filterDrops();
}

function filterDrops() {
    const q = dvState.searchQuery;
    if (!q) {
        dvState.filteredDrops = [];
    } else {
        dvState.filteredDrops = dvState.drops.filter(d =>
            (d.item && d.item.toLowerCase().includes(q)) ||
            (d.npc && d.npc.toLowerCase().includes(q))
        );
    }
    renderDrops();
}

// Alt1 & OCR Initialization

function detectAlt1() {
    try {
        if (window.alt1 && alt1.version) {
            dvState.alt1Ready = true;
            dvLog("Alt1 detected:", alt1.version);
            return true;
        }
    } catch {}
    dvState.alt1Ready = false;
    dvLog("Alt1 not detected.");
    return false;
}

async function initOcr() {
    if (!dvState.alt1Ready) detectAlt1();
    if (!dvState.alt1Ready) {
        setStatus("Alt1 not detected. Open inside Alt1.");
        return;
    }

    if (dvState.ocrInitialized) return;

    try {
        dvLog("Loading OCR font...");
        dvState.ocrFont = await a1lib.ocr.loadFont("small"); // right-click menu font
        dvState.ocrInitialized = true;
        setStatus("Alt1 OCR ready.");
        updateTitlebar();
    } catch (e) {
        dvLog("OCR init error:", e);
        setStatus("Failed to load OCR font.");
    }
}

function captureMenuImage() {
    if (!dvState.alt1Ready) return null;

    let r = dvState.menuRegion;
    if (!r) {
        const w = 300, h = 250;
        const screenW = alt1.rsWidth || 800;
        const screenH = alt1.rsHeight || 600;
        r = { x: (screenW - w) / 2, y: (screenH - h) / 2, w, h };
    }

    try {
        const img = a1lib.capture(r.x, r.y, r.w, r.h);
        return { img, region: r };
    } catch {
        return null;
    }
}

// OCR & Drop Extraction

function readMenuText() {
    if (!dvState.ocrInitialized) return null;

    const cap = captureMenuImage();
    if (!cap) return null;

    const { img, region } = cap;

    try {
        const lines = a1lib.ocr.readLines(img, dvState.ocrFont);
        if (!lines || !lines.length) return null;

        lines.sort((a, b) => a.y - b.y);

        const items = lines.map(l => l.text.trim()).filter(Boolean);

        dvState.lastMenuItems = items;
        dvState.lastMenuRawText = items.join("\n");

        if (dvState.el.menuPreview)
            dvState.el.menuPreview.textContent = dvState.lastMenuRawText;

        return items;
    } catch {
        return null;
    }
}

function parseDropFromMenu(items) {
    if (!items || !items.length) return null;

    let takeLine = items.find(t => /^take\s+/i.test(t));
    if (!takeLine) return null;

    const parts = takeLine.split(/\s+/);
    if (parts.length < 2) return null;

    const itemName = parts.slice(1).join(" ");
    let qty = null;
    let clean = itemName;

    const m1 = itemName.match(/^(\d+)\s*x\s*(.+)$/i);
    const m2 = itemName.match(/^(.+)\((\d+)\)$/);

    if (m1) {
        qty = parseInt(m1[1]);
        clean = m1[2];
    } else if (m2) {
        qty = parseInt(m2[2]);
        clean = m2[1];
    }

    return { item: clean.trim(), qty };
}

function recordDrop(dropInfo) {
    if (!dropInfo || !dropInfo.item) return;

    const npcName = dvState.currentNpc ? dvState.currentNpc.name : "Unknown NPC";

    dvState.drops.unshift({
        npc: npcName,
        item: dropInfo.item,
        qty: dropInfo.qty,
        ts: Date.now()
    });

    filterDrops();
    renderDrops();
}

function startPolling() {
    if (dvState.polling) return;
    dvState.polling = true;

    dvState.pollIntervalId = setInterval(() => {
        const items = readMenuText();
        if (!items) return;

        const drop = parseDropFromMenu(items);
        if (!drop) return;

        const sig = `${drop.item}|${drop.qty || ""}`;
        if (dvState._lastDropSig === sig) return;
        dvState._lastDropSig = sig;

        recordDrop(drop);
    }, 400);
}

function stopPolling() {
    dvState.polling = false;
    if (dvState.pollIntervalId) clearInterval(dvState.pollIntervalId);
}

// Event Handlers & Region Picker

function initEvents() {
    if (dvState.el.closeBtn) {
        dvState.el.closeBtn.addEventListener("click", () => {
            try {
                if (window.alt1 && alt1.close) alt1.close();
                else window.close();
            } catch {
                window.close();
            }
        });
    }

    if (dvState.el.searchInput) {
        dvState.el.searchInput.addEventListener("input", debounce(e => {
            setSearchQuery(e.target.value);
        }, 150));
    }

    if (dvState.el.status) {
        dvState.el.status.addEventListener("click", () => initOcr());
    }

    const setRegionBtn = $("#set-region-btn");
    if (setRegionBtn) {
        setRegionBtn.addEventListener("click", pickMenuRegion);
    }
}

function pickMenuRegion() {
    if (!dvState.alt1Ready) {
        setStatus("Alt1 not ready.");
        return;
    }

    a1lib.captureHoldFullRs((img, rect) => {
        if (!rect) {
            setStatus("Region selection cancelled.");
            return;
        }

        dvState.menuRegion = {
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height
        };

        setStatus("Menu region set.");
    });
}

//Bootstrap

function initNpcList() {
    dvState.npcList = POPULAR_NPCS.slice();
    dvState.currentNpc = dvState.npcList[0];
    renderNpcList();
    updateTitlebar();
}

async function bootstrapDropViewer() {
    initUiRefs();
    initNpcList();
    initEvents();

    detectAlt1();
    await initOcr();

    if (dvState.ocrInitialized) startPolling();
    else setStatus("Alt1 OCR not ready.");

    renderDrops();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapDropViewer);
} else {
    bootstrapDropViewer();
}
