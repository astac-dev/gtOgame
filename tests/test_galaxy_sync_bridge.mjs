/**
 * Test Suite: Galaxy Parser & Cross-Origin Live Sync Bridge
 * Tests the real OGame DOM extraction, API bridge persistence, and dashboard retrieval.
 */

import http from 'http';
import assert from 'assert';
import { GalaxyParser } from '../src/userscript/parser-galaxy.js';

function postJSON(urlStr, data) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const payload = JSON.stringify(data);
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, body });
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function getJSON(urlStr) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: 'GET'
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, body });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// DOM mock for Node test environment
class MockElement {
    constructor(tagName, attributes = {}, textContent = '') {
        this.tagName = tagName.toUpperCase();
        this.attributes = { ...attributes };
        this._textContent = textContent;
        this.children = [];
        this.parentNode = null;
        this.classList = {
            contains: (cls) => (this.attributes['class'] || '').split(/\s+/).includes(cls)
        };
    }

    get textContent() {
        if (this.children.length === 0) return this._textContent || '';
        return this.children.map(c => c.textContent).join('');
    }

    set textContent(val) {
        this._textContent = val;
    }

    get innerHTML() {
        if (this.textContent) return this.textContent;
        return this.children.map(c => c.innerHTML).join('');
    }

    set innerHTML(val) {
        this.textContent = val;
    }

    get value() {
        return this.attributes['value'] !== undefined ? this.attributes['value'] : '';
    }

    set value(v) {
        this.attributes['value'] = v;
    }

    getAttribute(name) {
        return this.attributes[name] !== undefined ? this.attributes[name] : null;
    }

    setAttribute(name, val) {
        this.attributes[name] = val;
    }

    remove() {
        if (this.parentNode) {
            const idx = this.parentNode.children.indexOf(this);
            if (idx !== -1) this.parentNode.children.splice(idx, 1);
        }
    }

    cloneNode(deep = true) {
        const clone = new MockElement(this.tagName, this.attributes, this.textContent);
        if (deep) {
            for (const child of this.children) {
                clone.appendChild(child.cloneNode(true));
            }
        }
        return clone;
    }

