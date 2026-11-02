/**
 * OGame Alliance Chat Asynchronous Sync Bus
 * Autonomous In-Game Intelligence Propagation using Zero-Width Steganography & E2EE.
 */

import { OGameReportSerializer } from '../core/encoder.js';
import { AllianceCrypto } from '../core/crypto.js';
import { ZeroWidthSteganography } from '../core/zero-width.js';

// Natural cover messages to mask zero-width steganographic payloads
const NATURAL_COVER_MESSAGES = [
    "Buenas noches compañeros",
    "Buen vuelo a todos con las expediciones",
    "Todo tranquilo por mi sector",
    "Revisando movimientos de flotas en la zona",
    "Subiendo minas y recolectando escombros",
    "Ojo con las actividades en los sistemas cercanos",
    "Coordinando rutas de transporte",
    "Actualizando bases y defensas planetarias"
];

export class ChatSyncBus {
    constructor(storageEngine, options = {}) {
        this.storage = storageEngine;
        this.alliancePassphrase = options.passphrase || 'DefaultAllianceSecret2026';
        this.onReportReceived = options.onReportReceived || null;
        this.queue = [];
        this.isProcessingQueue = false;
        this.processedPacketHashes = new Set();
        this.autoBroadcast = options.autoBroadcast ?? true;
    }

    /**
     * Updates the alliance encryption secret
     * @param {string} passphrase
     */
    setPassphrase(passphrase) {
        this.alliancePassphrase = passphrase;
    }

    /**
     * Queues an espionage report to be broadcasted to the alliance via in-game chat
     * @param {Object} report
     * @param {string} customCoverMessage Optional human message text
     */
    async queueReport(report, customCoverMessage = null) {
        if (!this.autoBroadcast) return;

        // Deduplication key: G:S:P:Moon:Timestamp
        const dedupKey = `${report.galaxy}:${report.system}:${report.position}:${report.isMoon ? 1 : 0}:${report.timestamp}`;
        if (this.processedPacketHashes.has(dedupKey)) {
            return; // Already broadcasted
        }
        this.processedPacketHashes.add(dedupKey);

        this.queue.push({ report, customCoverMessage });
        this.processQueue();
    }

    /**
     * Processes outbound queue with human-like jitter (Anti-Ban compliance - Regla 1)
     */
    async processQueue() {
        if (this.isProcessingQueue || this.queue.length === 0) return;
        this.isProcessingQueue = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            try {
                const messageWithStego = await this.prepareStegoMessage(item.report, item.customCoverMessage);
                await this.sendToOGameChat(messageWithStego);
            } catch (err) {
                console.error("[ChatSyncBus] Failed to broadcast report packet:", err);
            }

            if (this.queue.length > 0) {
                // Jitter: wait 3 to 6 seconds between messages to emulate human typing
                const jitterMs = 3000 + Math.floor(Math.random() * 3000);
                await new Promise(resolve => setTimeout(resolve, jitterMs));
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Packs, encrypts, and injects a report into an innocent human chat message
     * @param {Object} report
     * @param {string} customCover
     * @returns {Promise<string>}
     */
    async prepareStegoMessage(report, customCover = null) {
        // 1. Pack report into ~35 bytes
        const binaryPacket = OGameReportSerializer.pack(report);

        // 2. Encrypt with AES-256-GCM
        const encryptedPacket = await AllianceCrypto.encrypt(binaryPacket, this.alliancePassphrase);

        // 3. Choose natural cover message
        const cover = customCover || NATURAL_COVER_MESSAGES[Math.floor(Math.random() * NATURAL_COVER_MESSAGES.length)];

        // 4. Inject zero-width invisible payload
        return ZeroWidthSteganography.inject(cover, encryptedPacket);
    }

    /**
     * Intercepts and parses an incoming chat message from OGame
     * @param {string} rawMessageText
     * @param {Object} senderInfo { playerId, playerName, timestamp }
     * @returns {Promise<Object|null>} Decoded report or null if normal chat
     */
    async handleIncomingChatMessage(rawMessageText, senderInfo = {}) {
        if (!rawMessageText) return null;

        const { cleanText, payload } = ZeroWidthSteganography.extract(rawMessageText);
        if (!payload) {
            return null; // Regular chat message without hidden intelligence
        }

        try {
            // Decrypt with alliance secret
            const decryptedBytes = await AllianceCrypto.decrypt(payload, this.alliancePassphrase);

            // Unpack binary report (including all 17 modern ships)
            const report = OGameReportSerializer.unpack(decryptedBytes);

            // Deduplicate incoming
            const dedupKey = `${report.galaxy}:${report.system}:${report.position}:${report.isMoon ? 1 : 0}:${report.timestamp}`;
            this.processedPacketHashes.add(dedupKey);

            // Save automatically into local IndexedDB
            const savedReport = await this.storage.saveReport(report);

            console.log(`[ChatSyncBus] Inbound intelligence synced for [${report.galaxy}:${report.system}:${report.position}] from ${senderInfo.playerName || 'Alliance mate'}`);

            if (this.onReportReceived) {
                this.onReportReceived(savedReport, senderInfo, cleanText);
            }

            return {
                cleanText,
                report: savedReport,
                sender: senderInfo
            };
        } catch (err) {
            // Decryption failure (different alliance passphrase or corrupted packet)
            console.debug("[ChatSyncBus] Skipping packet with non-matching key:", err.message);
            return null;
        }
    }

    /**
     * Injects the message into OGame chat input box and submits
     * Hooked into native OGame DOM
     */
    async sendToOGameChat(messageText) {
        if (typeof document === 'undefined') {
            console.log("[ChatSyncBus-Mock] Dispatching chat message:", messageText);
            return;
        }

        // Modern OGame chat input element
        const chatInput = document.querySelector('#chatInput') || document.querySelector('.chat_input');
        const sendBtn = document.querySelector('#chatSend') || document.querySelector('.chat_send_button');

        if (chatInput && sendBtn) {
            chatInput.value = messageText;
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            sendBtn.click();
        } else {
            console.warn("[ChatSyncBus] OGame chat input not found in DOM");
        }
    }
}

