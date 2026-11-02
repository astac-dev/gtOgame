/**
 * OGame Modern Galaxy Parser (Robust Real-World Implementation)
 * Extracts planets, moons, debris, players, and activity indicators
 * from modern OGame galaxy responses (JSON, HTML snippets, or Live DOM).
 */

export class GalaxyParser {
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
            clone.querySelectorAll('.galaxyTooltip, ul, pre').forEach(n => n.remove());
            const nameEl = clone.querySelector('.planetName, a, span') || clone;
            const text = nameEl.textContent.trim();
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

        // Alliance Tag
        const allyEl = row.querySelector('.cellAlliance .allianceTag, .cellAlliance, .cellAllianceName');
        let allianceTag = '';
        if (allyEl) {
            const clone = allyEl.cloneNode(true);
            clone.querySelectorAll('.galaxyTooltip, .rank, .members, ul, pre').forEach(n => n.remove());
            const tagEl = clone.querySelector('a, .allianceTag') || clone;
            allianceTag = tagEl.textContent.trim().replace(/^\[|\]$/g, '');
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
