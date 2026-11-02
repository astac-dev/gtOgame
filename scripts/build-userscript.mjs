/**
 * Bundler script for Galaxytool Modern Userscript
 * Combines modular ES6 sources into a self-contained Tampermonkey script.
 */

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');
const distDir = path.join(projectRoot, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

const outputFile = path.join(distDir, 'galaxytool-modern.user.js');

const USER_SCRIPT_HEADER = `// ==UserScript==
// @name         Galaxytool Modern - Asynchronous Alliance Intelligence
// @namespace    https://galaxytool.modern/
// @version      6.0.0
// @description  Local-First, Zero-Database, Asynchronous Intelligence & Stealth HUD for Modern OGame (v7 - v11+)
// @author       Galaxytool Modern Team
// @match        *://*.ogame.gameforge.com/game/index.php*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      localhost
// @connect      127.0.0.1
// ==/UserScript==

(function() {
'use strict';

console.log("[Galaxytool-Modern] Bootstrapping Asynchronous Alliance Core v6.0.0...");
`;

const USER_SCRIPT_FOOTER = `
// Initialize Core Engine and Network Interceptor
(async function initGalaxytool() {
    try {
        const storage = new OGameStorageEngine();
        await storage.init();

        const chatBus = new ChatSyncBus(storage, {
            passphrase: 'DefaultAllianceSecret2026',
            autoBroadcast: true
        });

        let hud = null;

        const interceptor = new NetworkInterceptor(storage, (event) => {
            if (event.type === 'report') {
                if (hud && hud.config && !hud.config.syncReports) return;
                if (!hud || !hud.config || hud.config.syncChat) {
                    chatBus.queueReport(event.data);
                    console.log("[Galaxytool-Modern] Report queued for In-Game Chat Sync");
                }
                if (hud) hud.notify(event.summary, 'success', '[REP]');
            } else if (event.type === 'galaxy') {
                if (hud && hud.config && !hud.config.syncGalaxy) return;
                if (hud) hud.notify(event.summary, 'info', '[GAL]');
            } else if (event.type === 'highscore') {
                if (hud && hud.config && !hud.config.syncHighscores) return;
                if (hud) hud.notify(event.summary, 'info', '[TOP]');
            }
        });
        interceptor.start();

        hud = new InGameHUD(storage, chatBus, interceptor);
        chatBus.onReportReceived = (report) => {
            if (hud) hud.notify('Inteligencia recibida de aliado: [' + report.galaxy + ':' + report.system + ':' + report.position + ']', 'success', '[SYNC]');
        };

        if (typeof document !== 'undefined') {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => hud.init());
            } else {
                hud.init();
            }
        }

        // Expose public developer API on window and unsafeWindow
        const winContext = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        winContext.Galaxytool = window.Galaxytool = {
            version: '6.0.0',
            storage,
            interceptor,
            chatBus,
            hud,
            serializer: OGameReportSerializer,
            crypto: AllianceCrypto,
            stego: ZeroWidthSteganography,
            adapter: JSONLAdapter
        };

        console.log("[Galaxytool-Modern] Engine initialized successfully. Accessible at window.Galaxytool");
    } catch (err) {
        console.error("[Galaxytool-Modern] Boot error:", err);
    }
})();

})();
`;

function readFileWithoutImports(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    // Strip export keywords and import statements
    content = content.replace(/^import\s+[^;]+;\s*$/gm, '');
    content = content.replace(/^export\s+const\s+/gm, 'const ');
    content = content.replace(/^export\s+class\s+/gm, 'class ');
    content = content.replace(/^export\s+default\s+/gm, '');
    return content;
}

const files = [
    'src/core/constants.js',
    'src/core/encoder.js',
    'src/core/crypto.js',
    'src/core/zero-width.js',
    'src/storage/db.js',
    'src/storage/jsonl.js',
    'src/chat/chat-bus.js',
    'src/userscript/parser-galaxy.js',
    'src/userscript/parser-reports.js',
    'src/userscript/parser-highscore.js',
    'src/userscript/interceptor.js',
    'src/ui/hud.js'
];

let bundleBody = '';
for (const file of files) {
    const fullPath = path.join(projectRoot, file);
    bundleBody += `\n// ==========================================\n// SOURCE: ${file}\n// ==========================================\n`;
    bundleBody += readFileWithoutImports(fullPath);
}

const finalScript = USER_SCRIPT_HEADER + bundleBody + USER_SCRIPT_FOOTER;
fs.writeFileSync(outputFile, finalScript, 'utf-8');

console.log(`[BUILD] Generated userscript successfully at: ${outputFile}`);
console.log(`[BUILD] Size: ${(finalScript.length / 1024).toFixed(2)} KB`);

