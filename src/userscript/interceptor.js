/**
 * Passive Network Interceptor for OGame
 * Hooks window.fetch and XMLHttpRequest to monitor and capture in-game telemetry
 * without altering native game behavior (Strict Anti-Ban Compliance).
 */

import { GalaxyParser } from './parser-galaxy.js';
import { ReportParser } from './parser-reports.js';
import { HighscoreParser } from './parser-highscore.js';

export class NetworkInterceptor {
    constructor(storageEngine, onDataCaptured = null) {
        this.storage = storageEngine;
        this.onDataCaptured = onDataCaptured;
        this.active = false;
        this.telemetryLog = [];
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
     * Attaches passive hooks to fetch and XMLHttpRequest
     */
    start() {
        if (this.active) return;
        this.active = true;

        this.hookFetch();
        this.hookXHR();
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

                if (url.includes('page=galaxyContent') || url.includes('component=galaxy')) {
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
                    if (url.includes('page=galaxyContent') || url.includes('component=galaxy')) {
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

    async handleGalaxyResponse(content) {
        const parsed = GalaxyParser.parse(content);
        if (!parsed || !parsed.planets || parsed.planets.length === 0) return;

        for (const planet of parsed.planets) {
            await this.storage.savePlanet(planet);
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

        const summary = `Sistema ${parsed.galaxy}:${parsed.system} interceptado (${parsed.planets.length} cuerpos celestes guardados)`;
        console.log(`[Galaxytool-Modern] ${summary}`);
        this.logEvent('galaxy', summary, { galaxy: parsed.galaxy, system: parsed.system, count: parsed.planets.length });

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
}

