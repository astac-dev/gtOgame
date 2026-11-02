# 🧠 MEMORIA DE DESARROLLO - GALAXYTOOL

Este documento constituye la bitácora técnica oficial, registro de arquitectura, diagnóstico de seguridad y memoria de cambios del proyecto **Galaxytool**.

---

## 📌 1. Ficha Técnica y Contexto del Proyecto

* **Nombre del Software:** Galaxytool (Galaxietool)
* **Versión Base:** `v5.1` (Plugin versión: `2.6.12`)
* **Autor Original:** Christian Lehmann (2005 - 2013)
* **Propósito del Software:** Plataforma web de cartografía, base de datos militar, registro de informes de espionaje/combate, seguimiento de flotas y estadísticas de crecimiento para alianzas del juego online de navegador **OGame** (*Gameforge*).
* **Entorno de Trabajo Detectado:**
  * **Sistema Operativo:** Windows
  * **Intérprete PHP:** PHP 8.5.1 (CLI) / PHP 8.2.12 (XAMPP)
  * **Gestor de Base de Datos:** MariaDB 10.4.32 (XAMPP)
  * **Frontend:** HTML5, CSS3, JavaScript, Dojo Toolkit 1.8 (Dijit / Claro theme)

---

## 🔍 2. Auditoría Inicial de Seguridad (Aplicación de la Regla 1)

En estricto cumplimiento de la **Regla 1 ("La seguridad del proyecto es primero, se debe analizar cualquier vulnerabilidad en todo momento")**, se ejecutó un análisis estático y dinámico del código base heredado, identificando los siguientes vectores y riesgos:

| ID | Área Afectada | Tipo de Vulnerabilidad / Riesgo | Diagnóstico y Nivel de Severidad |
| :--- | :--- | :--- | :--- |
| **SEC-01** | `Authorization.inc.php`, `UserManagement.inc.php` | **Criptografía Débil (MD5 + Salt simple)** | **Alta:** Las contraseñas se almacenaban con `md5(CONCAT(salt, md5(pass), md5(salt)))`. Este esquema es susceptible a colisiones y ataques masivos por fuerza bruta en GPUs. |
| **SEC-02** | `UserManagement.inc.php` | **Inyección SQL Potencial** | **Alta:** Presencia de concatenación directa de variables en consultas UPDATE (`userpass=md5(CONCAT(..., '$userpass', ...))` y cláusulas `WHERE id=$id`). |
| **SEC-03** | `secret/phpmailer/` | **Dependencia Crítica Obsoleta (PHPMailer 5.2)** | **Crítica:** Librería de 2011 con CVEs conocidos de ejecución remota de código (CVE-2016-10033 / CVE-2016-10045) e incompatibilidad fatal con PHP 8 (`each()`, `get_magic_quotes_runtime()`). |
| **SEC-04** | `secret/parser/` | **Riesgo de Inyección XXE (XML External Entity)** | **Media:** Módulos de procesamiento XML (`DOMDocument`, `SimpleXML`) que requieren verificación de deshabilitación de entidades externas para evitar lectura no autorizada de archivos locales del servidor. |
| **SEC-05** | `GalaxytoolInstaller.inc.php` | **Telemetría Insegura a Dominio Huérfano** | **Baja/Media:** Método `send_feedback()` intentaba abrir conexiones HTTP a `galaxytool.eu`, lo cual provocaba bloqueos de red y exponía metadatos de versiones locales. |
| **SEC-06** | `secret/firefox.php` | **Sanitización Incompleta en Ingesta de Datos** | **Media:** Uso de `stripslashes()` sin validación estricta previa del payload antes del parser. |

---

## 🛠️ 3. Registro de Actualizaciones Realizadas (Habilitación para Pruebas Locales)

Para permitir el arranque y la ejecución limpia de pruebas en entornos modernos (**PHP 8.2 / PHP 8.5** y **MariaDB 10.4 / MySQL 8**), se aplicaron las siguientes actualizaciones:

### 3.1. Modernización de PHPMailer para PHP 8.x
* **Archivos modificados:**
  * [`secret/phpmailer/class.phpmailer.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/phpmailer/class.phpmailer.php) (Línea 1771): Sustitución del bucle obsoleto `while(list(, $line) = each($lines))` por `foreach ($lines as $line)`.
  * [`secret/phpmailer/class.smtp.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/phpmailer/class.smtp.php) (Líneas 391 y 420): Sustitución de bucles `@each($lines)` por `foreach`.
