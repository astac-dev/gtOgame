# 📜 LIBRO DE REGLAS DE DESARROLLO - GALAXYTOOL

Este documento define las políticas, estándares de ingeniería y directrices de seguridad obligatorias para el mantenimiento, modernización y evolución del proyecto **Galaxytool**.

---

## 🛡️ Regla 1: La seguridad del proyecto es primero, se debe analizar cualquier vulnerabilidad en todo momento.

> **Principio Fundamental:** Ningún cambio de código, optimización o nueva característica puede ser implementada si compromete o desconoce la postura de seguridad de la aplicación. Cada componente, entrada de datos y comunicación debe auditarse bajo el supuesto de amenaza hostil (Zero Trust).

### 1.1. Inyección SQL (SQL Injection - SQLi)
* **Prohibición absoluta:** Queda estrictamente prohibida la concatenación directa o interpolación de variables no sanitizadas o entradas de usuario en sentencias SQL (`$query .= "WHERE id = " . $_GET['id']`).
* **Prepared Statements obligatorios:** Toda consulta con parámetros dinámicos debe usar sentencias preparadas con **PDO** (`prepare()`, `bindValue()` o `bindParam()`).
* **Tipado estricto:** Los identificadores numéricos deben forzarse mediante casting estricto (`intval()`, `(int)`) antes de interactuar con la base de datos.
* **Comillado de identificadores reservados:** Nombres de tablas o columnas que colisionen con palabras reservadas de SQL modernos (como `` `returning` `` en MariaDB/MySQL 8) deben ir siempre entre comillas invertidas (*backticks*).

### 1.2. Ataques de Falsificación y Secuestro de Sesión (Session Hijacking & Fixation)
* **Regeneración de sesión:** Tras un cambio de privilegio o autenticación exitosa, el ID de sesión debe regenerarse (`session_regenerate_id(true)`).
* **Parámetros seguros de cookies:** Las cookies de sesión deben tener las directivas `HttpOnly`, `SameSite=Lax` (o `Strict`), y `Secure` si se opera bajo HTTPS.
* **Aislamiento de sesión:** La clave y nombre de sesión deben continuar vinculados al `GALAXYTOOL_ROOT` para evitar colisiones entre instancias virtuales del mismo host.

### 1.3. Cross-Site Scripting (XSS) y Sanitización de Salida
* Toda salida proyectada en vistas HTML o inyectada en payloads JSON/JS debe ser neutralizada con `htmlspecialchars($data, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')`.
* No confiar en `strip_tags()` como único mecanismo de desinfección, ya que no protege contra atributos maliciosos en eventos JS (`onload`, `onerror`).

### 1.4. Inyección de Entidades Externas XML (XXE)
* Debido a que Galaxytool procesa volcados XML de batallas, espionajes y la API de OGame (`secret/parser/` y `firefox.php`):
  * Se debe garantizar que la carga de entidades externas esté desactivada (`libxml_disable_entity_loader(true)` en versiones anteriores a PHP 8 o banderas `LIBXML_NONET` en `DOMDocument` y `SimpleXML`).
  * Validar estrictamente la estructura contra los esquemas XSD locales antes de manipular el árbol DOM.

### 1.5. Criptografía y Hashing de Contraseñas
* **Obsolescencia de MD5:** El esquema histórico basado en `md5($salt . md5($pass) . md5($salt))` está formalmente clasificado como **vulnerable** ante ataques modernos de GPU / tablas arcoíris.
* **Estrategia de Migración Transparente:**
  * Toda nueva credencial o cambio de contraseña debe generarse con `password_hash($pass, PASSWORD_DEFAULT)` o `PASSWORD_ARGON2ID`.
  * En el inicio de sesión (`Authorization.inc.php`), si se detecta un hash MD5 legado válido, se autenticará y rehasheará automáticamente al estándar moderno en la base de datos sin requerir fricción al usuario.

### 1.6. Auditoría y Eliminación de Código Tercero Inseguro
* Componentes externos heredados (como PHPMailer 5.2 con vulnerabilidades CVE-2016-10033 / CVE-2016-10045) deben ser actualizados, parcheados o reemplazados por alternativas modernas que cumplan con los estándares actuales de seguridad.
* Erradicar llamadas de telemetría a dominios externos extintos (`galaxytool.eu`, `galaxietool.de`) que puedan derivar en fuga de metadatos o ataques Man-in-the-Middle (MitM).

---

## ⚙️ Regla 2: Compatibilidad Estricta y Modernización con PHP 8.x+
1. El código base debe ejecutarse sin errores fatales, advertencias (`warnings`) ni avisos de obsolescencia (`notices` / `deprecations`) en versiones de PHP contemporáneas (**PHP 8.1, 8.2, 8.3, 8.4 y 8.5**).
2. Está prohibido el uso de APIs y construcciones obsoletas o eliminadas en PHP 8:
   * ❌ `each()`, `create_function()`, `get_magic_quotes_gpc()`, `get_magic_quotes_runtime()`.
   * ❌ Acceso a caracteres de cadena con llaves `$cadena{0}` (usar `$cadena[0]`).
   * ❌ Invocación estática de métodos no estáticos.
3. El motor de base de datos debe ser compatible con motores relacionales modernos (**MariaDB 10.4+ / MySQL 8.0+**) respetando el modo estricto (`STRICT_TRANS_TABLES`, `NO_ZERO_DATE`).

---

## 📝 Regla 3: Trazabilidad y Memoria Viva del Desarrollo
1. Cada cambio estructural, actualización de dependencia, corrección de bug o decisión arquitectónica debe ser documentado en el archivo [`MEMORIA_DESARROLLO.md`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/MEMORIA_DESARROLLO.md).
2. Se debe conservar el historial de versiones, problemas encontrados y justificación técnica de cada solución.

---

## 🧪 Regla 4: Verificación y Pruebas Locales Pre-Despliegue
1. Ninguna modificación será considerada completada sin antes haber ejecutado:
   * Análisis de sintaxis (`php -l`).
   * Suite de comprobación local en [`tests/test_local_environment.php`](file:///c:/Users/Alex/Documents/2026%20B/galaxytool_5_1/galaxytool/tests/test_local_environment.php).
   * Verificación de autenticación y carga de interfaz.
2. Todo error en logs de PHP o MySQL debe resolverse de raíz; no se permite silenciar errores con el operador `@` si se pueden controlar defensivamente.

---

## 🎮 Regla 5: Integridad del Dominio de Juego (OGame)
1. Preservar intacta la lógica matemática de cálculo de coordenadas galácticas, campos de escombros, tiempos de vuelo y parsing de informes.
2. Mantener la compatibilidad de los diccionarios de idiomas multilingües (`languages/*.inc.php`) y los patrones de detección de informes de sondas de espionaje (`*_probes.inc.php`).

---

## 👁️ Regla 6: Revisión y Aprobación Visual Exclusiva del Usuario
1. **Toda revisión visual del proyecto la realizará exclusivamente el usuario:** La inspección estética, usabilidad, disposición de layout, estilos CSS, visualización del HUD in-game y componentes gráficos serán evaluados directamente por el usuario en su entorno real.
2. El agente/desarrollador se centrará en la arquitectura técnica, robustez de datos, algoritmos de compresión, seguridad de red y pruebas de lógica sin asumir la aprobación visual en nombre del usuario.
3. Ante cualquier entrega que involucre interfaz, el agente proveerá las instrucciones claras para que el usuario pueda visualizarla, probarla y dictaminar su retroalimentación o aprobación.

