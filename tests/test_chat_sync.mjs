/**
 * Unit Test for Phase 4: In-Game Chat Asynchronous Sync Bus
 * Tests peer-to-peer transmission over OGame chat with E2EE and Zero-Width Steganography.
 */

import { OGameStorageEngine } from '../src/storage/db.js';
import { ChatSyncBus } from '../src/chat/chat-bus.js';
import { PLAYER_CLASSES, LIFEFORMS } from '../src/core/constants.js';

console.log("==========================================================");
console.log("   TEST SUITE: IN-GAME CHAT ASYNC SYNC BUS (FASE 4)       ");
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

    const ALLIANCE_PASSPHRASE = "Orion_Dominion_Secret_2026";

    // 1. Setup Scout (Player A) and Admiral (Player B) storage & buses
    const storageA = new OGameStorageEngine();
    await storageA.init();

    const storageB = new OGameStorageEngine();
    await storageB.init();

    let bReceivedReport = null;
    let bSenderInfo = null;

    const busA = new ChatSyncBus(storageA, {
        passphrase: ALLIANCE_PASSPHRASE,
        autoBroadcast: true
    });

    const busB = new ChatSyncBus(storageB, {
        passphrase: ALLIANCE_PASSPHRASE,
        onReportReceived: (report, sender) => {
            bReceivedReport = report;
            bSenderInfo = sender;
        }
    });

    assert(busA !== null && busB !== null, "Scout and Admiral ChatSyncBuses initialized");

    // 2. Scout scans enemy fleet in System 3:250:8
    console.log("\n--- 1. Scout scans target with Modern Fleet ---");
    const scannedReport = {
        galaxy: 3,
        system: 250,
        position: 8,
        isMoon: true,
        playerClass: PLAYER_CLASSES.GENERAL,
        lifeform: LIFEFORMS.ROCKTAL,
        timestamp: Math.floor(Date.now() / 1000),
        resources: {
            metal: 12500000,
            crystal: 8200000,
            deuterium: 3400000
        },
        fleet: {
            SC: 200,
            LC: 80,
            CR: 150,
            BS: 90,
            BC: 60,
            RIP: 3,
            CRAW: 120, // Modern Taladrador (Collector)
            REAP: 45,  // Modern Segador (General)
            PATH: 30   // Modern Explorador (Discoverer)
        }
    };

    await storageA.saveReport(scannedReport);
    assert(true, "Scout saved report locally in Player A storage");

    // 3. Scout generates chat message with hidden payload
    console.log("\n--- 2. Packaging & Steganography Generation ---");
    const customMessage = "Buenas noches compañeros, expediciones finalizadas.";
    const stegoChatMessage = await busA.prepareStegoMessage(scannedReport, customMessage);

    console.log(`Generated Chat Message: "${stegoChatMessage.substring(0, 40)}..."`);
    assert(stegoChatMessage.includes("Buenas noches compañeros"), "Chat message preserves human cover text");
    assert(stegoChatMessage.length > customMessage.length + 50, "Chat message contains hidden binary payload");

    // 4. Transmission over OGame Chat to Admiral (Player B)
    console.log("\n--- 3. In-Game Chat Transmission Simulation ---");
    const senderData = { playerId: 5001, playerName: "ExploradorAlpha", timestamp: Date.now() };
    const result = await busB.handleIncomingChatMessage(stegoChatMessage, senderData);

    assert(result !== null, "Admiral's bus successfully intercepted and decoded message");
    assert(result.cleanText === customMessage, "Clean text matches original cover message for UI rendering");
    assert(bReceivedReport !== null, "onReportReceived callback triggered in Admiral's engine");

    // 5. Verify Admiral's IndexedDB has the complete report
    console.log("\n--- 4. Data Fidelity in Admiral's Local Storage ---");
    const admiralSavedReport = await storageB.getLatestReport(3, 250, 8, true);
    assert(admiralSavedReport !== null, "Admiral's storage retrieved report for 3:250:8 (Moon)");
    assert(admiralSavedReport.resources.metal === 12500000, "Metal resource verified (12,500,000)");
    assert(admiralSavedReport.resources.crystal === 8200000, "Crystal resource verified (8,200,000)");
    assert(admiralSavedReport.resources.deuterium === 3400000, "Deuterium resource verified (3,400,000)");

    // Verify all modern ships in Admiral's database
    assert(admiralSavedReport.fleet.REAP === 45, "Modern Ship REAPER (Segador) verified in Admiral DB (45)");
    assert(admiralSavedReport.fleet.PATH === 30, "Modern Ship PATHFINDER (Explorador) verified in Admiral DB (30)");
    assert(admiralSavedReport.fleet.CRAW === 120, "Modern Ship CRAWLER (Taladrador) verified in Admiral DB (120)");
    assert(admiralSavedReport.fleet.RIP === 3, "Deathstar count verified (3)");

    // 6. Security & E2EE Isolation: Enemy Spy cannot decrypt
    console.log("\n--- 5. Security Check: Rival Alliance Isolation ---");
    const enemyStorage = new OGameStorageEngine();
    await enemyStorage.init();

    const enemyBus = new ChatSyncBus(enemyStorage, {
        passphrase: "WrongRivalAlliancePassword_999!"
    });

    const enemyResult = await enemyBus.handleIncomingChatMessage(stegoChatMessage, senderData);
    assert(enemyResult === null, "Enemy with different passphrase failed to decrypt or extract report");

    const enemyReport = await enemyStorage.getLatestReport(3, 250, 8, true);
    assert(enemyReport === null, "Enemy storage remains completely empty (Zero data leakage)");

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