* **Resultado:** Eliminación del error fatal `Call to undefined function each()` que rompía cualquier proceso de envío de correos o recuperación de cuentas en PHP 8.

### 3.2. Robustecimiento de Manejo de Errores y DBHandler
* **Archivo modificado:** [`secret/includes/classes/ErrorObject.inc.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/includes/classes/ErrorObject.inc.php)
  * El constructor ahora normaliza el texto del mensaje: si se recibe un arreglo u objeto (por ejemplo, `$stmt->errorInfo()`), se serializa de forma segura mediante `json_encode()` para prevenir advertencias de `Array to string conversion` en PHP 8.
* **Archivo modificado:** [`secret/includes/classes/DBHandler.inc.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/includes/classes/DBHandler.inc.php)
  * Captura y conversión limpia de excepciones `PDOException`.

### 3.3. Compatibilidad con SQL Moderno (Modo Estricto y Palabras Reservadas)
* **Archivos modificados:**
  * [`secret/includes/classes/DB.inc.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/includes/classes/DB.inc.php)
  * [`secret/ajax/ajax_install.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/ajax/ajax_install.php)
* **Problema resuelto:** Los motores modernos de MySQL/MariaDB activan por defecto `NO_ZERO_DATE` y `NO_ZERO_IN_DATE`, bloqueando la creación de 10 de las 18 tablas debido a campos con `DEFAULT '0000-00-00 00:00:00'` (`ERROR 1067: Invalid default value`).
* **Solución aplicada:** Se agregó `DB::$pdo->query("SET SESSION sql_mode = '';");` de forma transparente al conectar.
* **Conflicto de palabra reservada `RETURNING`:**
  * En MariaDB 10.4+, `RETURNING` es una cláusula SQL reservada.
  * Se corrigió la definición de la columna en [`secret/includes/classes/GalaxytoolInstaller.inc.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/includes/classes/GalaxytoolInstaller.inc.php) y en [`secret/parser/FleetMovementParser.inc.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/parser/FleetMovementParser.inc.php) envolviéndola en backticks: `` `returning` ``.

### 3.4. Eliminación de Telemetría Externa Innecesaria
* **Archivo modificado:** [`secret/includes/classes/GalaxytoolInstaller.inc.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/includes/classes/GalaxytoolInstaller.inc.php)
* Se neutralizó el método `send_feedback()` para evitar intentos de conexión hacia el dominio inactivo `galaxytool.eu`, eliminando bloqueos de tiempo de espera (*timeouts*).

### 3.5. Corrección de Bug de Puerto SMTP
* **Archivo modificado:** [`secret/ajax/ajax_install.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/ajax/ajax_install.php)
* Se corrigió un error tipográfico histórico donde `$SMPT_port` leía erróneamente `$_POST['SMPT_host']`. Ahora lee correctamente `$_POST['SMPT_port']` con fallback al puerto 25.

### 3.6. Aislamiento y Resiliencia en Arranque de Sesiones y Clases
* **Archivos modificados:**
  * [`secret/includes/startup.inc.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/includes/startup.inc.php)
  * [`secret/includes/autoloader.class.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/includes/autoloader.class.php)
  * [`secret/_general_header.inc.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/_general_header.inc.php)
  * [`secret/ajax/_general_header.inc.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/ajax/_general_header.inc.php)
  * [`secret/includes/classes/Authorization.inc.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/secret/includes/classes/Authorization.inc.php)
* Se acondicionaron las llamadas a `session_start()` y `session_name()` comprobando previamente `PHP_SESSION_NONE` y `!headers_sent()`.
* Se implementaron comprobaciones defensivas para `$_SERVER['HTTP_HOST']` y `$_SERVER['PHP_SELF']` permitiendo la ejecución tanto en servidor web como mediante scripts CLI y pruebas automatizadas.

---

## 🧪 4. Herramientas y Entorno de Pruebas Locales Creado

Se han incorporado utilidades en el proyecto para facilitar y acelerar las pruebas locales:

1. **Suite de Comprobación del Entorno Local:** [`tests/test_local_environment.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tests/test_local_environment.php)
   * Verifica extensiones requeridas (`pdo`, `pdo_mysql`, `simplexml`, etc.).
   * Valida compatibilidad de clases críticas.
   * Crea y verifica la totalidad de las 18 tablas e índices en la base de datos `galaxytool_dev`.
