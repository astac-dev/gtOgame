/**
 * OGame Modern Storage Engine (Local-First / Zero-Database)
 * Dual-Mode Storage:
 * - Browser: High-performance native IndexedDB (B-Tree indexed, zero CDN dependencies).
 * - Node.js / CLI: In-memory & JSON file backed storage.
 */

const DB_NAME = 'OGameGalaxytoolDB';
const DB_VERSION = 1;

export class OGameStorageEngine {
    constructor(options = {}) {
        this.isBrowser = typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
        this.db = null;
        this.memoryStore = {
            planets: new Map(),
            reports: new Map(),
            players: new Map(),
            alliances: new Map(),
            config: new Map()
        };
    }

    /**
     * Initializes the database connection and object stores
     * @returns {Promise<OGameStorageEngine>}
     */
    async init() {
        if (!this.isBrowser) {
            // Memory mode for Node.js / CLI
            return this;
        }

        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 1. Planets Store: Key = "G:S:P:Moon" (e.g. "1:154:3:0")
                if (!db.objectStoreNames.contains('planets')) {
                    const planetStore = db.createObjectStore('planets', { keyPath: 'coordKey' });
                    planetStore.createIndex('galaxy', 'galaxy', { unique: false });
                    planetStore.createIndex('system', ['galaxy', 'system'], { unique: false });
                    planetStore.createIndex('playerId', 'playerId', { unique: false });
                    planetStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    planetStore.createIndex('status', 'status', { unique: false }); // i, I, v, etc.
                }

                // 2. Espionage & Military Reports Store: Key = id
                if (!db.objectStoreNames.contains('reports')) {
                    const reportStore = db.createObjectStore('reports', { keyPath: 'id', autoIncrement: true });
                    reportStore.createIndex('coordKey', 'coordKey', { unique: false });
                    reportStore.createIndex('timestamp', 'timestamp', { unique: false });
                    reportStore.createIndex('playerId', 'playerId', { unique: false });
                }

                // 3. Players Store: Key = id (ogame_playerid)
                if (!db.objectStoreNames.contains('players')) {
                    const playerStore = db.createObjectStore('players', { keyPath: 'id' });
                    playerStore.createIndex('name', 'name', { unique: false });
                    playerStore.createIndex('allianceId', 'allianceId', { unique: false });
                    playerStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // 4. Alliances Store: Key = id (ogame_allyid)
                if (!db.objectStoreNames.contains('alliances')) {
                    const allyStore = db.createObjectStore('alliances', { keyPath: 'id' });
                    allyStore.createIndex('tag', 'tag', { unique: false });
                }

                // 5. Config & Alliance Shared Keys Store
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this);
            };