    matchesSelector(sel) {
        const parts = sel.trim().split(/\s+/);
        const lastPart = parts[parts.length - 1];
        if (lastPart.startsWith('#')) {
            return this.getAttribute('id') === lastPart.slice(1);
        }
        if (lastPart.startsWith('.')) {
            return this.classList.contains(lastPart.slice(1));
        }
        if (lastPart.startsWith('[') && lastPart.endsWith(']')) {
            const content = lastPart.slice(1, -1);
            if (content.includes('=')) {
                const [attr, val] = content.split('=');
                const cleanVal = val.replace(/["']/g, '');
                return this.getAttribute(attr) === cleanVal;
            }
            return this.getAttribute(content) !== null;
        }
        if (lastPart.toLowerCase() === this.tagName.toLowerCase()) {
            return true;
        }
        return false;
    }

    querySelector(selector) {
        const subSelectors = selector.split(',').map(s => s.trim());
        for (const sub of subSelectors) {
            const found = this.findSingleSelector(sub);
            if (found) return found;
        }
        return null;
    }

    findSingleSelector(sel) {
        for (const child of this.children) {
            if (child.matchesSelector(sel)) return child;
            const nested = child.findSingleSelector(sel);
            if (nested) return nested;
        }
        return null;
    }

    querySelectorAll(selector) {
        const subSelectors = selector.split(',').map(s => s.trim());
        const results = [];
        this.findAllRecursive(subSelectors, results);
        return results;
    }

    findAllRecursive(subSelectors, results) {
        for (const child of this.children) {
            if (subSelectors.some(sel => child.matchesSelector(sel))) {
                results.push(child);
            }
            child.findAllRecursive(subSelectors, results);
        }
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
}

class MockDocument {
    constructor() {
        this.body = new MockElement('body');
    }

    querySelector(selector) {
        const subSelectors = selector.split(',').map(s => s.trim());
        for (const sub of subSelectors) {
            const found = this.body.findSingleSelector(sub);
            if (found) return found;
        }
        return null;
    }

    getElementById(id) {
        return this.body.findSingleSelector('#' + id);
    }
}

async function runTests() {
    console.log('--- TEST SUITE: GALAXY PARSER & SYNC BRIDGE ---');

    // TEST 1: GalaxyParser with realistic OGame DOM
    console.log('[Test 1] Testing GalaxyParser extraction from live DOM...');
    const doc = new MockDocument();
    
    // Setup galaxy header inputs
    const galaxyInput = new MockElement('input', { id: 'galaxy_input', value: '2' });
    const systemInput = new MockElement('input', { id: 'system_input', value: '45' });
    doc.body.appendChild(galaxyInput);
    doc.body.appendChild(systemInput);

    // Setup galaxy table row 1: Active player with Moon and Debris
    const row1 = new MockElement('tr', { id: 'galaxyRow1', 'data-position': '1' });
    
    const posCell = new MockElement('td', { class: 'cellPosition' }, '1');
    const planetCell = new MockElement('td', { class: 'cellPlanetName' });
    planetCell.appendChild(new MockElement('span', { class: 'textNormal' }, 'Colonia Alpha'));
    
    const moonCell = new MockElement('td', { class: 'cellMoon' });
    const moonImg = new MockElement('img', { class: 'moon-icon', title: 'Moon (size: 8432km)' });
    moonCell.appendChild(moonImg);

    const debrisCell = new MockElement('td', { class: 'cellDebris' });
    const debrisLink = new MockElement('a', { class: 'debris-link', title: 'Metal: 450.000 Crystal: 230.000' });
    debrisCell.appendChild(debrisLink);

    const playerCell = new MockElement('td', { class: 'cellPlayerName' });
    const playerLink = new MockElement('a', { class: 'status_abbr_active', 'data-player-id': '104921' }, 'AdmiralThrawn');
    playerCell.appendChild(playerLink);

    const allyCell = new MockElement('td', { class: 'cellAlliance' });
    const allyLink = new MockElement('a', { class: 'alliance_link' }, 'EMPIRE');
    allyCell.appendChild(allyLink);

    row1.children = [posCell, planetCell, moonCell, debrisCell, playerCell, allyCell];
    doc.body.appendChild(row1);

    // Setup galaxy table row 2: Inactive (i) player
    const row2 = new MockElement('tr', { id: 'galaxyRow2', 'data-position': '2' });
    const posCell2 = new MockElement('td', { class: 'cellPosition' }, '2');
    const planetCell2 = new MockElement('td', { class: 'cellPlanetName' });
    planetCell2.appendChild(new MockElement('span', { class: 'textNormal' }, 'Base Minera'));
    const playerCell2 = new MockElement('td', { class: 'cellPlayerName' });
    const playerLink2 = new MockElement('a', { class: 'status_abbr_inactive', 'data-player-id': '108842' }, 'FarmerBob');
    playerCell2.appendChild(playerLink2);
    row2.children = [posCell2, planetCell2, new MockElement('td', { class: 'cellMoon' }), new MockElement('td', { class: 'cellDebris' }), playerCell2, new MockElement('td', { class: 'cellAlliance' })];
    doc.body.appendChild(row2);

    const parsedData = GalaxyParser.parseFromLiveDOM(doc);
    assert.strictEqual(parsedData.galaxy, 2, 'Galaxy should be 2');
    assert.strictEqual(parsedData.system, 45, 'System should be 45');
    assert.strictEqual(parsedData.planets.length, 3, 'Should have extracted 3 celestial bodies (2 planets + 1 moon)');

    const p1 = parsedData.planets[0];
    assert.strictEqual(p1.position, 1, 'Position should be 1');
    assert.strictEqual(p1.planet_name, 'Colonia Alpha', 'Planet name should match');
    assert.strictEqual(p1.player_name, 'AdmiralThrawn', 'Player name should match');
    assert.strictEqual(p1.player_id, 104921, 'Player ID should match');
    assert.strictEqual(p1.has_moon, true, 'Should detect moon on planet');
    assert.strictEqual(p1.moon_size, 8432, 'Moon size should be 8432');
    assert.strictEqual(p1.has_debris, true, 'Should detect debris');
    assert.strictEqual(p1.debris_metal, 450000, 'Debris metal should be 450,000');
    assert.strictEqual(p1.debris_crystal, 230000, 'Debris crystal should be 230,000');

    const m1 = parsedData.planets[1];
    assert.strictEqual(m1.position, 1);
    assert.strictEqual(m1.isMoon, true);
    assert.strictEqual(m1.planet_name, 'Luna 1');
    assert.strictEqual(m1.moon_size, 8432);

    const p2 = parsedData.planets[2];
    assert.strictEqual(p2.position, 2, 'Position should be 2');
    assert.strictEqual(p2.player_name, 'FarmerBob', 'Player name should match');
    assert.strictEqual(p2.status, 'i', 'Player status should be inactive (i)');
    console.log('✓ GalaxyParser extracted populated slots with moon, debris, and player status accurately.');

    // TEST 2: Local HTTP Sync Bridge (POST)
    console.log('[Test 2] Testing HTTP POST to local sync API bridge...');
    const postPayload = {
        type: 'galaxy',
        galaxy: 2,
        system: 45,
        planets: parsedData.planets
    };

    const postRes = await postJSON('http://localhost:8080/api/sync.php', postPayload);
    assert.strictEqual(postRes.status, 200, 'HTTP POST should return 200 OK');
    assert.strictEqual(postRes.data.success, true, 'API response should indicate success');
    assert.strictEqual(postRes.data.saved, 3, 'API should have processed 3 celestial bodies');
    console.log('✓ POST /api/sync.php successfully persisted galaxy data.');

    // TEST 3: Local HTTP Sync Bridge (GET by galaxy/system)
    console.log('[Test 3] Testing HTTP GET from local sync API bridge for system 2:45...');
    const getRes = await getJSON('http://localhost:8080/api/sync.php?g=2&s=45');
    assert.strictEqual(getRes.status, 200, 'HTTP GET should return 200 OK');
    assert(Array.isArray(getRes.data.planets), 'GET planets should be an array');
    
    const fetchedP1 = getRes.data.planets.find(p => p.position === 1 && !p.isMoon);
    assert(fetchedP1, 'Should find slot 1 in GET response');
    assert.strictEqual(fetchedP1.player_name, 'AdmiralThrawn', 'Stored player name should be AdmiralThrawn');
    assert.strictEqual(fetchedP1.debris_metal, 450000, 'Stored debris metal should be 450,000');
    console.log('✓ GET /api/sync.php successfully returned the newly synchronized data.');

    // TEST 4: Global GET verification
    console.log('[Test 4] Testing Global GET /api/sync.php...');
    const getAllRes = await getJSON('http://localhost:8080/api/sync.php');
    assert.strictEqual(getAllRes.status, 200);
    assert(Array.isArray(getAllRes.data.planets), 'Global planets should be an array');
    assert(getAllRes.data.planets.some(p => p.coordKey === '2:45:1:0'), 'System 2:45:1:0 must be present in global store');
    console.log(`✓ Global GET verified (${getAllRes.data.totalPlanets} total planets currently in cache).`);

    // TEST 5: System Re-visit with Deleted/Abandoned Planets (Slot 2 removed)
    console.log('[Test 5] Testing system re-visit with deleted planet (purging stale slot 2)...');
    const updatePayload = {
        type: 'galaxy',
        galaxy: 2,
        system: 45,
        planets: [
            p1 // Only slot 1 remains; slot 2 and moon have been removed/deleted
        ]
    };
    const updateRes = await postJSON('http://localhost:8080/api/sync.php', updatePayload);
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.saved, 1, 'Only 1 planet should be saved now');

    const getResUpdated = await getJSON('http://localhost:8080/api/sync.php?g=2&s=45');
    assert.strictEqual(getResUpdated.data.planets.length, 1, 'Should only contain 1 planet now');
    assert.strictEqual(getResUpdated.data.planets[0].position, 1, 'Only slot 1 should exist');
    const staleSlot2 = getResUpdated.data.planets.find(p => p.position === 2);
    assert.strictEqual(staleSlot2, undefined, 'Stale deleted planet at position 2 must be purged');
    console.log('✓ Successfully purged deleted planet from cache on re-scan.');

    // TEST 6: System Re-visit completely empty (0 planets)
    console.log('[Test 6] Testing system re-visit when system is completely vacant...');
    const emptyPayload = {
        type: 'galaxy',
        galaxy: 2,
        system: 45,
        planets: []
    };
    const emptyRes = await postJSON('http://localhost:8080/api/sync.php', emptyPayload);
    assert.strictEqual(emptyRes.status, 200);

    const getResEmpty = await getJSON('http://localhost:8080/api/sync.php?g=2&s=45');
    assert.strictEqual(getResEmpty.data.planets.length, 0, 'Vacant system should return 0 planets');
    console.log('✓ Successfully purged entire solar system when rescanned as empty.');

    // CLEANUP: Reset data storage so no test simulation data is left on disk
    const fs = await import('fs');
    fs.writeFileSync('data/planets.json', '{}\n', 'utf8');
    fs.writeFileSync('data/reports.json', '{}\n', 'utf8');
    console.log('✓ Cleaned up all test artifacts from data storage.');

    console.log('\n--- ALL GALAXY SYNC BRIDGE TESTS PASSED (100%) ---');
    process.exit(0);
}

runTests().catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
});
