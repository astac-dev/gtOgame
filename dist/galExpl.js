// ==UserScript==
// @name         Bot: 1. Explorador de Galaxia v1.11 (Navegación Orgánica, Escaneo y Espionaje Directo)
// @namespace    http://tampermonkey.net/
// @version      1.11
// @description  Navegación y escaneo automático de OGame sistema por sistema y galaxia por galaxia con intervalos aleatorios en milisegundos (jitter), detección y guardado en memoria de inactivos, y auto-espionaje directo de planetas y lunas inactivos compatible con Antigame Reborn (AGR).
// @author       Tu Especialista en IA
// @match        *://*.ogame.gameforge.com/game/index.php*
// @match        *://localhost/*
// @match        *://127.0.0.1/*
// @match        file://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const MEM_PREFIX = "ogame_scanner_";

    // --- VARIABLES DE ESTADO ---
    let scanTimeout = null;
    let countdownInterval = null;
    let isScanning = false;
    let isSpyingInProgress = false;
    let systemsScannedSession = 0;

    // --- HELPERS DE TIEMPO Y NAVEGACIÓN ---
    const getRandomDelayMs = (minMs, maxMs) => {
        const minVal = Math.max(300, parseInt(minMs) || 2500);
        const maxVal = Math.max(minVal, parseInt(maxMs) || 5000);
        return Math.floor(Math.random() * (maxVal - minVal + 1) + minVal);
    };

    function isGalaxyView() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('component') === 'galaxy' ||
            !!document.getElementById('galaxycomponent') ||
            !!document.getElementById('galaxy_input') ||
            window.location.pathname.toLowerCase().includes('galaxia');
    }

    function getUniverseLimits() {
        let maxG = 6;
        let maxS = 499;

        if (typeof win.maxGalaxies !== 'undefined' && !isNaN(parseInt(win.maxGalaxies))) {
            maxG = parseInt(win.maxGalaxies);
        } else {
            const metaG = document.querySelector('meta[name="ogame-universe-galaxies"]');
            if (metaG && metaG.content) maxG = parseInt(metaG.content) || 6;
        }

        if (typeof win.maxSystems !== 'undefined' && !isNaN(parseInt(win.maxSystems))) {
            maxS = parseInt(win.maxSystems);
        } else {
            const metaS = document.querySelector('meta[name="ogame-universe-systems"]');
            if (metaS && metaS.content) maxS = parseInt(metaS.content) || 499;
        }

        return { maxGalaxies: maxG, maxSystems: maxS };
    }

    function getCurrentCoords() {
        const gInput = document.getElementById('galaxy_input');
        const sInput = document.getElementById('system_input');

        let curG = gInput ? parseInt(gInput.value) : (win.galaxy || 1);
        let curS = sInput ? parseInt(sInput.value) : (win.system || 1);

        if (isNaN(curG) || curG < 1) curG = 1;
        if (isNaN(curS) || curS < 1) curS = 1;

        return { galaxy: curG, system: curS };
    }

    function isOGameBusy() {
        if (win.inProgress === true) return true;
        const loader = document.getElementById('galaxyLoading');
        if (loader && loader.style.display !== 'none') return true;
        return false;
    }

    function detectCaptcha() {
        const captchaEl = document.querySelector('#captcha, .geetest_holder, iframe[src*="captcha"], iframe[src*="challenge"]');
        return !!captchaEl;
    }

    function playBeep(freq = 600, duration = 150) {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = "sine";
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            osc.start();
            setTimeout(() => {
                osc.stop();
                audioCtx.close();
            }, duration);
        } catch (e) {
            // Audio context restringido sin interacción previa
        }
    }

    // --- GESTIÓN DE MEMORIA PERSISTENTE DE INACTIVOS ---
    function getInactivesList() {
        try {
            const raw = GM_getValue(MEM_PREFIX + 'inactives', '[]');
            return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
        } catch (e) {
            return [];
        }
    }

    function saveInactivesList(list) {
        GM_setValue(MEM_PREFIX + 'inactives', JSON.stringify(list));
    }

    function recordInactivePlanet(planetData) {
        const list = getInactivesList();
        const existingIdx = list.findIndex(p => p.coords === planetData.coords);

        if (existingIdx >= 0) {
            list[existingIdx].lastSeen = planetData.lastSeen;
            list[existingIdx].status = planetData.status;
            list[existingIdx].statusLabel = planetData.statusLabel;
            list[existingIdx].hasMoon = planetData.hasMoon;
            list[existingIdx].alliance = planetData.alliance;
            if (planetData.spied) list[existingIdx].spiedAt = planetData.lastSeen;
        } else {
            list.unshift(planetData);
        }

        saveInactivesList(list);
        updateInactivesCountUI();
    }

    function extractCleanPlayerName(row) {
        const playerEl = row.querySelector('.cellPlayerName .playerName') || row.querySelector('.cellPlayerName');
        if (!playerEl) return 'Inactivo';
        const clone = playerEl.cloneNode(true);
        clone.querySelectorAll('.galaxyTooltip, div, ul, pre, selected-language-icon').forEach(n => n.remove());
        const name = clone.textContent.trim();
        return name || 'Inactivo';
    }

    // --- MOTOR DE ESPIONAJE DIRECTO Y CLIC ORGÁNICO ---
    function executeEspionage(target) {
        console.log(`[Radar Galaxia] 🕵️ Ejecutando orden de espionaje a ${target.label}...`);

        let executed = false;
        const candidateElements = [
            target.element,
            target.spyActionElement,
            target.element?.closest('a'),
            target.element?.querySelector('a')
        ].filter(Boolean);

        // 1. Extraer parámetros exactos de sendShips del onclick si existe
        for (const el of candidateElements) {
            const onclickStr = el.getAttribute('onclick') || '';
            const match = onclickStr.match(/sendShips\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
            if (match) {
                const mission = parseInt(match[1]); // 6 = espionaje
                const g = parseInt(match[2]);
                const s = parseInt(match[3]);
                const p = parseInt(match[4]);
                const t = parseInt(match[5]); // 1 = planeta, 3 = luna
                const amount = parseInt(match[6]); // cantidad de sondas

                console.log(`[Radar Galaxia] 🎯 Parámetros detectados: sendShips(${mission}, ${g}, ${s}, ${p}, ${t}, ${amount})`);

                // Invocación directa en el contexto de la ventana principal
                if (typeof win.sendShips === 'function') {
                    try {
                        win.sendShips(mission, g, s, p, t, amount);
                        executed = true;
                        console.log("[Radar Galaxia] ✅ win.sendShips ejecutado exitosamente.");
                    } catch (err) {
                        console.warn("[Radar Galaxia] Error en win.sendShips:", err);
                    }
                }

                // Respaldo vía win.eval en caso de restricciones de sandbox
                if (!executed) {
                    try {
                        win.eval(`sendShips(${mission}, ${g}, ${s}, ${p}, ${t}, ${amount})`);
                        executed = true;
                        console.log("[Radar Galaxia] ✅ win.eval(sendShips) ejecutado con éxito.");
                    } catch (err) {
                        console.warn("[Radar Galaxia] Error en win.eval(sendShips):", err);
                    }
                }
                break;
            }
        }

        // 2. Si no se detectó onclick explícito, construir la llamada con coordenadas y tipo
        if (!executed) {
            const probeQty = win.spionageAmount || 15;
            const targetType = target.type === 'moon' ? 3 : 1;
            console.log(`[Radar Galaxia] 🛠️ Invocando sendShips(6, ${target.galaxy}, ${target.system}, ${target.position}, ${targetType}, ${probeQty})`);

            if (typeof win.sendShips === 'function') {
                try {
                    win.sendShips(6, target.galaxy, target.system, target.position, targetType, probeQty);
                    executed = true;
                    console.log("[Radar Galaxia] ✅ sendShips nativo ejecutado.");
                } catch (err) {
                    console.warn("[Radar Galaxia] Error invocando sendShips nativo:", err);
                }
            }

            if (!executed) {
                try {
                    win.eval(`if (typeof sendShips === 'function') sendShips(6, ${target.galaxy}, ${target.system}, ${target.position}, ${targetType}, ${probeQty});`);
                    executed = true;
                } catch (e) {
                    console.warn("[Radar Galaxia] Falló llamada eval de respaldo:", e);
                }
            }
        }

        // 3. Disparar también eventos de clic en el DOM para asegurar compatibilidad con AntiGame Reborn
        for (const el of candidateElements) {
            try {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                const evtClick = new MouseEvent('click', { bubbles: true, cancelable: true, view: win });
                el.dispatchEvent(evtClick);
                if (typeof el.click === 'function') el.click();
            } catch (e) { }
        }

        playBeep(720, 80);
    }

    // --- INTERFAZ FLOTANTE TÁCTICA SCI-FI ---
    function createUI() {
        if (document.getElementById('ia-galaxy-scanner-panel')) return;

        const { maxGalaxies, maxSystems } = getUniverseLimits();
        const cur = getCurrentCoords();

        const panel = document.createElement('div');
        panel.id = 'ia-galaxy-scanner-panel';
        panel.style.position = 'fixed';
        panel.style.top = GM_getValue(MEM_PREFIX + 'pos_top', '120px');
        panel.style.left = GM_getValue(MEM_PREFIX + 'pos_left', '20px');
        panel.style.backgroundColor = 'rgba(10, 20, 32, 0.96)';
        panel.style.border = '2px solid #00d2d3';
        panel.style.borderRadius = '8px';
        panel.style.padding = '12px';
        panel.style.zIndex = '999998';
        panel.style.color = '#ecf0f1';
        panel.style.fontFamily = 'Verdana, sans-serif';
        panel.style.fontSize = '11px';
        panel.style.width = '315px';
        panel.style.boxShadow = '0 0 18px rgba(0, 210, 211, 0.4)';
        panel.style.boxSizing = 'border-box';

        const savedMinDelayMs = GM_getValue(MEM_PREFIX + 'min_delay_ms', 2500);
        const savedMaxDelayMs = GM_getValue(MEM_PREFIX + 'max_delay_ms', 5000);
        const savedStartG = GM_getValue(MEM_PREFIX + 'start_g', cur.galaxy);
        const savedEndG = GM_getValue(MEM_PREFIX + 'end_g', maxGalaxies);
        const savedStartS = GM_getValue(MEM_PREFIX + 'start_s', cur.system);
        const savedEndS = GM_getValue(MEM_PREFIX + 'end_s', maxSystems);
        const savedLoop = GM_getValue(MEM_PREFIX + 'auto_loop', false);
        const savedAutoSpy = GM_getValue(MEM_PREFIX + 'auto_spy', true);
        const savedSpyMoon = GM_getValue(MEM_PREFIX + 'spy_moon', true);
        const savedSyncGT = GM_getValue(MEM_PREFIX + 'sync_gt', true);

        const inactivesCount = getInactivesList().length;

        panel.innerHTML = `
            <div id="scanner-drag-handle" style="cursor: move; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #00d2d3; padding-bottom: 6px; margin-bottom: 10px;">
                <span style="color: #00d2d3; font-weight: bold; font-size: 12px; letter-spacing: 0.5px;">
                    🌌 Radar de Galaxia v1.11
                </span>
                <div>
                    <span id="btn-minimize-scanner" style="cursor: pointer; padding: 0 4px; font-weight: bold; color: #7f8c8d;" title="Minimizar / Expandir">_</span>
                </div>
            </div>

            <div id="scanner-body">
                <!-- RANGO DE GALAXIA Y SISTEMA -->
                <div style="background: rgba(0, 0, 0, 0.4); padding: 8px; border-radius: 5px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.08);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-weight: bold; color: #3498db;">🎯 Rango de Coordenadas:</span>
                        <button id="btn-use-current-coords" style="background: #2c3e50; color: #bdc3c7; border: 1px solid #7f8c8d; border-radius: 3px; font-size: 9px; padding: 2px 5px; cursor: pointer;">
                            📍 Usar Actuales
                        </button>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: #bdc3c7;">Galaxias:</span>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <input type="number" id="sc-start-g" min="1" max="${maxGalaxies}" value="${savedStartG}" style="width: 48px; padding: 2px 4px; background: #1b2838; color: #fff; border: 1px solid #34495e; border-radius: 3px; text-align: center;">
                            <span style="color: #7f8c8d;">➜</span>
                            <input type="number" id="sc-end-g" min="1" max="${maxGalaxies}" value="${savedEndG}" style="width: 48px; padding: 2px 4px; background: #1b2838; color: #fff; border: 1px solid #34495e; border-radius: 3px; text-align: center;">
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="color: #bdc3c7;">Sistemas:</span>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <input type="number" id="sc-start-s" min="1" max="${maxSystems}" value="${savedStartS}" style="width: 48px; padding: 2px 4px; background: #1b2838; color: #fff; border: 1px solid #34495e; border-radius: 3px; text-align: center;">
                            <span style="color: #7f8c8d;">➜</span>
                            <input type="number" id="sc-end-s" min="1" max="${maxSystems}" value="${savedEndS}" style="width: 48px; padding: 2px 4px; background: #1b2838; color: #fff; border: 1px solid #34495e; border-radius: 3px; text-align: center;">
                        </div>
                    </div>
                </div>

                <!-- VELOCIDAD Y JITTER EN MILISEGUNDOS -->
                <div style="background: rgba(0, 0, 0, 0.4); padding: 8px; border-radius: 5px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.08);">
                    <div style="font-weight: bold; color: #f1c40f; margin-bottom: 6px;">
                        ⏱️ Intervalo al Azar (en Milisegundos):
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="color: #bdc3c7;">Min (ms):</span>
                        <input type="number" step="100" min="500" max="120000" id="sc-min-ms" value="${savedMinDelayMs}" style="width: 62px; padding: 2px 4px; background: #1b2838; color: #fff; border: 1px solid #34495e; border-radius: 3px; text-align: center;">
                        <span style="color: #bdc3c7; margin-left: 6px;">Max (ms):</span>
                        <input type="number" step="100" min="600" max="180000" id="sc-max-ms" value="${savedMaxDelayMs}" style="width: 62px; padding: 2px 4px; background: #1b2838; color: #fff; border: 1px solid #34495e; border-radius: 3px; text-align: center;">
                    </div>
                </div>

                <!-- PROTOCOLO DE INACTIVOS Y ESPIONAJE (AGR) -->
                <div style="background: rgba(0, 0, 0, 0.4); padding: 8px; border-radius: 5px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.08);">
                    <div style="font-weight: bold; color: #e67e22; margin-bottom: 6px;">
                        🕵️ Espionaje de Inactivos (Antigame Reborn):
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <input type="checkbox" id="sc-auto-spy" ${savedAutoSpy ? 'checked' : ''} style="cursor: pointer;">
                            <label for="sc-auto-spy" style="cursor: pointer; color: #ecf0f1; font-size: 10px;">
                                Auto-espionaje en Planeta Inactivo (i / I)
                            </label>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <input type="checkbox" id="sc-spy-moon" ${savedSpyMoon ? 'checked' : ''} style="cursor: pointer;">
                            <label for="sc-spy-moon" style="cursor: pointer; color: #ecf0f1; font-size: 10px;">
                                Auto-espionaje en Luna si existe (2-3s retardo)
                            </label>
                        </div>
                    </div>
                    <div style="font-size: 9px; color: #95a5a6; border-top: 1px dotted rgba(255,255,255,0.1); padding-top: 3px; margin-top: 3px;">
                        * Pausa de 2 a 3 segundos entre cada envío de sondas.
                    </div>
                </div>

                <!-- CONEXIÓN CON GALAXYTOOL MODERN -->
                <div style="background: rgba(0, 240, 255, 0.08); padding: 8px; border-radius: 5px; margin-bottom: 8px; border: 1px solid rgba(0, 210, 211, 0.4);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-weight: bold; color: #00d2d3;">🛡️ Galaxytool Modern:</span>
                        <span id="sc-gt-status-badge" style="color: #2ecc71; font-weight: bold; font-size: 9px;">● Sincronizado</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <input type="checkbox" id="sc-sync-gt" ${savedSyncGT ? 'checked' : ''} style="cursor: pointer;">
                        <label for="sc-sync-gt" style="cursor: pointer; color: #ecf0f1; font-size: 10px;">
                            Sincronizar sistema completo (planetas, lunas, escombros)
                        </label>
                    </div>
                </div>

                <!-- OPCIONES ADICIONALES -->
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px; padding: 0 2px;">
                    <input type="checkbox" id="sc-loop" ${savedLoop ? 'checked' : ''} style="cursor: pointer;">
                    <label for="sc-loop" style="cursor: pointer; color: #bdc3c7; font-size: 10px;">
                        Bucle infinito (reiniciar al llegar al final)
                    </label>
                </div>

                <!-- BOTONES DE ACCIÓN -->
                <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                    <button id="btn-toggle-scanner" style="flex: 2; padding: 8px; font-weight: bold; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; transition: 0.2s;">
                        🚀 INICIAR ESCANEO
                    </button>
                    <button id="btn-stop-scanner" style="flex: 1; padding: 8px; font-weight: bold; background: #c0392b; color: white; border: none; border-radius: 4px; cursor: pointer; transition: 0.2s;">
                        🛑 STOP
                    </button>
                </div>

                <!-- PANTALLA DE TELEMETRÍA Y ESTADO -->
                <div style="background: rgba(0, 0, 0, 0.6); padding: 8px; border-radius: 4px; border-left: 3px solid #00d2d3; margin-bottom: 8px;">
                    <div style="margin-bottom: 4px; display: flex; justify-content: space-between;">
                        <span style="color: #bdc3c7;">Estado:</span>
                        <span id="sc-status-text" style="color: #f1c40f; font-weight: bold;">En espera</span>
                    </div>
                    <div style="margin-bottom: 4px; display: flex; justify-content: space-between;">
                        <span style="color: #bdc3c7;">Posición actual:</span>
                        <span id="sc-pos-text" style="color: #00d2d3; font-weight: bold;">[${cur.galaxy}:${cur.system}]</span>
                    </div>
                    <div style="margin-bottom: 4px; display: flex; justify-content: space-between;">
                        <span style="color: #bdc3c7;">Próximo salto:</span>
                        <span id="sc-next-countdown" style="color: #2ecc71;">---</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #95a5a6; border-top: 1px dotted rgba(255,255,255,0.1); padding-top: 4px; margin-top: 4px;">
                        <span>Sistemas explorados:</span>
                        <span id="sc-counter-text" style="color: #ecf0f1; font-weight: bold;">0</span>
                    </div>
                </div>

                <!-- BÓVEDA DE INACTIVOS ENCONTRADOS -->
                <div style="background: rgba(0, 0, 0, 0.5); padding: 6px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #ecf0f1; font-size: 10px;">
                            💀 Inactivos en Memoria: <b id="sc-inactives-count" style="color: #e74c3c;">${inactivesCount}</b>
                        </span>
                        <div style="display: flex; gap: 4px;">
                            <button id="btn-toggle-inactives-list" style="background: #2c3e50; color: #bdc3c7; border: 1px solid #7f8c8d; border-radius: 3px; font-size: 9px; padding: 2px 4px; cursor: pointer;">
                                👁️ Ver Lista
                            </button>
                            <button id="btn-copy-inactives-list" style="background: #2980b9; color: white; border: none; border-radius: 3px; font-size: 9px; padding: 2px 4px; cursor: pointer;" title="Copiar reporte al portapapeles">
                                📋 Copiar
                            </button>
                            <button id="btn-clear-inactives-list" style="background: #7f8c8d; color: white; border: none; border-radius: 3px; font-size: 9px; padding: 2px 4px; cursor: pointer;" title="Limpiar memoria">
                                🗑️
                            </button>
                        </div>
                    </div>

                    <!-- CONTENEDOR DESPLEGABLE DE LA LISTA DE INACTIVOS -->
                    <div id="sc-inactives-list-container" style="display: none; max-height: 140px; overflow-y: auto; margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px; font-size: 9px; font-family: monospace;">
                        <!-- Se llena dinámicamente -->
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        setupUIEvents(panel);
        dragElement(panel, document.getElementById('scanner-drag-handle'));
        renderInactivesList();
    }

    function setupUIEvents(panel) {
        const btnToggle = document.getElementById('btn-toggle-scanner');
        const btnStop = document.getElementById('btn-stop-scanner');
        const btnUseCurrent = document.getElementById('btn-use-current-coords');
        const btnMin = document.getElementById('btn-minimize-scanner');
        const scBody = document.getElementById('scanner-body');
        const btnToggleList = document.getElementById('btn-toggle-inactives-list');
        const btnCopyList = document.getElementById('btn-copy-inactives-list');
        const btnClearList = document.getElementById('btn-clear-inactives-list');

        // Minimizar / Restaurar
        let isMinimized = false;
        btnMin.addEventListener('click', () => {
            isMinimized = !isMinimized;
            scBody.style.display = isMinimized ? 'none' : 'block';
            btnMin.textContent = isMinimized ? '+' : '_';
            panel.style.width = isMinimized ? '220px' : '315px';
        });

        // Desplegar / Ocultar Lista de Inactivos
        let isListOpen = false;
        btnToggleList.addEventListener('click', () => {
            isListOpen = !isListOpen;
            const container = document.getElementById('sc-inactives-list-container');
            if (container) {
                container.style.display = isListOpen ? 'block' : 'none';
                btnToggleList.textContent = isListOpen ? '❌ Cerrar' : '👁️ Ver Lista';
                if (isListOpen) renderInactivesList();
            }
        });

        // Copiar Lista de Inactivos
        btnCopyList.addEventListener('click', () => {
            const list = getInactivesList();
            if (list.length === 0) {
                alert("No hay planetas inactivos registrados aún.");
                return;
            }
            const textReport = list.map(p =>
                `[${p.coords}] | ${p.statusLabel} | Jugador: ${p.player} | Ally: ${p.alliance || '-'} | Luna: ${p.hasMoon ? 'SÍ' : 'NO'}`
            ).join('\n');

            navigator.clipboard.writeText(textReport).then(() => {
                const oldTxt = btnCopyList.textContent;
                btnCopyList.textContent = "✅ ¡Copiado!";
                setTimeout(() => { btnCopyList.textContent = oldTxt; }, 2000);
            }).catch(() => {
                alert(textReport);
            });
        });

        // Limpiar Lista de Inactivos
        btnClearList.addEventListener('click', () => {
            if (confirm("¿Estás seguro de que deseas borrar los planetas inactivos registrados de la memoria?")) {
                saveInactivesList([]);
                updateInactivesCountUI();
                renderInactivesList();
            }
        });

        // Usar coordenadas actuales
        btnUseCurrent.addEventListener('click', () => {
            const cur = getCurrentCoords();
            document.getElementById('sc-start-g').value = cur.galaxy;
            document.getElementById('sc-start-s').value = cur.system;
            saveConfig();
            updateTelemetry("Actualizado a coords actuales", `[${cur.galaxy}:${cur.system}]`);
        });

        // Guardar cambios al alterar inputs
        ['sc-start-g', 'sc-end-g', 'sc-start-s', 'sc-end-s', 'sc-min-ms', 'sc-max-ms', 'sc-loop', 'sc-auto-spy', 'sc-spy-moon', 'sc-sync-gt'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', saveConfig);
        });

        // Iniciar / Pausar
        btnToggle.addEventListener('click', () => {
            if (!isGalaxyView()) {
                alert("⚠️ Para utilizar el radar debes estar en la vista de Galaxia de OGame.");
                window.location.href = "index.php?page=ingame&component=galaxy";
                return;
            }

            if (isScanning) {
                pauseScanner("Pausado por el usuario");
            } else {
                startScanner();
            }
        });

        // Detener / Reset
        btnStop.addEventListener('click', () => {
            stopScanner("Detenido y reseteado");
        });
    }

    function saveConfig() {
        const startG = parseInt(document.getElementById('sc-start-g')?.value) || 1;
        const endG = parseInt(document.getElementById('sc-end-g')?.value) || 6;
        const startS = parseInt(document.getElementById('sc-start-s')?.value) || 1;
        const endS = parseInt(document.getElementById('sc-end-s')?.value) || 499;
        const minMs = parseInt(document.getElementById('sc-min-ms')?.value) || 2500;
        const maxMs = parseInt(document.getElementById('sc-max-ms')?.value) || 5000;
        const loop = document.getElementById('sc-loop')?.checked || false;
        const autoSpy = document.getElementById('sc-auto-spy')?.checked || false;
        const spyMoon = document.getElementById('sc-spy-moon')?.checked || false;

        GM_setValue(MEM_PREFIX + 'start_g', startG);
        GM_setValue(MEM_PREFIX + 'end_g', endG);
        GM_setValue(MEM_PREFIX + 'start_s', startS);
        GM_setValue(MEM_PREFIX + 'end_s', endS);
        GM_setValue(MEM_PREFIX + 'min_delay_ms', minMs);
        GM_setValue(MEM_PREFIX + 'max_delay_ms', maxMs);
        GM_setValue(MEM_PREFIX + 'auto_loop', loop);
        GM_setValue(MEM_PREFIX + 'auto_spy', autoSpy);
        GM_setValue(MEM_PREFIX + 'spy_moon', spyMoon);
        const syncGT = document.getElementById('sc-sync-gt')?.checked ?? true;
        GM_setValue(MEM_PREFIX + 'sync_gt', syncGT);
    }

    function updateTelemetry(status, pos, countdown, alert = false) {
        const stEl = document.getElementById('sc-status-text');
        const posEl = document.getElementById('sc-pos-text');
        const cdEl = document.getElementById('sc-next-countdown');
        const countEl = document.getElementById('sc-counter-text');

        if (stEl && status !== undefined) {
            stEl.textContent = status;
            stEl.style.color = alert ? '#e74c3c' : (isScanning ? '#2ecc71' : '#f1c40f');
        }
        if (posEl && pos !== undefined) posEl.textContent = pos;
        if (cdEl && countdown !== undefined) cdEl.innerHTML = countdown;
        if (countEl) countEl.textContent = systemsScannedSession;
    }

    function updateInactivesCountUI() {
        const countEl = document.getElementById('sc-inactives-count');
        if (countEl) {
            countEl.textContent = getInactivesList().length;
        }
    }

    function renderInactivesList() {
        const container = document.getElementById('sc-inactives-list-container');
        if (!container) return;

        const list = getInactivesList();
        if (list.length === 0) {
            container.innerHTML = `<div style="color: #7f8c8d; text-align: center; padding: 4px;">Sin inactivos registrados</div>`;
            return;
        }

        container.innerHTML = list.map(item => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0; border-bottom: 1px dotted rgba(255,255,255,0.05);">
                <span style="color: #3498db; font-weight: bold;">[${item.coords}]</span>
                <span style="color: #bdc3c7; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.player}">${item.player}</span>
                <span style="color: ${item.status === 'i_long' ? '#e74c3c' : '#f39c12'}; font-weight: bold;">${item.statusLabel}</span>
                <span>${item.hasMoon ? '🌕' : '🌑'}</span>
            </div>
        `).join('');
    }

    // --- LÓGICA DEL MOTOR DE ESCANEO ---
    function startScanner() {
        saveConfig();
        isScanning = true;
        isSpyingInProgress = false;

        const btnToggle = document.getElementById('btn-toggle-scanner');
        if (btnToggle) {
            btnToggle.textContent = "⏸️ PAUSAR";
            btnToggle.style.background = "#e67e22";
        }

        updateTelemetry("Iniciando radar...", undefined, "Calculando salto...");
        scheduleNextJump(800);
    }

    function pauseScanner(reason = "En pausa") {
        isScanning = false;
        isSpyingInProgress = false;
        if (scanTimeout) clearTimeout(scanTimeout);
        if (countdownInterval) clearInterval(countdownInterval);

        const btnToggle = document.getElementById('btn-toggle-scanner');
        if (btnToggle) {
            btnToggle.textContent = "▶️ CONTINUAR";
            btnToggle.style.background = "#27ae60";
        }

        updateTelemetry(reason, undefined, "---");
    }

    function stopScanner(reason = "Detenido") {
        pauseScanner(reason);
        systemsScannedSession = 0;
        const btnToggle = document.getElementById('btn-toggle-scanner');
        if (btnToggle) {
            btnToggle.textContent = "🚀 INICIAR ESCANEO";
            btnToggle.style.background = "#27ae60";
        }
        updateTelemetry(reason, undefined, "---");
    }

    function getNextTargetCoords() {
        const cur = getCurrentCoords();
        const startG = parseInt(document.getElementById('sc-start-g')?.value) || 1;
        const endG = parseInt(document.getElementById('sc-end-g')?.value) || 6;
        const startS = parseInt(document.getElementById('sc-start-s')?.value) || 1;
        const endS = parseInt(document.getElementById('sc-end-s')?.value) || 499;
        const loop = document.getElementById('sc-loop')?.checked || false;

        let nextG = cur.galaxy;
        let nextS = cur.system;

        if (nextG < startG) {
            return { galaxy: startG, system: startS, finished: false };
        }

        nextS++;

        if (nextS > endS) {
            nextG++;
            nextS = 1;
        }

        if (nextG > endG) {
            if (loop) {
                return { galaxy: startG, system: startS, finished: false };
            } else {
                return { galaxy: cur.galaxy, system: cur.system, finished: true };
            }
        }

        return { galaxy: nextG, system: nextS, finished: false };
    }

    function scheduleNextJump(overrideDelayMs = null) {
        if (!isScanning || isSpyingInProgress) return;

        if (detectCaptcha()) {
            stopScanner("🚨 CAPTCHA DETECTADO");
            playBeep(880, 500);
            alert("⚠️ Se ha detectado una verificación o captcha en OGame. El radar se ha detenido de inmediato por seguridad.");
            return;
        }

        const minMs = parseInt(document.getElementById('sc-min-ms')?.value) || 2500;
        const maxMs = parseInt(document.getElementById('sc-max-ms')?.value) || 5000;
        const delayMs = overrideDelayMs !== null ? overrideDelayMs : getRandomDelayMs(minMs, maxMs);

        const next = getNextTargetCoords();
        if (next.finished) {
            playBeep(523, 250);
            stopScanner("✅ Rango completado");
            return;
        }

        startCountdown(delayMs, next.galaxy, next.system, () => {
            performJump(next.galaxy, next.system);
        });
    }

    function startCountdown(totalMs, nextG, nextS, onComplete) {
        if (countdownInterval) clearInterval(countdownInterval);
        if (scanTimeout) clearTimeout(scanTimeout);

        let remainingMs = totalMs;
        const updateIntervalMs = 100;

        const tick = () => {
            if (!isScanning || isSpyingInProgress) {
                if (countdownInterval) clearInterval(countdownInterval);
                return;
            }

            if (remainingMs <= 0) {
                clearInterval(countdownInterval);
                updateTelemetry("Saltando...", `[${nextG}:${nextS}]`, `<span style="color:#00d2d3;">Cargando...</span>`);
                if (onComplete) onComplete();
                return;
            }

            const secStr = (remainingMs / 1000).toFixed(2);
            const countdownHtml = `➜ [${nextG}:${nextS}] en <b style="color:#00d2d3;">${secStr}s</b>`;
            updateTelemetry("Esperando intervalo", undefined, countdownHtml);

            remainingMs -= updateIntervalMs;
        };

        tick();
        countdownInterval = setInterval(tick, updateIntervalMs);
    }

    function performJump(targetG, targetS) {
        if (!isScanning || isSpyingInProgress) return;

        if (isOGameBusy()) {
            updateTelemetry("Esperando a OGame...", undefined, "Petición en curso...", true);
            scanTimeout = setTimeout(() => performJump(targetG, targetS), 400);
            return;
        }

        const gInput = document.getElementById('galaxy_input');
        const sInput = document.getElementById('system_input');

        if (gInput) {
            gInput.value = targetG;
            gInput.dispatchEvent(new Event('input', { bubbles: true }));
            gInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (sInput) {
            sInput.value = targetS;
            sInput.dispatchEvent(new Event('input', { bubbles: true }));
            sInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        try {
            if (typeof win.loadContentNew === 'function') {
                win.loadContentNew(targetG, targetS);
            } else if (typeof win.submitForm === 'function') {
                win.submitForm();
            } else {
                const submitBtn = document.querySelector('.btn_blue[onclick*="submitForm"], #galaxy_head .btn_blue, form[name="galaform"] .btn_blue');
                if (submitBtn) submitBtn.click();
            }
        } catch (e) {
            console.error("[Radar Galaxia] Error al disparar la carga:", e);
        }

        waitForLoadFinish(targetG, targetS, 0);
    }

    function waitForLoadFinish(targetG, targetS, elapsedMs) {
        if (!isScanning) return;

        if (elapsedMs > 12000) {
            console.warn("[Radar Galaxia] Timeout de carga del sistema. Reanudando ciclo...");
            systemsScannedSession++;
            scheduleNextJump();
            return;
        }

        if (elapsedMs < 250 || isOGameBusy()) {
            updateTelemetry("Cargando datos...", `[${targetG}:${targetS}]`, `<span style="color:#e67e22;">Recibiendo...</span>`);
            setTimeout(() => waitForLoadFinish(targetG, targetS, elapsedMs + 200), 200);
            return;
        }

        systemsScannedSession++;
        const cur = getCurrentCoords();
        updateTelemetry("Sistema cargado", `[${cur.galaxy}:${cur.system}]`, "Analizando inactivos...");

        processSystemInactives(cur.galaxy, cur.system);
    }

    // --- INTEGRACIÓN Y SINCRONIZACIÓN CON GALAXYTOOL MODERN ---
    function extractPlayerId(row) {
        const attr = row.getAttribute('data-player-id') || row.querySelector('[data-player-id]')?.getAttribute('data-player-id');
        if (attr) return parseInt(attr, 10);
        const link = row.querySelector('.cellPlayerName a')?.href || '';
        const match = link.match(/[?&](?:to|playerId|player)=(\d+)/i);
        return match ? parseInt(match[1], 10) : 0;
    }

    function extractPlayerStatus(row) {
        if (row.querySelector('.status_abbr_longinactive')) return 'I';
        if (row.querySelector('.status_abbr_inactive')) return 'i';
        if (row.querySelector('.status_abbr_vacation')) return 'v';
        if (row.querySelector('.status_abbr_banned')) return 'b';
        if (row.querySelector('.status_abbr_outlaw')) return 'bandit';
        if (row.querySelector('.status_abbr_honorableTarget')) return 'hp';
        return '';
    }

    function extractDebris(row) {
        const cell = row.querySelector('.cellDebris');
        if (!cell || cell.innerHTML.trim() === '') return null;
        const text = cell.getAttribute('title') || cell.getAttribute('data-tooltip-content') || cell.innerHTML;
        const m = text.match(/Metal:\s*([\d\.,]+)/i) || text.match(/([\d\.,]+)\s*Metal/i);
        const c = text.match(/Cristal:\s*([\d\.,]+)/i) || text.match(/([\d\.,]+)\s*Cristal/i);
        const metal = m ? parseInt(m[1].replace(/[^\d]/g, ''), 10) : 0;
        const crystal = c ? parseInt(c[1].replace(/[^\d]/g, ''), 10) : 0;
        return (metal > 0 || crystal > 0) ? { metal, crystal } : null;
    }

    function saveToIndexedDBDirectly(galaxy, system, planets) {
        try {
            if (typeof window.indexedDB === 'undefined') return;
            const req = window.indexedDB.open('OGameGalaxytoolDB', 1);
            req.onsuccess = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('planets')) return;
                const stores = ['planets'];
                if (db.objectStoreNames.contains('players')) stores.push('players');
                const tx = db.transaction(stores, 'readwrite');
                const pStore = tx.objectStore('planets');
                const uStore = db.objectStoreNames.contains('players') ? tx.objectStore('players') : null;

                const incomingKeys = new Set(
                    (planets || []).map(p => `${galaxy}:${system}:${p.position}:${p.isMoon ? 1 : 0}`)
                );

                if (pStore.indexNames.contains('system')) {
                    const idx = pStore.index('system');
                    const getReq = idx.getAll(IDBKeyRange.only([galaxy, system]));
                    getReq.onsuccess = () => {
                        const existing = getReq.result || [];
                        for (const old of existing) {
                            if (!incomingKeys.has(old.coordKey)) {
                                pStore.delete(old.coordKey);
                            }
                        }
                    };
                }

                for (const p of (planets || [])) {
                    const coordKey = `${p.galaxy}:${p.system}:${p.position}:${p.isMoon ? 1 : 0}`;
                    pStore.put({ ...p, coordKey });
                    if (uStore && p.playerId) {
                        uStore.put({
                            id: p.playerId,
                            name: p.playerName,
                            allianceTag: p.allianceTag,
                            allianceId: p.allianceId || 0,
                            status: p.status,
                            updatedAt: Date.now()
                        });
                    }
                }
            };
        } catch (_) {}
    }

    async function sendToGalaxytoolSolution(galaxy, system, planets) {
        const list = Array.isArray(planets) ? planets : [];
        const gt = win.Galaxytool || (typeof unsafeWindow !== 'undefined' ? unsafeWindow.Galaxytool : null);

        if (gt && gt.storage) {
            try {
                if (typeof gt.storage.syncSolarSystem === 'function') {
                    await gt.storage.syncSolarSystem(galaxy, system, list);
                } else {
                    for (const p of list) {
                        await gt.storage.savePlanet(p);
                    }
                }

                for (const p of list) {
                    if (p.playerId && typeof gt.storage.savePlayer === 'function') {
                        await gt.storage.savePlayer({
                            id: p.playerId,
                            name: p.playerName,
                            allianceTag: p.allianceTag,
                            allianceId: p.allianceId || 0,
                            status: p.status,
                            updatedAt: Date.now()
                        });
                    }
                }

                if (gt.interceptor && typeof gt.interceptor.logEvent === 'function') {
                    gt.interceptor.logEvent('galaxy', `Radar GalExpl: Sistema ${galaxy}:${system} sincronizado (${list.length} cuerpos celestes)`, { galaxy, system, count: list.length });
                }

                if (gt.hud && typeof gt.hud.notify === 'function') {
                    const msg = list.length > 0 
                        ? `🪐 Radar: Sistema [${galaxy}:${system}] sincronizado con Galaxytool (${list.length} planetas)`
                        : `🪐 Radar: Sistema [${galaxy}:${system}] vacío (0 planetas)`;
                    gt.hud.notify(msg, 'info', '🌌');
                }
            } catch (err) {
                console.warn("[Radar Galaxia] Error al enviar a window.Galaxytool:", err);
            }
        }

        saveToIndexedDBDirectly(galaxy, system, list);

        // 3. Enviar a API Bridge local (http://localhost:8080/api/sync.php)
        try {
            const payload = JSON.stringify({ type: 'galaxy', galaxy, system, planets: list });
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'http://localhost:8080/api/sync.php',
                    headers: { 'Content-Type': 'application/json' },
                    data: payload
                });
            } else if (typeof fetch === 'function') {
                fetch('http://localhost:8080/api/sync.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    mode: 'cors'
                }).catch(() => {});
            }
        } catch (_) {}

        const badge = document.getElementById('sc-gt-status-badge');
        if (badge) {
            badge.textContent = `● Sincronizado [${galaxy}:${system}] (${list.length})`;
            badge.style.color = '#2ecc71';
        }
    }

    // --- PROCESAMIENTO COMPLETO DE SISTEMA, INACTIVOS Y ESPIONAJE DIRECTO ---
    function processSystemInactives(curGalaxy, curSystem) {
        if (!isScanning) return;

        const autoSpy = document.getElementById('sc-auto-spy')?.checked ?? true;
        const spyMoon = document.getElementById('sc-spy-moon')?.checked ?? true;
        const syncGT = document.getElementById('sc-sync-gt')?.checked ?? true;

        const spyQueue = [];
        const systemPlanets = [];

        for (let pos = 1; pos <= 15; pos++) {
            const row = document.getElementById(`galaxyRow${pos}`);
            if (!row) continue;

            const isEmpty = row.classList.contains('empty_filter');
            if (isEmpty) continue;

            const isOwn = !!row.querySelector('.ownPlayerRow');
            const playerName = extractCleanPlayerName(row);
            const allyName = row.querySelector('.cellAlliance')?.textContent.trim().replace(/^\[|\]$/g, '') || '';
            const planetName = row.querySelector('.cellPlanet .planetName, .cellPlanet')?.textContent.trim() || `Planeta ${pos}`;
            const playerId = extractPlayerId(row);
            const status = extractPlayerStatus(row);

            // Elementos de luna
            const moonCell = row.querySelector('.cellMoon');
            const moonAnchor = moonCell?.querySelector('a');
            const moonMicro = moonCell?.querySelector('.micromoon');
            const hasMoon = !!(moonAnchor || moonMicro) && (moonCell && moonCell.innerHTML.trim() !== '');
            let moonSize = 0;
            if (hasMoon) {
                const moonText = moonCell.getAttribute('title') || moonCell.getAttribute('data-tooltip-content') || moonCell.innerHTML;
                const sizeMatch = moonText.match(/(\d{3,5})\s*km/i);
                if (sizeMatch) moonSize = parseInt(sizeMatch[1], 10);
            }

            // Elementos de escombros
            const debris = extractDebris(row);

            // Registro completo de planeta para Galaxytool
            const planetObj = {
                galaxy: curGalaxy,
                system: curSystem,
                position: pos,
                isMoon: false,
                planetName,
                name: planetName,
                playerId,
                playerName,
                allianceTag: allyName,
                allianceId: 0,
                status,
                playerStatus: status,
                hasMoon,
                moonSize,
                debris,
                updatedAt: Date.now()
            };
            systemPlanets.push(planetObj);

            // Registro de luna si existe
            if (hasMoon) {
                systemPlanets.push({
                    galaxy: curGalaxy,
                    system: curSystem,
                    position: pos,
                    isMoon: true,
                    planetName: 'Luna ' + pos,
                    name: 'Luna ' + pos,
                    playerId,
                    playerName,
                    allianceTag: allyName,
                    allianceId: 0,
                    status,
                    playerStatus: status,
                    moonSize,
                    debris: null,
                    updatedAt: Date.now()
                });
            }

            // Detección de inactivo (7d o 28d) para radar y auto-espionaje
            const inactiveSpan = row.querySelector('.status_abbr_inactive, .status_abbr_longinactive');
            const isInactiveRow = row.classList.contains('inactive_filter') || !!inactiveSpan || status === 'i' || status === 'I';
            const isVacation = status === 'v' || !!row.querySelector('.status_abbr_vacation');

            if (isInactiveRow && !isVacation && !isOwn) {
                const isLong = status === 'I' || row.querySelector('.status_abbr_longinactive') !== null;
                const statusLabel = isLong ? '(I) 28d' : '(i) 7d';
                const coordsStr = `${curGalaxy}:${curSystem}:${pos}`;

                console.log(`[Radar Galaxia] 🎯 Inactivo detectado en [${coordsStr}]: ${playerName} ${statusLabel} (Luna: ${hasMoon ? 'SÍ' : 'NO'})`);

                recordInactivePlanet({
                    coords: coordsStr,
                    galaxy: curGalaxy,
                    system: curSystem,
                    position: pos,
                    player: playerName,
                    status: isLong ? 'i_long' : 'i',
                    statusLabel: statusLabel,
                    alliance: allyName,
                    hasMoon: hasMoon,
                    lastSeen: new Date().toLocaleTimeString(),
                    spied: autoSpy
                });

                if (autoSpy) {
                    const planetAnchor = row.querySelector('.cellPlanet a');
                    const planetMicro = row.querySelector('.cellPlanet .microplanet');
                    const spyAction = row.querySelector('.cellAction a.espionage, .cellAction .espionage');

                    spyQueue.push({
                        type: 'planet',
                        galaxy: curGalaxy,
                        system: curSystem,
                        position: pos,
                        element: planetAnchor || planetMicro,
                        spyActionElement: spyAction,
                        label: `Planeta [${coordsStr}] (${playerName})`
                    });

                    if (spyMoon && hasMoon) {
                        spyQueue.push({
                            type: 'moon',
                            galaxy: curGalaxy,
                            system: curSystem,
                            position: pos,
                            element: moonAnchor || moonMicro,
                            spyActionElement: null,
                            label: `Luna [${coordsStr}]`
                        });
                    }
                }
            }
        }

        // Sincronizar todos los datos con la solución Galaxytool Modern
        if (syncGT) {
            sendToGalaxytoolSolution(curGalaxy, curSystem, systemPlanets);
        }

        // Ejecutar cola de espionaje con pausas de 2 a 3 segundos
        if (spyQueue.length > 0) {
            console.log(`[Radar Galaxia] 📋 Cola de espionaje armada con ${spyQueue.length} acciones.`);
            executeSpyQueue(spyQueue, 0, () => {
                scheduleNextJump();
            });
        } else {
            scheduleNextJump();
        }
    }

    function executeSpyQueue(queue, index, onFinish) {
        if (!isScanning) {
            isSpyingInProgress = false;
            return;
        }

        if (index >= queue.length) {
            isSpyingInProgress = false;
            updateTelemetry("Espionaje completado", undefined, "Esperando intervalo...");
            if (onFinish) onFinish();
            return;
        }

        isSpyingInProgress = true;
        const task = queue[index];

        updateTelemetry(`Espiando (${index + 1}/${queue.length})`, undefined, `<span style="color:#e67e22;">${task.label}</span>`);

        // Ejecución directa de espionaje y clics
        executeEspionage(task);

        // Retardo orgánico de 2000 a 3000 ms entre cada acción de espionaje
        const spyWaitMs = getRandomDelayMs(2000, 3000);
        let remMs = spyWaitMs;
        const updateInterval = 200;

        const countdownTick = () => {
            if (!isScanning) {
                isSpyingInProgress = false;
                return;
            }

            if (remMs <= 0) {
                executeSpyQueue(queue, index + 1, onFinish);
                return;
            }

            const secStr = (remMs / 1000).toFixed(1);
            updateTelemetry(`Espiando (${index + 1}/${queue.length})`, undefined, `Pausa anti-detección: <b style="color:#f39c12;">${secStr}s</b>`);
            remMs -= updateInterval;
            setTimeout(countdownTick, updateInterval);
        };

        setTimeout(countdownTick, updateInterval);
    }

    // --- ARRASTRE DE ELEMENTOS (DRAG & DROP) ---
    function dragElement(elmnt, dragHandle) {
        let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
        const handle = dragHandle || elmnt;

        handle.onmousedown = (e) => {
            if (['BUTTON', 'INPUT', 'LABEL', 'SPAN'].includes(e.target.tagName) && e.target.id !== 'scanner-drag-handle') {
                return;
            }
            e.preventDefault();
            p3 = e.clientX;
            p4 = e.clientY;

            document.onmouseup = () => {
                document.onmouseup = null;
                document.onmousemove = null;
                GM_setValue(MEM_PREFIX + 'pos_top', elmnt.style.top);
                GM_setValue(MEM_PREFIX + 'pos_left', elmnt.style.left);
            };

            document.onmousemove = (e) => {
                e.preventDefault();
                p1 = p3 - e.clientX;
                p2 = p4 - e.clientY;
                p3 = e.clientX;
                p4 = e.clientY;
                elmnt.style.top = (elmnt.offsetTop - p2) + "px";
                elmnt.style.left = (elmnt.offsetLeft - p1) + "px";
            };
        };
    }

    // --- INICIALIZACIÓN ---
    function init() {
        if (document.body) {
            createUI();
        } else {
            window.addEventListener('DOMContentLoaded', createUI);
        }
    }

    init();
})();
