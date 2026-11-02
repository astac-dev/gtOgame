/**
 * Passive Network Interceptor for OGame
 * Hooks window.fetch and XMLHttpRequest to monitor and capture in-game telemetry
 * without altering native game behavior (Strict Anti-Ban Compliance).
 */

import { GalaxyParser } from './parser-galaxy.js';
import { ReportParser } from './parser-reports.js';

export class NetworkInterceptor {
    constructor(storageEngine, onDataCaptured = null) {
        this.storage = storageEngine;
        this.onDataCaptured = onDataCaptured;
        this.active = false;
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

        console.log(`[Galaxytool-Modern] Saved ${parsed.planets.length} celestial bodies for System ${parsed.galaxy}:${parsed.system}`);
        if (this.onDataCaptured) {
            this.onDataCaptured({ type: 'galaxy', data: parsed });
        }
    }

    async handleReportResponse(content) {
        const parsed = ReportParser.parse(content);
        if (!parsed || !parsed.galaxy || !parsed.system) return;

        const saved = await this.storage.saveReport(parsed);
        console.log(`[Galaxytool-Modern] Espionage report saved for [${parsed.galaxy}:${parsed.system}:${parsed.position}]`);
        if (this.onDataCaptured) {
            this.onDataCaptured({ type: 'report', data: saved });
        }
    }
}

