/**
 * OGame Modern Galaxy Parser
 * Extracts planets, moons, debris, players, and activity indicators
 * from modern OGame galaxy responses (JSON or DOM snippets).
 */

export class GalaxyParser {
    /**
     * Parses an OGame galaxy response (supports modern JSON payload and DOM fallback)
     * @param {Object|string} responseData
     * @returns {Object|null} { galaxy, system, planets: Array<Object> }
     */
    static parse(responseData) {
        if (!responseData) return null;

        // Modern OGame galaxy responses often arrive as JSON
        if (typeof responseData === 'object' && responseData.galaxy && responseData.system) {
            return this.parseJSONGalaxy(responseData);
        }

        if (typeof responseData === 'string') {
            try {
                const parsed = JSON.parse(responseData);
                if (parsed.galaxy && parsed.system) {
                    return this.parseJSONGalaxy(parsed);
                }
            } catch (_) {
                // Fallback: parse as HTML DOM
                return this.parseHTMLGalaxy(responseData);
            }
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

        // OGame provides system rows either as array or object
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
                name: row.planetName || row.name || `Planeta ${position}`,
                playerId: row.playerId ? parseInt(row.playerId, 10) : 0,
                playerName: row.playerName || '',
                allianceId: row.allianceId ? parseInt(row.allianceId, 10) : 0,
                allianceTag: row.allianceTag || '',
                status: row.playerStatus || row.status || '', // 'active', 'i', 'I', 'v', 'b'
                activity: row.activity || null, // null, '*', '15min'
                debris: [
                    row.debrisMetal ? parseInt(row.debrisMetal, 10) : 0,
                    row.debrisCrystal ? parseInt(row.debrisCrystal, 10) : 0
                ],
                updatedAt: Date.now()
            };

            planets.push(planetObj);

            // Check if Moon exists
            if (row.hasMoon || row.moon) {
                const moonObj = {
                    galaxy,
                    system,
                    position,
                    isMoon: true,
                    name: row.moonName || 'Luna',
                    moonSize: row.moonSize ? parseInt(row.moonSize, 10) : 0,
                    playerId: planetObj.playerId,
                    playerName: planetObj.playerName,
                    allianceId: planetObj.allianceId,
                    allianceTag: planetObj.allianceTag,
                    status: planetObj.status,
                    activity: row.moonActivity || null,
                    updatedAt: Date.now()
                };
                planets.push(moonObj);
            }
        }

        return { galaxy, system, planets };
    }

    /**
     * Parses HTML DOM string fallback if OGame returns HTML table
     */
    static parseHTMLGalaxy(htmlString) {
        // Fallback regex extraction for galaxy/system header
        const gMatch = htmlString.match(/name=["']galaxy["']\s+value=["'](\d+)["']/i) ||
                       htmlString.match(/data-galaxy=["'](\d+)["']/i);
        const sMatch = htmlString.match(/name=["']system["']\s+value=["'](\d+)["']/i) ||
                       htmlString.match(/data-system=["'](\d+)["']/i);

        if (!gMatch || !sMatch) return null;

        const galaxy = parseInt(gMatch[1], 10);
        const system = parseInt(sMatch[1], 10);
        const planets = [];

        // Simple row matcher across slots 1 to 15
        const rowRegex = /data-planet-id=["'](\d+)["'][\s\S]*?position["']?>(\d+)<[\s\S]*?(?:player["']>([^<]+)<)?/gi;
        let match;
        while ((match = rowRegex.exec(htmlString)) !== null) {
            planets.push({
                galaxy,
                system,
                position: parseInt(match[2], 10),
                isMoon: false,
                name: 'Planeta ' + match[2],
                playerId: parseInt(match[1], 10),
                playerName: match[3] ? match[3].trim() : '',
                updatedAt: Date.now()
            });
        }

        return { galaxy, system, planets };
    }
}

