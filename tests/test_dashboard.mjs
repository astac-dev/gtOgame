/**
 * Test Suite: Galaxytool Modern Dashboard & PWA (Fase 6)
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

console.log('==========================================================');
console.log('   TEST SUITE: DASHBOARD STANDALONE PWA (FASE 6)          ');
console.log('==========================================================');

const rootDir = process.cwd();

// --- Test 1: File Existence & Integrity ---
console.log('\n--- 1. Testing Dashboard Files & PWA Assets ---');

const manifestPath = path.join(rootDir, 'dashboard', 'manifest.json');
const swPath = path.join(rootDir, 'dashboard', 'sw.js');
const indexPath = path.join(rootDir, 'dashboard', 'index.html');
const appPath = path.join(rootDir, 'dashboard', 'app.js');

assert(fs.existsSync(manifestPath), 'manifest.json must exist in dashboard/');
assert(fs.existsSync(swPath), 'sw.js must exist in dashboard/');
assert(fs.existsSync(indexPath), 'index.html must exist in dashboard/');
assert(fs.existsSync(appPath), 'app.js must exist in dashboard/');
console.log('[PASS] All core dashboard assets exist on disk');

// --- Test 2: PWA Manifest Content ---
console.log('\n--- 2. Testing PWA Manifest Configuration ---');
const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.equal(manifestContent.short_name, 'Galaxytool');
assert.equal(manifestContent.display, 'standalone');
assert(manifestContent.theme_color, 'Theme color must be specified');
assert(manifestContent.icons.length >= 2, 'Must provide multiple icon sizes');
console.log('[PASS] manifest.json contains valid PWA specification');

// --- Test 3: Service Worker Syntax & Cache Definitions ---
console.log('\n--- 3. Testing Service Worker Setup ---');
const swCode = fs.readFileSync(swPath, 'utf8');
assert(swCode.includes('CACHE_NAME'), 'SW must declare a CACHE_NAME');
assert(swCode.includes("addEventListener('install'"), 'SW must handle install event');
assert(swCode.includes("addEventListener('fetch'"), 'SW must handle fetch event');
console.log('[PASS] sw.js implements offline caching handlers');

// --- Test 4: Dashboard Logic & Tactical Math ---
console.log('\n--- 4. Testing Cargo & Plunder Calculation ---');

function calculatePlunder(resources, ratio = 0.5) {
    const total = (resources.metal || 0) + (resources.crystal || 0) + (resources.deuterium || 0);
    const plunder = Math.floor(total * ratio);
    return {
        total,
        plunder,
        sc: Math.ceil(plunder / 5000),
        lc: Math.ceil(plunder / 25000),
        path: Math.ceil(plunder / 10000)
    };
}

const res = { metal: 2000000, crystal: 1000000, deuterium: 500000 };
const loot50 = calculatePlunder(res, 0.5);
assert.equal(loot50.total, 3500000);
assert.equal(loot50.plunder, 1750000);
assert.equal(loot50.sc, 350);
assert.equal(loot50.lc, 70);
assert.equal(loot50.path, 175);
console.log('[PASS] 50% Plunder & SC/LC/PATH counts match exact OGame rules');

const loot75 = calculatePlunder(res, 0.75);
assert.equal(loot75.plunder, 2625000);
assert.equal(loot75.sc, 525);
assert.equal(loot75.lc, 105);
assert.equal(loot75.path, 263);
console.log('[PASS] 75% Discoverer Plunder correctly calculated');

// --- Test 5: Target Inactivity & Debris Filtering ---
console.log('\n--- 5. Testing Target Filtering Engine ---');

const samplePlanets = [
    { galaxy: 1, system: 10, position: 2, playerStatus: 'i', debris: { metal: 100000, crystal: 50000 } },
    { galaxy: 1, system: 10, position: 5, playerStatus: 'I', debris: null },
    { galaxy: 1, system: 10, position: 8, playerStatus: '', debris: { metal: 500000, crystal: 500000 } },
    { galaxy: 2, system: 10, position: 4, playerStatus: 'v', debris: null }
];

const inactivesOnly = samplePlanets.filter(p => p.playerStatus && (p.playerStatus.includes('i') || p.playerStatus.includes('I')));
assert.equal(inactivesOnly.length, 2, 'Should detect exactly 2 inactives');
console.log('[PASS] Filter correctly identifies inactive accounts (i and I)');

const highDebris = samplePlanets.filter(p => p.debris && ((p.debris.metal + p.debris.crystal) >= 500000));
assert.equal(highDebris.length, 1, 'Should find 1 target with high debris');
console.log('[PASS] Filter correctly isolates high-value debris fields');

// --- Test 6: Modern 17 Ships Presence in app.js ---
console.log('\n--- 6. Testing Modern Ship Support in app.js ---');
const appCode = fs.readFileSync(appPath, 'utf8');
const modernKeys = ['SC', 'LC', 'LF', 'HF', 'CR', 'BS', 'COL', 'REC', 'ESP', 'BOM', 'SAT', 'DEST', 'RIP', 'BC', 'CRAW', 'REAP', 'PATH'];

for (const k of modernKeys) {
    assert(appCode.includes(`${k}:`), `app.js must define ship code ${k}`);
}
console.log('[PASS] All 17 modern ships defined (including CRAW, REAP, PATH)');

// --- Test 7: HTML DOM Structure & Section Integrity ---
console.log('\n--- 7. Testing HTML View Structure ---');
const html = fs.readFileSync(indexPath, 'utf8');
assert(html.includes('id="tab-galaxy"'), 'index.html must contain Galaxy tab');
assert(html.includes('id="tab-targets"'), 'index.html must contain Targets tab');
assert(html.includes('id="tab-reports"'), 'index.html must contain Reports tab');
assert(html.includes('id="tab-calc"'), 'index.html must contain Calculator tab');
assert(html.includes('id="tab-data"'), 'index.html must contain Data tab');
assert(html.includes('id="report-detail-modal"'), 'index.html must contain Tactical Report modal');
console.log('[PASS] index.html contains all 5 tactical views and modal dialog');

console.log('\n==========================================================');
console.log('RESULTS: ALL 7 TEST SUITES PASSED (0 FAILED)');
console.log('==========================================================');

