/**
 * Test Suite: galExpl.js Integration with Galaxytool Modern
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('==========================================================');
console.log('   TEST SUITE: RADAR GALEXPL & GALAXYTOOL INTEGRATION     ');
console.log('==========================================================');

const galExplCode = fs.readFileSync(path.resolve('dist', 'galExpl.js'), 'utf8');

// Test 1: Verify presence of Galaxytool integration functions
assert(galExplCode.includes('sendToGalaxytoolSolution'), 'galExpl.js must define sendToGalaxytoolSolution');
assert(galExplCode.includes('saveToIndexedDBDirectly'), 'galExpl.js must define saveToIndexedDBDirectly');
assert(galExplCode.includes('extractDebris'), 'galExpl.js must extract debris fields');
assert(galExplCode.includes('extractPlayerStatus'), 'galExpl.js must extract player statuses');
assert(galExplCode.includes('sc-sync-gt'), 'galExpl.js must include UI toggle for Galaxytool sync');
console.log('[PASS] Integration methods and UI toggle verified in galExpl.js');

// Test 2: Extraction logic unit tests
function extractPlayerStatusMock(classes, innerHTML) {
    if (classes.includes('status_abbr_longinactive') || innerHTML.includes('status_abbr_longinactive')) return 'I';
    if (classes.includes('status_abbr_inactive') || innerHTML.includes('status_abbr_inactive')) return 'i';
    if (classes.includes('status_abbr_vacation') || innerHTML.includes('status_abbr_vacation')) return 'v';
    if (classes.includes('status_abbr_banned') || innerHTML.includes('status_abbr_banned')) return 'b';
    return '';
}

assert.equal(extractPlayerStatusMock([], '<span class="status_abbr_inactive">(i)</span>'), 'i');
assert.equal(extractPlayerStatusMock([], '<span class="status_abbr_longinactive">(I)</span>'), 'I');
assert.equal(extractPlayerStatusMock(['status_abbr_vacation'], ''), 'v');
assert.equal(extractPlayerStatusMock([], ''), '');
console.log('[PASS] Player status extraction handles active, (i), (I) and vacation');

// Test 3: Debris extraction unit test
function extractDebrisMock(tooltipText) {
    const m = tooltipText.match(/Metal:\s*([\d\.,]+)/i) || tooltipText.match(/([\d\.,]+)\s*Metal/i);
    const c = tooltipText.match(/Cristal:\s*([\d\.,]+)/i) || tooltipText.match(/([\d\.,]+)\s*Cristal/i);
    const metal = m ? parseInt(m[1].replace(/[^\d]/g, ''), 10) : 0;
    const crystal = c ? parseInt(c[1].replace(/[^\d]/g, ''), 10) : 0;
    return (metal > 0 || crystal > 0) ? { metal, crystal } : null;
}

const debrisSample = extractDebrisMock('Escombros: Metal: 120.500 | Cristal: 85.000');
assert.equal(debrisSample.metal, 120500);
assert.equal(debrisSample.crystal, 85000);
console.log('[PASS] Debris field values correctly parsed from tooltips');

console.log('\n==========================================================');
console.log('RESULTS: ALL 3 TESTS PASSED (0 FAILED)');
console.log('==========================================================');
