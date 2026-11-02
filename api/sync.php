<?php
/**
 * Galaxytool Modern - Local-First Asynchronous Sync API
 * Bridges in-game userscripts and standalone dashboard across origins.
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$dataDir = __DIR__ . '/../data';
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0777, true);
}

$planetsCacheFile = $dataDir . '/planets.json';
$reportsCacheFile = $dataDir . '/reports.json';

function cleanPlanetName($name, $pos) {
    if (empty($name)) return "Planeta $pos";
    $s = trim($name);
    if (preg_match('/(\[\d+:\d+:\d+\]\s*[^\r\n]+)/', $s, $m)) {
        $s = $m[1];
    } else {
        $lines = preg_split('/[\r\n]+/', $s);
        foreach ($lines as $line) {
            $t = trim($line);
            if (!empty($t) && !preg_match('/^\d+$/', $t) && !preg_match('/^actividad/i', $t) && !preg_match('/^(?:transporte|espionaje|atacar|mostrar|jugador|vigilar)/i', $t)) {
                $s = $t;
                break;
            }
        }
    }
    $s = preg_replace('/\s*(?:Transporte|Mantener\s+posici[oó]n|Espionaje|Informe\s+de\s+espionaje|Atacar|Mostrar\s+la\s+informaci[oó]n|Jugador\s+en\s+modo|Actividad:|Vigilar|Granja|Objetivo|Ataque|Desplegar|Recolectar)[\s\S]*/i', '', $s);
    $s = preg_replace('/^\d+\s+/', '', trim($s));
    return !empty($s) ? $s : "Planeta $pos";
}

// Load existing memory/cache
$planets = file_exists($planetsCacheFile) ? json_decode(file_get_contents($planetsCacheFile), true) : [];
$reports = file_exists($reportsCacheFile) ? json_decode(file_get_contents($reportsCacheFile), true) : [];

if (!is_array($planets)) $planets = [];
if (!is_array($reports)) $reports = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);

    if (!$payload) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Invalid JSON']);
        exit();
    }

    $savedCount = 0;

    // Handle Galaxy payload
    if (isset($payload['type']) && $payload['type'] === 'galaxy') {
        $g = isset($payload['galaxy']) ? (int)$payload['galaxy'] : null;
        $s = isset($payload['system']) ? (int)$payload['system'] : null;

        // 1. Purge all existing records for this specific solar system to remove deleted/vacated planets
        if ($g !== null && $s !== null) {
            foreach ($planets as $key => $p) {
                if ((int)$p['galaxy'] === $g && (int)$p['system'] === $s) {
                    unset($planets[$key]);
                }
            }
        }

        // 2. Insert updated celestial bodies (if any)
        if (!empty($payload['planets']) && is_array($payload['planets'])) {
            foreach ($payload['planets'] as $p) {
                $key = $p['galaxy'] . ':' . $p['system'] . ':' . $p['position'] . ':' . (!empty($p['isMoon']) ? 1 : 0);
                $p['coordKey'] = $key;
                $p['updatedAt'] = !empty($p['updatedAt']) ? $p['updatedAt'] : round(microtime(true) * 1000);
                if (empty($p['isMoon'])) {
                    $p['planetName'] = cleanPlanetName($p['planetName'] ?? '', (int)$p['position']);
                    $p['name'] = $p['planetName'];
                }
                $planets[$key] = $p;
                $savedCount++;
            }
        }
    } else if (isset($payload['type']) && $payload['type'] === 'report' && !empty($payload['data'])) {
        $r = $payload['data'];
        $id = !empty($r['id']) ? $r['id'] : count($reports) + 1;
        $r['id'] = $id;
        $reports[$id] = $r;
        $savedCount++;
    } else if (!empty($payload['planets'])) {
        // Direct list of planets
        foreach ($payload['planets'] as $p) {
            $key = $p['galaxy'] . ':' . $p['system'] . ':' . $p['position'] . ':' . (!empty($p['isMoon']) ? 1 : 0);
            $p['coordKey'] = $key;
            $p['updatedAt'] = !empty($p['updatedAt']) ? $p['updatedAt'] : round(microtime(true) * 1000);
            if (empty($p['isMoon'])) {
                $p['planetName'] = cleanPlanetName($p['planetName'] ?? '', (int)$p['position']);
                $p['name'] = $p['planetName'];
            }
            $planets[$key] = $p;
            $savedCount++;
        }
    }

    // Persist cache files
    file_put_contents($planetsCacheFile, json_encode($planets, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    file_put_contents($reportsCacheFile, json_encode($reports, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'saved' => $savedCount,
        'totalPlanets' => count($planets),
        'totalReports' => count($reports),
        'timestamp' => time()
    ]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    header('Content-Type: application/json');
    
    // Check if filtering by system
    $g = isset($_GET['galaxy']) ? (int)$_GET['galaxy'] : (isset($_GET['g']) ? (int)$_GET['g'] : null);
    $s = isset($_GET['system']) ? (int)$_GET['system'] : (isset($_GET['s']) ? (int)$_GET['s'] : null);

    if ($g !== null && $s !== null) {
        $filtered = [];
        foreach ($planets as $p) {
            if ($p['galaxy'] === $g && $p['system'] === $s) {
                $filtered[] = $p;
            }
        }
        usort($filtered, function($a, $b) { return $a['position'] <=> $b['position']; });
        echo json_encode([
            'galaxy' => $g,
            'system' => $s,
            'planets' => $filtered
        ]);
        exit();
    }

    echo json_encode([
        'planets' => array_values($planets),
        'reports' => array_values($reports),
        'totalPlanets' => count($planets),
        'totalReports' => count($reports)
    ]);
    exit();
}

