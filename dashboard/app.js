/**
 * Galaxytool Modern Tactical Dashboard - Application Logic
 * Local-First / Zero-Database Architecture for Modern OGame
 */

const SHIPS = {
    SC:   { id: 202, name: 'Nave de Carga Pequeña', capacity: 5000,   speed: 10000, deut: 20 },
    LC:   { id: 203, name: 'Nave de Carga Grande',   capacity: 25000,  speed: 7500,  deut: 50 },
    LF:   { id: 204, name: 'Cazador Ligero',         capacity: 50,     speed: 12500, deut: 20 },
    HF:   { id: 205, name: 'Cazador Pesado',         capacity: 100,    speed: 10000, deut: 75 },
    CR:   { id: 206, name: 'Crucero',                capacity: 800,    speed: 15000, deut: 300 },
    BS:   { id: 207, name: 'Nave de Batalla',        capacity: 1500,   speed: 10000, deut: 500 },
    COL:  { id: 208, name: 'Colonizador',            capacity: 7500,   speed: 2500,  deut: 1000 },
    REC:  { id: 209, name: 'Reciclador',             capacity: 20000,  speed: 4000,  deut: 300 },
    ESP:  { id: 210, name: 'Sonda de Espionaje',     capacity: 5,      speed: 100000000, deut: 1 },
    BOM:  { id: 211, name: 'Bombardero',             capacity: 500,    speed: 5000,  deut: 700 },
    SAT:  { id: 212, name: 'Satélite Solar',         capacity: 0,      speed: 0,     deut: 0 },
    DEST: { id: 213, name: 'Destructor',             capacity: 2000,   speed: 5000,  deut: 1000 },
    RIP:  { id: 214, name: 'Estrella de la Muerte',  capacity: 1000000,speed: 100,   deut: 1 },
    BC:   { id: 215, name: 'Acorazado',              capacity: 750,    speed: 10000, deut: 250 },
    CRAW: { id: 217, name: 'Taladrador (Crawler)',   capacity: 0,      speed: 0,     deut: 0 },
    REAP: { id: 218, name: 'Segador (Reaper)',       capacity: 10000,  speed: 10000, deut: 1100 },
    PATH: { id: 219, name: 'Explorador (Pathfinder)',capacity: 10000,  speed: 12000, deut: 300 }
};

const DB_NAME = 'OGameGalaxytoolDB';
const DB_VERSION = 1;

class DashboardApp {
    constructor() {
        this.db = null;
        this.currentGalaxy = 1;
        this.currentSystem = 1;
        this.activeTab = 'galaxy';
        this.memoryStore = {
            planets: new Map(),
            reports: new Map()
        };
        this.isIndexedDBSupported = typeof window !== 'undefined' && 'indexedDB' in window;
    }

    async init() {
        await this.initDB();
        this.setupNavigation();
        this.setupEventListeners();
        this.setupHoverPopovers();
        this.registerServiceWorker();
        await this.loadInitialView();
        this.startLiveSync();
    }

    startLiveSync() {
        setInterval(async () => {
            await this.syncFromAPIBridge();
            this.updateStats();
        }, 3000);
    }

    // ==========================================
    // 1. STORAGE / INDEXEDDB INTEGRATION
    // ==========================================