2. **Prueba de Autenticación:** [`tests/test_auth.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tests/test_auth.php)
   * Valida el ciclo completo de login de administrador contra la base de datos local.
3. **Aprovisionador de Desarrollo:** [`tools/setup_dev_env.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tools/setup_dev_env.php)
   * Genera automáticamente `config/config.php` y `config/attributes.php` listos para desarrollo local.
4. **Lanzadores del Servidor de Desarrollo:**
   * Iniciar: [`tools/start_dev_server.ps1`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tools/start_dev_server.ps1) / [`tools/start_dev_server.bat`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tools/start_dev_server.bat)
   * Detener: [`tools/stop_dev_server.ps1`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tools/stop_dev_server.ps1) / [`tools/stop_dev_server.bat`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tools/stop_dev_server.bat)

---

## 📊 5. Resultados de Verificación y Estado Actual

* **Sintaxis PHP:** 100% de los archivos PHP verificados sin errores sintácticos (`php -l`).
* **Base de Datos:** 18 tablas creadas exitosamente en MariaDB local (`galaxytool_dev`):
  * `gt_galaxy`, `gt_system`, `gt_usertable`, `gt_players`, `gt_alliances`, `gt_notices`, `gt_reports`, `gt_iptable`, `gt_shoutbox`, `gt_alliances_history`, `gt_players_history`, `gt_fleet_movements`, `gt_player_activity`, `gt_messages`, `gt_combat_reports`, `gt_combat_party`, `gt_report_archive`, `gt_form_saves`.
* **Triggers de Base de Datos:** Creados y activos sin errores.
* **Autenticación:** Usuario `admin` autenticado con rol de Administrador exitosamente.
* **Servidor HTTP:** Probado en `http://localhost:8080/index.php` con respuesta HTTP **200 OK**.

---

## 🚀 6. Hoja de Ruta (Roadmap) y Próximos Pasos

1. **Fase 1 (Seguridad Criptográfica):** Implementar la migración transparente de contraseñas de MD5 a `password_hash()` con algoritmo **Argon2id** o **Bcrypt** en `Authorization.inc.php`.
2. **Fase 2 (Blindaje SQL):** Refactorizar las consultas de `UserManagement.inc.php` para eliminar cualquier concatenación directa residual.
3. **Fase 3 (Modernización PHPMailer / Mailer API):** Reemplazar la carpeta legada de PHPMailer 5.2 por una versión segura o un conector SMTP nativo y ligero en PHP 8.
4. **Fase 4 (Blindaje de Parsers y XML):** Auditar los esquemas XSD y llamadas a `DOMDocument` para asegurar que `LIBXML_NONET` esté activo en todos los parsers.

---

## 💡 7. Nueva Dirección Estratégica: Arquitectura Local-First y Zero-Database

Conforme al requerimiento de reestructuración, se completó la investigación técnica sobre la evolución del proyecto hacia un modelo **Serverless / Local-First**:
* **Documento rector:** [`SUGERENCIAS_REESTRUCTURACION.md`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/SUGERENCIAS_REESTRUCTURACION.md).
* **Pilares de la Reestructuración:**
  1. **Catálogo Completo de Flotas Modernas (v7.0 - v11+):** Incorporación de las naves omitidas en GT 5.1: Taladrador (`CRAW` - 217), Segador (`REAP` - 218) y Explorador (`PATH` - 219), junto con soporte de Clases de Jugador (Recolector, General, Descubridor) y Formas de Vida (*Lifeforms*).
  2. **Modernización Radical de Interfaces (Dual UI):** Sustitución del arcaico Dojo 1.8 por un **HUD In-Game nativo en Shadow DOM** (Command Palette `Ctrl+K`, cálculo automático de naves en despacho de flotas, radar 24/7 de actividad) y un **Dashboard PWA responsive** con Tailwind CSS.
  3. **Almacenamiento Local en JSON / IndexedDB:** Desacoplamiento total de servidores MySQL/MariaDB. Uso de particionado galáctico y `.jsonl` para reportes continuos.
  4. **Transmisión In-Game por Chat de OGame:** Protocolo binario ultra-comprimido (de 1.2 KB a ~45 bytes) mediante bitpacking y difusión invisible por esteganografía de caracteres de ancho cero (*Zero-Width Characters*).
  5. **Malla P2P WebRTC:** Sincronización masiva de galaxias entre miembros online de la alianza sin intermediación de servidores externos.
  6. **Cifrado E2EE (AES-256-GCM):** Blindaje total contra la inspección de tráfico por operadores del juego o terceros.

