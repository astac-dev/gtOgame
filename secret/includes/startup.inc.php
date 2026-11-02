<?php

/**
 * The following lines will always be executed one the config file is loaded. Add all central settings here
 */

// php5.3 requires time zone to be defined to avoid warnings - we explicitly want to use the server time zone here to be in sync with mysql
@date_default_timezone_set(date_default_timezone_get());

require_once GALAXYTOOL_ROOT . "/secret/version.php";

require_once GALAXYTOOL_ROOT . "/secret/includes/autoloader.class.php";
spl_autoload_register('AutoLoader::ClassLoader');
spl_autoload_register('AutoLoader::ModelLoader');

if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
	session_name(preg_replace("/[^a-zA-Z0-9_]/i", "", GALAXYTOOL_ROOT));
}
