/**
 * OGame Modern Espionage & Combat Report Parser
 * Extracts full 17 ships, defenses, resources, and coordinates from OGame messages.
 */

import { SHIPS, SHIP_KEY_INDEX, SHIP_ID_INDEX } from '../core/constants.js';

export class ReportParser {
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

