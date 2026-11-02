/**
 * Unit Test for Bundled Userscript (Phase 3 Integration)
 * Simulates browser environment, window.fetch, and OGame AJAX responses.
 */

import fs from 'node:fs';
import path from 'node:path';

console.log("==========================================================");
console.log("   TEST SUITE: BUNDLED USERSCRIPT INTEGRATION (FASE 3)    ");
console.log("==========================================================\n");

// Mock browser window and fetch environment
globalThis.window = globalThis;
let capturedEvents = [];

const scriptPath = path.resolve('dist/galaxytool-modern.user.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

// Execute script in mock environment
eval(scriptContent);

// Wait for async initialization
await new Promise(r => setTimeout(r, 100));

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

    assert(typeof window.Galaxytool !== 'undefined', "window.Galaxytool is exposed and active");
    assert(window.Galaxytool.version === '6.0.0', "Galaxytool version is 6.0.0");

    // --- 1. Test Galaxy View AJAX Interception ---
    console.log("\n--- 1. Testing Passive Galaxy View Interception ---");
    const mockGalaxyData = {
        galaxy: 2,
        system: 140,
        galaxyContent: [
            {
                position: 1,
                planetName: "Colonia 1",
                playerId: 2001,
                playerName: "ImperioBeta",
                playerStatus: "active",
                hasMoon: true,
                moonSize: 8500,
                debrisMetal: 40000,
                debrisCrystal: 20000
            },
            {
                position: 4,
                planetName: "Colonia 4",
                playerId: 2002,
                playerName: "GranjaInactiva",
                playerStatus: "i",
                hasMoon: false
            }
        ]
    };

    // Simulate fetch call to OGame galaxy endpoint
    await window.fetch('https://s1-es.ogame.gameforge.com/game/index.php?page=galaxyContent&ajax=1', {
        headers: { 'Accept': 'application/json' }
    });

    // Directly trigger interceptor handler with mock response data
    await window.Galaxytool.interceptor.handleGalaxyResponse(JSON.stringify(mockGalaxyData));

    const planet = await window.Galaxytool.storage.getPlanet(2, 140, 1, false);
    assert(planet !== null && planet.playerName === "ImperioBeta", "Intercepted and stored Planet 2:140:1");

    const moon = await window.Galaxytool.storage.getPlanet(2, 140, 1, true);
    assert(moon !== null && moon.isMoon === true && moon.moonSize === 8500, "Intercepted and stored Moon 2:140:1");

    const player = await window.Galaxytool.storage.getPlayer(2001);
    assert(player !== null && player.name === "ImperioBeta", "Indexed Player 2001 in player cache");

    // --- 2. Test Espionage Report AJAX Interception ---
    console.log("\n--- 2. Testing Espionage Report Interception with Modern Ships ---");
    const mockReportData = {
        coordinates: "[2:140:1]",
        isMoon: false,
        timestamp: 1730503000,
        resources: { metal: 3200000, crystal: 1600000, deuterium: 400000 },
        ships: {
            SC: 50,
            LC: 10,
            CR: 20,
            REAP: 5,   // Modern Segador
            PATH: 15,  // Modern Explorador
            CRAW: 8    // Modern Taladrador
        }
    };

    await window.Galaxytool.interceptor.handleReportResponse(JSON.stringify(mockReportData));

    const latestReport = await window.Galaxytool.storage.getLatestReport(2, 140, 1, false);
    assert(latestReport !== null, "Intercepted and stored Espionage Report for [2:140:1]");
    assert(latestReport.resources.metal === 3200000, "Extracted Metal resource verified");
    assert(latestReport.fleet.REAP === 5, "Extracted Modern Ship REAPER verified (5)");
    assert(latestReport.fleet.PATH === 15, "Extracted Modern Ship PATHFINDER verified (15)");
    assert(latestReport.fleet.CRAW === 8, "Extracted Modern Ship CRAWLER verified (8)");

    // Test automatic bitpacking of the intercepted report
    const packed = window.Galaxytool.serializer.pack(latestReport);
    assert(packed.length < 45, `Report automatically compressed to ${packed.length} bytes (< 45 bytes)`);

    // --- SUMMARY ---
    console.log("\n==========================================================");
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==========================================================");

    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error("Test Failure:", err);
    process.exit(1);
});