    async initDB() {
        if (!this.isIndexedDBSupported) {
            this.updateDBStatus('Modo Memoria (Sin IndexedDB)', 'amber');
            return;
        }

        return new Promise((resolve) => {
            const req = window.indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('planets')) {
                    const ps = db.createObjectStore('planets', { keyPath: 'coordKey' });
                    ps.createIndex('system', ['galaxy', 'system'], { unique: false });
                }
                if (!db.objectStoreNames.contains('reports')) {
                    const rs = db.createObjectStore('reports', { keyPath: 'id', autoIncrement: true });
                    rs.createIndex('coordKey', 'coordKey', { unique: false });
                    rs.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                this.updateDBStatus('IndexedDB Conectado (Local-First)', 'emerald');
                this.updateStats();
                resolve();
            };
            req.onerror = () => {
                this.updateDBStatus('Error de Conexión IndexedDB', 'rose');
                resolve();
            };
        });
    }

    updateDBStatus(text, color) {
        const el = document.getElementById('db-status');
        if (el) {
            el.innerHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-${color}-500 mr-2 animate-pulse"></span>${text}`;
        }
    }

    async syncFromAPIBridge() {
        try {
            const res = await fetch('../api/sync.php');
            if (!res.ok) return;
            const data = await res.json();
            if (data.planets && Array.isArray(data.planets)) {
                const remoteKeys = new Set(data.planets.map(p => p.coordKey || `${p.galaxy}:${p.system}:${p.position}:${p.isMoon ? 1 : 0}`));

                if (this.db) {
                    const tx = this.db.transaction('planets', 'readwrite');
                    const store = tx.objectStore('planets');
                    const allReq = store.getAll();
                    allReq.onsuccess = () => {
                        const localPlanets = allReq.result || [];
                        for (const lp of localPlanets) {
                            if (!remoteKeys.has(lp.coordKey)) {
                                store.delete(lp.coordKey);
                            }
                        }
                        for (const p of data.planets) {
                            const coordKey = p.coordKey || `${p.galaxy}:${p.system}:${p.position}:${p.isMoon ? 1 : 0}`;
                            const planetName = this.cleanPlanetName(p.planetName, p.galaxy, p.system, p.position);
                            store.put({ ...p, planetName, coordKey });
                        }
                    };
                } else {
                    this.memoryStore.planets.clear();
                    for (const p of data.planets) {
                        const coordKey = p.coordKey || `${p.galaxy}:${p.system}:${p.position}:${p.isMoon ? 1 : 0}`;
                        const planetName = this.cleanPlanetName(p.planetName, p.galaxy, p.system, p.position);
                        this.memoryStore.planets.set(coordKey, { ...p, planetName, coordKey });
                    }
                }
            }
            if (data.reports && Array.isArray(data.reports)) {
                for (const r of data.reports) {
                    await this.saveReport(r);
                }
            }
        } catch (_) {}
    }

    async getAllPlanets() {
        await this.syncFromAPIBridge();
        if (!this.db) return Array.from(this.memoryStore.planets.values());
        return new Promise((resolve) => {
            const tx = this.db.transaction('planets', 'readonly');
            const req = tx.objectStore('planets').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async getAllReports() {
        await this.syncFromAPIBridge();
        if (!this.db) return Array.from(this.memoryStore.reports.values());
        return new Promise((resolve) => {
            const tx = this.db.transaction('reports', 'readonly');
            const req = tx.objectStore('reports').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async getSystemPlanets(galaxy, system) {
        // Fetch latest system state from API sync bridge for immediate real-time view
        try {
            const res = await fetch(`../api/sync.php?g=${galaxy}&s=${system}`);
            if (res.ok) {
                const data = await res.json();
                if (data.planets && Array.isArray(data.planets)) {
                    const incomingKeys = new Set(data.planets.map(p => p.coordKey || `${galaxy}:${system}:${p.position}:${p.isMoon ? 1 : 0}`));

                    if (this.db) {
                        const tx = this.db.transaction('planets', 'readwrite');
                        const store = tx.objectStore('planets');
                        const idx = store.index('system');
                        const req = idx.getAll(IDBKeyRange.only([galaxy, system]));
                        req.onsuccess = () => {
                            const existing = req.result || [];
                            for (const old of existing) {
                                if (!incomingKeys.has(old.coordKey)) {
                                    store.delete(old.coordKey);
                                }
                            }
                            for (const p of data.planets) {
                                const coordKey = p.coordKey || `${galaxy}:${system}:${p.position}:${p.isMoon ? 1 : 0}`;
                                store.put({ ...p, coordKey });
                            }
                        };
                    } else {
                        for (const [key, p] of this.memoryStore.planets.entries()) {
                            if (p.galaxy === galaxy && p.system === system && !incomingKeys.has(key)) {
                                this.memoryStore.planets.delete(key);
                            }
                        }
                        for (const p of data.planets) {
                            const coordKey = p.coordKey || `${galaxy}:${system}:${p.position}:${p.isMoon ? 1 : 0}`;
                            this.memoryStore.planets.set(coordKey, { ...p, coordKey });
                        }
                    }

                    return data.planets.sort((a, b) => a.position - b.position);
                }
            }
        } catch (_) {}

        if (!this.db) {
            return Array.from(this.memoryStore.planets.values())
                .filter(p => p.galaxy === galaxy && p.system === system)
                .sort((a, b) => a.position - b.position);
        }
        return new Promise((resolve) => {
            const tx = this.db.transaction('planets', 'readonly');
            const index = tx.objectStore('planets').index('system');
            const req = index.getAll(IDBKeyRange.only([galaxy, system]));
            req.onsuccess = () => {
                const sorted = (req.result || []).sort((a, b) => a.position - b.position);
                resolve(sorted);
            };
            req.onerror = () => resolve([]);
        });
    }

    async getLatestReport(galaxy, system, position, isMoon = false) {
        const coordKey = `${galaxy}:${system}:${position}:${isMoon ? 1 : 0}`;
        const reports = await this.getAllReports();
        const matches = reports.filter(r => r.coordKey === coordKey || (r.galaxy === galaxy && r.system === system && r.position === position && (!!r.isMoon === !!isMoon)));
        if (matches.length === 0) return null;
        matches.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return matches[0];
    }

    async savePlanet(planet) {
        const coordKey = `${planet.galaxy}:${planet.system}:${planet.position}:${planet.isMoon ? 1 : 0}`;
        const record = { ...planet, coordKey, updatedAt: planet.updatedAt || Date.now() };
        if (!this.db) {
            this.memoryStore.planets.set(coordKey, record);
            return record;
        }
        return new Promise((resolve) => {
            const tx = this.db.transaction('planets', 'readwrite');
            const req = tx.objectStore('planets').put(record);
            req.onsuccess = () => resolve(record);
            req.onerror = () => resolve(null);
        });
    }

    async saveReport(report) {
        const coordKey = `${report.galaxy}:${report.system}:${report.position}:${report.isMoon ? 1 : 0}`;
        const record = { ...report, coordKey, timestamp: report.timestamp || Math.floor(Date.now() / 1000) };
        if (!this.db) {
            const id = report.id || (this.memoryStore.reports.size + 1);
            record.id = id;
            this.memoryStore.reports.set(id, record);
            return record;
        }
        return new Promise((resolve) => {
            const tx = this.db.transaction('reports', 'readwrite');
            const req = tx.objectStore('reports').put(record);
            req.onsuccess = (e) => {
                record.id = e.target.result;
                resolve(record);
            };
            req.onerror = () => resolve(null);
        });
    }

    async clearAllData() {
        if (!this.db) {
            this.memoryStore.planets.clear();
            this.memoryStore.reports.clear();
            return;
        }
        return new Promise((resolve) => {
            const tx = this.db.transaction(['planets', 'reports'], 'readwrite');
            tx.objectStore('planets').clear();
            tx.objectStore('reports').clear();
            tx.oncomplete = () => {
                this.updateStats();
                resolve();
            };
        });
    }

    async updateStats() {
        const planets = await this.getAllPlanets();
        const reports = await this.getAllReports();
        const pCountEl = document.getElementById('stat-planets-count');
        const rCountEl = document.getElementById('stat-reports-count');
        const inactivesEl = document.getElementById('stat-inactives-count');

        if (pCountEl) pCountEl.textContent = planets.length;
        if (rCountEl) rCountEl.textContent = reports.length;
        if (inactivesEl) {
            const inactives = planets.filter(p => p.playerStatus && (p.playerStatus.includes('i') || p.playerStatus.includes('I')));
            inactivesEl.textContent = inactives.length;
        }
    }

    // ==========================================
    // 2. UI NAVIGATION & EVENT HANDLERS
    // ==========================================

    setupNavigation() {
        const tabs = document.querySelectorAll('[data-tab-target]');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const target = tab.getAttribute('data-tab-target');
                this.switchTab(target);
            });
        });
    }

    switchTab(tabName) {
        this.activeTab = tabName;
        document.querySelectorAll('.tab-content').forEach(section => {
            section.classList.add('hidden');
        });
        const activeSection = document.getElementById(`tab-${tabName}`);
        if (activeSection) {
            activeSection.classList.remove('hidden');
        }

        document.querySelectorAll('[data-tab-target]').forEach(tab => {
            if (tab.getAttribute('data-tab-target') === tabName) {
                tab.classList.add('border-cyan-500', 'text-cyan-400');
                tab.classList.remove('border-transparent', 'text-slate-400');
            } else {
                tab.classList.remove('border-cyan-500', 'text-cyan-400');
                tab.classList.add('border-transparent', 'text-slate-400');
            }
        });

        if (tabName === 'galaxy') this.renderGalaxySystem();
        if (tabName === 'targets') this.renderTargetsFinder();
        if (tabName === 'reports') this.renderReportsList();
        if (tabName === 'calc') this.renderPlunderCalculator();
        if (tabName === 'data') this.updateStats();
    }

    setupEventListeners() {
        // Galaxy Nav Controls
        const btnPrevSys = document.getElementById('btn-prev-sys');
        const btnNextSys = document.getElementById('btn-next-sys');
        const inputGalaxy = document.getElementById('input-galaxy');
        const inputSystem = document.getElementById('input-system');
        const btnJump = document.getElementById('btn-jump-sys');

        if (btnPrevSys) {
            btnPrevSys.addEventListener('click', () => {
                if (this.currentSystem > 1) {
                    this.currentSystem--;
                    inputSystem.value = this.currentSystem;
                    this.renderGalaxySystem();
                }
            });
        }

        if (btnNextSys) {
            btnNextSys.addEventListener('click', () => {
                if (this.currentSystem < 499) {
                    this.currentSystem++;
                    inputSystem.value = this.currentSystem;
                    this.renderGalaxySystem();
                }
            });
        }

        if (btnJump) {
            btnJump.addEventListener('click', () => {
                const g = parseInt(inputGalaxy.value, 10) || 1;
                const s = parseInt(inputSystem.value, 10) || 1;
                this.currentGalaxy = Math.min(Math.max(g, 1), 9);
                this.currentSystem = Math.min(Math.max(s, 1), 499);
                inputGalaxy.value = this.currentGalaxy;
                inputSystem.value = this.currentSystem;
                this.renderGalaxySystem();
            });
        }

        // Targets Finder Filters
        const targetFilters = ['filter-galaxy-min', 'filter-galaxy-max', 'filter-status', 'filter-min-loot', 'filter-min-debris'];
        targetFilters.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.renderTargetsFinder());
                el.addEventListener('change', () => this.renderTargetsFinder());
            }
        });

        // Data Management Buttons
        const btnExport = document.getElementById('btn-export-jsonl');
        const btnImport = document.getElementById('btn-import-jsonl');
        const fileImport = document.getElementById('file-import-jsonl');
        const btnSeedDemo = document.getElementById('btn-seed-demo');
        const btnClearDB = document.getElementById('btn-clear-db');

        if (btnExport) btnExport.addEventListener('click', () => this.exportToJSONL());
        if (btnImport && fileImport) {
            btnImport.addEventListener('click', () => fileImport.click());
            fileImport.addEventListener('change', (e) => this.importFromJSONL(e));
        }
        if (btnSeedDemo) btnSeedDemo.addEventListener('click', () => this.seedDemoData());
        if (btnClearDB) {
            btnClearDB.addEventListener('click', async () => {
                if (confirm('¿Estás seguro de que deseas vaciar toda la inteligencia almacenada localmente?')) {
                    await this.clearAllData();
                    this.renderGalaxySystem();
                    alert('Base de datos vaciada exitosamente.');
                }
            });
        }

        // Calculator inputs
        const calcInputs = ['calc-metal', 'calc-crystal', 'calc-deut', 'calc-ratio'];
        calcInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.calculateCustomPlunder());
            }
        });
    }

    async loadInitialView() {
        await this.renderGalaxySystem();
        await this.updateStats();
    }

    // ==========================================
    // 3. GALAXY SYSTEM EXPLORER
    // ==========================================

    cleanPlanetName(name, galaxy, system, position) {
        if (!name) return `Planeta ${position}`;
        let s = String(name).trim();

        // Extraer formato [g:s:p] Nombre si está presente
        const bracketMatch = s.match(/(\[\d+:\d+:\d+\]\s*[^\r\n]+)/);
        if (bracketMatch) {
            s = bracketMatch[1];
        } else {
            const lines = s.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                if (!/^\d+$/.test(line) && !/^actividad/i.test(line) && !/^(?:transporte|espionaje|atacar|mostrar|jugador|vigilar)/i.test(line)) {
                    s = line;
                    break;
                }
            }
        }

        // Eliminar sufijos y textos de botones de acción / AGR
        const junkRegex = /\s*(?:Transporte|Mantener\s+posici[oó]n|Espionaje|Informe\s+de\s+espionaje|Atacar|Mostrar\s+la\s+informaci[oó]n|Jugador\s+en\s+modo|Actividad:|Vigilar|Granja|Objetivo|Ataque|Desplegar|Recolectar)[\s\S]*/i;
        s = s.replace(junkRegex, '').trim();
        s = s.replace(/^\d+\s+/, '').trim();

        return s || `Planeta ${position}`;
    }

    formatActivityDetail(activity, updatedAt) {
        if (!activity) return null;
        const capturedTime = activity.capturedAt || updatedAt || Date.now();
        const elapsedMinutes = Math.floor((Date.now() - capturedTime) / 60000);
        const currentMinutes = (activity.minutes || 0) + elapsedMinutes;

        // "Asi hasta que la actividad supera los 59 min y desaparece ese dato."
        if (currentMinutes > 59) return null;

        // Hora del evento original de actividad
        const eventTimestamp = capturedTime - ((activity.minutes || 0) * 60000);
        const eventDate = new Date(eventTimestamp);
        const hours = String(eventDate.getHours()).padStart(2, '0');
        const mins = String(eventDate.getMinutes()).padStart(2, '0');

        // Formato exacto de huso horario local (ej. -6:00 hrs GMT)
        const offsetMin = -eventDate.getTimezoneOffset();
        const sign = offsetMin >= 0 ? '+' : '-';
        const absMin = Math.abs(offsetMin);
        const tzHours = Math.floor(absMin / 60);
        const tzMins = absMin % 60;
        const tzFormatted = `${sign}${tzHours}:${String(tzMins).padStart(2, '0')} hrs GMT`;

        let timeLabel = '';
        if (activity.type === 'recent' || activity.minutes === 0) {
            timeLabel = currentMinutes === 0 ? '* (<15 min)' : `${currentMinutes} min`;
        } else {
            timeLabel = `${currentMinutes} min`;
        }

        return {
            currentMinutes,
            badge: (activity.type === 'recent' && currentMinutes === 0) ? '*' : `${currentMinutes}m`,
            fullText: `U.Act. ${timeLabel} (${hours}:${mins} hrs ${tzFormatted})`
        };
    }

    async renderGalaxySystem() {
        const container = document.getElementById('galaxy-slots-table');
        if (!container) return;

        const g = this.currentGalaxy;
        const s = this.currentSystem;
        const planets = await this.getSystemPlanets(g, s);
        const planetsByPos = new Map();
        const moonsByPos = new Map();

        planets.forEach(p => {
            if (p.isMoon) {
                moonsByPos.set(p.position, p);
            } else {
                planetsByPos.set(p.position, p);
            }
        });

        let html = '';
        for (let pos = 1; pos <= 15; pos++) {
            const planet = planetsByPos.get(pos);
            const moon = moonsByPos.get(pos);
            const coordStr = `${g}:${s}:${pos}`;

            if (!planet && !moon) {
                // Empty slot (8 columns matching headers)
                html += `
                <tr class="border-b border-slate-800/60 hover:bg-slate-900/40 transition">
                    <td class="py-2.5 px-3 font-mono text-cyan-400 font-bold">${pos}</td>
                    <td class="py-2.5 px-3 text-slate-500 italic">Espacio Profundo Vacío</td>
                    <td class="py-2.5 px-3 font-mono text-xs text-slate-500">${coordStr}</td>
                    <td class="py-2.5 px-3 text-slate-600">-</td>
                    <td class="py-2.5 px-3 text-slate-600">-</td>
                    <td class="py-2.5 px-3 text-slate-600">-</td>
                    <td class="py-2.5 px-3 text-slate-600">-</td>
                    <td class="py-2.5 px-3 text-right">
                        <button onclick="app.copyToClipboard('${coordStr}')" class="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition" title="Copiar Coordenadas">📋</button>
                    </td>
                </tr>`;
                continue;
            }

            const mainBody = planet || moon;
            const rawPName = planet ? (planet.planetName || `Planeta ${pos}`) : (moon.planetName || `Luna ${pos}`);
            const pName = this.cleanPlanetName(rawPName, g, s, pos);
            const playerName = mainBody.playerName || 'Desconocido';
            
            // Clean alliance siglas only (strip brackets and extra tokens)
            const rawTag = (mainBody.allianceTag || '').replace(/[\[\]]/g, '').trim();
            const cleanTag = rawTag.split(/\s+/)[0] || '';
            const fullAllyName = mainBody.allianceName || cleanTag;

            const statusBadge = this.formatStatusBadge(mainBody.playerStatus);
            const hasMoon = !!moon || !!(planet && planet.hasMoon);
            const moonSize = moon ? moon.moonSize : (planet ? planet.moonSize : 0);
            const moonIcon = hasMoon ? `<span class="inline-flex items-center text-amber-300 font-mono text-xs" title="Luna presente">🌕 ${moonSize ? moonSize + 'km' : 'Luna'}</span>` : `<span class="text-slate-600">-</span>`;
            const debris = (planet && planet.debris) ? planet.debris : (moon && moon.debris ? moon.debris : null);
            const debrisHtml = debris ? `<span class="text-xs font-mono text-emerald-400">M:${this.formatNumber(debris.metal || 0)} C:${this.formatNumber(debris.crystal || 0)}</span>` : `<span class="text-slate-600">-</span>`;

            // Calculate dynamic activity & expiration (>59m)
            const actDetail = this.formatActivityDetail(mainBody.activity, mainBody.updatedAt);

            html += `
            <tr class="border-b border-slate-800/80 hover:bg-slate-800/50 transition">
                <td class="py-2.5 px-3 font-mono text-cyan-400 font-bold">${pos}</td>
                <td class="py-2.5 px-3 font-medium text-slate-200">
                    <div class="gt-popover-target inline-flex items-center cursor-pointer group"
                         data-popover-type="planet"
                         data-coord="${coordStr}"
                         data-planet-name="${this.escapeHTML(pName)}"
                         data-activity="${this.escapeHTML(actDetail ? actDetail.fullText : '')}"
                         data-status="${this.escapeHTML(mainBody.playerStatus || '')}">
                        <span class="inline-block w-2 h-2 rounded-full bg-cyan-400 mr-2 group-hover:ring-2 ring-cyan-400/50"></span>
                        <span class="hover:text-cyan-300 transition">${this.escapeHTML(pName)}</span>
                        ${actDetail ? `<span class="ml-1.5 px-1.5 py-0.5 rounded text-[11px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">⏱️ ${actDetail.badge}</span>` : ''}
                    </div>
                </td>
                <td class="py-2.5 px-3 font-mono text-xs text-cyan-300">${coordStr}</td>
                <td class="py-2.5 px-3">${moonIcon}</td>
                <td class="py-2.5 px-3">${debrisHtml}</td>
                <td class="py-2.5 px-3 font-medium text-slate-100">
                    <span>${this.escapeHTML(playerName)}</span>
                    ${cleanTag ? `
                        <span class="gt-popover-target inline-block text-xs font-mono text-indigo-400 hover:text-indigo-300 ml-1 cursor-pointer font-bold"
                              data-popover-type="alliance"
                              data-tag="${this.escapeHTML(cleanTag)}"
                              data-ally-name="${this.escapeHTML(fullAllyName)}"
                              data-player-name="${this.escapeHTML(playerName)}">
                            [${this.escapeHTML(cleanTag)}]
                        </span>` : ''}
                </td>
                <td class="py-2.5 px-3">${statusBadge}</td>
                <td class="py-2.5 px-3 text-right space-x-1">
                    <button onclick="app.showReportFor('${coordStr}')" class="px-2 py-1 text-xs bg-cyan-900/50 hover:bg-cyan-800 text-cyan-300 border border-cyan-700/50 rounded transition" title="Ver Inteligencia">📡 Reporte</button>
                    <button onclick="app.openCargoCalcForCoord('${coordStr}')" class="px-2 py-1 text-xs bg-emerald-900/50 hover:bg-emerald-800 text-emerald-300 border border-emerald-700/50 rounded transition" title="Calcular Granjeo">🚀 Granjeo</button>
                    <button onclick="app.copyToClipboard('${coordStr}')" class="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition" title="Copiar Coordenadas">📋</button>
                </td>
            </tr>`;
        }

        container.innerHTML = html;
        const currentCoordEl = document.getElementById('current-system-label');
        if (currentCoordEl) currentCoordEl.textContent = `[${g}:${s}]`;
    }

    // ==========================================
    // 4. TARGET FINDER / INACTIVES RADAR
    // ==========================================

    async renderTargetsFinder() {
        const container = document.getElementById('targets-table-body');
        if (!container) return;

        const gMin = parseInt(document.getElementById('filter-galaxy-min')?.value, 10) || 1;
        const gMax = parseInt(document.getElementById('filter-galaxy-max')?.value, 10) || 9;
        const statusFilter = document.getElementById('filter-status')?.value || 'all';
        const minLoot = parseInt(document.getElementById('filter-min-loot')?.value, 10) || 0;
        const minDebris = parseInt(document.getElementById('filter-min-debris')?.value, 10) || 0;

        const planets = await this.getAllPlanets();
        const reports = await this.getAllReports();

        // Match reports by coordKey
        const reportMap = new Map();
        reports.forEach(r => {
            const key = `${r.galaxy}:${r.system}:${r.position}:0`;
            if (!reportMap.has(key) || (r.timestamp > reportMap.get(key).timestamp)) {
                reportMap.set(key, r);
            }
        });

        const filtered = planets.filter(p => {
            if (p.isMoon) return false;
            if (p.galaxy < gMin || p.galaxy > gMax) return false;

            const isInactive = p.playerStatus && (p.playerStatus.includes('i') || p.playerStatus.includes('I'));
            if (statusFilter === 'inactive' && !isInactive) return false;
            if (statusFilter === 'long-inactive' && (!p.playerStatus || !p.playerStatus.includes('I'))) return false;

            const totalDebris = (p.debris?.metal || 0) + (p.debris?.crystal || 0);
            if (totalDebris < minDebris) return false;

            const rep = reportMap.get(p.coordKey);
            const totalRes = rep?.resources ? ((rep.resources.metal || 0) + (rep.resources.crystal || 0) + (rep.resources.deuterium || 0)) : 0;
            const plunderable = Math.floor(totalRes * 0.5);
            if (plunderable < minLoot) return false;

            return true;
        });

        // Sort by plunderable resource descending
        filtered.sort((a, b) => {
            const repA = reportMap.get(a.coordKey);
            const repB = reportMap.get(b.coordKey);
            const resA = repA?.resources ? (repA.resources.metal + repA.resources.crystal + repA.resources.deuterium) : 0;
            const resB = repB?.resources ? (repB.resources.metal + repB.resources.crystal + repB.resources.deuterium) : 0;
            return resB - resA;
        });

        if (filtered.length === 0) {
            container.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-500">No se encontraron objetivos que coincidan con los filtros de búsqueda.</td></tr>`;
            return;
        }

        let html = '';
        filtered.slice(0, 50).forEach(p => {
            const rep = reportMap.get(p.coordKey);
            const totalRes = rep?.resources ? ((rep.resources.metal || 0) + (rep.resources.crystal || 0) + (rep.resources.deuterium || 0)) : 0;
            const plunder = Math.floor(totalRes * 0.5);
            const totalDebris = (p.debris?.metal || 0) + (p.debris?.crystal || 0);
            const coordStr = `${p.galaxy}:${p.system}:${p.position}`;
            const scNeeded = Math.ceil(plunder / 5000);
            const lcNeeded = Math.ceil(plunder / 25000);

            html += `
            <tr class="border-b border-slate-800/80 hover:bg-slate-800/50 transition">
                <td class="py-2.5 px-3 font-mono font-bold text-cyan-400">${coordStr}</td>
                <td class="py-2.5 px-3 font-medium text-slate-200">
                    ${this.escapeHTML(p.playerName || 'Inactivo')}
                    ${p.allianceTag ? `<span class="text-xs text-indigo-400 ml-1">[${this.escapeHTML(p.allianceTag)}]</span>` : ''}
                </td>
                <td class="py-2.5 px-3">${this.formatStatusBadge(p.playerStatus)}</td>
                <td class="py-2.5 px-3 font-mono text-emerald-400 font-medium">
                    ${plunder > 0 ? `${this.formatNumber(plunder)} <span class="text-xs text-slate-500 font-normal">(${scNeeded} PT / ${lcNeeded} GT)</span>` : '<span class="text-slate-600">Sin espionaje</span>'}
                </td>
                <td class="py-2.5 px-3 font-mono text-cyan-300">
                    ${totalDebris > 0 ? this.formatNumber(totalDebris) : '<span class="text-slate-600">-</span>'}
                </td>
                <td class="py-2.5 px-3 font-mono text-xs text-slate-400">${this.formatTimeAgo(p.updatedAt)}</td>
                <td class="py-2.5 px-3 text-right space-x-1">
                    <button onclick="app.jumpToSystem(${p.galaxy}, ${p.system})" class="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded transition" title="Ir al sistema">🪐 Ver</button>
                    <button onclick="app.showReportFor('${coordStr}')" class="px-2 py-1 text-xs bg-cyan-900/50 hover:bg-cyan-800 text-cyan-300 border border-cyan-700/50 rounded transition" title="Ver Reporte">📡 Reporte</button>
                    <button onclick="app.copyToClipboard('${coordStr}')" class="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition" title="Copiar Coordenadas">📋</button>
                </td>
            </tr>`;
        });

        container.innerHTML = html;
    }

    // ==========================================
    // 5. ESPIONAGE REPORTS LIST & MODAL
    // ==========================================

    async renderReportsList() {
        const container = document.getElementById('reports-table-body');
        if (!container) return;

        const reports = await this.getAllReports();
        reports.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (reports.length === 0) {
            container.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-500">No hay reportes de espionaje en la base de datos local.</td></tr>`;
            return;
        }

        let html = '';
        reports.forEach(r => {
            const coordStr = `${r.galaxy}:${r.system}:${r.position}${r.isMoon ? ' (Luna)' : ''}`;
            const totalRes = r.resources ? ((r.resources.metal || 0) + (r.resources.crystal || 0) + (r.resources.deuterium || 0)) : 0;
            const plunder50 = Math.floor(totalRes * 0.5);
            const fleetCount = r.fleet ? Object.values(r.fleet).reduce((a, b) => a + b, 0) : 0;
            const defCount = r.defenses ? Object.values(r.defenses).reduce((a, b) => a + b, 0) : 0;
            const dateStr = r.timestamp ? new Date(r.timestamp * 1000).toLocaleString() : '-';

            html += `
            <tr class="border-b border-slate-800/80 hover:bg-slate-800/50 transition">
                <td class="py-2.5 px-3 font-mono font-bold text-cyan-400">${coordStr}</td>
                <td class="py-2.5 px-3 font-mono text-xs text-slate-400">${dateStr}</td>
                <td class="py-2.5 px-3 font-mono text-emerald-400">${this.formatNumber(totalRes)} <span class="text-xs text-slate-500">(50%: ${this.formatNumber(plunder50)})</span></td>
                <td class="py-2.5 px-3 font-mono text-amber-300 text-xs">${fleetCount > 0 ? `${fleetCount} naves` : '<span class="text-slate-600">0 naves</span>'}</td>
                <td class="py-2.5 px-3 font-mono text-rose-300 text-xs">${defCount > 0 ? `${defCount} estructuras` : '<span class="text-slate-600">0 defensas</span>'}</td>
                <td class="py-2.5 px-3 text-right">
                    <button onclick="app.showReportModalById(${r.id})" class="px-2.5 py-1 text-xs bg-cyan-900/60 hover:bg-cyan-800 text-cyan-300 border border-cyan-700/60 rounded transition">Detalle Táctico</button>
                </td>
            </tr>`;
        });

        container.innerHTML = html;
    }

    async showReportFor(coordStr) {
        const parts = coordStr.split(':').map(Number);
        const rep = await this.getLatestReport(parts[0], parts[1], parts[2], false);
        if (!rep) {
            alert(`No se encontró reporte de espionaje para las coordenadas ${coordStr}.`);
            return;
        }
        this.renderReportDetail(rep);
    }

    async showReportModalById(id) {
        const reports = await this.getAllReports();
        const rep = reports.find(r => r.id === id);
        if (rep) this.renderReportDetail(rep);
    }

    renderReportDetail(rep) {
        const modal = document.getElementById('report-detail-modal');
        const content = document.getElementById('report-modal-content');
        if (!modal || !content) return;

        const m = rep.resources?.metal || 0;
        const c = rep.resources?.crystal || 0;
        const d = rep.resources?.deuterium || 0;
        const energy = rep.resources?.energy || 0;
        const total = m + c + d;
        const loot50 = Math.floor(total * 0.5);
        const loot75 = Math.floor(total * 0.75);

        // Fleet items (17 modern ships)
        let fleetHtml = '';
        if (rep.fleet && Object.keys(rep.fleet).length > 0) {
            fleetHtml = Object.entries(rep.fleet).map(([k, qty]) => {
                const shipDef = SHIPS[k];
                const name = shipDef ? shipDef.name : k;
                return `<div class="flex justify-between py-1 border-b border-slate-800 text-xs"><span class="text-slate-300">${name} (${k})</span><span class="font-mono font-bold text-cyan-400">${qty.toLocaleString()}</span></div>`;
            }).join('');
        } else {
            fleetHtml = `<p class="text-xs text-slate-500 italic py-2">No se detectaron naves en órbita o estacionadas.</p>`;
        }

        // Defenses
        let defHtml = '';
        if (rep.defenses && Object.keys(rep.defenses).length > 0) {
            defHtml = Object.entries(rep.defenses).map(([k, qty]) => {
                return `<div class="flex justify-between py-1 border-b border-slate-800 text-xs"><span class="text-slate-300">${k}</span><span class="font-mono font-bold text-rose-400">${qty.toLocaleString()}</span></div>`;
            }).join('');
        } else {
            defHtml = `<p class="text-xs text-slate-500 italic py-2">Sin defensas registradas.</p>`;
        }

        content.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                    <h3 class="text-lg font-bold text-cyan-400 font-mono">[${rep.galaxy}:${rep.system}:${rep.position}] ${rep.isMoon ? '🌕 Luna' : '🪐 Planeta'}</h3>
                    <p class="text-xs text-slate-400">Escaneado el: ${new Date((rep.timestamp || Date.now() / 1000) * 1000).toLocaleString()}</p>
                </div>
                <div class="text-right">
                    <span class="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono">Clase: ${rep.playerClass || 'Desconocida'}</span>
                </div>
            </div>

            <!-- Recursos -->
            <div class="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Recursos en Superficie</h4>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-sm">
                    <div class="bg-slate-800/50 p-2 rounded"><span class="text-slate-400 text-xs block">Metal</span><span class="text-amber-400 font-bold">${m.toLocaleString()}</span></div>
                    <div class="bg-slate-800/50 p-2 rounded"><span class="text-slate-400 text-xs block">Cristal</span><span class="text-cyan-400 font-bold">${c.toLocaleString()}</span></div>
                    <div class="bg-slate-800/50 p-2 rounded"><span class="text-slate-400 text-xs block">Deuterio</span><span class="text-emerald-400 font-bold">${d.toLocaleString()}</span></div>
                    <div class="bg-slate-800/50 p-2 rounded"><span class="text-slate-400 text-xs block">Total Botín 50%</span><span class="text-indigo-400 font-bold">${loot50.toLocaleString()}</span></div>
                </div>
            </div>

            <!-- Calculo Granjeo -->
            <div class="bg-emerald-950/30 p-3 rounded-lg border border-emerald-900/50 text-xs">
                <h4 class="font-semibold text-emerald-400 uppercase tracking-wider mb-1">Cálculo de Transporte Recomendado (50% de Botín)</h4>
                <div class="grid grid-cols-3 gap-2 font-mono text-center pt-1">
                    <div class="bg-slate-900/80 p-1.5 rounded"><span class="text-slate-400 block">Pequeña Carga</span><span class="text-white font-bold text-sm">${Math.ceil(loot50 / 5000)} PT</span></div>
                    <div class="bg-slate-900/80 p-1.5 rounded"><span class="text-slate-400 block">Gran Carga</span><span class="text-white font-bold text-sm">${Math.ceil(loot50 / 25000)} GT</span></div>
                    <div class="bg-slate-900/80 p-1.5 rounded"><span class="text-slate-400 block">Pathfinder</span><span class="text-white font-bold text-sm">${Math.ceil(loot50 / 10000)} PATH</span></div>
                </div>
            </div>

            <!-- Flota & Defensa -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                    <h4 class="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2">Flota Detectada</h4>
                    <div class="max-h-48 overflow-y-auto pr-1">${fleetHtml}</div>
                </div>
                <div class="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                    <h4 class="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">Defensas Detectadas</h4>
                    <div class="max-h-48 overflow-y-auto pr-1">${defHtml}</div>
                </div>
            </div>
        </div>`;

        modal.classList.remove('hidden');
    }

    closeReportModal() {
        const modal = document.getElementById('report-detail-modal');
        if (modal) modal.classList.add('hidden');
    }

    // ==========================================
    // 6. TACTICAL PLUNDER & CARGO CALCULATOR
    // ==========================================

    renderPlunderCalculator() {
        this.calculateCustomPlunder();
    }

    calculateCustomPlunder() {
        const m = parseInt(document.getElementById('calc-metal')?.value, 10) || 0;
        const c = parseInt(document.getElementById('calc-crystal')?.value, 10) || 0;
        const d = parseInt(document.getElementById('calc-deut')?.value, 10) || 0;
        const ratio = parseFloat(document.getElementById('calc-ratio')?.value) || 0.5;

        const plunderM = Math.floor(m * ratio);
        const plunderC = Math.floor(c * ratio);
        const plunderD = Math.floor(d * ratio);
        const totalPlunder = plunderM + plunderC + plunderD;

        const sc = Math.ceil(totalPlunder / 5000);
        const lc = Math.ceil(totalPlunder / 25000);
        const path = Math.ceil(totalPlunder / 10000);

        const outTotal = document.getElementById('calc-out-total');
        const outSC = document.getElementById('calc-out-sc');
        const outLC = document.getElementById('calc-out-lc');
        const outPATH = document.getElementById('calc-out-path');

        if (outTotal) outTotal.textContent = totalPlunder.toLocaleString();
        if (outSC) outSC.textContent = sc.toLocaleString();
        if (outLC) outLC.textContent = lc.toLocaleString();
        if (outPATH) outPATH.textContent = path.toLocaleString();
    }

    openCargoCalcForCoord(coordStr) {
        this.switchTab('calc');
        const parts = coordStr.split(':').map(Number);
        this.getLatestReport(parts[0], parts[1], parts[2], false).then(rep => {
            if (rep && rep.resources) {
                const elM = document.getElementById('calc-metal');
                const elC = document.getElementById('calc-crystal');
                const elD = document.getElementById('calc-deut');
                if (elM) elM.value = rep.resources.metal || 0;
                if (elC) elC.value = rep.resources.crystal || 0;
                if (elD) elD.value = rep.resources.deuterium || 0;
                this.calculateCustomPlunder();
            }
        });
    }

    // ==========================================
    // 7. DATA MANAGEMENT & JSONL BACKUP
    // ==========================================

    async exportToJSONL() {
        const planets = await this.getAllPlanets();
        const reports = await this.getAllReports();

        const dump = {
            version: '6.0.0',
            exportedAt: new Date().toISOString(),
            planets,
            reports
        };

        const lines = [
            JSON.stringify({ type: 'header', ...dump }),
            ...reports.map(r => JSON.stringify({ type: 'report', data: r })),
            ...planets.map(p => JSON.stringify({ type: 'planet', data: p }))
        ];

        const blob = new Blob([lines.join('\n')], { type: 'application/x-jsonlines;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `galaxytool-intel-${new Date().toISOString().slice(0, 10)}.jsonl`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async importFromJSONL(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const content = e.target.result;
            const lines = content.split(/\r?\n/);
            let importedPlanets = 0;
            let importedReports = 0;

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const obj = JSON.parse(trimmed);
                    if (obj.type === 'planet' && obj.data) {
                        await this.savePlanet(obj.data);
                        importedPlanets++;
                    } else if (obj.type === 'report' && obj.data) {
                        await this.saveReport(obj.data);
                        importedReports++;
                    } else if (obj.coordKey) {
                        // Direct planet or report
                        if (obj.resources) {
                            await this.saveReport(obj);
                            importedReports++;
                        } else {
                            await this.savePlanet(obj);
                            importedPlanets++;
                        }
                    }
                } catch (err) {
                    // Ignore corrupted row
                }
            }

            await this.updateStats();
            this.renderGalaxySystem();
            alert(`Importación completada:\n• ${importedPlanets} planetas\n• ${importedReports} reportes de espionaje`);
        };
        reader.readAsText(file);
    }

    async seedDemoData() {
        // Sample planets and systems for testing
        const samplePlanets = [
            { galaxy: 1, system: 1, position: 1, planetName: 'Colonia Alfa', playerName: 'Alex_Commander', allianceTag: 'TITAN', playerStatus: '', hasMoon: true, moonSize: 8450, debris: { metal: 120000, crystal: 85000 }, updatedAt: Date.now() - 300000 },
            { galaxy: 1, system: 1, position: 2, planetName: 'Kaelesh Outpost', playerName: 'DarkGhost', allianceTag: '', playerStatus: 'i', hasMoon: false, debris: null, updatedAt: Date.now() - 3600000 },
            { galaxy: 1, system: 1, position: 5, planetName: 'Perdición', playerName: 'Noxus', allianceTag: 'PVP', playerStatus: 'I', hasMoon: true, moonSize: 8900, debris: { metal: 450000, crystal: 310000 }, updatedAt: Date.now() - 86400000 },
            { galaxy: 1, system: 1, position: 8, planetName: 'Mundo Inerte', playerName: 'CyberFarmer', allianceTag: 'FARM', playerStatus: 'i', hasMoon: false, debris: null, updatedAt: Date.now() - 7200000 },
            { galaxy: 1, system: 1, position: 12, planetName: 'Santuario', playerName: 'Zenith', allianceTag: 'TITAN', playerStatus: 'v', hasMoon: false, debris: null, updatedAt: Date.now() - 172800000 },
            { galaxy: 1, system: 2, position: 3, planetName: 'Minas Rojas', playerName: 'RocktalLord', allianceTag: 'MINE', playerStatus: 'i', hasMoon: false, debris: null, updatedAt: Date.now() - 14400000 },
            { galaxy: 1, system: 2, position: 6, planetName: 'Fortaleza', playerName: 'Valkyrie', allianceTag: 'WAR', playerStatus: '', hasMoon: true, moonSize: 8100, debris: { metal: 50000, crystal: 25000 }, updatedAt: Date.now() - 1800000 },
            { galaxy: 2, system: 50, position: 4, planetName: 'Depósito 4', playerName: 'OldMiner', allianceTag: '', playerStatus: 'I', hasMoon: false, debris: null, updatedAt: Date.now() - 259200000 }
        ];

        for (const p of samplePlanets) {
            await this.savePlanet(p);
        }

        // Sample reports including modern 17 ships (Reaper, Pathfinder, Crawler)
        const sampleReports = [
            {
                galaxy: 1, system: 1, position: 2, isMoon: false,
                timestamp: Math.floor(Date.now() / 1000) - 3600,
                playerName: 'DarkGhost', playerClass: 'collector',
                resources: { metal: 1850000, crystal: 920000, deuterium: 340000, energy: 4500 },
                fleet: { SC: 15, LC: 5, CRAW: 12 },
                defenses: { 'Lanzamisiles': 40, 'Láser pequeño': 20 }
            },
            {
                galaxy: 1, system: 1, position: 5, isMoon: false,
                timestamp: Math.floor(Date.now() / 1000) - 18000,
                playerName: 'Noxus', playerClass: 'general',
                resources: { metal: 4200000, crystal: 2100000, deuterium: 850000, energy: 7200 },
                fleet: { CR: 25, BS: 10, REAP: 4, PATH: 8, REC: 15 },
                defenses: { 'Cañón Gauss': 10, 'Cañón de Plasma': 2, 'Cúpula grande': 1 }
            },
            {
                galaxy: 1, system: 2, position: 3, isMoon: false,
                timestamp: Math.floor(Date.now() / 1000) - 7200,
                playerName: 'RocktalLord', playerClass: 'discoverer',
                resources: { metal: 950000, crystal: 480000, deuterium: 120000, energy: 3200 },
                fleet: { PATH: 12, SC: 20 },
                defenses: { 'Lanzamisiles': 15 }
            }
        ];

        for (const r of sampleReports) {
            await this.saveReport(r);
        }

        await this.updateStats();
        this.renderGalaxySystem();
        alert('Datos de prueba cargados exitosamente (8 planetas en 3 sistemas solares y 3 reportes con flota moderna).');
    }

    // ==========================================
    // 8. HELPERS & UTILITIES
    // ==========================================

    jumpToSystem(g, s) {
        this.currentGalaxy = g;
        this.currentSystem = s;
        const elG = document.getElementById('input-galaxy');
        const elS = document.getElementById('input-system');
        if (elG) elG.value = g;
        if (elS) elS.value = s;
        this.switchTab('galaxy');
    }

    formatStatusBadge(status) {
        if (!status || status === 'active') return `<span class="px-1.5 py-0.5 text-xs rounded bg-slate-800 text-slate-400">Activo</span>`;
        if (status === 'own') return `<span class="px-1.5 py-0.5 text-xs rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">Tuyo</span>`;

        const badges = [];
        if (status.includes('I')) badges.push(`<span class="px-1.5 py-0.5 text-xs rounded bg-red-950 text-red-400 font-bold border border-red-800 font-mono" title="Inactivo 28+ días">(I)</span>`);
        else if (status.includes('i')) badges.push(`<span class="px-1.5 py-0.5 text-xs rounded bg-amber-950 text-amber-400 font-bold border border-amber-800 font-mono" title="Inactivo 7+ días">(i)</span>`);
        if (status.includes('v')) badges.push(`<span class="px-1.5 py-0.5 text-xs rounded bg-blue-950 text-blue-400 font-mono" title="Modo Vacaciones">(v)</span>`);
        if (status.includes('b')) badges.push(`<span class="px-1.5 py-0.5 text-xs rounded bg-purple-950 text-purple-400 font-mono" title="Bloqueado">(b)</span>`);
        if (status.includes('bandit')) badges.push(`<span class="px-1.5 py-0.5 text-xs rounded bg-red-900/60 text-red-300 font-mono" title="Bandido">Bandido</span>`);
        if (status.includes('hp')) badges.push(`<span class="px-1.5 py-0.5 text-xs rounded bg-yellow-900/60 text-yellow-300 font-mono" title="Objetivo Honorable">HP</span>`);

        return badges.length > 0 ? badges.join(' ') : `<span class="px-1.5 py-0.5 text-xs rounded bg-slate-800 text-slate-400 font-mono">${this.escapeHTML(status)}</span>`;
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(0) + 'k';
        return num.toLocaleString();
    }

    formatTimeAgo(timestamp) {
        if (!timestamp) return '-';
        const sec = Math.floor((Date.now() - timestamp) / 1000);
        if (sec < 60) return 'hace un momento';
        const min = Math.floor(sec / 60);
        if (min < 60) return `hace ${min}m`;
        const hrs = Math.floor(min / 60);
        if (hrs < 24) return `hace ${hrs}h`;
        const days = Math.floor(hrs / 24);
        return `hace ${days}d`;
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

    copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
        }
    }

    filterByAlliance(tag) {
        this.switchTab('targets');
        alert(`Filtrando objetivos de la alianza [${tag}].`);
    }

    openFleetDispatch(coordStr) {
        this.copyToClipboard(coordStr);
        alert(`Coordenadas ${coordStr} copiadas al portapapeles para envío de flota.`);
    }

    setupHoverPopovers() {
        if (typeof document === 'undefined') return;

        let popoverEl = document.getElementById('gt-hover-popover');
        if (!popoverEl) {
            popoverEl = document.createElement('div');
            popoverEl.id = 'gt-hover-popover';
            popoverEl.className = 'fixed z-50 hidden bg-space-950/95 border border-cyan-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs text-slate-200 transition-opacity duration-150 max-w-xs pointer-events-auto';
            document.body.appendChild(popoverEl);
        }

        let hoverTimer = null;
        let closeTimer = null;
        let activeTarget = null;

        const hidePopover = () => {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
            if (closeTimer) {
                clearTimeout(closeTimer);
                closeTimer = null;
            }
            popoverEl.classList.add('hidden');
            activeTarget = null;
        };

        const showPopoverFor = (target) => {
            const type = target.getAttribute('data-popover-type');
            if (!type) return;

            let contentHtml = '';
            if (type === 'planet') {
                const name = target.getAttribute('data-planet-name') || 'Planeta';
                const coord = target.getAttribute('data-coord') || '';
                const activity = target.getAttribute('data-activity') || '';

                contentHtml = `
                    <div class="space-y-2">
                        <div class="flex items-center justify-between border-b border-slate-700/60 pb-1.5">
                            <span class="font-bold text-cyan-400 text-sm flex items-center space-x-1">
                                <span>🪐</span> <span>${this.escapeHTML(name)}</span>
                            </span>
                            <span class="font-mono text-xs text-slate-400">[${coord}]</span>
                        </div>
                        ${activity ? `
                            <div class="p-1.5 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300 font-mono text-xs">
                                ⏱️ ${this.escapeHTML(activity)}
                            </div>
                        ` : `
                            <div class="text-slate-500 text-[11px] italic">
                                Sin actividad reciente detectada (&gt;59m)
                            </div>
                        `}
                        <div class="pt-1 border-t border-slate-800 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Accesos Rápidos:</div>
                        <div class="grid grid-cols-2 gap-1.5 pt-0.5">
                            <button onclick="app.showReportFor('${coord}')" class="px-2 py-1 bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-300 rounded border border-cyan-700/40 text-left transition flex items-center space-x-1">
                                <span>📡</span> <span>Reporte</span>
                            </button>
                            <button onclick="app.openCargoCalcForCoord('${coord}')" class="px-2 py-1 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 rounded border border-emerald-700/40 text-left transition flex items-center space-x-1">
                                <span>🚀</span> <span>Granjeo</span>
                            </button>
                            <button onclick="app.openFleetDispatch('${coord}')" class="px-2 py-1 bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-300 rounded border border-indigo-700/40 text-left transition flex items-center space-x-1">
                                <span>🛸</span> <span>Flota</span>
                            </button>
                            <button onclick="app.copyToClipboard('${coord}')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-left transition flex items-center space-x-1">
                                <span>📋</span> <span>Copiar</span>
                            </button>
                        </div>
                    </div>
                `;
            } else if (type === 'alliance') {
                const tag = target.getAttribute('data-tag') || '';
                const allyName = target.getAttribute('data-ally-name') || tag;
                const player = target.getAttribute('data-player-name') || '';

                contentHtml = `
                    <div class="space-y-2">
                        <div class="border-b border-slate-700/60 pb-1.5">
                            <div class="font-bold text-indigo-300 text-sm flex items-center space-x-1">
                                <span>🛡️</span> <span>[${this.escapeHTML(tag)}]</span>
                            </div>
                            <div class="text-xs text-slate-300 font-medium">${this.escapeHTML(allyName)}</div>
                        </div>
                        <div class="text-[11px] text-slate-400">
                            <span>Miembro: </span><span class="text-slate-200 font-semibold">${this.escapeHTML(player)}</span>
                        </div>
                        <div class="pt-1 border-t border-slate-800 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Accesos Rápidos:</div>
                        <div class="space-y-1 pt-0.5">
                            <button onclick="app.filterByAlliance('${this.escapeHTML(tag)}')" class="w-full px-2 py-1 bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-300 rounded border border-indigo-700/40 text-left transition flex items-center space-x-1">
                                <span>🔍</span> <span>Buscar miembros de [${this.escapeHTML(tag)}]</span>
                            </button>
                            <button onclick="app.copyToClipboard('${this.escapeHTML(tag)}')" class="w-full px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-left transition flex items-center space-x-1">
                                <span>📋</span> <span>Copiar Siglas</span>
                            </button>
                        </div>
                    </div>
                `;
            }

            popoverEl.innerHTML = contentHtml;

            // Positioning logic near target
            const rect = target.getBoundingClientRect();
            const popWidth = 260;
            let left = rect.left;
            let top = rect.bottom + 8;

            if (left + popWidth > window.innerWidth - 10) {
                left = window.innerWidth - popWidth - 10;
            }
            if (left < 10) left = 10;

            if (top + 180 > window.innerHeight) {
                top = rect.top - 180;
                if (top < 10) top = rect.bottom + 8;
            }

            popoverEl.style.left = `${left}px`;
            popoverEl.style.top = `${top}px`;
            popoverEl.classList.remove('hidden');
        };

        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('.gt-popover-target');
            if (target) {
                if (closeTimer) {
                    clearTimeout(closeTimer);
                    closeTimer = null;
                }
                if (activeTarget === target) return;
                activeTarget = target;
                if (hoverTimer) clearTimeout(hoverTimer);
                // Espera de 1 segundo (1000ms)
                hoverTimer = setTimeout(() => {
                    showPopoverFor(target);
                }, 1000);
            } else if (e.target.closest('#gt-hover-popover')) {
                if (closeTimer) {
                    clearTimeout(closeTimer);
                    closeTimer = null;
                }
            }
        });

        document.addEventListener('mouseout', (e) => {
            const target = e.target.closest('.gt-popover-target');
            if (target) {
                if (hoverTimer) {
                    clearTimeout(hoverTimer);
                    hoverTimer = null;
                }
                closeTimer = setTimeout(() => {
                    hidePopover();
                }, 250);
            } else if (e.target.closest('#gt-hover-popover')) {
                closeTimer = setTimeout(() => {
                    hidePopover();
                }, 250);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hidePopover();
        });
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js').catch(err => {
                    console.warn('[PWA] Service Worker registration failed:', err);
                });
            });
        }
    }
}

// Global instance for inline button calls
window.app = new DashboardApp();
window.addEventListener('DOMContentLoaded', () => {
    window.app.init();
});

