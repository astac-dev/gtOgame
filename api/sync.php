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
    if (isset($payload['type']) && $payload['type'] === 'galaxy' && !empty($payload['planets'])) {
        foreach ($payload['planets'] as $p) {
            $key = $p['galaxy'] . ':' . $p['system'] . ':' . $p['position'] . ':' . (!empty($p['isMoon']) ? 1 : 0);
            $p['coordKey'] = $key;
            $p['updatedAt'] = !empty($p['updatedAt']) ? $p['updatedAt'] : round(microtime(true) * 1000);
            $planets[$key] = $p;
            $savedCount++;
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
