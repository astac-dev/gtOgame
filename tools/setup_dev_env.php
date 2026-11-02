<?php
/**
 * Setup script for local development environment.
 * Generates config files and provisions local database.
 */

define("GALAXYTOOL_ROOT", realpath(__DIR__ . '/..'));
define("VERSION", "v5.1");

require GALAXYTOOL_ROOT . "/secret/includes/autoloader.class.php";
spl_autoload_register('AutoLoader::ClassLoader');
spl_autoload_register('AutoLoader::ModelLoader');
spl_autoload_register('AutoLoader::ParserLoader');

$dbhost = "localhost";
$dbname = "galaxytool_dev";
$dbusername = "root";
$dbpassword = "";
$dbprefix = "gt_";

echo "Provisioning local development configuration...\n";

// 1. Write config/config.php
$resConfig = GalaxytoolInstaller::write_config_file(
    $dbusername, $dbpassword, $dbname, $dbhost, $dbprefix
);
if ($resConfig > 0) {
    echo "[OK] config/config.php generated successfully.\n";
} else {
    echo "[ERR] Failed to write config/config.php\n";
    exit(1);
}

// 2. Write config/attributes.php
$resAttr = GalaxytoolInstaller::write_attribute_file(
    "Local Admin",
    15,
    "admin@example.local",
    "galaxytool@example.local",
    false,
    "spanish",
    "UniDev",
    false,
    30,
    1,
    "",
    "smtp.example.local",
    "user",
    "pass",
    "",
    25
);
if ($resAttr > 0) {
    echo "[OK] config/attributes.php generated successfully.\n";
} else {
    echo "[ERR] Failed to write config/attributes.php\n";
    exit(1);
}

// 3. Provision tables & default admin user
require_once GALAXYTOOL_ROOT . "/config/config.php";

$installer = new GalaxytoolInstaller();
$installer->create_database_tables(
    $dbtablename, $systemtablename, $utablename, $playertable, $allytable, $noticetable,
    $reporttable, $iptablename, $shouttable, $allyhistory, $playerhistory, $fleetmovetable,
    $player_activity, $messagetable, $combattable, $combatparty, $reportarchive,
    $formtable, $dbprefix
);

// Check if admin already exists
$checkStmt = DB::getDB()->prepare("SELECT id FROM $utablename WHERE username='admin'");
$checkStmt->execute();
if ($checkStmt->rowCount() === 0) {
    $installer->create_admin_account("admin123456", $utablename);
    echo "[OK] Admin account created (Username: admin, Password: admin123456).\n";
} else {
    echo "[INFO] Admin account already exists.\n";
}

echo "[SUCCESS] Local development environment configured and ready!\n";

