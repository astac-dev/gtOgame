/**
 * Modern In-Game Tactical HUD (Head-Up Display)
 * Encapsulated in Web Components with Shadow DOM for 0% CSS collision with OGame.
 * Features:
 * - Floating Tactical Badge & Status Indicator
 * - Command Palette (Ctrl+K or Alt+G) with instant fuzzy search
 * - Galaxy View Enrichment (Scout age & loot profitability)
 * - Fleet Dispatch Auto-Filler (Calculates & inputs exact SC/LC/PATH for 50%/75% plunder)
 */

import { JSONLAdapter } from '../storage/jsonl.js';

export class InGameHUD {
    constructor(storageEngine, chatBus = null) {
        this.storage = storageEngine;
        this.chatBus = chatBus;
        this.host = null;
        this.shadow = null;
        this.isPaletteOpen = false;
        this.initialized = false;
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

        console.log("[Galaxytool-Modern] In-Game Tactical HUD mounted in Shadow DOM.");
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
                background: rgba(11, 14, 20, 0.88);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(0, 240, 255, 0.35);
                border-radius: 9999px;
                padding: 6px 14px;
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 12px rgba(0, 240, 255, 0.2);
                transition: all 0.2s ease;
                user-select: none;
            }
            .gt-status-badge:hover {
                transform: translateY(-2px);
                border-color: #00f0ff;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6), 0 0 16px rgba(0, 240, 255, 0.4);
            }
            .gt-pulse-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #10b981;
                box-shadow: 0 0 8px #10b981;
            }

            /* Command Palette Overlay Modal */
            .gt-palette-backdrop {
                position: fixed;
                inset: 0;
                z-index: 1000000;
                background: rgba(4, 6, 10, 0.75);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: flex-start;
                justify-content: center;
                padding-top: 10vh;
                animation: gtFadeIn 0.15s ease-out;
            }
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
            .gt-search-input::placeholder {
                color: #64748b;
            }
            .gt-kbd-shortcut {
                background: #1e293b;
                border: 1px solid #334155;
                border-radius: 4px;
                padding: 2px 6px;
                font-size: 11px;
                color: #94a3b8;
            }
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
            .gt-result-item:hover, .gt-result-item.selected {
                background: #1a2234;
            }
            .gt-result-coords {
                color: #00f0ff;
                font-weight: 600;
                font-family: monospace;
            }
            .gt-result-name {
                color: #e2e8f0;
                margin-left: 8px;
            }
            .gt-result-status {
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: bold;
            }
            .gt-status-inact {
                background: rgba(245, 158, 11, 0.2);
                color: #f59e0b;
                border: 1px solid rgba(245, 158, 11, 0.4);
            }

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
            .gt-btn {
                background: #0284c7;
                color: white;
                border: none;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.15s;
            }
            .gt-btn:hover {
                background: #0369a1;
            }
            .gt-btn-secondary {
                background: #334155;
            }
            .gt-btn-secondary:hover {
                background: #475569;
            }

            @keyframes gtFadeIn {
                from { opacity: 0; transform: scale(0.97); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        this.shadow.appendChild(style);
    }

    renderStructure() {
        const wrapper = document.createElement('div');
        wrapper.id = 'gt-hud-wrapper';
        wrapper.innerHTML = `
            <!-- Floating Badge -->
            <div class="gt-status-badge" id="gtBadgeBtn" title="Presiona Ctrl + K para abrir el Command Palette">
                <div class="gt-pulse-dot"></div>
                <span><strong>GT Modern</strong></span>
                <span class="gt-kbd-shortcut">Ctrl+K</span>
            </div>

            <!-- Command Palette Modal (Hidden by default) -->
            <div class="gt-palette-backdrop" id="gtPaletteModal" style="display: none;">
                <div class="gt-palette-container">
                    <div class="gt-search-wrapper">
                        <input type="text" class="gt-search-input" id="gtSearchInput" placeholder="Buscar jugador, coord (ej: 1:154:3) o alianza..." autocomplete="off" />
                        <span class="gt-kbd-shortcut">ESC</span>
                    </div>
                    <div class="gt-results-list" id="gtResultsList">
                        <div style="padding: 20px; text-align: center; color: #64748b;">
                            Escribe para buscar en la base de datos local...
                        </div>
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
        const modal = this.shadow.querySelector('#gtPaletteModal');
        const input = this.shadow.querySelector('#gtSearchInput');

        badge.addEventListener('click', () => this.togglePalette(true));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.togglePalette(false);
        });

        input.addEventListener('input', (e) => this.handleSearch(e.target.value));

        // Global hotkeys: Ctrl+K or Alt+G
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.altKey && e.key.toLowerCase() === 'g')) {
                e.preventDefault();
                this.togglePalette(!this.isPaletteOpen);
            } else if (e.key === 'Escape' && this.isPaletteOpen) {
                this.togglePalette(false);
            }
        });
    }

    togglePalette(open) {
        this.isPaletteOpen = open;
        const modal = this.shadow.querySelector('#gtPaletteModal');
        const input = this.shadow.querySelector('#gtSearchInput');

        if (open) {
            modal.style.display = 'flex';
            setTimeout(() => input.focus(), 50);
        } else {
            modal.style.display = 'none';
        }
    }

    async handleSearch(query) {
        const q = query.trim().toLowerCase();
        const resultsContainer = this.shadow.querySelector('#gtResultsList');

        if (q.length === 0) {
            resultsContainer.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #64748b;">
                    Escribe para buscar en la base de datos local...
                </div>
            `;
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
        if (this.storage.memoryStore?.planets) {
            for (const p of this.storage.memoryStore.planets.values()) {
                if (p.playerName?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || p.allianceTag?.toLowerCase().includes(q)) {
                    matches.push(p);
                    if (matches.length >= 15) break;
                }
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
                        <span class="gt-result-name">${p.playerName || 'Desconocido'} (${p.name || 'Planeta'})</span>
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

    /**
     * Checks if current page is fleet dispatch and offers automated cargo looting
     */
    async checkFleetDispatch() {
        if (typeof window === 'undefined') return;
        const url = window.location.href;
        if (!url.includes('component=fleetdispatch')) return;

        // Try to read target coordinates from query or DOM
        const targetG = document.querySelector('#galaxy')?.value || 1;
        const targetS = document.querySelector('#system')?.value || 1;
        const targetP = document.querySelector('#position')?.value || 1;

        const report = await this.storage.getLatestReport(parseInt(targetG, 10), parseInt(targetS, 10), parseInt(targetP, 10), false);
        if (!report) return;

        const plunder = JSONLAdapter.calculatePlunder(report, 0.5);
        const banner = this.shadow.querySelector('#gtFleetBanner');
        banner.style.display = 'flex';
        banner.innerHTML = `
            <span>🎯 <strong>Botín 50%:</strong> ${(plunder.plunderable.total / 1000).toFixed(0)}k | <strong>Req:</strong> ${plunder.shipsNeeded.SC} SC / ${plunder.shipsNeeded.LC} LC / ${plunder.shipsNeeded.PATH} PATH</span>
            <button class="gt-btn" id="gtAutoFillSC">Cargar ${plunder.shipsNeeded.SC} SC</button>
            <button class="gt-btn" id="gtAutoFillLC">Cargar ${plunder.shipsNeeded.LC} LC</button>
            <button class="gt-btn gt-btn-secondary" id="gtCloseBanner">✕</button>
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

    /**
     * Observes galaxy view DOM updates to annotate with intelligence
     */
    attachGalaxyObserver() {
        if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
        const targetNode = document.querySelector('#galaxyContent') || document.body;
        if (!targetNode) return;

        const observer = new MutationObserver(() => {
            // Annotations hook
        });
        observer.observe(targetNode, { childList: true, subtree: true });
    }
}