---

## ⚡ 8. Ejecución de la Fase 1: Núcleo de Serialización, Cripto y Flota Moderna (Completada)

* **Regla 6 Aplicada:** Se actualizó [`REGLAS_DESARROLLO.md`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/REGLAS_DESARROLLO.md) estableciendo que toda revisión visual del proyecto queda bajo la exclusiva potestad y juicio del usuario.
* **Plan de Trabajo Establecido:** Creado [`PLAN_TRABAJO.md`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/PLAN_TRABAJO.md) con 6 fases estructuradas.
* **Componentes Construidos y Validados:**
  1. [`src/core/constants.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/src/core/constants.js): Catálogo de 17 naves modernas (incluyendo IDs 217 Crawler, 218 Reaper, 219 Pathfinder), clases de jugador y formas de vida.
  2. [`src/core/encoder.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/src/core/encoder.js): Empaquetador binario que redujo reportes de espionaje a **35 bytes** (ahorro > 94% sobre JSON plano).
  3. [`src/core/crypto.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/src/core/crypto.js): Cifrado AES-256-GCM militar con derivación PBKDF2 y autenticación GCM (63 bytes finales con vector de inicialización de 12 bytes y Auth Tag).
  4. [`src/core/zero-width.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/src/core/zero-width.js): Motor esteganográfico que oculta los datos de inteligencia en mensajes cotidianos del chat de OGame mediante caracteres Unicode invisibles.
* **Resultados de Pruebas Unitarias:**
  * Suite [`tests/test_modern_core.mjs`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tests/test_modern_core.mjs): **22 pruebas ejecutadas, 22 aprobadas, 0 fallidas (100% éxito)**.

---

## 💾 9. Ejecución de la Fase 2: Motor de Persistencia Local-First & JSONL (Completada)

* **Objetivo Cumplido:** Desacoplamiento total de servidores de bases de datos relacionales externas (Zero MySQL). La inteligencia militar ahora persiste en almacenamiento local client-side.
* **Componentes Construidos y Validados:**
  1. [`src/storage/db.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/src/storage/db.js): Motor dual de almacenamiento estructurado:
     * **Modo Navegador:** **IndexedDB nativo** con almacenes de objetos indexados (`planets`, `reports`, `players`, `alliances`, `config`) sin librerías externas ni dependencias CDN.
     * **Modo Node/CLI:** Almacén en memoria de alto rendimiento para scripts de terminal, exportadores y pruebas automatizadas.
  2. [`src/storage/jsonl.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/src/storage/jsonl.js): Adaptador para el formato de intercambio **JSON Lines (`.jsonl`)** e implementador del algoritmo táctico militar `calculatePlunder()` (cálculo de naves de carga pequeñas, grandes y exploradores necesarias para saquear el 50% o 75% del botín).
* **Resultados de Pruebas Unitarias:**
  * Suite [`tests/test_storage.mjs`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tests/test_storage.mjs): **16 pruebas ejecutadas, 16 aprobadas, 0 fallidas (100% éxito)**.

---

## 🧩 10. Ejecución de la Fase 3: Userscript Base para Tampermonkey (Completada)

* **Objetivo Cumplido:** Construcción del script instalable cliente para `*.ogame.gameforge.com` con intercepción pasiva y empaquetado autónomo sin dependencias foráneas.
* **Componentes Construidos y Validados:**
  1. [`src/userscript/parser-galaxy.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/src/userscript/parser-galaxy.js): Parser de galaxia moderna (planetas, lunas, escombros, jugadores, alianzas e indicadores de actividad `*`/minutos).
  2. [`src/userscript/parser-reports.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/src/userscript/parser-reports.js): Parser de mensajes de espionaje con soporte completo para las 17 naves (Reaper, Pathfinder, Crawler), defensas y recursos.
  3. [`src/userscript/interceptor.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/src/userscript/interceptor.js): Interceptor pasivo no intrusivo sobre `window.fetch` y `XMLHttpRequest` (cumplimiento estricto Anti-Ban de la Regla 1).
  4. [`scripts/build-userscript.mjs`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/scripts/build-userscript.mjs): Bundler automatizado que compila los módulos en el archivo final.
  5. [`dist/galaxytool-modern.user.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/dist/galaxytool-modern.user.js): Userscript listo para instalar en Tampermonkey / Violentmonkey (45.59 KB, 100% autónomo).
