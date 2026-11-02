/**
 * Comprehensive Unit Test for Modern OGame Core:
 * - 17 Ships Bitpacking Serialization
 * - AES-256-GCM Military Encryption
 * - Zero-Width In-Game Steganography
 */

import { OGameReportSerializer } from '../src/core/encoder.js';
import { ZeroWidthSteganography } from '../src/core/zero-width.js';
import { AllianceCrypto } from '../src/core/crypto.js';
import { SHIPS, PLAYER_CLASSES, LIFEFORMS } from '../src/core/constants.js';

console.log("==========================================================");
console.log("   TEST SUITE: OGAME MODERN ASYNCHRONOUS CORE (FASE 1)    ");
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

    // --- TEST 1: Full 17 Ships Bitpacking Serialization ---
    console.log("--- 1. Testing Full 17 Ships Bitpacking ---");
    const originalReport = {
        galaxy: 4,
        system: 212,
        position: 8,
        isMoon: true,
        playerClass: PLAYER_CLASSES.GENERAL,
        lifeform: LIFEFORMS.KAELESH,
        timestamp: Math.floor(Date.now() / 1000),
        resources: {
            metal: 4520000,
            crystal: 2180000,
            deuterium: 980000
        },
        fleet: {
            SC: 150,     // Nave pequeña de carga
            LC: 80,      // Nave grande de carga
            CR: 45,      // Crucero
            BS: 30,      // Nave de batalla
            BC: 20,      // Acorazado
            RIP: 2,      // Estrella de la muerte
            CRAW: 15,    // Taladrador (ID 217 - Moderno)
            REAP: 10,    // Segador (ID 218 - Moderno)
            PATH: 25     // Explorador (ID 219 - Moderno)
        }
    };

    const binaryPacket = OGameReportSerializer.pack(originalReport);
    console.log(`Binary Packed Size: ${binaryPacket.length} bytes (Raw JSON would be ~650 bytes)`);
    assert(binaryPacket.length < 50, `Binary packet is ultra-compact (${binaryPacket.length} bytes < 50 bytes)`);

    const unpacked = OGameReportSerializer.unpack(binaryPacket);
    assert(unpacked.galaxy === 4, "Coordinates Galaxy matches (4)");
    assert(unpacked.system === 212, "Coordinates System matches (212)");
    assert(unpacked.position === 8, "Coordinates Position matches (8)");
    assert(unpacked.isMoon === true, "Coordinates Moon flag matches (true)");
    assert(unpacked.playerClass === PLAYER_CLASSES.GENERAL, "Player Class matches (GENERAL)");
    assert(unpacked.lifeform === LIFEFORMS.KAELESH, "Lifeform matches (KAELESH)");
    assert(unpacked.resources.metal === 4520000, "Metal resource matches");
    assert(unpacked.resources.crystal === 2180000, "Crystal resource matches");
    assert(unpacked.resources.deuterium === 980000, "Deuterium resource matches");

    // Check modern ships integrity
    assert(unpacked.fleet.CRAW === 15, "Modern Ship CRAWLER (Taladrador) unpacked correctly (15)");
    assert(unpacked.fleet.REAP === 10, "Modern Ship REAPER (Segador) unpacked correctly (10)");
    assert(unpacked.fleet.PATH === 25, "Modern Ship PATHFINDER (Explorador) unpacked correctly (25)");
    assert(unpacked.fleet.SC === 150, "Classic Ship SC unpacked correctly (150)");

    // --- TEST 2: AES-256-GCM Encryption / Decryption ---
    console.log("\n--- 2. Testing End-to-End Encryption (AES-256-GCM) ---");
    const allianceSecret = "TopSecretAlliancePassword_2026!";
    const encryptedPacket = await AllianceCrypto.encrypt(binaryPacket, allianceSecret);
    console.log(`Encrypted Packet Size (with IV + Auth Tag): ${encryptedPacket.length} bytes`);
    assert(encryptedPacket.length === binaryPacket.length + 12 + 16, "Encrypted payload contains 12-byte IV and 16-byte Auth Tag");

    const decryptedPacket = await AllianceCrypto.decrypt(encryptedPacket, allianceSecret);
    assert(decryptedPacket.length === binaryPacket.length, "Decrypted packet length matches original");
    const decryptedReport = OGameReportSerializer.unpack(decryptedPacket);
    assert(decryptedReport.fleet.REAP === 10, "Decrypted report preserves Reaper count (10)");
    assert(decryptedReport.fleet.PATH === 25, "Decrypted report preserves Pathfinder count (25)");

    // --- TEST 3: Zero-Width Steganography in Human Chat ---
    console.log("\n--- 3. Testing Zero-Width Steganography in In-Game Chat ---");
    const humanChatMessage = "Buen ataque compañeros, a seguir subiendo en el ranking de flotas.";
    const stegoMessage = ZeroWidthSteganography.inject(humanChatMessage, encryptedPacket);

    console.log(`Visible message length: ${humanChatMessage.length} chars`);
    console.log(`Stego message length with hidden payload: ${stegoMessage.length} chars`);

    // Verify extraction
    const { cleanText, payload: extractedBytes } = ZeroWidthSteganography.extract(stegoMessage);
    assert(cleanText === humanChatMessage, "Extracted clean human text matches original exactly without visual artifacts");
    assert(extractedBytes !== null, "Hidden encrypted payload successfully detected and extracted");

    // Decrypt extracted payload
    const decryptedStegoPacket = await AllianceCrypto.decrypt(extractedBytes, allianceSecret);
    const finalReport = OGameReportSerializer.unpack(decryptedStegoPacket);

    assert(finalReport.galaxy === 4 && finalReport.system === 212 && finalReport.position === 8, "Coordinates preserved through full Chat Stego pipeline");
    assert(finalReport.fleet.CRAW === 15 && finalReport.fleet.REAP === 10 && finalReport.fleet.PATH === 25, "All modern ships recovered flawlessly from chat message");

    // --- SUMMARY ---
    console.log("\n==========================================================");
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==========================================================");

    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error("Fatal Test Failure:", err);
    process.exit(1);
});

