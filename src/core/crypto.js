/**
 * Web Crypto AES-256-GCM Encryption Engine
 * End-to-End Encryption for Alliance In-Game Transmissions.
 * Compatible with modern Browsers (window.crypto) and Node.js v18+ (globalThis.crypto).
 */

const cryptoObj = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : null;

export class AllianceCrypto {
    /**
     * Derives an AES-GCM 256-bit CryptoKey from an alliance shared secret
     * @param {string} passphrase Shared secret defined by the alliance
     * @param {Uint8Array} salt 16-byte salt
     * @returns {Promise<CryptoKey>}
     */
    static async deriveKey(passphrase, salt) {
        if (!cryptoObj?.subtle) {
            throw new Error("Web Crypto API (crypto.subtle) is not available in this environment");
        }

        const enc = new TextEncoder();
        const baseKey = await cryptoObj.subtle.importKey(
            'raw',
            enc.encode(passphrase),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        return await cryptoObj.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 50000,
                hash: 'SHA-256'
            },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypts plaintext bytes using AES-256-GCM with static alliance salt & random IV
     * @param {Uint8Array} data Plaintext binary payload
     * @param {string} passphrase Alliance secret password
     * @returns {Promise<Uint8Array>} [12 bytes IV] + [Ciphertext + 16 bytes GCM Auth Tag]
     */
    static async encrypt(data, passphrase) {
        // Deterministic salt for the alliance key derivation so all members can decrypt
        const salt = new TextEncoder().encode("OGAME_GT_ALLIANCE_SALT_2026");
        const key = await this.deriveKey(passphrase, salt);

        const iv = new Uint8Array(12);
        cryptoObj.getRandomValues(iv);

        const ciphertextBuffer = await cryptoObj.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        const ciphertext = new Uint8Array(ciphertextBuffer);
        const result = new Uint8Array(iv.length + ciphertext.length);
        result.set(iv, 0);
        result.set(ciphertext, iv.length);
        return result;
    }

    /**
     * Decrypts ciphertext bytes using AES-256-GCM
     * @param {Uint8Array} encryptedBytes [12 bytes IV] + [Ciphertext + 16 bytes Tag]
     * @param {string} passphrase Alliance secret password
     * @returns {Promise<Uint8Array>} Decrypted original payload
     */
    static async decrypt(encryptedBytes, passphrase) {
        if (encryptedBytes.length < 28) throw new Error("Encrypted payload too short");

        const salt = new TextEncoder().encode("OGAME_GT_ALLIANCE_SALT_2026");
        const key = await this.deriveKey(passphrase, salt);

        const iv = encryptedBytes.slice(0, 12);
        const ciphertext = encryptedBytes.slice(12);

        const decryptedBuffer = await cryptoObj.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );

        return new Uint8Array(decryptedBuffer);
    }
}

