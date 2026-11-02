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

import { JSONLAdapter } from '../storage/jsonl.js';

export class InGameHUD {
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
        this.notify('Ajustes guardados correctamente', 'success', '💾');
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
                <span class="gt-badge-action" id="gtBtnOpenSettings" title="Configurar Sincronización y Ver Telemetría">⚙️ Config</span>
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
                            <span style="color: #38bdf8;">⚙️ <strong>Abrir Ventana de Configuración y Telemetría</strong></span>
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
                            <span>Ω</span>
                            <span>Galaxytool Modern v6.0 &bull; Configuración & Telemetría</span>
                        </div>
                        <span class="gt-badge-action" id="gtBtnCloseSettings" style="cursor: pointer;">✕ Cerrar</span>
                    </div>

                    <div class="gt-settings-body">
                        <!-- Telemetry Status Bar -->
                        <div class="gt-section-card">
                            <div class="gt-section-title">
                                <span>📡 Telemetría en Vivo & Base Local (IndexedDB)</span>
                                <span style="font-size: 10px; color: #10b981;">● En Escucha Activa</span>
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
                                <span>🔐 Cifrado End-to-End de Alianza (AES-256-GCM)</span>
                            </div>
                            <div class="gt-form-group">
                                <label class="gt-form-label">Frase de Paso de Alianza (Debe ser idéntica entre tus compañeros):</label>
                                <input type="password" class="gt-form-input" id="gtInputPassphrase" value="${this.config.passphrase}" placeholder="Clave secreta de alianza" />
                            </div>
                        </div>

                        <!-- Sync Options Toggles -->
                        <div class="gt-section-card">
                            <div class="gt-section-title">
                                <span>⚡ Módulos de Captura & Sincronización Automática</span>
                            </div>
                            <div class="gt-toggle-row">
                                <div class="gt-toggle-info">
                                    <strong>🪐 Vista de Galaxia</strong>
                                    <span class="gt-toggle-sub">Guarda planetas, lunas, escombros y jugadores al navegar el mapa galáctico.</span>
                                </div>
                                <input type="checkbox" id="gtChkSyncGalaxy" ${this.config.syncGalaxy ? 'checked' : ''} />
                            </div>
                            <div class="gt-toggle-row">
                                <div class="gt-toggle-info">
                                    <strong>📡 Reportes de Espionaje</strong>
                                    <span class="gt-toggle-sub">Captura recursos y las 17 naves modernas al abrir mensajes de espionaje.</span>
                                </div>
                                <input type="checkbox" id="gtChkSyncReports" ${this.config.syncReports ? 'checked' : ''} />
                            </div>
                            <div class="gt-toggle-row">
                                <div class="gt-toggle-info">
                                    <strong>🏆 Tabla de Puntajes / Clasificación</strong>
                                    <span class="gt-toggle-sub">Actualiza puntos y alianzas al consultar las clasificaciones in-game.</span>
                                </div>
                                <input type="checkbox" id="gtChkSyncHighscores" ${this.config.syncHighscores ? 'checked' : ''} />
                            </div>
                            <div class="gt-toggle-row">
                                <div class="gt-toggle-info">
                                    <strong>💬 Sincronización por Chat In-Game (Steganography)</strong>
                                    <span class="gt-toggle-sub">Transmite inteligencia de forma invisible a tus aliados vía chat de alianza.</span>
                                </div>
                                <input type="checkbox" id="gtChkSyncChat" ${this.config.syncChat ? 'checked' : ''} />
                            </div>
                            <div class="gt-toggle-row">
                                <div class="gt-toggle-info">
                                    <strong>🔔 Notificaciones en Pantalla (Toasts)</strong>
                                    <span class="gt-toggle-sub">Muestra avisos visuales flotantes al capturar galaxias, reportes o puntajes.</span>
                                </div>
                                <input type="checkbox" id="gtChkShowToasts" ${this.config.showToasts ? 'checked' : ''} />
                            </div>
                        </div>

                        <!-- Live Activity Feed -->
                        <div class="gt-section-card">
                            <div class="gt-section-title">
                                <span>📋 Registro de Actividad Reciente</span>
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
                            <button class="gt-btn gt-btn-emerald" id="gtBtnSaveSettings">💾 Guardar Cambios</button>
                            <button class="gt-btn gt-btn-secondary" id="gtBtnTestPing">🧪 Probar Envío</button>
                        </div>
                        <button class="gt-btn" id="gtBtnOpenDashboard">🌐 Abrir Dashboard PWA</button>
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
                this.notify('Paquete de prueba encriptado y puesto en cola de chat', 'success', '🚀');
            } else {
                this.notify('Bus de chat no inicializado aún', 'warn', '⚠️');
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

    notify(message, type = 'info', icon = '📡') {
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
            else if (toast.parentNode) toast.parentNode.removeChild(toast);
        });

        container.appendChild(toast);

        // Auto remove after 4.5 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => {
                if (typeof toast.remove === 'function') toast.remove();
                else if (toast.parentNode) toast.parentNode.removeChild(toast);
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
                    const icon = l.type === 'galaxy' ? '🪐' : (l.type === 'report' ? '📡' : (l.type === 'highscore' ? '🏆' : '⚙️'));
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
                    <span style="color: #38bdf8;">⚙️ <strong>Abrir Ventana de Configuración y Telemetría</strong></span>
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
