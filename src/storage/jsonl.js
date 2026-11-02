/**
 * JSON & JSONL (JSON Lines) Serialization & Analytics Engine
 * File-system and backup adapter with OGame military looting algorithms.
 */

import { SHIPS, SHIP_KEY_INDEX } from '../core/constants.js';

export class JSONLAdapter {
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

