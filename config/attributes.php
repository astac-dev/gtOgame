<?php

define('OGAME_URL','');

/**
 * Set your name here. It will be shown at the logon page.
 */
$owner       = 'Local Admin';

/**
 * Settings for shoutbox = maximum number of shout entries
 *
 */
$maxshouts   = 15;

/**
 * The user at this address will be informed about new registrations
 */
$email_to   = 'admin@example.local';

/**
 * This address will be shown as sender of the email
 */
$email_from = 'galaxytool@example.local';

/**
 * settings for phpmailer - only needed if you server cannot send emails
 */
$usePHPMailer        = false;	// use phpmailer ? (true | false)
$phpmailerHost       = "smtp.prov.dom";	// smtp hostname
$phpmailerUser       = "user@prov.dom";	// smtp username
$phpmailerPass       = "password";	// smtp password
$phpmailerSMTPSecure = "";	// smtp authentication method (ssl)
$phpmailerPort       = "";	// smtp port - enter number directly - without "" !

/**
 * choose your default language
* the following are available:
* balkan,brazilian,bulgarian,chinese,croatian,czech,danish,dutch,english,finnish,french,german,greek,
* hungarian,italian,japan,korean,latvian,lithuanian,norwegian,polish,portugues,romanian,russian,
* serbian,slovak,slovenian,swedish,spanish,taiwan,turkish
 */
$default_language = 'spanish';


/**
 * Don't forget to enter this since only data from this universe can be uploaded
 */
$global_universe = 'UniDev';

$def_to_debris = false; // set to true for ogame universe where attacked defense creates a debris field e.g. German U15
$debris_rate = 30;      // 30% is default for most universes (only used to be sent to online sims like Speedsim and Dragosim)
$speed_rate  = 1;       // increase this value if you are in a speed universe to get correct calculated VALUES for resources / 24 hours (default value is 1 )

?>