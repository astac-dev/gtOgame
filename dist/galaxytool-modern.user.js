// ==UserScript==
// @name         Galaxytool Modern - Asynchronous Alliance Intelligence
// @namespace    https://galaxytool.modern/
// @version      6.0.0
// @description  Local-First, Zero-Database, Asynchronous Intelligence & Stealth HUD for Modern OGame (v7 - v11+)
// @author       Galaxytool Modern Team
// @match        *://*.ogame.gameforge.com/game/index.php*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      localhost
// @connect      127.0.0.1
// ==/UserScript==

(function() {
'use strict';

console.log("[Galaxytool-Modern] Bootstrapping Asynchronous Alliance Core v6.0.0...");

// ==========================================
// SOURCE: src/core/constants.js
// ==========================================
/**
 * OGame Modern Core Constants (v7 - v11+)
 * Full 17 ships mapping, classes, lifeforms, and protocol constants.
 */

const PROTOCOL_MAGIC = 0x47; // 'G' for Galaxytool
const PROTOCOL_VERSION = 1;

const SHIPS = [
    { id: 202, key: 'SC', legacy: 'kt', name: 'Nave pequeña de carga', capacity: 5000, speed: 5000 },
    { id: 203, key: 'LC', legacy: 'gt', name: 'Nave grande de carga', capacity: 25000, speed: 7500 },
    { id: 204, key: 'LF', legacy: 'lj', name: 'Cazador ligero', capacity: 50, speed: 12500 },
    { id: 205, key: 'HF', legacy: 'sj', name: 'Cazador pesado', capacity: 100, speed: 10000 },
    { id: 206, key: 'CR', legacy: 'krz', name: 'Crucero', capacity: 800, speed: 15000 },
    { id: 207, key: 'BS', legacy: 'ss', name: 'Nave de batalla', capacity: 1500, speed: 10000 },
    { id: 208, key: 'COL', legacy: 'kolo', name: 'Colonizador', capacity: 7500, speed: 2500 },
    { id: 209, key: 'REC', legacy: 'rec', name: 'Reciclador', capacity: 20000, speed: 2000 },
    { id: 210, key: 'ESP', legacy: 'spio', name: 'Sonda de espionaje', capacity: 5, speed: 100000000 },
    { id: 211, key: 'BOM', legacy: 'bomb', name: 'Bombardero', capacity: 500, speed: 4000 },
    { id: 212, key: 'SAT', legacy: 'sat', name: 'Satélite solar', capacity: 0, speed: 0 },
    { id: 213, key: 'DEST', legacy: 'zerri', name: 'Destructor', capacity: 2000, speed: 5000 },
    { id: 214, key: 'RIP', legacy: 'ds', name: 'Estrella de la muerte', capacity: 1000000, speed: 100 },
    { id: 215, key: 'BC', legacy: 'skrz', name: 'Acorazado', capacity: 750, speed: 10000 },
    // Modern v7+ Ships
    { id: 217, key: 'CRAW', legacy: 'craw', name: 'Taladrador (Crawler)', capacity: 0, speed: 0 },
    { id: 218, key: 'REAP', legacy: 'reap', name: 'Segador (Reaper)', capacity: 10000, speed: 7000 },
    { id: 219, key: 'PATH', legacy: 'path', name: 'Explorador (Pathfinder)', capacity: 10000, speed: 12000 }
];

const SHIP_KEY_INDEX = {};
const SHIP_ID_INDEX = {};
SHIPS.forEach((ship, idx) => {
    SHIP_KEY_INDEX[ship.key] = idx;
    SHIP_ID_INDEX[ship.id] = idx;
    if (ship.legacy) SHIP_KEY_INDEX[ship.legacy] = idx;
});

const PLAYER_CLASSES = {
    NONE: 0,
    COLLECTOR: 1,
    GENERAL: 2,
    DISCOVERER: 3
};

const ALLIANCE_CLASSES = {
    NONE: 0,
    TRADER: 1,
    WARRIORS: 2,
    RESEARCHERS: 3
};

const LIFEFORMS = {
    NONE: 0,
    HUMANS: 1,
    ROCKTAL: 2,
    MECHAS: 3,
    KAELESH: 4
};


// ==========================================
// SOURCE: src/core/encoder.js
// ==========================================
/**
 * OGame Modern Bitpacking Binary Encoder
 * High-density binary serialization for espionage reports and galaxy coordinates.
 */


// Base Epoch: 2026-01-01 00:00:00 UTC in seconds
const EPOCH_BASE_2026 = 1767225600;

class BinaryEncoder {
    constructor() {
        this.buffer = new Uint8Array(1024);
        this.offset = 0;
    }

    ensureCapacity(needed) {
        if (this.offset + needed > this.buffer.length) {
            const newBuf = new Uint8Array(Math.max(this.buffer.length * 2, this.offset + needed));
            newBuf.set(this.buffer);
            this.buffer = newBuf;
        }
    }

    writeUint8(val) {
        this.ensureCapacity(1);
        this.buffer[this.offset++] = val & 0xFF;
    }

    writeUint16(val) {
        this.ensureCapacity(2);
        this.buffer[this.offset++] = (val >> 8) & 0xFF;
        this.buffer[this.offset++] = val & 0xFF;
    }

    writeUint32(val) {
        this.ensureCapacity(4);
        this.buffer[this.offset++] = (val >> 24) & 0xFF;
        this.buffer[this.offset++] = (val >> 16) & 0xFF;
        this.buffer[this.offset++] = (val >> 8) & 0xFF;
        this.buffer[this.offset++] = val & 0xFF;
    }

    writeVarint(val) {
        let v = Math.max(0, Math.floor(val));
        while (v >= 0x80) {
            this.writeUint8((v & 0x7F) | 0x80);
            v = Math.floor(v / 128);
        }
        this.writeUint8(v & 0x7F);
    }

    getBytes() {
        return this.buffer.slice(0, this.offset);
    }
}

class BinaryDecoder {
    constructor(uint8Array) {
        this.buffer = uint8Array;
        this.offset = 0;
    }

    readUint8() {
        if (this.offset >= this.buffer.length) throw new Error("Unexpected end of buffer");
        return this.buffer[this.offset++];
    }

    readUint16() {
        const b1 = this.readUint8();
        const b2 = this.readUint8();
        return (b1 << 8) | b2;
    }

    readUint32() {
        const b1 = this.readUint8();
        const b2 = this.readUint8();
        const b3 = this.readUint8();
        const b4 = this.readUint8();
        return (((b1 << 24) >>> 0) | (b2 << 16) | (b3 << 8) | b4) >>> 0;
    }

    readVarint() {
        let result = 0;
        let shift = 0;
        while (true) {
            const byte = this.readUint8();
            result += (byte & 0x7F) * Math.pow(2, shift);
            if ((byte & 0x80) === 0) break;
            shift += 7;
            if (shift > 49) throw new Error("Varint overflow");
        }
        return result;
    }

    getRemaining() {
        return this.buffer.length - this.offset;
    }
}

/**
 * Main Espionage & Military Report Serializer
 */
class OGameReportSerializer {
    /**
     * Packs an espionage report into a tight binary buffer (~40-45 bytes)
     * @param {Object} report
     * @returns {Uint8Array}
     */
    static pack(report) {
        const enc = new BinaryEncoder();

        // 1. Magic & Version (2 bytes)
        enc.writeUint8(PROTOCOL_MAGIC);
        enc.writeUint8(PROTOCOL_VERSION);

        // 2. Packed Coordinates & Flags (4 bytes)
        // [Galaxy: 4b (1-9)] [System: 10b (1-499)] [Position: 4b (1-15)] [Moon: 1b] [Class: 3b] [Lifeform: 3b]
        const galaxy = (report.galaxy || 1) & 0x0F;
        const system = (report.system || 1) & 0x03FF;
        const position = (report.position || 1) & 0x0F;
        const isMoon = report.isMoon ? 1 : 0;
        const playerClass = (report.playerClass || 0) & 0x07;
        const lifeform = (report.lifeform || 0) & 0x07;

        let coordWord = 0;
        coordWord |= (galaxy << 21);
        coordWord |= (system << 11);
        coordWord |= (position << 7);
        coordWord |= (isMoon << 6);
        coordWord |= (playerClass << 3);
        coordWord |= lifeform;
        enc.writeUint32(coordWord >>> 0);

        // 3. Timestamp: minutes relative to EPOCH_BASE_2026 (4 bytes)
        const tsSeconds = report.timestamp ? Math.floor(report.timestamp) : Math.floor(Date.now() / 1000);
        const relMinutes = Math.max(0, Math.floor((tsSeconds - EPOCH_BASE_2026) / 60));
        enc.writeUint32(relMinutes);

        // 4. Resources (Metal, Crystal, Deuterium) via Varints
        enc.writeVarint(report.resources?.metal || 0);
        enc.writeVarint(report.resources?.crystal || 0);
        enc.writeVarint(report.resources?.deuterium || 0);

        // 5. Fleets: 32-bit Bitmask followed by Varints for present ships
        let fleetMask = 0;
        const activeShips = [];

        if (report.fleet) {
            for (let i = 0; i < SHIPS.length; i++) {
                const ship = SHIPS[i];
                const count = report.fleet[ship.key] || report.fleet[ship.id] || report.fleet[ship.legacy] || 0;
                if (count > 0) {
                    fleetMask |= (1 << i);
                    activeShips.push(count);
                }
            }
        }
        enc.writeUint32(fleetMask >>> 0);

        for (const count of activeShips) {
            enc.writeVarint(count);
        }

        return enc.getBytes();
    }

    /**
     * Unpacks a binary buffer back into an Espionage Report object
     * @param {Uint8Array} bytes
     * @returns {Object}
     */
    static unpack(bytes) {
        const dec = new BinaryDecoder(bytes);

        const magic = dec.readUint8();
        if (magic !== PROTOCOL_MAGIC) throw new Error("Invalid magic byte: not an OGame report packet");
        const version = dec.readUint8();

        const coordWord = dec.readUint32();
        const galaxy = (coordWord >> 21) & 0x0F;
        const system = (coordWord >> 11) & 0x03FF;
        const position = (coordWord >> 7) & 0x0F;
        const isMoon = ((coordWord >> 6) & 0x01) === 1;
        const playerClass = (coordWord >> 3) & 0x07;
        const lifeform = coordWord & 0x07;

        const relMinutes = dec.readUint32();
        const timestamp = EPOCH_BASE_2026 + (relMinutes * 60);

        const metal = dec.readVarint();
        const crystal = dec.readVarint();
        const deuterium = dec.readVarint();

        const fleetMask = dec.readUint32();
        const fleet = {};

        for (let i = 0; i < SHIPS.length; i++) {
            if ((fleetMask & (1 << i)) !== 0) {
                const count = dec.readVarint();
                fleet[SHIPS[i].key] = count;
            }
        }

        return {
            version,
            galaxy,
            system,
            position,
            isMoon,
            playerClass,
            lifeform,
            timestamp,
            resources: { metal, crystal, deuterium },
            fleet
        };
    }
}


// ==========================================
// SOURCE: src/core/crypto.js
// ==========================================
/**
 * Web Crypto AES-256-GCM Encryption Engine
 * End-to-End Encryption for Alliance In-Game Transmissions.
 * Compatible with modern Browsers (window.crypto) and Node.js v18+ (globalThis.crypto).
 */

const cryptoObj = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : null;

class AllianceCrypto {
    /**
     * Derives an AES-GCM 256-bit CryptoKey from an alliance shared secret
     * @param {string} passphrase Shared secret defined by the alliance
     * @param {Uint8Array} salt 16-byte salt
     * @returns {Promise<CryptoKey>}
     */
    static async deriveKey(passphrase, salt) {
        if (!cryptoObj?.subtle) {
            throw new Error("Web Crypto API (crypto.subtle) is not available in this environment");
        }

        const enc = new TextEncoder();
        const baseKey = await cryptoObj.subtle.importKey(
            'raw',
            enc.encode(passphrase),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        return await cryptoObj.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 50000,
                hash: 'SHA-256'
            },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypts plaintext bytes using AES-256-GCM with static alliance salt & random IV
     * @param {Uint8Array} data Plaintext binary payload
     * @param {string} passphrase Alliance secret password
     * @returns {Promise<Uint8Array>} [12 bytes IV] + [Ciphertext + 16 bytes GCM Auth Tag]
     */
    static async encrypt(data, passphrase) {
        // Deterministic salt for the alliance key derivation so all members can decrypt
        const salt = new TextEncoder().encode("OGAME_GT_ALLIANCE_SALT_2026");
        const key = await this.deriveKey(passphrase, salt);

        const iv = new Uint8Array(12);
        cryptoObj.getRandomValues(iv);

        const ciphertextBuffer = await cryptoObj.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        const ciphertext = new Uint8Array(ciphertextBuffer);
        const result = new Uint8Array(iv.length + ciphertext.length);
        result.set(iv, 0);
        result.set(ciphertext, iv.length);
        return result;
    }

    /**
     * Decrypts ciphertext bytes using AES-256-GCM
     * @param {Uint8Array} encryptedBytes [12 bytes IV] + [Ciphertext + 16 bytes Tag]
     * @param {string} passphrase Alliance secret password
     * @returns {Promise<Uint8Array>} Decrypted original payload
     */
    static async decrypt(encryptedBytes, passphrase) {
        if (encryptedBytes.length < 28) throw new Error("Encrypted payload too short");

        const salt = new TextEncoder().encode("OGAME_GT_ALLIANCE_SALT_2026");
        const key = await this.deriveKey(passphrase, salt);

        const iv = encryptedBytes.slice(0, 12);
        const ciphertext = encryptedBytes.slice(12);

        const decryptedBuffer = await cryptoObj.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );

        return new Uint8Array(decryptedBuffer);
    }
}


// ==========================================
// SOURCE: src/core/zero-width.js
// ==========================================
/**
 * Zero-Width Steganography Engine for OGame Chat Transmission
 * Invisibility encoder: packs binary payloads into human chat messages.
 */

const ZW_START = '\uFEFF';  // Zero-Width No-Break Space (Header)
const ZW_END   = '\u2060';  // Word Joiner (Footer)
const ZW_BIT_0 = '\u200B';  // Zero-Width Space ('00')
const ZW_BIT_1 = '\u200C';  // Zero-Width Non-Joiner ('01')
const ZW_BIT_2 = '\u200D';  // Zero-Width Joiner ('10')
const ZW_BIT_3 = '\u200E';  // Left-to-Right Mark ('11')

const DIBIT_MAP = [ZW_BIT_0, ZW_BIT_1, ZW_BIT_2, ZW_BIT_3];
const CHAR_TO_DIBIT = {
    [ZW_BIT_0]: 0,
    [ZW_BIT_1]: 1,
    [ZW_BIT_2]: 2,
    [ZW_BIT_3]: 3
};

class ZeroWidthSteganography {
    /**
     * Converts raw bytes into a compact zero-width invisible character string (2 bits per char)
     * @param {Uint8Array} bytes
     * @returns {string} Invisible unicode string
     */
    static bytesToZeroWidth(bytes) {
        let result = ZW_START;
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i];
            // Encode byte into 4 dibits (2 bits each)
            result += DIBIT_MAP[(b >> 6) & 0x03];
            result += DIBIT_MAP[(b >> 4) & 0x03];
            result += DIBIT_MAP[(b >> 2) & 0x03];
            result += DIBIT_MAP[b & 0x03];
        }
        result += ZW_END;
        return result;
    }

    /**
     * Extracts and decodes binary bytes from a zero-width string
     * @param {string} text Containing invisible characters
     * @returns {Uint8Array|null} Extracted bytes or null if not found
     */
    static zeroWidthToBytes(text) {
        const startIdx = text.indexOf(ZW_START);
        if (startIdx === -1) return null;
        const endIdx = text.indexOf(ZW_END, startIdx);
        if (endIdx === -1) return null;

        const payloadStr = text.substring(startIdx + 1, endIdx);
        const dibits = [];
        for (let i = 0; i < payloadStr.length; i++) {
            const ch = payloadStr[i];
            if (CHAR_TO_DIBIT[ch] !== undefined) {
                dibits.push(CHAR_TO_DIBIT[ch]);
            }
        }

        if (dibits.length % 4 !== 0) {
            // Incomplete or corrupted packet
            return null;
        }

        const bytes = new Uint8Array(dibits.length / 4);
        for (let i = 0; i < bytes.length; i++) {
            const d0 = dibits[i * 4];
            const d1 = dibits[i * 4 + 1];
            const d2 = dibits[i * 4 + 2];
            const d3 = dibits[i * 4 + 3];
            bytes[i] = (d0 << 6) | (d1 << 4) | (d2 << 2) | d3;
        }

        return bytes;
    }

    /**
     * Injects an invisible binary payload into a normal human message
     * @param {string} visibleText e.g. "Hola compañeros, buen ataque hoy"
     * @param {Uint8Array} payload
     * @returns {string} Text with hidden payload
     */
    static inject(visibleText, payload) {
        const zw = this.bytesToZeroWidth(payload);
        return visibleText + zw;
    }

    /**
     * Extracts payload and returns both payload and clean human text
     * @param {string} textWithHiddenPayload
     * @returns {{ cleanText: string, payload: Uint8Array|null }}
     */
    static extract(textWithHiddenPayload) {
        const payload = this.zeroWidthToBytes(textWithHiddenPayload);
        // Clean all zero-width characters for UI rendering
        const cleanText = textWithHiddenPayload.replace(/[\uFEFF\u2060\u200B\u200C\u200D\u200E]/g, '');
        return { cleanText, payload };
    }
}


