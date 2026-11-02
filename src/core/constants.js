/**
 * OGame Modern Core Constants (v7 - v11+)
 * Full 17 ships mapping, classes, lifeforms, and protocol constants.
 */

export const PROTOCOL_MAGIC = 0x47; // 'G' for Galaxytool
export const PROTOCOL_VERSION = 1;

export const SHIPS = [
    { id: 202, key: 'SC', legacy: 'kt', name: 'Nave pequeña de carga', capacity: 5000, speed: 5000 },
    { id: 203, key: 'LC', legacy: 'gt', name: 'Nave grande de carga', capacity: 25000, speed: 7500 },
    { id: 204, key: 'LF', legacy: 'lj', name: 'Cazador ligero', capacity: 50, speed: 12500 },
    { id: 205, key: 'HF', legacy: 'sj', name: 'Cazador pesado', capacity: 100, speed: 10000 },
    { id: 206, key: 'CR', legacy: 'krz', name: 'Crucero', capacity: 800, speed: 15000 },
    { id: 207, key: 'BS', legacy: 'ss', name: 'Nave de batalla', capacity: 1500, speed: 10000 },
    { id: 208, key: 'COL', legacy: 'kolo', name: 'Colonizador', capacity: 7500, speed: 2500 },
    { id: 209, key: 'REC', legacy: 'rec', name: 'Reciclador', capacity: 20000, speed: 2000 },
    { id: 210, key: 'ESP', legacy: 'spio', name: 'Sonda de espionaje', capacity: 5, speed: 100000000 },
    { id: 211, key: 'BOM', legacy: 'bomb', name: 'Bombardero', capacity: 500, speed: 4000 },
    { id: 212, key: 'SAT', legacy: 'sat', name: 'Satélite solar', capacity: 0, speed: 0 },
    { id: 213, key: 'DEST', legacy: 'zerri', name: 'Destructor', capacity: 2000, speed: 5000 },
    { id: 214, key: 'RIP', legacy: 'ds', name: 'Estrella de la muerte', capacity: 1000000, speed: 100 },
    { id: 215, key: 'BC', legacy: 'skrz', name: 'Acorazado', capacity: 750, speed: 10000 },
    // Modern v7+ Ships
    { id: 217, key: 'CRAW', legacy: 'craw', name: 'Taladrador (Crawler)', capacity: 0, speed: 0 },
    { id: 218, key: 'REAP', legacy: 'reap', name: 'Segador (Reaper)', capacity: 10000, speed: 7000 },
    { id: 219, key: 'PATH', legacy: 'path', name: 'Explorador (Pathfinder)', capacity: 10000, speed: 12000 }
];

export const SHIP_KEY_INDEX = {};
export const SHIP_ID_INDEX = {};
SHIPS.forEach((ship, idx) => {
    SHIP_KEY_INDEX[ship.key] = idx;
    SHIP_ID_INDEX[ship.id] = idx;
    if (ship.legacy) SHIP_KEY_INDEX[ship.legacy] = idx;
});

export const PLAYER_CLASSES = {
    NONE: 0,
    COLLECTOR: 1,
    GENERAL: 2,
    DISCOVERER: 3
};

export const ALLIANCE_CLASSES = {
    NONE: 0,
    TRADER: 1,
    WARRIORS: 2,
    RESEARCHERS: 3
};

export const LIFEFORMS = {
    NONE: 0,
    HUMANS: 1,
    ROCKTAL: 2,
    MECHAS: 3,
    KAELESH: 4
};