            request.onerror = (event) => {
                reject(new Error(`Failed to open IndexedDB: ${event.target.error}`));
            };
        });
    }

    /**
     * Helper to create coordinate key "G:S:P:M"
     */
    static makeCoordKey(galaxy, system, position, isMoon = false) {
        return `${galaxy}:${system}:${position}:${isMoon ? 1 : 0}`;
    }

    // ==========================================
    // PLANETS & GALAXY API
    // ==========================================

    async savePlanet(planet) {
        const coordKey = OGameStorageEngine.makeCoordKey(
            planet.galaxy, planet.system, planet.position, planet.isMoon
        );
        const record = {
            ...planet,
            coordKey,
            updatedAt: planet.updatedAt || Date.now()
        };

        if (!this.isBrowser) {
            this.memoryStore.planets.set(coordKey, record);
            return record;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('planets', 'readwrite');
            const store = tx.objectStore('planets');
            const req = store.put(record);
            req.onsuccess = () => resolve(record);
            req.onerror = () => reject(req.error);
        });
    }

    async getPlanet(galaxy, system, position, isMoon = false) {
        const coordKey = OGameStorageEngine.makeCoordKey(galaxy, system, position, isMoon);

        if (!this.isBrowser) {
            return this.memoryStore.planets.get(coordKey) || null;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('planets', 'readonly');
            const store = tx.objectStore('planets');
            const req = store.get(coordKey);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async getSystem(galaxy, system) {
        if (!this.isBrowser) {
            const result = [];
            for (const p of this.memoryStore.planets.values()) {
                if (p.galaxy === galaxy && p.system === system) {
                    result.push(p);
                }
            }
            return result.sort((a, b) => a.position - b.position);
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('planets', 'readonly');
            const store = tx.objectStore('planets');
            const index = store.index('system');
            const range = IDBKeyRange.only([galaxy, system]);
            const req = index.getAll(range);
            req.onsuccess = () => {
                const sorted = (req.result || []).sort((a, b) => a.position - b.position);
                resolve(sorted);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async getAllPlanets() {
        if (!this.isBrowser) {
            return Array.from(this.memoryStore.planets.values());
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('planets', 'readonly');
            const store = tx.objectStore('planets');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    // ==========================================
    // ESPIONAGE & COMBAT REPORTS API
    // ==========================================

    async saveReport(report) {
        const coordKey = OGameStorageEngine.makeCoordKey(
            report.galaxy, report.system, report.position, report.isMoon
        );
        const record = {
            ...report,
            coordKey,
            timestamp: report.timestamp || Math.floor(Date.now() / 1000)
        };

        if (!this.isBrowser) {
            const id = report.id || (this.memoryStore.reports.size + 1);
            record.id = id;
            this.memoryStore.reports.set(id, record);
            return record;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('reports', 'readwrite');
            const store = tx.objectStore('reports');
            const req = store.put(record);
            req.onsuccess = (e) => {
                record.id = e.target.result;
                resolve(record);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async getLatestReport(galaxy, system, position, isMoon = false) {
        const coordKey = OGameStorageEngine.makeCoordKey(galaxy, system, position, isMoon);

        if (!this.isBrowser) {
            let latest = null;
            for (const r of this.memoryStore.reports.values()) {
                if (r.coordKey === coordKey) {
                    if (!latest || r.timestamp > latest.timestamp) {
                        latest = r;
                    }
                }
            }
            return latest;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('reports', 'readonly');
            const store = tx.objectStore('reports');
            const index = store.index('coordKey');
            const req = index.getAll(IDBKeyRange.only(coordKey));

            req.onsuccess = () => {
                const reports = req.result || [];
                if (reports.length === 0) return resolve(null);
                reports.sort((a, b) => b.timestamp - a.timestamp);
                resolve(reports[0]);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async getAllReports() {
        if (!this.isBrowser) {
            return Array.from(this.memoryStore.reports.values());
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('reports', 'readonly');
            const store = tx.objectStore('reports');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    // ==========================================
    // PLAYERS & ALLIANCES API
    // ==========================================

    async savePlayer(player) {
        const record = {
            ...player,
            updatedAt: player.updatedAt || Date.now()
        };

        if (!this.isBrowser) {
            this.memoryStore.players.set(player.id, record);
            return record;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('players', 'readwrite');
            const store = tx.objectStore('players');
            const req = store.put(record);
            req.onsuccess = () => resolve(record);
            req.onerror = () => reject(req.error);
        });
    }

    async getPlayer(playerId) {
        if (!this.isBrowser) {
            return this.memoryStore.players.get(playerId) || null;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('players', 'readonly');
            const store = tx.objectStore('players');
            const req = store.get(playerId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    // ==========================================
    // CONFIG & ALLIANCE KEYS API
    // ==========================================

    async setConfig(key, value) {
        const record = { key, value };
        if (!this.isBrowser) {
            this.memoryStore.config.set(key, value);
            return value;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('config', 'readwrite');
            const store = tx.objectStore('config');
            const req = store.put(record);
            req.onsuccess = () => resolve(value);
            req.onerror = () => reject(req.error);
        });
    }

    async getConfig(key, defaultValue = null) {
        if (!this.isBrowser) {
            return this.memoryStore.config.has(key) ? this.memoryStore.config.get(key) : defaultValue;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('config', 'readonly');
            const store = tx.objectStore('config');
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
            req.onerror = () => reject(req.error);
        });
    }

    async clearAll() {
        if (!this.isBrowser) {
            this.memoryStore.planets.clear();
            this.memoryStore.reports.clear();
            this.memoryStore.players.clear();
            this.memoryStore.alliances.clear();
            this.memoryStore.config.clear();
            return true;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['planets', 'reports', 'players', 'alliances'], 'readwrite');
            tx.objectStore('planets').clear();
            tx.objectStore('reports').clear();
            tx.objectStore('players').clear();
            tx.objectStore('alliances').clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }
}

