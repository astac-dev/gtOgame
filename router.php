<?php
/**
 * Local Development Server Router
 * Ensures proper UTF-8 charset headers and seamless redirects.
 */

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . $path;

if ($path === '/' || $path === '/index.php') {
    if (!isset($_GET['legacy'])) {
        header('Location: /dashboard/');
        exit();
    }
}

if ($path !== '/' && file_exists($file) && !is_dir($file)) {
    $ext = pathinfo($file, PATHINFO_EXTENSION);
    if ($ext === 'js') {
        header('Content-Type: application/javascript; charset=UTF-8');
        header('Access-Control-Allow-Origin: *');
        readfile($file);
        exit();
    }
    if ($ext === 'json') {
        header('Content-Type: application/json; charset=UTF-8');
        header('Access-Control-Allow-Origin: *');
        readfile($file);
        exit();
    }
    if ($ext === 'css') {
        header('Content-Type: text/css; charset=UTF-8');
        readfile($file);
        exit();
    }
    return false;
}

return false;
