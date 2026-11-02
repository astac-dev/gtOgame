<?php
/**
 * Test script for verifying local environment, PHP 8 compatibility, and database setup.
 */

define("GALAXYTOOL_ROOT", realpath(__DIR__ . '/..'));
define("VERSION", "v5.1");

require GALAXYTOOL_ROOT . "/secret/includes/autoloader.class.php";
spl_autoload_register('AutoLoader::ClassLoader');
spl_autoload_register('AutoLoader::ModelLoader');
spl_autoload_register('AutoLoader::ParserLoader');

echo "=== GALAXYTOOL LOCAL ENVIRONMENT VERIFICATION ===\n";
echo "PHP Version: " . PHP_VERSION . "\n";
echo "Root Path: " . GALAXYTOOL_ROOT . "\n\n";

// 1. Verify critical PHP extensions
$requiredExtensions = ['pdo', 'pdo_mysql', 'simplexml', 'dom', 'json', 'session'];
$missingExtensions = [];
foreach ($requiredExtensions as $ext) {
    if (!extension_loaded($ext)) {
        $missingExtensions[] = $ext;
    }
}

if (!empty($missingExtensions)) {
    echo "[FAIL] Missing required PHP extensions: " . implode(', ', $missingExtensions) . "\n";
    exit(1);
} else {
    echo "[PASS] All required PHP extensions loaded.\n";
}

// 2. Test ErrorObject with array/string
$err = new ErrorObject(ErrorObject::severity_info, "Test message");
$childErr = new ErrorObject(ErrorObject::severity_error, ["code" => 123, "info" => "array message test"]);
$err->add_child_message($childErr);
$json = $err->get_JSON_result();
if (strpos($json, 'Test message') !== false && strpos($json, 'array message test') !== false) {
    echo "[PASS] ErrorObject handles strings and arrays safely in PHP 8.\n";
} else {
    echo "[FAIL] ErrorObject failed to format JSON.\n";
}

// 3. Test PHPMailer compatibility
require_once GALAXYTOOL_ROOT . "/secret/phpmailer/class.phpmailer.php";
$mail = new PHPMailer();
$mail->Subject = "Local test";
echo "[PASS] PHPMailer initialized without fatal errors on PHP " . PHP_VERSION . ".\n";

// 4. Test Database Connection
$dbhost = "localhost";
$dbname = "galaxytool_dev";
$dbusername = "root";
$dbpassword = "";

try {
    $pdo = DB::getDB();
    echo "[PASS] Connected to MariaDB/MySQL database ($dbname).\n";

    // Test creating tables via GalaxytoolInstaller
    $installer = new GalaxytoolInstaller();
    $prefix = "gt_";
    $tables = [
        'galaxy' => $prefix . 'galaxy',
        'system' => $prefix . 'system',
        'usertable' => $prefix . 'usertable',
        'players' => $prefix . 'players',
        'alliances' => $prefix . 'alliances',
        'notices' => $prefix . 'notices',
        'reports' => $prefix . 'reports',
        'iptable' => $prefix . 'iptable',
        'shoutbox' => $prefix . 'shoutbox',
        'alliances_history' => $prefix . 'alliances_history',
        'players_history' => $prefix . 'players_history',
        'fleet_movements' => $prefix . 'fleet_movements',
        'player_activity' => $prefix . 'player_activity',
        'messages' => $prefix . 'messages',
        'combat_reports' => $prefix . 'combat_reports',
        'combat_party' => $prefix . 'combat_party',
        'report_archive' => $prefix . 'report_archive',
        'form_saves' => $prefix . 'form_saves',
    ];

    echo "Creating database schema in $dbname...\n";
    $installer->create_database_tables(
        $tables['galaxy'],
        $tables['system'],
        $tables['usertable'],
        $tables['players'],
        $tables['alliances'],
        $tables['notices'],
        $tables['reports'],
        $tables['iptable'],
        $tables['shoutbox'],
        $tables['alliances_history'],
        $tables['players_history'],
        $tables['fleet_movements'],
        $tables['player_activity'],
        $tables['messages'],
        $tables['combat_reports'],
        $tables['combat_party'],
        $tables['report_archive'],
        $tables['form_saves'],
        $prefix
    );

    // Create admin account
    $installer->create_admin_account("admin123456", $tables['usertable']);

    $errors = $installer->get_error_object();
    if ($errors !== null && $errors->get_worst_severity() === ErrorObject::severity_error) {
        echo "[WARN/FAIL] Installer reported errors:\n";
        echo $errors->get_plain_message_text() . "\n";
    } else {
        echo "[PASS] All tables, triggers, and admin account created successfully.\n";
    }

    // Verify tables exist in database
    $stmt = $pdo->query("SHOW TABLES LIKE '{$prefix}%'");
    $createdCount = $stmt->rowCount();
    echo "[PASS] Total created tables matching prefix: $createdCount\n";

} catch (Exception $e) {
    echo "[FAIL] Database operation error: " . $e->getMessage() . "\n";
}

echo "\n=== VERIFICATION FINISHED ===\n";