* **Resultados de Pruebas Unitarias:**
  * Suite [`tests/test_userscript_integration.mjs`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tests/test_userscript_integration.mjs): **11 pruebas ejecutadas, 11 aprobadas, 0 fallidas (100% éxito)**.
  * **Balance Global del Nuevo Motor:** **49 pruebas unitarias ejecutadas, 49 aprobadas (100% éxito)** en Fases 1, 2 y 3.

---

## 📡 11. Ejecución de la Fase 4: Módulo de Transmisión In-Game por Chat (Completada)

* **Objetivo Cumplido:** Propagación autónoma y descentralizada de reportes de espionaje a través del chat de alianza de OGame mediante esteganografía Zero-Width y cifrado militar E2EE.
* **Componentes Construidos y Validados:**
  1. [`src/chat/chat-bus.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/src/chat/chat-bus.js): Bus asíncrono de sincronización bidireccional:
     * **Cola de emisión con Jitter humano (Anti-Ban):** Retardos aleatorios entre 3 y 6 segundos para imitar escritura humana.
     * **Frases de cobertura orgánica:** Inyecta la carga invisible detrás de textos naturales ("Buenas noches compañeros", "Revisando movimientos de flotas").
     * **Deduplicación:** Evita el reenvío de reportes ya compartidos mediante claves únicas `G:S:P:M:Timestamp`.
     * **Intercepción y descifrado en tiempo real:** Extrae la carga útil invisible, la descifra con la clave de la alianza y la almacena en el IndexedDB local del receptor.
     * **Aislamiento Criptográfico:** Si un rival o topo de otra alianza intercepta el chat, la carga es impenetrable y falla silenciosamente.
  2. [`dist/galaxytool-modern.user.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/dist/galaxytool-modern.user.js): Userscript actualizado y re-compilado integrando el `ChatSyncBus` (51.86 KB).
* **Resultados de Pruebas Unitarias:**
  * Suite [`tests/test_chat_sync.mjs`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tests/test_chat_sync.mjs): **17 pruebas ejecutadas, 17 aprobadas, 0 fallidas (100% éxito)**.
  * **Balance Acumulado del Proyecto:** **66 pruebas unitarias ejecutadas, 66 aprobadas (100% éxito)** en Fases 1, 2, 3 y 4.

---

## 🖥️ 12. Ejecución de la Fase 5: HUD In-Game Táctico en Shadow DOM (Completada)

* **Regla 6 Aplicada:** Toda revisión visual, validación de estética, usabilidad y paleta de colores de este HUD queda reservada para la inspección y dictamen exclusivo del usuario.
* **Componentes Construidos y Validados:**
  1. [`src/ui/hud.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/src/ui/hud.js): Capa táctica inyectada directamente en el juego:
     * **Aislamiento en Shadow DOM:** Estilos encapsulados con cero colisión sobre el CSS de OGame.
     * **Badge Táctico Flotante:** Acceso directo e indicador de sincronización en la esquina inferior derecha.
     * **Command Palette (`Ctrl + K` o `Alt + G`):** Buscador instantáneo con búsqueda difusa sobre planetas, coordenadas (`G:S:P`), lunas, alianzas e inactivos.
     * **Asistente de Despacho de Flota (Fleet Dispatch Auto-Filler):** Detecta si las coordenadas objetivo tienen reporte de espionaje previo y calcula automáticamente la carga requerida al 50% o 75%, inyectando con un clic el número exacto de naves de carga pequeñas (`SC`), grandes (`LC`) o exploradores (`PATH`) en los campos nativos de OGame.
  2. [`dist/galaxytool-modern.user.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/dist/galaxytool-modern.user.js): Userscript re-compilado incorporando el HUD completo (67.93 KB).
* **Resultados de Pruebas Unitarias:**
  * Suite [`tests/test_hud.mjs`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tests/test_hud.mjs): **11 pruebas ejecutadas, 11 aprobadas, 0 fallidas (100% éxito)**.
  * **Balance Acumulado Total del Proyecto:** **77 pruebas unitarias ejecutadas, 77 aprobadas (100% éxito)** en Fases 1, 2, 3, 4 y 5.

---

## 📱 13. Ejecución de la Fase 6: Dashboard Standalone PWA / Web (Completada)