// ==========================================
// SOURCE: src/storage/db.js
// ==========================================
/**
 * OGame Modern Storage Engine (Local-First / Zero-Database)
 * Dual-Mode Storage:
 * - Browser: High-performance native IndexedDB (B-Tree indexed, zero CDN dependencies).
 * - Node.js / CLI: In-memory & JSON file backed storage.
 */

const DB_NAME = 'OGameGalaxytoolDB';
const DB_VERSION = 1;

class OGameStorageEngine {
    constructor(options = {}) {
        this.isBrowser = typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
        this.db = null;
        this.memoryStore = {
            planets: new Map(),
            reports: new Map(),
            players: new Map(),
            alliances: new Map(),
            config: new Map()
        };
    }

    /**
     * Initializes the database connection and object stores
     * @returns {Promise<OGameStorageEngine>}
     */
    async init() {
        if (!this.isBrowser) {
            // Memory mode for Node.js / CLI
            return this;
        }

        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 1. Planets Store: Key = "G:S:P:Moon" (e.g. "1:154:3:0")
                if (!db.objectStoreNames.contains('planets')) {
                    const planetStore = db.createObjectStore('planets', { keyPath: 'coordKey' });
                    planetStore.createIndex('galaxy', 'galaxy', { unique: false });
                    planetStore.createIndex('system', ['galaxy', 'system'], { unique: false });
                    planetStore.createIndex('playerId', 'playerId', { unique: false });
                    planetStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    planetStore.createIndex('status', 'status', { unique: false }); // i, I, v, etc.
                }

                // 2. Espionage & Military Reports Store: Key = id
                if (!db.objectStoreNames.contains('reports')) {
                    const reportStore = db.createObjectStore('reports', { keyPath: 'id', autoIncrement: true });
                    reportStore.createIndex('coordKey', 'coordKey', { unique: false });
                    reportStore.createIndex('timestamp', 'timestamp', { unique: false });
                    reportStore.createIndex('playerId', 'playerId', { unique: false });
                }

                // 3. Players Store: Key = id (ogame_playerid)
                if (!db.objectStoreNames.contains('players')) {
                    const playerStore = db.createObjectStore('players', { keyPath: 'id' });
                    playerStore.createIndex('name', 'name', { unique: false });
                    playerStore.createIndex('allianceId', 'allianceId', { unique: false });
                    playerStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // 4. Alliances Store: Key = id (ogame_allyid)
                if (!db.objectStoreNames.contains('alliances')) {
                    const allyStore = db.createObjectStore('alliances', { keyPath: 'id' });
                    allyStore.createIndex('tag', 'tag', { unique: false });
                }

                // 5. Config & Alliance Shared Keys Store
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this);
            };

