/**
 * Unit Test Suite for Phase 2: Local Storage & JSONL Persistence
 */

import { OGameStorageEngine } from '../src/storage/db.js';
import { JSONLAdapter } from '../src/storage/jsonl.js';
import { SHIPS } from '../src/core/constants.js';

console.log("==========================================================");
console.log("   TEST SUITE: OGAME LOCAL STORAGE & JSONL (FASE 2)       ");
console.log("==========================================================\n");

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
    assert(storage !== null, "Storage engine initialized successfully");

    // --- 1. Planets and Systems CRUD ---
    console.log("\n--- 1. Testing Planets & Solar Systems Storage ---");
    await storage.savePlanet({
        galaxy: 1, system: 154, position: 3, isMoon: false,
        name: "Colonia 1", playerId: 1001, playerName: "ComandanteAlfa",
        status: "active", debris: [50000, 20000]
    });

    await storage.savePlanet({
        galaxy: 1, system: 154, position: 1, isMoon: false,
        name: "Planeta Principal", playerId: 1002, playerName: "ObjetivoInactivo",
        status: "i", debris: [0, 0]
    });

    await storage.savePlanet({
        galaxy: 1, system: 154, position: 3, isMoon: true,
        name: "Luna Alfa", playerId: 1001, playerName: "ComandanteAlfa",
        moonSize: 8450
    });

    const planet = await storage.getPlanet(1, 154, 3, false);
    assert(planet !== null && planet.name === "Colonia 1", "Retrieved Planet 1:154:3 correctly");

    const moon = await storage.getPlanet(1, 154, 3, true);
    assert(moon !== null && moon.isMoon === true && moon.moonSize === 8450, "Retrieved Moon at 1:154:3 correctly");

    const system = await storage.getSystem(1, 154);
    assert(system.length === 3, "Retrieved all 3 celestial bodies in solar system 1:154");
    assert(system[0].position === 1, "System bodies sorted in ascending position order");

    // --- 2. Espionage Reports & Plunder Engine ---
    console.log("\n--- 2. Testing Espionage Reports & Plunder Calculation ---");
    const testReport = {
        galaxy: 1, system: 154, position: 1, isMoon: false,
        timestamp: 1730501000,
        resources: { metal: 2500000, crystal: 1250000, deuterium: 250000 },
        fleet: { SC: 20, REAP: 2, PATH: 5 }
    };
    await storage.saveReport(testReport);

    const latestReport = await storage.getLatestReport(1, 154, 1, false);
    assert(latestReport !== null, "Retrieved latest report for 1:154:1");
    assert(latestReport.resources.metal === 2500000, "Report metal count verified (2,500,000)");

    // Plunder calculations (50% standard plunder)
    // Total resources: 4,000,000. Plunderable (50%): 2,000,000.
    // SC (5k capacity): 2,000,000 / 5,000 = 400 SC
    // LC (25k capacity): 2,000,000 / 25,000 = 80 LC
    // PATH (10k capacity): 2,000,000 / 10,000 = 200 PATH
    const plunder = JSONLAdapter.calculatePlunder(latestReport, 0.5);
    assert(plunder.plunderable.total === 2000000, "Plunderable 50% calculated correctly (2,000,000)");
    assert(plunder.shipsNeeded.SC === 400, "Calculated 400 Small Cargoes needed");
    assert(plunder.shipsNeeded.LC === 80, "Calculated 80 Large Cargoes needed");
    assert(plunder.shipsNeeded.PATH === 200, "Calculated 200 Pathfinders needed");

    // --- 3. JSONL Export and Import Serialization ---
    console.log("\n--- 3. Testing JSON Lines (.jsonl) Export/Import ---");
    const sampleReports = [
        testReport,
        {
            galaxy: 2, system: 50, position: 8, isMoon: false,
            timestamp: 1730502000,
            resources: { metal: 100000, crystal: 50000, deuterium: 10000 },
            fleet: { LC: 10 }
        }
    ];

    const jsonl = JSONLAdapter.exportToJSONL(sampleReports);
    console.log("Exported JSONL Preview:\n" + jsonl.trim());
    assert(jsonl.includes('\n'), "JSONL contains newline separators");

    const parsedReports = JSONLAdapter.parseFromJSONL(jsonl);
    assert(parsedReports.length === 2, "Parsed back exact number of reports (2)");
    assert(parsedReports[0].galaxy === 1 && parsedReports[1].galaxy === 2, "Parsed data preserves coordinates intact");

    // --- 4. Config & Alliance Key Management ---
    console.log("\n--- 4. Testing Alliance Configuration Storage ---");
    await storage.setConfig('alliance_passphrase', 'SecretAllianceKey_2026');
    await storage.setConfig('auto_sync_chat', true);

    const key = await storage.getConfig('alliance_passphrase');
    const autoSync = await storage.getConfig('auto_sync_chat');
    assert(key === 'SecretAllianceKey_2026', "Retrieved alliance passphrase");
    assert(autoSync === true, "Retrieved boolean auto_sync setting");

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

