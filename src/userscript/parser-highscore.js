/**
 * OGame Modern Highscore / Leaderboard Parser
 * Extracts player rankings, points, alliances, and honor points from OGame highscores.
 */

export class HighscoreParser {
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

