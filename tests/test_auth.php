<?php
define("GALAXYTOOL_ROOT", realpath(__DIR__ . '/..'));
define("VERSION", "v5.1");

require GALAXYTOOL_ROOT . "/secret/includes/autoloader.class.php";
spl_autoload_register('AutoLoader::ClassLoader');
spl_autoload_register('AutoLoader::ModelLoader');

require GALAXYTOOL_ROOT . "/languages/english.inc.php";

$dbhost = "localhost";
$dbname = "galaxytool_dev";
$dbusername = "root";
$dbpassword = "";

$utablename = "gt_usertable";
$playertable = "gt_players";
$iptablename = "gt_iptable";
$default_language = "english";

session_name("gt_test_session");
session_start();

try {
    $auth = new Authorization($utablename, $playertable, $iptablename, $default_language, "admin", "admin123456");
    $userId = $auth->get_setting(iAuthorization::setting_userid);
    if (!empty($userId)) {
        echo "[PASS] Admin authentication successful! User ID: " . $userId . "\n";
        echo "[PASS] Username: " . $auth->get_setting(iAuthorization::setting_username) . "\n";
        echo "[PASS] Is Admin: " . ($auth->get_permission(iAuthorization::permission_is_admin) ? "YES" : "NO") . "\n";
    } else {
        echo "[FAIL] Authentication failed: ";
        $err = $auth->get_error_object();
        echo ($err ? $err->get_plain_message_text() : "Unknown error") . "\n";
    }
} catch (Exception $e) {
    echo "[FAIL] Exception during auth: " . $e->getMessage() . "\n";
}
