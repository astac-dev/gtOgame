/**
 * OGame Modern Bitpacking Binary Encoder
 * High-density binary serialization for espionage reports and galaxy coordinates.
 */

import { PROTOCOL_MAGIC, PROTOCOL_VERSION, SHIPS, SHIP_KEY_INDEX, SHIP_ID_INDEX } from './constants.js';

// Base Epoch: 2026-01-01 00:00:00 UTC in seconds
const EPOCH_BASE_2026 = 1767225600;

export class BinaryEncoder {
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

export class BinaryDecoder {
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
export class OGameReportSerializer {
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