* **Regla 6 Aplicada:** Siguiendo estrictamente la Regla 6 del proyecto, toda revisión visual, evaluación estética y de interfaz de usuario de este Dashboard queda a cargo exclusivo del usuario Alex en su navegador.
* **Objetivo Cumplido:** Panel de inteligencia táctico independiente, responsivo para móviles y ordenadores de escritorio, con funcionamiento 100% offline (PWA) y arquitectura local-first sin base de datos centralizada.
* **Componentes Construidos y Validados:**
  1. [`dashboard/index.html`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/dashboard/index.html):
     * Shell SPA moderna con diseño espacial oscuro (`slate-950` / `space-900`) y Tailwind CSS.
     * **Explorador de Galaxia:** Visualizador de sistemas (1:1 a 9:499) con las 15 posiciones solares, detalle de planetas, lunas, escombros, jugador, alianza, estado (`i`, `I`, `v`, `b`) y acciones directas.
     * **Radar de Inactivos & Buscador de Objetivos:** Filtrado de objetivos por rango de galaxias, estado inactivo (`i` 7d, `I` 28d+), umbral de botín mínimo y campos de escombros.
     * **Dossier de Inteligencia & Reportes:** Archivo de espionajes con modal emergente detallado (las 17 naves modernas, recursos, defensas, formas de vida y cálculos de naves).
     * **Calculadora Táctica de Granjeo:** Simulador interactivo de botín (50%, 75% Descubridor, 100% Bandido) con cómputo automático de naves de carga pequeñas (`SC`), grandes (`LC`) y exploradores (`PATH`).
     * **Gestión de Inteligencia & Respaldo:** Exportación e importación en formato estándar JSON Lines (`.jsonl`), generador de datos demo de prueba y vaciado seguro de datos.
  2. [`dashboard/app.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/dashboard/app.js):
     * Controlador SPA reactivo que interactúa directamente con `indexedDB` (`OGameGalaxytoolDB`).
     * Soporte íntegro de las 17 naves modernas de OGame v7 - v11+ (Reaper ID 218, Pathfinder ID 219, Crawler ID 217).
     * Generador de datos de prueba (8 planetas en 3 sistemas, reportes con flotas modernas) para pruebas locales inmediatas.
  3. [`dashboard/manifest.json`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/dashboard/manifest.json):
     * Manifiesto Web App para instalación en smartphones (Android/iOS) y escritorio como aplicación nativa PWA.
  4. [`dashboard/sw.js`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/dashboard/sw.js):
     * Service Worker con estrategia de caché offline para ejecución autónoma sin conexión a internet.
  5. [`tests/test_dashboard.mjs`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tests/test_dashboard.mjs):
     * Suite de pruebas automatizadas validando integridad de manifiesto, service worker, catálogo de 17 naves, cálculos tácticos de carga y filtrado de objetivos inactivos.
* **Resultados de Pruebas Unitarias:**
  * Suite [`tests/test_dashboard.mjs`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tests/test_dashboard.mjs): **7 pruebas ejecutadas, 7 aprobadas, 0 fallidas (100% éxito)**.
  * **Balance Final Total del Proyecto:** **84 pruebas unitarias ejecutadas, 84 aprobadas (100% éxito)** a lo largo de las 6 fases del plan de trabajo.

---

## 📌 14. Regla 7: Operación Exclusiva de Galaxytool Modern (Sin Base de Datos SQL)

* **Directriz del Usuario:** No abrir ni interactuar con el modelo monolítico viejo (Galaxytool v5.x con servidor MySQL/MariaDB). Toda prueba, visualización e interacción se enfoca exclusivamente en el modelo moderno sin base de datos SQL.
* **Acciones Implementadas:**
  1. **Incorporación de Regla 7 en [`REGLAS_DESARROLLO.md`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/REGLAS_DESARROLLO.md):** Formalización de la política de ejecución exclusiva de Galaxytool Modern (v6+), arquitectura local-first basada en `IndexedDB`, almacenamiento en memoria, persistencia en archivos planos JSON y userscripts en Tampermonkey sin servidor MySQL.
  2. **Enrutamiento por Defecto en [`index.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/index.php):** Se añadió redirección automática en la raíz del servidor web (`/`) hacia `/dashboard/` (`Location: dashboard/`), impidiendo que el usuario acceda por accidente al viejo login con dependencia de MySQL.
  3. **Punto de Entrada Oficial:**
     * Dashboard: [http://localhost:8080/dashboard/](http://localhost:8080/dashboard/) (o directamente [http://localhost:8080/](http://localhost:8080/)).








