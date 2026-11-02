/**
 * Unit Test for Phase 5: In-Game HUD (Shadow DOM & Command Palette)
 */

import { InGameHUD } from '../src/ui/hud.js';
import { OGameStorageEngine } from '../src/storage/db.js';

console.log("==========================================================");
console.log("   TEST SUITE: IN-GAME HUD & SHADOW DOM (FASE 5)          ");
console.log("==========================================================\n");

// Minimal DOM Mock for Node.js
class MockShadowRoot {
    constructor() {
        this.children = [];
    }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    remove() {
        if (this.parentNode && this.parentNode.children) {
            const idx = this.parentNode.children.indexOf(this);
            if (idx !== -1) this.parentNode.children.splice(idx, 1);
        }
    }
    querySelector(selector) {
        for (const child of this.children) {
            if (child.querySelector) {
                const found = child.querySelector(selector);
                if (found) return found;
            }
        }
        return null;
    }
}

class MockElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.id = '';
        this.className = '';
        this.style = {};
        this.children = [];
        this._innerHTML = '';
        this.listeners = {};
        this.shadowRoot = null;
        this.idMap = new Map();
    }
    get innerHTML() {
        return this._innerHTML;
    }
    set innerHTML(html) {
        this._innerHTML = html;
        const idRegex = /id=["']([^"']+)["']/g;
        let m;
        while ((m = idRegex.exec(html)) !== null) {
            const el = new MockElement('div');
            el.id = m[1];
            this.idMap.set(m[1], el);
        }
    }
    appendChild(child) {
        this.children.push(child);
        if (child.id) this.idMap.set(child.id, child);
        return child;
    }
    attachShadow() {
        this.shadowRoot = new MockShadowRoot();
        return this.shadowRoot;
    }
    addEventListener(event, fn) {
        this.listeners[event] = fn;
    }
    dispatchEvent(event) {
        if (this.listeners[event.type]) this.listeners[event.type](event);
    }
    querySelector(selector) {
        const id = selector.startsWith('#') ? selector.slice(1) : selector;
        if (this.id === id) return this;
        if (this.idMap.has(id)) return this.idMap.get(id);
        for (const c of this.children) {
            if (c.querySelector) {
                const res = c.querySelector(selector);
                if (res) return res;
            }
        }
        return null;
    }
    focus() {}
}

globalThis.document = {
    body: new MockElement('body'),
    createElement: (tag) => new MockElement(tag),
    querySelector: () => null
};
globalThis.window = {
    addEventListener: () => {},
    location: { href: 'https://s1-es.ogame.gameforge.com/game/index.php?page=ingame&component=galaxy' }
};

async function runTests() {
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`[PASS] ${message}`);
            passed++;
        } else {
            console.error(`[FAIL] ${message}`);
            failed++;
        }
    }

    const storage = new OGameStorageEngine();
    await storage.init();

    await storage.savePlanet({
        galaxy: 1, system: 154, position: 5, isMoon: false,
        name: "Granja Rica", playerId: 3001, playerName: "ObjetivoInactivo",
        status: "i"
    });

    const hud = new InGameHUD(storage);
    hud.init();

    assert(hud.host !== null, "HUD Host element created in document body");
    assert(hud.shadow !== null, "Shadow Root successfully attached with encapsulation");

    // Check inner elements inside Shadow DOM
    const badge = hud.shadow.querySelector('#gtBadgeBtn');
    assert(badge !== null, "Floating Tactical Badge rendered inside Shadow DOM");

    const modal = hud.shadow.querySelector('#gtPaletteModal');
    assert(modal !== null, "Command Palette Modal rendered inside Shadow DOM");

    // Test toggle Command Palette
    hud.togglePalette(true);
    assert(modal.style.display === 'flex', "Command Palette opened (display: flex)");

    hud.togglePalette(false);
    assert(modal.style.display === 'none', "Command Palette closed (display: none)");

    // Test search functionality
    console.log("\n--- Testing Command Palette Search ---");
    await hud.handleSearch("1:154:5");
    const resultsContainer = hud.shadow.querySelector('#gtResultsList');
    assert(resultsContainer.innerHTML.includes("1:154:5"), "Search by coordinates found target [1:154:5]");
    assert(resultsContainer.innerHTML.includes("ObjetivoInactivo"), "Search rendered player name correctly");
    assert(resultsContainer.innerHTML.includes("gt-status-inact"), "Rendered inactive status badge");

    // Test ship auto-filler function
    console.log("\n--- Testing Fleet Dispatch Ship Auto-Filler ---");
    let inputDispatched = false;
    const mockShipInput = new MockElement('input');
    mockShipInput.addEventListener('input', () => { inputDispatched = true; });

    document.querySelector = (sel) => {
        if (sel.includes('ship_202')) return mockShipInput;
        return null;
    };

    hud.fillShips(202, 150);
    assert(mockShipInput.value === 150, "Auto-filled 150 Small Cargoes into ship input field");
    assert(inputDispatched === true, "Dispatched input event for native OGame reactive UI");

    // --- Testing Configuration Modal & Toasts ---
    console.log("\n--- Testing Settings Modal & Toast Notifications ---");
    const settingsModal = hud.shadow.querySelector('#gtSettingsModal');
    assert(settingsModal !== null, "Settings & Telemetry Modal rendered in Shadow DOM");

    await hud.toggleSettings(true);
    assert(settingsModal.style.display === 'flex', "Settings modal opened (display: flex)");

    await hud.toggleSettings(false);
    assert(settingsModal.style.display === 'none', "Settings modal closed (display: none)");

    hud.notify("Sistema 1:154 interceptado y guardado", "info", "🪐");
    const toastContainer = hud.shadow.querySelector('#gtToastContainer');
    assert(toastContainer !== null, "Toast container exists in Shadow DOM");
    assert(toastContainer.children.length > 0, "Toast notification created and mounted");
    assert(toastContainer.children[0].innerHTML.includes("Sistema 1:154"), "Toast contains capture feedback message");

    // --- SUMMARY ---
    console.log("\n==========================================================");
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==========================================================");

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runTests().catch(err => {
    console.error("Test Failure:", err);
    process.exit(1);
});