            request.onerror = (event) => {
                reject(new Error(`Failed to open IndexedDB: ${event.target.error}`));
            };
        });
    }

    /**
     * Helper to create coordinate key "G:S:P:M"
     */
    static makeCoordKey(galaxy, system, position, isMoon = false) {
        return `${galaxy}:${system}:${position}:${isMoon ? 1 : 0}`;
    }

    // ==========================================
    // PLANETS & GALAXY API
    // ==========================================

    async savePlanet(planet) {
        const coordKey = OGameStorageEngine.makeCoordKey(
            planet.galaxy, planet.system, planet.position, planet.isMoon
        );
        const record = {
            ...planet,
            coordKey,
            updatedAt: planet.updatedAt || Date.now()
        };

        if (!this.isBrowser) {
            this.memoryStore.planets.set(coordKey, record);
            return record;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('planets', 'readwrite');
            const store = tx.objectStore('planets');
            const req = store.put(record);
            req.onsuccess = () => resolve(record);
            req.onerror = () => reject(req.error);
        });
    }

    async getPlanet(galaxy, system, position, isMoon = false) {
        const coordKey = OGameStorageEngine.makeCoordKey(galaxy, system, position, isMoon);

        if (!this.isBrowser) {
            return this.memoryStore.planets.get(coordKey) || null;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('planets', 'readonly');
            const store = tx.objectStore('planets');
            const req = store.get(coordKey);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async getSystem(galaxy, system) {
        if (!this.isBrowser) {
            const result = [];
            for (const p of this.memoryStore.planets.values()) {
                if (p.galaxy === galaxy && p.system === system) {
                    result.push(p);
                }
            }
            return result.sort((a, b) => a.position - b.position);
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('planets', 'readonly');
            const store = tx.objectStore('planets');
            const index = store.index('system');
            const range = IDBKeyRange.only([galaxy, system]);
            const req = index.getAll(range);
            req.onsuccess = () => {
                const sorted = (req.result || []).sort((a, b) => a.position - b.position);
                resolve(sorted);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async deletePlanet(galaxy, system, position, isMoon = false) {
        const coordKey = OGameStorageEngine.makeCoordKey(galaxy, system, position, isMoon);
        if (!this.isBrowser) {
            this.memoryStore.planets.delete(coordKey);
            return true;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('planets', 'readwrite');
            const store = tx.objectStore('planets');
            const req = store.delete(coordKey);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Synchronizes an entire solar system with the latest live view.
     * Deletes any celestial body in (galaxy, system) that is no longer present.
     * Inserts/updates the remaining active bodies.
     */
    async syncSolarSystem(galaxy, system, newPlanets = []) {
        const validPlanets = Array.isArray(newPlanets) ? newPlanets : [];
        const incomingKeys = new Set(
            validPlanets.map(p => OGameStorageEngine.makeCoordKey(galaxy, system, p.position, p.isMoon))
        );

        if (!this.isBrowser) {
            // Memory store mode
            for (const [key, p] of this.memoryStore.planets.entries()) {
                if (p.galaxy === galaxy && p.system === system && !incomingKeys.has(key)) {
                    this.memoryStore.planets.delete(key);
                }
            }
            for (const p of validPlanets) {
                await this.savePlanet({ ...p, galaxy, system });
            }
            return this.getSystem(galaxy, system);
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('planets', 'readwrite');
            const store = tx.objectStore('planets');
            const index = store.index('system');
            const req = index.getAll(IDBKeyRange.only([galaxy, system]));

            req.onsuccess = () => {
                const existing = req.result || [];
                // Delete obsolete planets that are no longer in this solar system
                for (const oldBody of existing) {
                    if (!incomingKeys.has(oldBody.coordKey)) {
                        store.delete(oldBody.coordKey);
                    }
                }

                // Put current active celestial bodies
                for (const p of validPlanets) {
                    const coordKey = OGameStorageEngine.makeCoordKey(galaxy, system, p.position, p.isMoon);
                    const record = {
                        ...p,
                        galaxy,
                        system,
                        coordKey,
                        updatedAt: p.updatedAt || Date.now()
                    };
                    store.put(record);
                }

                tx.oncomplete = () => {
                    this.getSystem(galaxy, system).then(resolve).catch(reject);
                };
            };
            req.onerror = () => reject(req.error);
        });
    }

    async getAllPlanets() {
        if (!this.isBrowser) {
            return Array.from(this.memoryStore.planets.values());
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('planets', 'readonly');
            const store = tx.objectStore('planets');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    // ==========================================
    // ESPIONAGE & COMBAT REPORTS API
    // ==========================================

    async saveReport(report) {
        const coordKey = OGameStorageEngine.makeCoordKey(
            report.galaxy, report.system, report.position, report.isMoon
        );
        const record = {
            ...report,
            coordKey,
            timestamp: report.timestamp || Math.floor(Date.now() / 1000)
        };

        if (!this.isBrowser) {
            const id = report.id || (this.memoryStore.reports.size + 1);
            record.id = id;
            this.memoryStore.reports.set(id, record);
            return record;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('reports', 'readwrite');
            const store = tx.objectStore('reports');
            const req = store.put(record);
            req.onsuccess = (e) => {
                record.id = e.target.result;
                resolve(record);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async getLatestReport(galaxy, system, position, isMoon = false) {
        const coordKey = OGameStorageEngine.makeCoordKey(galaxy, system, position, isMoon);

        if (!this.isBrowser) {
            let latest = null;
            for (const r of this.memoryStore.reports.values()) {
                if (r.coordKey === coordKey) {
                    if (!latest || r.timestamp > latest.timestamp) {
                        latest = r;
                    }
                }
            }
            return latest;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('reports', 'readonly');
            const store = tx.objectStore('reports');
            const index = store.index('coordKey');
            const req = index.getAll(IDBKeyRange.only(coordKey));

            req.onsuccess = () => {
                const reports = req.result || [];
                if (reports.length === 0) return resolve(null);
                reports.sort((a, b) => b.timestamp - a.timestamp);
                resolve(reports[0]);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async getAllReports() {
        if (!this.isBrowser) {
            return Array.from(this.memoryStore.reports.values());
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('reports', 'readonly');
            const store = tx.objectStore('reports');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    // ==========================================
    // PLAYERS & ALLIANCES API
    // ==========================================

    async savePlayer(player) {
        const record = {
            ...player,
            updatedAt: player.updatedAt || Date.now()
        };

        if (!this.isBrowser) {
            this.memoryStore.players.set(player.id, record);
            return record;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('players', 'readwrite');
            const store = tx.objectStore('players');
            const req = store.put(record);
            req.onsuccess = () => resolve(record);
            req.onerror = () => reject(req.error);
        });
    }

    async getPlayer(playerId) {
        if (!this.isBrowser) {
            return this.memoryStore.players.get(playerId) || null;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('players', 'readonly');
            const store = tx.objectStore('players');
            const req = store.get(playerId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    // ==========================================
    // CONFIG & ALLIANCE KEYS API
    // ==========================================

    async setConfig(key, value) {
        const record = { key, value };
        if (!this.isBrowser) {
            this.memoryStore.config.set(key, value);
            return value;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('config', 'readwrite');
            const store = tx.objectStore('config');
            const req = store.put(record);
            req.onsuccess = () => resolve(value);
            req.onerror = () => reject(req.error);
        });
    }

    async getConfig(key, defaultValue = null) {
        if (!this.isBrowser) {
            return this.memoryStore.config.has(key) ? this.memoryStore.config.get(key) : defaultValue;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('config', 'readonly');
            const store = tx.objectStore('config');
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
            req.onerror = () => reject(req.error);
        });
    }

    async clearAll() {
        if (!this.isBrowser) {
            this.memoryStore.planets.clear();
            this.memoryStore.reports.clear();
            this.memoryStore.players.clear();
            this.memoryStore.alliances.clear();
            this.memoryStore.config.clear();
            return true;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['planets', 'reports', 'players', 'alliances'], 'readwrite');
            tx.objectStore('planets').clear();
            tx.objectStore('reports').clear();
            tx.objectStore('players').clear();
            tx.objectStore('alliances').clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }
}


// ==========================================
// SOURCE: src/storage/jsonl.js
// ==========================================
/**
 * JSON & JSONL (JSON Lines) Serialization & Analytics Engine
 * File-system and backup adapter with OGame military looting algorithms.
 */


class JSONLAdapter {
    /**
     * Serializes an array of espionage reports into a JSON Lines string
     * @param {Array<Object>} reports
     * @returns {string} One JSON document per line
     */
    static exportToJSONL(reports) {
        return reports
            .map(r => JSON.stringify(r))
            .join('\n') + '\n';
    }

    /**
     * Parses a JSON Lines string into an array of report objects
     * Robust against empty lines or malformed rows.
     * @param {string} jsonlContent
     * @returns {Array<Object>}
     */
    static parseFromJSONL(jsonlContent) {
        const lines = jsonlContent.split(/\r?\n/);
        const results = [];

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed) continue;
            try {
                results.push(JSON.parse(trimmed));
            } catch (err) {
                console.warn(`[JSONLAdapter] Skipping corrupted line ${i + 1}: ${err.message}`);
            }
        }
        return results;
    }

    /**
     * Partitions a galaxy dataset into blocks of systems (e.g. 100 systems per file)
     * @param {number} galaxy
     * @param {number} startSys
     * @param {number} endSys
     * @param {Array<Object>} planets
     * @returns {string} Compact formatted JSON
     */
    static exportGalaxyBlock(galaxy, startSys, endSys, planets) {
        const payload = {
            g: galaxy,
            from: startSys,
            to: endSys,
            exportedAt: Date.now(),
            planets: planets.filter(p => p.galaxy === galaxy && p.system >= startSys && p.system <= endSys)
        };
        return JSON.stringify(payload, null, 2);
    }

    /**
     * Calculates the exact tactical looting requirements for a spy report
     * Calculates fleet count (SC / LC / PATH) needed to harvest 50% or 75% plunder.
     * @param {Object} report Espionage report containing resources
     * @param {number} plunderRatio 0.5 (standard), 0.75 (inactives / honor target)
     * @returns {Object} Total plunderable resources and ship counts required
     */
    static calculatePlunder(report, plunderRatio = 0.5) {
        const m = report.resources?.metal || 0;
        const c = report.resources?.crystal || 0;
        const d = report.resources?.deuterium || 0;

        const plunderMetal = Math.floor(m * plunderRatio);
        const plunderCrystal = Math.floor(c * plunderRatio);
        const plunderDeut = Math.floor(d * plunderRatio);
        const totalPlunder = plunderMetal + plunderCrystal + plunderDeut;

        // Capacity per ship:
        // SC (Small Cargo - ID 202): 5,000 base
        // LC (Large Cargo - ID 203): 25,000 base
        // PATH (Pathfinder - ID 219): 10,000 base
        return {
            totalResources: m + c + d,
            plunderable: {
                metal: plunderMetal,
                crystal: plunderCrystal,
                deuterium: plunderDeut,
                total: totalPlunder
            },
            shipsNeeded: {
                SC: Math.ceil(totalPlunder / 5000),
                LC: Math.ceil(totalPlunder / 25000),
                PATH: Math.ceil(totalPlunder / 10000)
            }
        };
    }
}


// ==========================================
// SOURCE: src/chat/chat-bus.js
// ==========================================
/**
 * OGame Alliance Chat Asynchronous Sync Bus
 * Autonomous In-Game Intelligence Propagation using Zero-Width Steganography & E2EE.
 */




// Natural cover messages to mask zero-width steganographic payloads
const NATURAL_COVER_MESSAGES = [
    "Buenas noches compañeros",
    "Buen vuelo a todos con las expediciones",
    "Todo tranquilo por mi sector",
    "Revisando movimientos de flotas en la zona",
    "Subiendo minas y recolectando escombros",
    "Ojo con las actividades en los sistemas cercanos",
    "Coordinando rutas de transporte",
    "Actualizando bases y defensas planetarias"
];

class ChatSyncBus {
    constructor(storageEngine, options = {}) {
        this.storage = storageEngine;
        this.alliancePassphrase = options.passphrase || 'DefaultAllianceSecret2026';
        this.onReportReceived = options.onReportReceived || null;
        this.queue = [];
        this.isProcessingQueue = false;
        this.processedPacketHashes = new Set();
        this.autoBroadcast = options.autoBroadcast ?? true;
    }

    /**
     * Updates the alliance encryption secret
     * @param {string} passphrase
     */
    setPassphrase(passphrase) {
        this.alliancePassphrase = passphrase;
    }

    /**
     * Queues an espionage report to be broadcasted to the alliance via in-game chat
     * @param {Object} report
     * @param {string} customCoverMessage Optional human message text
     */
    async queueReport(report, customCoverMessage = null) {
        if (!this.autoBroadcast) return;

        // Deduplication key: G:S:P:Moon:Timestamp
        const dedupKey = `${report.galaxy}:${report.system}:${report.position}:${report.isMoon ? 1 : 0}:${report.timestamp}`;
        if (this.processedPacketHashes.has(dedupKey)) {
            return; // Already broadcasted
        }
        this.processedPacketHashes.add(dedupKey);

        this.queue.push({ report, customCoverMessage });
        this.processQueue();
    }

    /**
     * Processes outbound queue with human-like jitter (Anti-Ban compliance - Regla 1)
     */
    async processQueue() {
        if (this.isProcessingQueue || this.queue.length === 0) return;
        this.isProcessingQueue = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            try {
                const messageWithStego = await this.prepareStegoMessage(item.report, item.customCoverMessage);
                await this.sendToOGameChat(messageWithStego);
            } catch (err) {
                console.error("[ChatSyncBus] Failed to broadcast report packet:", err);
            }

            if (this.queue.length > 0) {
                // Jitter: wait 3 to 6 seconds between messages to emulate human typing
                const jitterMs = 3000 + Math.floor(Math.random() * 3000);
                await new Promise(resolve => setTimeout(resolve, jitterMs));
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Packs, encrypts, and injects a report into an innocent human chat message
     * @param {Object} report
     * @param {string} customCover
     * @returns {Promise<string>}
     */
    async prepareStegoMessage(report, customCover = null) {
        // 1. Pack report into ~35 bytes
        const binaryPacket = OGameReportSerializer.pack(report);

        // 2. Encrypt with AES-256-GCM
        const encryptedPacket = await AllianceCrypto.encrypt(binaryPacket, this.alliancePassphrase);

        // 3. Choose natural cover message
        const cover = customCover || NATURAL_COVER_MESSAGES[Math.floor(Math.random() * NATURAL_COVER_MESSAGES.length)];

        // 4. Inject zero-width invisible payload
        return ZeroWidthSteganography.inject(cover, encryptedPacket);
    }

    /**
     * Intercepts and parses an incoming chat message from OGame
     * @param {string} rawMessageText
     * @param {Object} senderInfo { playerId, playerName, timestamp }
     * @returns {Promise<Object|null>} Decoded report or null if normal chat
     */
    async handleIncomingChatMessage(rawMessageText, senderInfo = {}) {
        if (!rawMessageText) return null;

        const { cleanText, payload } = ZeroWidthSteganography.extract(rawMessageText);
        if (!payload) {
            return null; // Regular chat message without hidden intelligence
        }

        try {
            // Decrypt with alliance secret
            const decryptedBytes = await AllianceCrypto.decrypt(payload, this.alliancePassphrase);

            // Unpack binary report (including all 17 modern ships)
            const report = OGameReportSerializer.unpack(decryptedBytes);

            // Deduplicate incoming
            const dedupKey = `${report.galaxy}:${report.system}:${report.position}:${report.isMoon ? 1 : 0}:${report.timestamp}`;
            this.processedPacketHashes.add(dedupKey);

            // Save automatically into local IndexedDB
            const savedReport = await this.storage.saveReport(report);

            console.log(`[ChatSyncBus] Inbound intelligence synced for [${report.galaxy}:${report.system}:${report.position}] from ${senderInfo.playerName || 'Alliance mate'}`);

            if (this.onReportReceived) {
                this.onReportReceived(savedReport, senderInfo, cleanText);
            }

            return {
                cleanText,
                report: savedReport,
                sender: senderInfo
            };
        } catch (err) {
            // Decryption failure (different alliance passphrase or corrupted packet)
            console.debug("[ChatSyncBus] Skipping packet with non-matching key:", err.message);
            return null;
        }
    }

    /**
     * Injects the message into OGame chat input box and submits
     * Hooked into native OGame DOM
     */
    async sendToOGameChat(messageText) {
        if (typeof document === 'undefined') {
            console.log("[ChatSyncBus-Mock] Dispatching chat message:", messageText);
            return;
        }

        // Modern OGame chat input element
        const chatInput = document.querySelector('#chatInput') || document.querySelector('.chat_input');
        const sendBtn = document.querySelector('#chatSend') || document.querySelector('.chat_send_button');

        if (chatInput && sendBtn) {
            chatInput.value = messageText;
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            sendBtn.click();
        } else {
            console.warn("[ChatSyncBus] OGame chat input not found in DOM");
        }
    }
}


// ==========================================
// SOURCE: src/userscript/parser-galaxy.js
// ==========================================
/**
 * OGame Modern Galaxy Parser (Robust Real-World Implementation)
 * Extracts planets, moons, debris, players, and activity indicators
 * from modern OGame galaxy responses (JSON, HTML snippets, or Live DOM).
 */

class GalaxyParser {
    /**
     * Parses an OGame galaxy response (supports JSON, HTML snippet, or Live DOM)
     * @param {Object|string} responseData
     * @returns {Object|null} { galaxy, system, planets: Array<Object> }
     */
    static parse(responseData) {
        if (!responseData) return null;

        // 1. If it's already an object with galaxy & system
        if (typeof responseData === 'object' && responseData.galaxy && responseData.system) {
            return this.parseJSONGalaxy(responseData);
        }

        // 2. If it's a string, try JSON first, then HTML
        if (typeof responseData === 'string') {
            const trimmed = responseData.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    // OGame returns galaxyContent as HTML snippet inside JSON payload
                    if (parsed.galaxyContent && typeof parsed.galaxyContent === 'string') {
                        return this.parseHTMLGalaxy(parsed.galaxyContent, parseInt(parsed.galaxy, 10), parseInt(parsed.system, 10));
                    }
                    if (parsed.galaxy && parsed.system && (Array.isArray(parsed.rows) || Array.isArray(parsed.galaxyContent))) {
                        return this.parseJSONGalaxy(parsed);
                    }
                } catch (_) {}
            }

            return this.parseHTMLGalaxy(responseData);
        }

        return null;
    }

    /**
     * Parses JSON-based galaxy payload
     */
    static parseJSONGalaxy(data) {
        const galaxy = parseInt(data.galaxy, 10);
        const system = parseInt(data.system, 10);
        const planets = [];

        const rows = data.galaxyContent || data.rows || [];
        const entries = Array.isArray(rows) ? rows : Object.values(rows);

        for (const row of entries) {
            if (!row || !row.position) continue;
            const position = parseInt(row.position, 10);
            if (position < 1 || position > 15) continue;

            const planetObj = {
                galaxy,
                system,
                position,
                isMoon: false,
                planetName: row.planetName || row.name || `Planeta ${position}`,
                name: row.planetName || row.name || `Planeta ${position}`,
                playerId: row.playerId ? parseInt(row.playerId, 10) : 0,
                playerName: row.playerName || '',
                allianceId: row.allianceId ? parseInt(row.allianceId, 10) : 0,
                allianceTag: row.allianceTag || '',
                playerStatus: row.playerStatus || row.status || '',
                status: row.playerStatus || row.status || '',
                hasMoon: !!(row.hasMoon || row.moon),
                moonSize: row.moonSize ? parseInt(row.moonSize, 10) : 0,
                debris: row.debris ? row.debris : ((row.debrisMetal || row.debrisCrystal) ? {
                    metal: parseInt(row.debrisMetal || 0, 10),
                    crystal: parseInt(row.debrisCrystal || 0, 10)
                } : null),
                updatedAt: Date.now()
            };

            planets.push(planetObj);

            if (row.hasMoon || row.moon) {
                planets.push({
                    galaxy,
                    system,
                    position,
                    isMoon: true,
                    planetName: row.moonName || `Luna ${position}`,
                    name: row.moonName || `Luna ${position}`,
                    moonSize: row.moonSize ? parseInt(row.moonSize, 10) : 0,
                    playerId: planetObj.playerId,
                    playerName: planetObj.playerName,
                    allianceId: planetObj.allianceId,
                    allianceTag: planetObj.allianceTag,
                    playerStatus: planetObj.status,
                    status: planetObj.status,
                    debris: null,
                    updatedAt: Date.now()
                });
            }
        }

        return { galaxy, system, planets };
    }

    /**
     * Parses HTML DOM string (returned via AJAX or page source)
     */
    static parseHTMLGalaxy(htmlString, fallbackGalaxy = null, fallbackSystem = null) {
        if (!htmlString || typeof htmlString !== 'string') return null;

        let doc = null;
        if (typeof DOMParser !== 'undefined') {
            try {
                const parser = new DOMParser();
                doc = parser.parseFromString(htmlString, 'text/html');
            } catch (_) {}
        }

        let galaxy = fallbackGalaxy;
        let system = fallbackSystem;

        // Try extracting galaxy and system coordinates
        if (!galaxy || !system) {
            const gInput = doc ? doc.querySelector('#galaxy_input, input[name="galaxy"]') : null;
            const sInput = doc ? doc.querySelector('#system_input, input[name="system"]') : null;
            if (gInput && gInput.value) galaxy = parseInt(gInput.value, 10);
            if (sInput && sInput.value) system = parseInt(sInput.value, 10);
        }

        if (!galaxy || !system) {
            const gMatch = htmlString.match(/(?:id|name)=["']galaxy(?:_input)?["'][^>]*value=["'](\d+)["']/i) ||
                           htmlString.match(/data-galaxy=["'](\d+)["']/i) ||
                           htmlString.match(/galaxy\s*:\s*(\d+)/i);
            const sMatch = htmlString.match(/(?:id|name)=["']system(?:_input)?["'][^>]*value=["'](\d+)["']/i) ||
                           htmlString.match(/data-system=["'](\d+)["']/i) ||
                           htmlString.match(/system\s*:\s*(\d+)/i);
            if (gMatch) galaxy = parseInt(gMatch[1], 10);
            if (sMatch) system = parseInt(sMatch[1], 10);
        }

        // Global fallback to window/document if running in browser
        if ((!galaxy || !system) && typeof document !== 'undefined') {
            const liveG = document.querySelector('#galaxy_input, input[name="galaxy"]');
            const liveS = document.querySelector('#system_input, input[name="system"]');
            if (liveG && liveG.value) galaxy = parseInt(liveG.value, 10);
            if (liveS && liveS.value) system = parseInt(liveS.value, 10);
        }

        if (!galaxy || !system) return null;

        const planets = [];

        // If doc parsed successfully, use robust query selectors
        if (doc) {
            for (let pos = 1; pos <= 15; pos++) {
                const row = doc.getElementById(`galaxyRow${pos}`) || doc.querySelector(`[id="galaxyRow${pos}"]`);
                if (!row) continue;
                if (row.classList.contains('empty_filter')) continue;

                const extracted = this.extractRowFromElement(row, galaxy, system, pos);
                if (extracted) {
                    planets.push(extracted.planet);
                    if (extracted.moon) planets.push(extracted.moon);
                }
            }
        }

        // Fallback regex matcher if DOMParser was unavailable
        if (planets.length === 0) {
            const rowMatches = htmlString.matchAll(/id=["']galaxyRow(\d+)["'][\s\S]*?(?:id=["']galaxyRow|\<\/table|\<\/div\s*\>\s*\<\/div\s*\>|$)/gi);
            for (const rm of rowMatches) {
                const pos = parseInt(rm[1], 10);
                if (pos < 1 || pos > 15) continue;
                const snippet = rm[0];
                if (snippet.includes('empty_filter')) continue;

                // Player name
                const pMatch = snippet.match(/class=["'][^"']*playerName[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|a|div)>/i);
                const playerName = pMatch ? pMatch[1].replace(/<[^>]+>/g, '').trim() : '';

                // Planet name
                const plMatch = snippet.match(/class=["'][^"']*planetname[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|a|div)>/i);
                const planetName = plMatch ? plMatch[1].replace(/<[^>]+>/g, '').trim() : `Planeta ${pos}`;

                // Status
                let status = '';
                if (snippet.includes('status_abbr_longinactive')) status = 'I';
                else if (snippet.includes('status_abbr_inactive')) status = 'i';
                else if (snippet.includes('status_abbr_vacation')) status = 'v';
                else if (snippet.includes('status_abbr_banned')) status = 'b';

                // Moon
                const hasMoon = snippet.includes('cellMoon') && (snippet.includes('micromoon') || snippet.includes('moon.gif'));

                planets.push({
                    galaxy,
                    system,
                    position: pos,
                    isMoon: false,
                    planetName,
                    name: planetName,
                    playerName,
                    playerId: 0,
                    allianceTag: '',
                    allianceId: 0,
                    status,
                    playerStatus: status,
                    hasMoon,
                    debris: null,
                    updatedAt: Date.now()
                });
            }
        }

        return { galaxy, system, planets };
    }

    /**
     * Inspects row links, tooltips and containers to detect the true coordinates rendered in the table
     */
    static detectTableCoordinates(doc, fallbackG, fallbackS) {
        // 1. Check data-galaxy and data-system on container
        const container = doc.querySelector('#galaxyTable, #galaxyContent, .galaxyTable, #galaxy_head');
        if (container) {
            const dg = parseInt(container.getAttribute('data-galaxy'), 10);
            const ds = parseInt(container.getAttribute('data-system'), 10);
            if (dg && ds) return { galaxy: dg, system: ds };
        }

        // 2. Check individual rows for coordinate evidence
        for (let pos = 1; pos <= 15; pos++) {
            const row = doc.getElementById(`galaxyRow${pos}`) || doc.querySelector(`[id="galaxyRow${pos}"]`);
            if (!row) continue;
            const html = row.innerHTML || '';

            // Match tooltip "[G:S:P]"
            const tipMatch = html.match(/\[(\d+):(\d+):\d+\]/);
            if (tipMatch) {
                return { galaxy: parseInt(tipMatch[1], 10), system: parseInt(tipMatch[2], 10) };
            }

            // Match sendShips(mission, g, s, p, ...)
            const shipMatch = html.match(/sendShips\s*\(\s*\d+\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*\d+/i);
            if (shipMatch) {
                return { galaxy: parseInt(shipMatch[1], 10), system: parseInt(shipMatch[2], 10) };
            }

            // Match URL parameters galaxy=X&system=Y
            const urlMatch = html.match(/galaxy=(\d+)&amp;system=(\d+)/i) || html.match(/galaxy=(\d+)&system=(\d+)/i);
            if (urlMatch) {
                return { galaxy: parseInt(urlMatch[1], 10), system: parseInt(urlMatch[2], 10) };
            }
        }

        return { galaxy: fallbackG, system: fallbackS };
    }

    /**
     * Extracts full system data directly from active document DOM
     */
    static parseFromLiveDOM(doc = (typeof document !== 'undefined' ? document : null)) {
        if (!doc) return null;

        const gInput = doc.querySelector('#galaxy_input, input[name="galaxy"]');
        const sInput = doc.querySelector('#system_input, input[name="system"]');
        if (!gInput || !sInput) return null;

        const inputGalaxy = parseInt(gInput.value, 10);
        const inputSystem = parseInt(sInput.value, 10);
        if (!inputGalaxy || !inputSystem) return null;

        // Verify that the rendered table actually matches the input coordinates
        const tableCoords = this.detectTableCoordinates(doc, inputGalaxy, inputSystem);
        if (tableCoords.galaxy !== inputGalaxy || tableCoords.system !== inputSystem) {
            // Table rows belong to a different system (mid-load AJAX transition); do NOT ingest stale data!
            return null;
        }

        const galaxy = inputGalaxy;
        const system = inputSystem;

        const planets = [];
        for (let pos = 1; pos <= 15; pos++) {
            const row = doc.getElementById(`galaxyRow${pos}`) || doc.querySelector(`[id="galaxyRow${pos}"]`);
            if (!row) continue;
            if (row.classList.contains('empty_filter')) continue;

            const extracted = this.extractRowFromElement(row, galaxy, system, pos);
            if (extracted) {
                planets.push(extracted.planet);
                if (extracted.moon) planets.push(extracted.moon);
            }
        }

        return { galaxy, system, planets };
    }

    static extractRowFromElement(row, galaxy, system, pos) {
        // Player Name
        const playerCell = row.querySelector('.cellPlayerName, .cellPlayer');
        let playerName = '';
        if (playerCell) {
            const clone = playerCell.cloneNode(true);
            clone.querySelectorAll('.galaxyTooltip, .rank, .playerRank, .honorRank, .undermark, ul, pre').forEach(n => n.remove());
            const playerLink = clone.querySelector('a, [class*="status_abbr_"], .playerName');
            if (playerLink) {
                playerName = playerLink.textContent.trim();
            } else {
                playerName = clone.textContent.trim();
            }
            playerName = playerName.replace(/\s*\((?:ph|hp|i|I|v|b|s|n|bandit)\)\s*/gi, ' ').trim();
            playerName = playerName.replace(/\s+\d+$/, '').trim();
        }

        // Planet Name
        const planetCell = row.querySelector('.cellPlanet, .cellPlanetName');
        let planetName = `Planeta ${pos}`;
        if (planetCell) {
            const clone = planetCell.cloneNode(true);
            clone.querySelectorAll('.galaxyTooltip, .tooltip, [class*="tooltip"], ul, ol, pre, .agr_menu, [class*="agr"], .actions, .action, [class*="action"], [onclick*="sendShips"], a[href*="fleet"], .microplanet, .activity, .minuteCounter').forEach(n => n.remove());
            let text = clone.textContent.trim();

            const bracketMatch = text.match(/(\[\d+:\d+:\d+\]\s*[^\r\n]+)/);
            if (bracketMatch) {
                text = bracketMatch[1];
            } else {
                const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
                for (const line of lines) {
                    if (!/^\d+$/.test(line) && !/^actividad/i.test(line) && !/^(?:transporte|espionaje|atacar|mostrar|jugador|vigilar)/i.test(line)) {
                        text = line;
                        break;
                    }
                }
            }

            const junkRegex = /\s*(?:Transporte|Mantener\s+posici[oó]n|Espionaje|Informe\s+de\s+espionaje|Atacar|Mostrar\s+la\s+informaci[oó]n|Jugador\s+en\s+modo|Actividad:|Vigilar|Granja|Objetivo|Ataque|Desplegar|Recolectar)[\s\S]*/i;
            text = text.replace(junkRegex, '').trim();
            text = text.replace(/^\d+\s+/, '').trim();
            if (text) planetName = text;
        }

        // Player ID
        let playerId = 0;
        const pAttr = row.getAttribute('data-player-id') || row.querySelector('[data-player-id]')?.getAttribute('data-player-id');
        if (pAttr) {
            playerId = parseInt(pAttr, 10);
        } else {
            const pLink = row.querySelector('.cellPlayerName a, a[rel^="#player"], a[href*="playerId="], a[href*="to="]');
            if (pLink) {
                const href = pLink.getAttribute('href') || '';
                const rel = pLink.getAttribute('rel') || '';
                const m = href.match(/[?&](?:to|playerId|player)=(\d+)/i) || rel.match(/#player(\d+)/i);
                if (m) playerId = parseInt(m[1], 10);
            }
        }

        // Alliance Tag (Siglas only) and Full Alliance Name
        const allyEl = row.querySelector('.cellAlliance .allianceTag, .cellAlliance, .cellAllianceName');
        let allianceTag = '';
        let allianceName = '';
        if (allyEl) {
            const clone = allyEl.cloneNode(true);
            clone.querySelectorAll('.galaxyTooltip, ul, pre').forEach(n => n.remove());
            allianceName = clone.textContent.trim().replace(/^\[|\]$/g, '');
            const tagEl = clone.querySelector('a, .allianceTag') || clone;
            let rawTag = tagEl.textContent.trim().replace(/^\[|\]$/g, '');
            allianceTag = rawTag.split(/\s+/)[0];
        }

        // Activity / Minutero
        let activity = null;
        const actEl = row.querySelector('.cellPlanet .activity, .cellPlanetName .activity, .cellPlanet .minuteCounter, .cellPlanetName .minuteCounter');
        if (actEl) {
            const actText = actEl.textContent.trim();
            if (actText === '*' || actText.includes('*')) {
                activity = { type: 'star', minutes: 15, label: '*', capturedAt: Date.now() };
            } else {
                const m = actText.match(/(\d+)/);
                if (m) {
                    const mins = parseInt(m[1], 10);
                    if (mins >= 15 && mins <= 59) {
                        activity = { type: 'minutes', minutes: mins, label: `${mins} min`, capturedAt: Date.now() };
                    }
                }
            }
        }

        // Player Status: capture all combinations (inactive, long inactive, vacation, banned, bandit, hp)
        const statusList = [];
        if (row.querySelector('.status_abbr_longinactive')) statusList.push('I');
        else if (row.querySelector('.status_abbr_inactive')) statusList.push('i');
        if (row.querySelector('.status_abbr_vacation')) statusList.push('v');
        if (row.querySelector('.status_abbr_banned')) statusList.push('b');
        if (row.querySelector('.status_abbr_outlaw')) statusList.push('bandit');
        if (row.querySelector('.status_abbr_honorableTarget')) statusList.push('hp');
        if (row.querySelector('.status_abbr_strong')) statusList.push('s');
        if (row.querySelector('.status_abbr_noob')) statusList.push('n');

        let status = statusList.join(' ');
        if (!status && playerName) {
            status = row.querySelector('.ownPlayerRow') ? 'own' : 'active';
        }

        // Moon
        const moonCell = row.querySelector('.cellMoon');
        const moonAnchor = moonCell?.querySelector('a, img, .micromoon');
        const moonMicro = moonCell?.querySelector('.micromoon');
        const hasMoon = !!(moonAnchor || moonMicro);
        let moonSize = 0;
        if (hasMoon && moonCell) {
            const text = moonCell.getAttribute('title') || 
                         moonCell.getAttribute('data-tooltip-content') || 
                         moonAnchor?.getAttribute('title') || 
                         moonAnchor?.getAttribute('data-tooltip-content') || 
                         moonCell.innerHTML || '';
            const match = text.match(/(\d{3,5})\s*km/i);
            if (match) moonSize = parseInt(match[1], 10);
        }

        // Debris Field
        let debris = null;
        const debrisCell = row.querySelector('.cellDebris');
        const debrisItem = debrisCell?.querySelector('a, span, img');
        if (debrisCell && (debrisItem || debrisCell.textContent.trim() !== '' || debrisCell.getAttribute('title'))) {
            const text = debrisCell.getAttribute('title') || 
                         debrisCell.getAttribute('data-tooltip-content') || 
                         debrisItem?.getAttribute('title') || 
                         debrisItem?.getAttribute('data-tooltip-content') || 
                         debrisCell.textContent || '';
            const mMatch = text.match(/Metal:\s*([\d\.,]+)/i) || text.match(/([\d\.,]+)\s*Metal/i);
            const cMatch = text.match(/(?:Cristal|Crystal):\s*([\d\.,]+)/i) || text.match(/([\d\.,]+)\s*(?:Cristal|Crystal)/i);
            const metal = mMatch ? parseInt(mMatch[1].replace(/[^\d]/g, ''), 10) : 0;
            const crystal = cMatch ? parseInt(cMatch[1].replace(/[^\d]/g, ''), 10) : 0;
            if (metal > 0 || crystal > 0) {
                debris = { metal, crystal };
            }
        }

        // Ignore uncolonized empty slots
        if (!playerName && !playerId && !debris && !hasMoon) {
            return null;
        }

        const planet = {
            galaxy,
            system,
            position: pos,
            isMoon: false,
            planetName,
            name: planetName,
            planet_name: planetName,
            playerName,
            player_name: playerName,
            playerId,
            player_id: playerId,
            allianceTag,
            alliance_tag: allianceTag,
            allianceName,
            alliance_name: allianceName,
            activity,
            allianceId: 0,
            status,
            playerStatus: status,
            hasMoon,
            has_moon: hasMoon,
            moonSize,
            moon_size: moonSize,
            debris,
            has_debris: !!debris,
            debris_metal: debris?.metal || 0,
            debris_crystal: debris?.crystal || 0,
            updatedAt: Date.now()
        };

        const moon = hasMoon ? {
            galaxy,
            system,
            position: pos,
            isMoon: true,
            planetName: `Luna ${pos}`,
            name: `Luna ${pos}`,
            planet_name: `Luna ${pos}`,
            playerName,
            player_name: playerName,
            playerId,
            player_id: playerId,
            allianceTag,
            alliance_tag: allianceTag,
            allianceName,
            alliance_name: allianceName,
            activity,
            allianceId: 0,
            status,
            playerStatus: status,
            moonSize,
            moon_size: moonSize,
            debris: null,
            updatedAt: Date.now()
        } : null;

        return { planet, moon };
    }
}

// ==========================================
// SOURCE: src/userscript/parser-reports.js
// ==========================================
/**
 * OGame Modern Espionage & Combat Report Parser
 * Extracts full 17 ships, defenses, resources, and coordinates from OGame messages.
 */


class ReportParser {
    /**
     * Parses espionage report from JSON or HTML message body
     * @param {Object|string} data
     * @returns {Object|null}
     */
    static parse(data) {
        if (!data) return null;

        if (typeof data === 'object') {
            return this.parseJSON(data);
        }

        if (typeof data === 'string') {
            try {
                const parsed = JSON.parse(data);
                return this.parseJSON(parsed);
            } catch (_) {
                return this.parseHTML(data);
            }
        }
        return null;
    }

    /**
     * Parses structured JSON from modern OGame API
     */
    static parseJSON(json) {
        // Look for coordinates pattern "[G:S:P]"
        const coordRaw = json.coordinates || json.targetCoords || json.coords || '';
        const coords = this.extractCoords(coordRaw);
        if (!coords) return null;

        const isMoon = json.isMoon || json.targetType === 3 || coordRaw.includes('(Luna)') || false;
        const timestamp = json.timestamp || json.eventTime || Math.floor(Date.now() / 1000);

        const resources = {
            metal: parseInt(json.resources?.metal || json.metal || 0, 10),
            crystal: parseInt(json.resources?.crystal || json.crystal || 0, 10),
            deuterium: parseInt(json.resources?.deuterium || json.deuterium || 0, 10)
        };

        const fleet = {};
        const rawFleet = json.ships || json.fleet || {};

        // Map all 17 ships by key or id
        for (const ship of SHIPS) {
            const count = rawFleet[ship.key] || rawFleet[ship.id] || rawFleet[ship.legacy] || 0;
            if (count > 0) {
                fleet[ship.key] = parseInt(count, 10);
            }
        }

        return {
            galaxy: coords.galaxy,
            system: coords.system,
            position: coords.position,
            isMoon,
            timestamp,
            resources,
            fleet,
            playerClass: json.playerClass || 0,
            lifeform: json.lifeform || 0
        };
    }

    /**
     * Parses HTML text of an espionage report (standard fallback)
     */
    static parseHTML(html) {
        const coordMatch = html.match(/\[(\d+):(\d+):(\d+)\]/);
        if (!coordMatch) return null;

        const galaxy = parseInt(coordMatch[1], 10);
        const system = parseInt(coordMatch[2], 10);
        const position = parseInt(coordMatch[3], 10);
        const isMoon = /luna|moon/i.test(html);

        // Extract resources
        const metalMatch = html.match(/metal[^0-9]*([0-9\.,]+)/i);
        const crystalMatch = html.match(/cristal|crystal[^0-9]*([0-9\.,]+)/i);
        const deutMatch = html.match(/deuterio|deuterium[^0-9]*([0-9\.,]+)/i);

        const cleanNumber = (str) => str ? parseInt(str.replace(/[\.,]/g, ''), 10) : 0;

        const resources = {
            metal: cleanNumber(metalMatch ? metalMatch[1] : '0'),
            crystal: cleanNumber(crystalMatch ? crystalMatch[1] : '0'),
            deuterium: cleanNumber(deutMatch ? deutMatch[1] : '0')
        };

        const fleet = {};
        // Scan for ship names or tech IDs in HTML
        for (const ship of SHIPS) {
            const regex = new RegExp(`${ship.name}[^0-9]*([0-9\\.,]+)`, 'i');
            const m = html.match(regex);
            if (m) {
                const count = cleanNumber(m[1]);
                if (count > 0) fleet[ship.key] = count;
            }
        }

        return {
            galaxy,
            system,
            position,
            isMoon,
            timestamp: Math.floor(Date.now() / 1000),
            resources,
            fleet
        };
    }

    static extractCoords(str) {
        const m = str.match(/(\d+):(\d+):(\d+)/);
        if (!m) return null;
        return {
            galaxy: parseInt(m[1], 10),
            system: parseInt(m[2], 10),
            position: parseInt(m[3], 10)
        };
    }
}


// ==========================================
// SOURCE: src/userscript/parser-highscore.js
// ==========================================
/**
 * OGame Modern Highscore / Leaderboard Parser
 * Extracts player rankings, points, alliances, and honor points from OGame highscores.
 */

class HighscoreParser {
    /**
     * Parses highscore response (JSON or HTML)
     * @param {Object|string} responseData
     * @returns {Object|null} { category, type, entries: Array<Object> }
     */
    static parse(responseData) {
        if (!responseData) return null;

        if (typeof responseData === 'object' && responseData.ranks) {
            return this.parseJSONHighscore(responseData);
        }

        if (typeof responseData === 'string') {
            try {
                const parsed = JSON.parse(responseData);
                if (parsed.ranks || parsed.content) {
                    return this.parseJSONHighscore(parsed.ranks ? parsed : parsed.content);
                }
            } catch (_) {
                return this.parseHTMLHighscore(responseData);
            }
        }

        return null;
    }

    static parseJSONHighscore(data) {
        const rows = data.ranks || data.entries || (Array.isArray(data) ? data : []);
        const entries = [];

        for (const row of rows) {
            if (!row) continue;
            entries.push({
                rank: parseInt(row.position || row.rank || 0, 10),
                playerId: row.playerId || row.id || null,
                playerName: row.playerName || row.name || 'Desconocido',
                allianceId: row.allianceId || null,
                allianceTag: row.allianceTag || row.tag || '',
                score: parseInt(row.score || row.points || 0, 10),
                updatedAt: Date.now()
            });
        }

        return {
            type: data.type || 'player',
            category: data.category || 'total',
            entries
        };
    }

    static parseHTMLHighscore(htmlString) {
        if (typeof DOMParser === 'undefined') return null;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');
            const rows = doc.querySelectorAll('#ranks tbody tr, .highscoreContent tbody tr, table.ranks tr');
            if (!rows || rows.length === 0) return null;

            const entries = [];
            rows.forEach(tr => {
                const rankEl = tr.querySelector('.position, .rank, td:nth-child(1)');
                const playerEl = tr.querySelector('.player, .name, td:nth-child(2)');
                const allyEl = tr.querySelector('.ally, .alliance, td:nth-child(3)');
                const scoreEl = tr.querySelector('.score, .points, td:nth-child(4)');

                if (!playerEl) return;

                const rank = rankEl ? parseInt(rankEl.textContent.trim(), 10) : 0;
                const playerName = playerEl.textContent.trim();
                const allianceTag = allyEl ? allyEl.textContent.trim().replace(/^\[|\]$/g, '') : '';
                const score = scoreEl ? parseInt(scoreEl.textContent.replace(/[^\d]/g, ''), 10) : 0;

                entries.push({
                    rank,
                    playerName,
                    allianceTag,
                    score,
                    updatedAt: Date.now()
                });
            });

            return entries.length > 0 ? { type: 'player', category: 'total', entries } : null;
        } catch (_) {
            return null;
        }
    }
}


// ==========================================
// SOURCE: src/userscript/interceptor.js
// ==========================================
/**
 * Passive Network Interceptor for OGame
 * Hooks window.fetch, XMLHttpRequest, and Live DOM mutations to capture in-game telemetry
 * without altering native game behavior (Strict Anti-Ban Compliance).
 */




class NetworkInterceptor {
    constructor(storageEngine, onDataCaptured = null, syncUrl = 'http://localhost:8080/api/sync.php') {
        this.storage = storageEngine;
        this.onDataCaptured = onDataCaptured;
        this.syncUrl = syncUrl;
        this.active = false;
        this.telemetryLog = [];
        this.lastParsedCoord = '';
    }

    logEvent(type, summary, details = null) {
        const item = {
            id: Date.now() + Math.random(),
            timestamp: Date.now(),
            type,
            summary,
            details
        };
        this.telemetryLog.unshift(item);
        if (this.telemetryLog.length > 50) this.telemetryLog.pop();
        return item;
    }

    /**
     * Attaches passive hooks to fetch, XMLHttpRequest and Live DOM observer
     */
    start() {
        if (this.active) return;
        this.active = true;

        this.hookFetch();
        this.hookXHR();
        this.hookLiveDOM();
        console.log("[Galaxytool-Modern] Passive Network Interceptor active.");
        this.logEvent('system', 'Interceptor pasivo activado y en escucha.');
    }

    hookFetch() {
        if (typeof window === 'undefined' || !window.fetch) return;
        const originalFetch = window.fetch;
        const self = this;

        window.fetch = async function(...args) {
            const response = await originalFetch.apply(this, args);
            try {
                const url = (args[0] && typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');
                const clone = response.clone();

                if (url.includes('galaxyContent') || url.includes('component=galaxy') || url.includes('page=galaxy')) {
                    clone.text().then(text => self.handleGalaxyResponse(text));
                } else if (url.includes('page=messages') || url.includes('tab=espionage')) {
                    clone.text().then(text => self.handleReportResponse(text));
                } else if (url.includes('page=highscore') || url.includes('component=highscore')) {
                    clone.text().then(text => self.handleHighscoreResponse(text));
                }
            } catch (err) {
                console.debug("[Galaxytool-Modern] Interceptor non-fatal notice:", err);
            }
            return response;
        };
    }

    hookXHR() {
        if (typeof window === 'undefined' || !window.XMLHttpRequest) return;
        const originalOpen = window.XMLHttpRequest.prototype.open;
        const originalSend = window.XMLHttpRequest.prototype.send;
        const self = this;

        window.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this._gt_url = url;
            return originalOpen.apply(this, [method, url, ...rest]);
        };

        window.XMLHttpRequest.prototype.send = function(...args) {
            this.addEventListener('load', function() {
                try {
                    const url = this._gt_url || '';
                    if (url.includes('galaxyContent') || url.includes('component=galaxy') || url.includes('page=galaxy')) {
                        self.handleGalaxyResponse(this.responseText);
                    } else if (url.includes('page=messages') || url.includes('tab=espionage')) {
                        self.handleReportResponse(this.responseText);
                    } else if (url.includes('page=highscore') || url.includes('component=highscore')) {
                        self.handleHighscoreResponse(this.responseText);
                    }
                } catch (err) {
                    console.debug("[Galaxytool-Modern] XHR Interceptor non-fatal notice:", err);
                }
            });
            return originalSend.apply(this, args);
        };
    }

    /**
     * Observes live DOM for initial load and dynamic galaxy updates
     */
    hookLiveDOM() {
        if (typeof document === 'undefined') return;

        let debounceTimer = null;
        const checkDOM = () => {
            const parsed = GalaxyParser.parseFromLiveDOM(document);
            if (parsed && parsed.galaxy && parsed.system) {
                const coordKey = `${parsed.galaxy}:${parsed.system}`;
                const now = Date.now();
                if (this.lastParsedCoord !== coordKey || (now - (this.lastParsedTime || 0)) > 2500) {
                    this.lastParsedCoord = coordKey;
                    this.lastParsedTime = now;
                    this.processGalaxyData(parsed);
                }
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(checkDOM, 600));
        } else {
            setTimeout(checkDOM, 400);
        }

        if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(checkDOM, 350);
            });
            const target = document.getElementById('galaxyContent') || document.getElementById('middle') || document.body;
            observer.observe(target, { childList: true, subtree: true });
        }
    }

    async handleGalaxyResponse(content) {
        let parsed = GalaxyParser.parse(content);
        if (!parsed || !parsed.galaxy || !parsed.system) {
            // Fallback to reading the live DOM if snippet was minimal
            if (typeof document !== 'undefined') {
                parsed = GalaxyParser.parseFromLiveDOM(document);
            }
        }
        if (!parsed || !parsed.galaxy || !parsed.system) return;

        const coordKey = `${parsed.galaxy}:${parsed.system}`;
        this.lastParsedCoord = coordKey;
        await this.processGalaxyData(parsed);
    }

    async processGalaxyData(parsed) {
        const planets = parsed.planets || [];

        // Synchronize entire solar system: deletes any planets in this system that were deleted or abandoned
        if (this.storage && typeof this.storage.syncSolarSystem === 'function') {
            await this.storage.syncSolarSystem(parsed.galaxy, parsed.system, planets);
        } else if (this.storage) {
            for (const planet of planets) {
                await this.storage.savePlanet(planet);
            }
        }

        // Update player info for populated slots
        if (this.storage && typeof this.storage.savePlayer === 'function') {
            for (const planet of planets) {
                if (planet.playerId) {
                    await this.storage.savePlayer({
                        id: planet.playerId,
                        name: planet.playerName,
                        allianceId: planet.allianceId,
                        allianceTag: planet.allianceTag,
                        status: planet.status,
                        updatedAt: Date.now()
                    });
                }
            }
        }

        const summary = planets.length > 0 
            ? `Sistema ${parsed.galaxy}:${parsed.system} guardado (${planets.length} cuerpos celestes)`
            : `Sistema ${parsed.galaxy}:${parsed.system} vacío (0 planetas activos)`;

        console.log(`[Galaxytool-Modern] ${summary}`);
        this.logEvent('galaxy', summary, { galaxy: parsed.galaxy, system: parsed.system, count: planets.length });

        // Sync in background to local API bridge for Standalone Dashboard (purges old planets on backend)
        this.syncToLocalBackend({
            type: 'galaxy',
            galaxy: parsed.galaxy,
            system: parsed.system,
            planets: planets
        });

        if (this.onDataCaptured) {
            this.onDataCaptured({ type: 'galaxy', data: parsed, summary });
        }
    }

    async handleReportResponse(content) {
        const parsed = ReportParser.parse(content);
        if (!parsed || !parsed.galaxy || !parsed.system) return;

        const saved = await this.storage.saveReport(parsed);
        const summary = `Reporte de espionaje [${parsed.galaxy}:${parsed.system}:${parsed.position}${parsed.isMoon ? ' Luna' : ''}] interceptado`;
        console.log(`[Galaxytool-Modern] ${summary}`);
        this.logEvent('report', summary, { coords: `${parsed.galaxy}:${parsed.system}:${parsed.position}` });

        // Sync in background to local API bridge
        this.syncToLocalBackend({
            type: 'report',
            data: saved
        });

        if (this.onDataCaptured) {
            this.onDataCaptured({ type: 'report', data: saved, summary });
        }
    }

    async handleHighscoreResponse(content) {
        const parsed = HighscoreParser.parse(content);
        if (!parsed || !parsed.entries || parsed.entries.length === 0) return;

        for (const entry of parsed.entries) {
            if (entry.playerId) {
                await this.storage.savePlayer({
                    id: entry.playerId,
                    name: entry.playerName,
                    allianceTag: entry.allianceTag,
                    score: entry.score,
                    rank: entry.rank,
                    updatedAt: Date.now()
                });
            }
        }

        const summary = `Tabla de puntajes: ${parsed.entries.length} jugadores actualizados en el índice`;
        console.log(`[Galaxytool-Modern] ${summary}`);
        this.logEvent('highscore', summary, { count: parsed.entries.length });

        if (this.onDataCaptured) {
            this.onDataCaptured({ type: 'highscore', data: parsed, summary });
        }
    }

    syncToLocalBackend(payload) {
        if (!this.syncUrl) return;

        try {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: this.syncUrl,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify(payload),
                    onload: () => {},
                    onerror: () => {}
                });
            } else if (typeof fetch === 'function') {
                fetch(this.syncUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    mode: 'cors'
                }).catch(() => {});
            }
        } catch (_) {}
    }
}

// ==========================================
// SOURCE: src/ui/hud.js
// ==========================================
/**
 * Modern In-Game Tactical HUD (Head-Up Display)
 * Encapsulated in Web Components with Shadow DOM for 0% CSS collision with OGame.
 * Features:
 * - Floating Tactical Badge & Status Indicator with Quick Settings Gear
 * - Configuration & Live Telemetry Modal (Passphrase, Toggles, Live Capture Feed)
 * - Non-intrusive floating Toast Notifications (Real-time capture & sync feedback)
 * - Command Palette (Ctrl+K or Alt+G) with instant fuzzy search
 * - Galaxy View Enrichment (Scout age & loot profitability)
 * - Fleet Dispatch Auto-Filler (Calculates & inputs exact SC/LC/PATH for 50%/75% plunder)
 */


class InGameHUD {
    constructor(storageEngine, chatBus = null, interceptor = null) {
        this.storage = storageEngine;
        this.chatBus = chatBus;
        this.interceptor = interceptor;
        this.host = null;
        this.shadow = null;
        this.isPaletteOpen = false;
        this.isSettingsOpen = false;
        this.initialized = false;
        this.config = {
            passphrase: 'DefaultAllianceSecret2026',
            syncGalaxy: true,
            syncReports: true,
            syncHighscores: true,
            syncChat: true,
            showToasts: true,
            dashboardUrl: 'http://localhost:8080/dashboard/'
        };
    }

    /**
     * Initializes and mounts the HUD inside the document body
     */
    init() {
        if (typeof document === 'undefined' || this.initialized) return;
        this.initialized = true;

        this.host = document.createElement('div');
        this.host.id = 'gt-modern-hud-host';
        document.body.appendChild(this.host);

        this.shadow = this.host.attachShadow({ mode: 'open' });
        this.renderStyles();
        this.renderStructure();
        this.attachEventListeners();
        this.attachGalaxyObserver();
        this.checkFleetDispatch();
        this.loadConfig().catch(() => {});

        console.log("[Galaxytool-Modern] In-Game Tactical HUD mounted in Shadow DOM.");
    }

    async loadConfig() {
        try {
            const saved = await this.storage.getConfig('hud_settings', null);
            if (saved) {
                this.config = { ...this.config, ...saved };
                if (this.chatBus && this.config.passphrase) {
                    this.chatBus.passphrase = this.config.passphrase;
                }
            }
        } catch (_) {}
    }

    async saveConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        await this.storage.setConfig('hud_settings', this.config);
        if (this.chatBus && this.config.passphrase) {
            this.chatBus.passphrase = this.config.passphrase;
        }
        this.notify('Ajustes guardados correctamente', 'success', '[OK]');
    }

    renderStyles() {
        const style = document.createElement('style');
        style.textContent = `
            :host {
                all: initial;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 13px;
                color: #e2e8f0;
            }

            /* Floating Status Badge */
            .gt-status-badge {
                position: fixed;
                bottom: 16px;
                right: 16px;
                z-index: 999999;
                background: rgba(11, 14, 20, 0.92);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(0, 240, 255, 0.4);
                border-radius: 9999px;
                padding: 6px 14px;
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 12px rgba(0, 240, 255, 0.2);
                transition: all 0.2s ease;
                user-select: none;
            }
            .gt-status-badge:hover {
                transform: translateY(-2px);
                border-color: #00f0ff;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.7), 0 0 16px rgba(0, 240, 255, 0.4);
            }
            .gt-pulse-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #10b981;
                box-shadow: 0 0 8px #10b981;
            }
            .gt-badge-action {
                background: #1e293b;
                border: 1px solid #334155;
                border-radius: 4px;
                padding: 2px 6px;
                font-size: 11px;
                color: #94a3b8;
                transition: background 0.15s;
            }
            .gt-badge-action:hover {
                background: #334155;
                color: #f8fafc;
            }

            /* Toast Notification Container */
            .gt-toast-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000010;
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
            }
            .gt-toast {
                pointer-events: auto;
                min-width: 280px;
                max-width: 380px;
                background: rgba(13, 17, 26, 0.95);
                backdrop-filter: blur(8px);
                border: 1px solid #1f293d;
                border-left: 4px solid #00f0ff;
                border-radius: 8px;
                padding: 10px 14px;
                display: flex;
                align-items: flex-start;
                gap: 10px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.7);
                animation: gtSlideIn 0.25s ease-out;
                transition: opacity 0.3s, transform 0.3s;
            }
            .gt-toast.success { border-left-color: #10b981; }
            .gt-toast.warn { border-left-color: #f59e0b; }
            .gt-toast.info { border-left-color: #00f0ff; }
            .gt-toast-icon { font-size: 16px; line-height: 1; margin-top: 2px; }
            .gt-toast-content { flex: 1; }
            .gt-toast-title { font-weight: 600; font-size: 12px; color: #f8fafc; margin-bottom: 2px; }
            .gt-toast-msg { font-size: 11px; color: #94a3b8; }
            .gt-toast-close { cursor: pointer; color: #64748b; font-size: 14px; line-height: 1; }
            .gt-toast-close:hover { color: #f8fafc; }

            /* Modals Backdrop (Palette & Settings) */
            .gt-modal-backdrop {
                position: fixed;
                inset: 0;
                z-index: 1000000;
                background: rgba(4, 6, 10, 0.8);
                backdrop-filter: blur(5px);
                display: flex;
                align-items: flex-start;
                justify-content: center;
                padding-top: 8vh;
                animation: gtFadeIn 0.15s ease-out;
            }

            /* Command Palette */
            .gt-palette-container {
                width: 580px;
                max-width: 90vw;
                background: #0d111a;
                border: 1px solid #1f293d;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(0, 240, 255, 0.15);
            }
            .gt-search-wrapper {
                display: flex;
                align-items: center;
                padding: 14px 18px;
                border-bottom: 1px solid #1f293d;
                background: #121824;
            }
            .gt-search-input {
                flex: 1;
                background: transparent;
                border: none;
                outline: none;
                color: #f8fafc;
                font-size: 15px;
            }
            .gt-search-input::placeholder { color: #64748b; }
            .gt-results-list {
                max-height: 380px;
                overflow-y: auto;
                padding: 8px;
            }
            .gt-result-item {
                padding: 10px 14px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: pointer;
                transition: background 0.1s ease;
            }
            .gt-result-item:hover { background: #1a2234; }
            .gt-result-coords { color: #00f0ff; font-weight: 600; font-family: monospace; }
            .gt-result-name { color: #e2e8f0; margin-left: 8px; }
            .gt-result-status { padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; }
            .gt-status-inact { background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); }

            /* Settings Modal Container */
            .gt-settings-container {
                width: 640px;
                max-width: 92vw;
                max-height: 84vh;
                background: #0c101a;
                border: 1px solid #1f293d;
                border-radius: 14px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 240, 255, 0.18);
            }
            .gt-settings-header {
                padding: 16px 20px;
                background: #121724;
                border-bottom: 1px solid #1f293d;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .gt-settings-title {
                font-size: 15px;
                font-weight: 700;
                color: #00f0ff;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .gt-settings-body {
                padding: 20px;
                overflow-y: auto;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            .gt-section-card {
                background: #111622;
                border: 1px solid #1e2638;
                border-radius: 10px;
                padding: 14px;
            }
            .gt-section-title {
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: #38bdf8;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .gt-telemetry-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
                font-family: monospace;
            }
            .gt-telemetry-box {
                background: #0a0d14;
                border: 1px solid #1b2230;
                border-radius: 6px;
                padding: 8px 10px;
            }
            .gt-telemetry-label { font-size: 10px; color: #64748b; display: block; }
            .gt-telemetry-val { font-size: 14px; font-weight: bold; color: #10b981; }

            .gt-form-group { margin-bottom: 12px; }
            .gt-form-label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px; }
            .gt-form-input {
                width: 100%;
                box-sizing: border-box;
                background: #080b12;
                border: 1px solid #243046;
                border-radius: 6px;
                padding: 8px 12px;
                color: #f8fafc;
                font-family: monospace;
                font-size: 13px;
                outline: none;
            }
            .gt-form-input:focus { border-color: #00f0ff; }

            .gt-toggle-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #171f2e;
            }
            .gt-toggle-row:last-child { border-bottom: none; }
            .gt-toggle-info { font-size: 12px; color: #cbd5e1; }
            .gt-toggle-sub { font-size: 10px; color: #64748b; display: block; }

            .gt-log-list {
                max-height: 140px;
                overflow-y: auto;
                background: #080b12;
                border: 1px solid #1a2233;
                border-radius: 6px;
                padding: 6px;
                font-family: monospace;
                font-size: 11px;
            }
            .gt-log-entry {
                padding: 4px 6px;
                border-bottom: 1px solid #131a27;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .gt-log-time { color: #64748b; }
            .gt-log-text { color: #cbd5e1; flex: 1; }

            .gt-settings-footer {
                padding: 14px 20px;
                background: #121724;
                border-top: 1px solid #1f293d;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .gt-btn {
                background: #0284c7;
                color: white;
                border: none;
                border-radius: 6px;
                padding: 6px 14px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.15s;
            }
            .gt-btn:hover { background: #0369a1; }
            .gt-btn-emerald { background: #059669; }
            .gt-btn-emerald:hover { background: #047857; }
            .gt-btn-secondary { background: #334155; }
            .gt-btn-secondary:hover { background: #475569; }

            /* Fleet Dispatch Auto-Fill Banner */
            .gt-fleet-banner {
                position: fixed;
                top: 70px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 999990;
                background: #0f172a;
                border: 1px solid #38bdf8;
                border-radius: 10px;
                padding: 12px 20px;
                display: flex;
                align-items: center;
                gap: 16px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.3);
            }

            @keyframes gtFadeIn {
                from { opacity: 0; transform: scale(0.97); }
                to { opacity: 1; transform: scale(1); }
            }
            @keyframes gtSlideIn {
                from { opacity: 0; transform: translateX(20px); }
                to { opacity: 1; transform: translateX(0); }
            }
        `;
        this.shadow.appendChild(style);
    }

    renderStructure() {
        const wrapper = document.createElement('div');
        wrapper.id = 'gt-hud-wrapper';
        wrapper.innerHTML = `
            <!-- Floating Toast Notification Container -->
            <div class="gt-toast-container" id="gtToastContainer"></div>

            <!-- Floating Badge -->
            <div class="gt-status-badge" id="gtBadgeBtn" title="Clic para Configuración | Ctrl+K para Búsqueda">
                <div class="gt-pulse-dot"></div>
                <span><strong>GT Modern</strong></span>
                <span class="gt-badge-action" id="gtBtnOpenSettings" title="Configurar Sincronización y Ver Telemetría">Config</span>
                <span class="gt-badge-action" id="gtBtnOpenPalette" title="Abrir Command Palette">Ctrl+K</span>
            </div>

            <!-- Command Palette Modal (Hidden by default) -->
            <div class="gt-modal-backdrop" id="gtPaletteModal" style="display: none;">
                <div class="gt-palette-container">
                    <div class="gt-search-wrapper">
                        <input type="text" class="gt-search-input" id="gtSearchInput" placeholder="Buscar jugador, coord (ej: 1:154:3) o alianza..." autocomplete="off" />
                        <span class="gt-badge-action">ESC</span>
                    </div>
                    <div class="gt-results-list" id="gtResultsList">
                        <div style="padding: 12px 14px; border-bottom: 1px solid #1a2234; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" id="gtPaletteOpenConfigRow">
                            <span style="color: #38bdf8;"><strong>[Configuracion] Abrir Ventana de Configuracion y Telemetria</strong></span>
                            <span class="gt-badge-action">Enter</span>
                        </div>
                        <div style="padding: 20px; text-align: center; color: #64748b;">
                            Escribe coordenadas (ej: 1:154) o nombre de jugador...
                        </div>
                    </div>
                </div>
            </div>

            <!-- Settings & Telemetry Modal (Hidden by default) -->
            <div class="gt-modal-backdrop" id="gtSettingsModal" style="display: none;">
                <div class="gt-settings-container">
                    <div class="gt-settings-header">
                        <div class="gt-settings-title">
                            <span>[GT]</span>
                            <span>Galaxytool Modern v6.0 &bull; Configuracion & Telemetria</span>
                        </div>
                        <span class="gt-badge-action" id="gtBtnCloseSettings" style="cursor: pointer;">[X] Cerrar</span>
                    </div>

                    <div class="gt-settings-body">
                        <!-- Telemetry Status Bar -->
                        <div class="gt-section-card">
                            <div class="gt-section-title">
                                <span>Telemetria en Vivo & Base Local (IndexedDB)</span>
                                <span style="font-size: 10px; color: #10b981;">[Activo] En Escucha</span>
                            </div>
                            <div class="gt-telemetry-grid">
                                <div class="gt-telemetry-box">
                                    <span class="gt-telemetry-label">Planetas Indexados</span>
                                    <span class="gt-telemetry-val" id="gtStatPlanets">0</span>
                                </div>
                                <div class="gt-telemetry-box">
                                    <span class="gt-telemetry-label">Reportes Guardados</span>
                                    <span class="gt-telemetry-val" id="gtStatReports">0</span>
                                </div>
                                <div class="gt-telemetry-box">
                                    <span class="gt-telemetry-label">Jugadores / Rango</span>
                                    <span class="gt-telemetry-val" id="gtStatPlayers">0</span>
                                </div>
                            </div>
                        </div>

                        <!-- Alliance Passphrase -->
                        <div class="gt-section-card">
                            <div class="gt-section-title">
                                <span>Cifrado End-to-End de Alianza (AES-256-GCM)</span>
                            </div>
                            <div class="gt-form-group">
                                <label class="gt-form-label">Frase de Paso de Alianza (Debe ser identica entre tus companeros):</label>
                                <input type="password" class="gt-form-input" id="gtInputPassphrase" value="${this.config.passphrase}" placeholder="Clave secreta de alianza" />
                            </div>
                        </div>

                        <!-- Sync Options Toggles -->
                        <div class="gt-section-card">
                            <div class="gt-section-title">
                                <span>Modulos de Captura & Sincronizacion Automatica</span>
                            </div>
                            <div class="gt-toggle-row">
                                <div class="gt-toggle-info">
                                    <strong>Vista de Galaxia</strong>
                                    <span class="gt-toggle-sub">Guarda planetas, lunas, escombros y jugadores al navegar el mapa galactico.</span>
                                </div>
                                <input type="checkbox" id="gtChkSyncGalaxy" ${this.config.syncGalaxy ? 'checked' : ''} />
                            </div>
                            <div class="gt-toggle-row">
                                <div class="gt-toggle-info">
                                    <strong>Reportes de Espionaje</strong>
                                    <span class="gt-toggle-sub">Captura recursos y las 17 naves modernas al abrir mensajes de espionaje.</span>
                                </div>
                                <input type="checkbox" id="gtChkSyncReports" ${this.config.syncReports ? 'checked' : ''} />
                            </div>
                            <div class="gt-toggle-row">
                                <div class="gt-toggle-info">
                                    <strong>Tabla de Puntajes / Clasificacion</strong>
                                    <span class="gt-toggle-sub">Actualiza puntos y alianzas al consultar las clasificaciones in-game.</span>
                                </div>
                                <input type="checkbox" id="gtChkSyncHighscores" ${this.config.syncHighscores ? 'checked' : ''} />
                            </div>
                            <div class="gt-toggle-row">
                                <div class="gt-toggle-info">
                                    <strong>Sincronizacion por Chat In-Game (Steganography)</strong>
                                    <span class="gt-toggle-sub">Transmite inteligencia de forma invisible a tus aliados via chat de alianza.</span>
                                </div>
                                <input type="checkbox" id="gtChkSyncChat" ${this.config.syncChat ? 'checked' : ''} />
                            </div>
                            <div class="gt-toggle-row">
                                <div class="gt-toggle-info">
                                    <strong>Notificaciones en Pantalla (Toasts)</strong>
                                    <span class="gt-toggle-sub">Muestra avisos visuales flotantes al capturar galaxias, reportes o puntajes.</span>
                                </div>
                                <input type="checkbox" id="gtChkShowToasts" ${this.config.showToasts ? 'checked' : ''} />
                            </div>
                        </div>

                        <!-- Live Activity Feed -->
                        <div class="gt-section-card">
                            <div class="gt-section-title">
                                <span>Registro de Actividad Reciente</span>
                            </div>
                            <div class="gt-log-list" id="gtLogContainer">
                                <div class="gt-log-entry">
                                    <span class="gt-log-time">Esperando actividad...</span>
                                    <span class="gt-log-text">Navega por la galaxia o abre reportes para ver capturas en vivo.</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="gt-settings-footer">
                        <div style="display: flex; gap: 8px;">
                            <button class="gt-btn gt-btn-emerald" id="gtBtnSaveSettings">Guardar Cambios</button>
                            <button class="gt-btn gt-btn-secondary" id="gtBtnTestPing">Probar Envio</button>
                        </div>
                        <button class="gt-btn" id="gtBtnOpenDashboard">Abrir Dashboard PWA</button>
                    </div>
                </div>
            </div>

            <!-- Fleet Dispatch Auto-Fill Banner (Hidden by default) -->
            <div class="gt-fleet-banner" id="gtFleetBanner" style="display: none;"></div>
        `;
        this.shadow.appendChild(wrapper);
    }

    attachEventListeners() {
        const badge = this.shadow.querySelector('#gtBadgeBtn');
        const btnOpenSettings = this.shadow.querySelector('#gtBtnOpenSettings');
        const btnOpenPalette = this.shadow.querySelector('#gtBtnOpenPalette');
        const btnCloseSettings = this.shadow.querySelector('#gtBtnCloseSettings');

        const paletteModal = this.shadow.querySelector('#gtPaletteModal');
        const settingsModal = this.shadow.querySelector('#gtSettingsModal');
        const searchInput = this.shadow.querySelector('#gtSearchInput');

        // Badge clicks
        btnOpenSettings?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSettings(true);
        });
        btnOpenPalette?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePalette(true);
        });
        badge?.addEventListener('click', () => {
            this.toggleSettings(true);
        });

        // Close backdrop clicks
        paletteModal?.addEventListener('click', (e) => {
            if (e.target === paletteModal) this.togglePalette(false);
        });
        settingsModal?.addEventListener('click', (e) => {
            if (e.target === settingsModal) this.toggleSettings(false);
        });
        btnCloseSettings?.addEventListener('click', () => this.toggleSettings(false));

        // Command Palette actions
        searchInput?.addEventListener('input', (e) => this.handleSearch(e.target.value));
        this.shadow.querySelector('#gtPaletteOpenConfigRow')?.addEventListener('click', () => {
            this.togglePalette(false);
            this.toggleSettings(true);
        });

        // Save settings button
        this.shadow.querySelector('#gtBtnSaveSettings')?.addEventListener('click', () => {
            const pass = this.shadow.querySelector('#gtInputPassphrase')?.value || '';
            const syncG = this.shadow.querySelector('#gtChkSyncGalaxy')?.checked;
            const syncR = this.shadow.querySelector('#gtChkSyncReports')?.checked;
            const syncH = this.shadow.querySelector('#gtChkSyncHighscores')?.checked;
            const syncC = this.shadow.querySelector('#gtChkSyncChat')?.checked;
            const toasts = this.shadow.querySelector('#gtChkShowToasts')?.checked;

            this.saveConfig({
                passphrase: pass,
                syncGalaxy: syncG,
                syncReports: syncR,
                syncHighscores: syncH,
                syncChat: syncC,
                showToasts: toasts
            });
            this.toggleSettings(false);
        });

        // Test Chat Sync button
        this.shadow.querySelector('#gtBtnTestPing')?.addEventListener('click', () => {
            if (this.chatBus) {
                const dummyReport = {
                    galaxy: 1, system: 1, position: 1, isMoon: false,
                    resources: { metal: 100000, crystal: 50000, deuterium: 25000 },
                    fleet: { SC: 10, PATH: 2 },
                    timestamp: Math.floor(Date.now() / 1000)
                };
                this.chatBus.queueReport(dummyReport);
                this.notify('Paquete de prueba encriptado y puesto en cola de chat', 'success', '[OK]');
            } else {
                this.notify('Bus de chat no inicializado aún', 'warn', '[AVISO]');
            }
        });

        // Open Dashboard button
        this.shadow.querySelector('#gtBtnOpenDashboard')?.addEventListener('click', () => {
            window.open(this.config.dashboardUrl, '_blank');
        });

        // Global hotkeys: Ctrl+K or Alt+G for palette, Alt+S for settings
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.altKey && e.key.toLowerCase() === 'g')) {
                e.preventDefault();
                this.togglePalette(!this.isPaletteOpen);
            } else if (e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.toggleSettings(!this.isSettingsOpen);
            } else if (e.key === 'Escape') {
                if (this.isPaletteOpen) this.togglePalette(false);
                if (this.isSettingsOpen) this.toggleSettings(false);
            }
        });
    }

    notify(message, type = 'info', icon = '[GT]') {
        if (!this.config.showToasts || typeof document === 'undefined' || !this.shadow) return;

        const container = this.shadow.querySelector('#gtToastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `gt-toast ${type}`;
        toast.innerHTML = `
            <div class="gt-toast-icon">${icon}</div>
            <div class="gt-toast-content">
                <div class="gt-toast-title">Galaxytool Modern</div>
                <div class="gt-toast-msg">${this.escapeHTML(message)}</div>
            </div>
            <div class="gt-toast-close">&times;</div>
        `;

        toast.querySelector('.gt-toast-close')?.addEventListener('click', () => {
            if (typeof toast.remove === 'function') toast.remove();
            else if (toast.parentNode && typeof toast.parentNode.removeChild === 'function') toast.parentNode.removeChild(toast);
        });

        container.appendChild(toast);

        // Auto remove after 4.5 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => {
                if (typeof toast.remove === 'function') toast.remove();
                else if (toast.parentNode && typeof toast.parentNode.removeChild === 'function') toast.parentNode.removeChild(toast);
            }, 300);
        }, 4500);
    }

    togglePalette(open) {
        this.isPaletteOpen = open;
        const modal = this.shadow.querySelector('#gtPaletteModal');
        const input = this.shadow.querySelector('#gtSearchInput');

        if (open) {
            this.toggleSettings(false);
            modal.style.display = 'flex';
            setTimeout(() => input?.focus(), 50);
        } else {
            modal.style.display = 'none';
        }
    }

    async toggleSettings(open) {
        this.isSettingsOpen = open;
        const modal = this.shadow.querySelector('#gtSettingsModal');

        if (open) {
            this.togglePalette(false);
            await this.refreshTelemetryUI();
            modal.style.display = 'flex';
        } else {
            modal.style.display = 'none';
        }
    }

    async refreshTelemetryUI() {
        if (!this.shadow) return;

        // Update counts
        const planets = await this.storage.getAllPlanets();
        const reports = await this.storage.getAllReports();

        const elPlanets = this.shadow.querySelector('#gtStatPlanets');
        const elReports = this.shadow.querySelector('#gtStatReports');
        const elPlayers = this.shadow.querySelector('#gtStatPlayers');

        if (elPlanets) elPlanets.textContent = planets ? planets.length : 0;
        if (elReports) elReports.textContent = reports ? reports.length : 0;
        if (elPlayers) {
            const uniquePlayers = new Set(planets.map(p => p.playerName).filter(Boolean));
            elPlayers.textContent = uniquePlayers.size;
        }

        // Update log list from interceptor telemetry
        const logContainer = this.shadow.querySelector('#gtLogContainer');
        if (logContainer && this.interceptor?.telemetryLog) {
            const logs = this.interceptor.telemetryLog;
            if (logs.length === 0) {
                logContainer.innerHTML = `<div class="gt-log-entry"><span class="gt-log-time">-</span><span class="gt-log-text">Sin eventos registrados aún.</span></div>`;
            } else {
                logContainer.innerHTML = logs.slice(0, 15).map(l => {
                    const timeStr = new Date(l.timestamp).toLocaleTimeString();
                    const icon = l.type === 'galaxy' ? '[GAL]' : (l.type === 'report' ? '[REP]' : (l.type === 'highscore' ? '[TOP]' : '[SYS]'));
                    return `
                        <div class="gt-log-entry">
                            <span>${icon}</span>
                            <span class="gt-log-time">[${timeStr}]</span>
                            <span class="gt-log-text">${this.escapeHTML(l.summary)}</span>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    async handleSearch(query) {
        const q = query.trim().toLowerCase();
        const resultsContainer = this.shadow.querySelector('#gtResultsList');

        if (q.length === 0) {
            resultsContainer.innerHTML = `
                <div style="padding: 12px 14px; border-bottom: 1px solid #1a2234; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" id="gtPaletteOpenConfigRow">
                    <span style="color: #38bdf8;"><strong>[Configuracion] Abrir Ventana de Configuracion y Telemetria</strong></span>
                    <span class="gt-badge-action">Enter</span>
                </div>
                <div style="padding: 20px; text-align: center; color: #64748b;">
                    Escribe para buscar en la base de datos local...
                </div>
            `;
            this.shadow.querySelector('#gtPaletteOpenConfigRow')?.addEventListener('click', () => {
                this.togglePalette(false);
                this.toggleSettings(true);
            });
            return;
        }

        // Coordinate search regex (e.g. "1:154" or "1:154:3")
        const coordMatch = q.match(/(\d+):(\d+)(?::(\d+))?/);
        if (coordMatch) {
            const g = parseInt(coordMatch[1], 10);
            const s = parseInt(coordMatch[2], 10);
            const p = coordMatch[3] ? parseInt(coordMatch[3], 10) : null;

            if (p) {
                const planet = await this.storage.getPlanet(g, s, p, false);
                const report = await this.storage.getLatestReport(g, s, p, false);
                this.renderSearchResults(planet ? [planet] : [], report);
            } else {
                const systemPlanets = await this.storage.getSystem(g, s);
                this.renderSearchResults(systemPlanets);
            }
            return;
        }

        // Search in memory / storage
        const matches = [];
        const allPlanets = await this.storage.getAllPlanets();
        for (const p of allPlanets) {
            if (p.playerName?.toLowerCase().includes(q) || p.planetName?.toLowerCase().includes(q) || p.allianceTag?.toLowerCase().includes(q)) {
                matches.push(p);
                if (matches.length >= 15) break;
            }
        }
        this.renderSearchResults(matches);
    }

    renderSearchResults(planets, associatedReport = null) {
        const container = this.shadow.querySelector('#gtResultsList');
        if (!planets || planets.length === 0) {
            container.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b;">No se encontraron resultados en el universo explorado.</div>`;
            return;
        }

        let html = '';
        for (const p of planets) {
            const coordStr = `${p.galaxy}:${p.system}:${p.position}${p.isMoon ? ' (Luna)' : ''}`;
            const statusBadge = p.status ? `<span class="gt-result-status gt-status-inact">${p.status}</span>` : '';
            html += `
                <div class="gt-result-item" onclick="window.Galaxytool?.hud?.jumpToGalaxy(${p.galaxy}, ${p.system})">
                    <div>
                        <span class="gt-result-coords">[${coordStr}]</span>
                        <span class="gt-result-name">${p.playerName || 'Desconocido'} (${p.planetName || 'Planeta'})</span>
                    </div>
                    <div>
                        ${statusBadge}
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    jumpToGalaxy(galaxy, system) {
        this.togglePalette(false);
        if (typeof window !== 'undefined') {
            window.location.href = `/game/index.php?page=ingame&component=galaxy&galaxy=${galaxy}&system=${system}`;
        }
    }

    async checkFleetDispatch() {
        if (typeof window === 'undefined') return;
        const url = window.location.href;
        if (!url.includes('component=fleetdispatch')) return;

        const targetG = document.querySelector('#galaxy')?.value || 1;
        const targetS = document.querySelector('#system')?.value || 1;
        const targetP = document.querySelector('#position')?.value || 1;

        const report = await this.storage.getLatestReport(parseInt(targetG, 10), parseInt(targetS, 10), parseInt(targetP, 10), false);
        if (!report) return;

        const plunder = JSONLAdapter.calculatePlunder(report, 0.5);
        const banner = this.shadow.querySelector('#gtFleetBanner');
        banner.style.display = 'flex';
        banner.innerHTML = `
            <span><strong>Botin 50%:</strong> ${(plunder.plunderable.total / 1000).toFixed(0)}k | <strong>Req:</strong> ${plunder.shipsNeeded.SC} SC / ${plunder.shipsNeeded.LC} LC / ${plunder.shipsNeeded.PATH} PATH</span>
            <button class="gt-btn" id="gtAutoFillSC">Cargar ${plunder.shipsNeeded.SC} SC</button>
            <button class="gt-btn" id="gtAutoFillLC">Cargar ${plunder.shipsNeeded.LC} LC</button>
            <button class="gt-btn gt-btn-secondary" id="gtCloseBanner">[X]</button>
        `;

        this.shadow.querySelector('#gtAutoFillSC')?.addEventListener('click', () => this.fillShips(202, plunder.shipsNeeded.SC));
        this.shadow.querySelector('#gtAutoFillLC')?.addEventListener('click', () => this.fillShips(203, plunder.shipsNeeded.LC));
        this.shadow.querySelector('#gtCloseBanner')?.addEventListener('click', () => { banner.style.display = 'none'; });
    }

    fillShips(shipId, count) {
        const input = document.querySelector(`#ship_${shipId}`) || document.querySelector(`input[name="am${shipId}"]`);
        if (input) {
            input.value = count;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    attachGalaxyObserver() {
        if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
        const targetNode = document.querySelector('#galaxyContent') || document.body;
        if (!targetNode) return;

        const observer = new MutationObserver(() => {});
        observer.observe(targetNode, { childList: true, subtree: true });
    }

    escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

// Initialize Core Engine and Network Interceptor
(async function initGalaxytool() {
    try {
        const storage = new OGameStorageEngine();
        await storage.init();

        const chatBus = new ChatSyncBus(storage, {
            passphrase: 'DefaultAllianceSecret2026',
            autoBroadcast: true
        });

        let hud = null;

        const interceptor = new NetworkInterceptor(storage, (event) => {
            if (event.type === 'report') {
                if (hud && hud.config && !hud.config.syncReports) return;
                if (!hud || !hud.config || hud.config.syncChat) {
                    chatBus.queueReport(event.data);
                    console.log("[Galaxytool-Modern] Report queued for In-Game Chat Sync");
                }
                if (hud) hud.notify(event.summary, 'success', '[REP]');
            } else if (event.type === 'galaxy') {
                if (hud && hud.config && !hud.config.syncGalaxy) return;
                if (hud) hud.notify(event.summary, 'info', '[GAL]');
            } else if (event.type === 'highscore') {
                if (hud && hud.config && !hud.config.syncHighscores) return;
                if (hud) hud.notify(event.summary, 'info', '[TOP]');
            }
        });
        interceptor.start();

        hud = new InGameHUD(storage, chatBus, interceptor);
        chatBus.onReportReceived = (report) => {
            if (hud) hud.notify('Inteligencia recibida de aliado: [' + report.galaxy + ':' + report.system + ':' + report.position + ']', 'success', '[SYNC]');
        };

        if (typeof document !== 'undefined') {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => hud.init());
            } else {
                hud.init();
            }
        }

        // Expose public developer API on window and unsafeWindow
        const winContext = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        winContext.Galaxytool = window.Galaxytool = {
            version: '6.0.0',
            storage,
            interceptor,
            chatBus,
            hud,
            serializer: OGameReportSerializer,
            crypto: AllianceCrypto,
            stego: ZeroWidthSteganography,
            adapter: JSONLAdapter
        };

        console.log("[Galaxytool-Modern] Engine initialized successfully. Accessible at window.Galaxytool");
    } catch (err) {
        console.error("[Galaxytool-Modern] Boot error:", err);
    }
})();

})();
