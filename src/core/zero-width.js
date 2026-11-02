/**
 * Zero-Width Steganography Engine for OGame Chat Transmission
 * Invisibility encoder: packs binary payloads into human chat messages.
 */

const ZW_START = '\uFEFF';  // Zero-Width No-Break Space (Header)
const ZW_END   = '\u2060';  // Word Joiner (Footer)
const ZW_BIT_0 = '\u200B';  // Zero-Width Space ('00')
const ZW_BIT_1 = '\u200C';  // Zero-Width Non-Joiner ('01')
const ZW_BIT_2 = '\u200D';  // Zero-Width Joiner ('10')
const ZW_BIT_3 = '\u200E';  // Left-to-Right Mark ('11')

const DIBIT_MAP = [ZW_BIT_0, ZW_BIT_1, ZW_BIT_2, ZW_BIT_3];
const CHAR_TO_DIBIT = {
    [ZW_BIT_0]: 0,
    [ZW_BIT_1]: 1,
    [ZW_BIT_2]: 2,
    [ZW_BIT_3]: 3
};

export class ZeroWidthSteganography {
    /**
     * Converts raw bytes into a compact zero-width invisible character string (2 bits per char)
     * @param {Uint8Array} bytes
     * @returns {string} Invisible unicode string
     */
    static bytesToZeroWidth(bytes) {
        let result = ZW_START;
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i];
            // Encode byte into 4 dibits (2 bits each)
            result += DIBIT_MAP[(b >> 6) & 0x03];
            result += DIBIT_MAP[(b >> 4) & 0x03];
            result += DIBIT_MAP[(b >> 2) & 0x03];
            result += DIBIT_MAP[b & 0x03];
        }
        result += ZW_END;
        return result;
    }

    /**
     * Extracts and decodes binary bytes from a zero-width string
     * @param {string} text Containing invisible characters
     * @returns {Uint8Array|null} Extracted bytes or null if not found
     */
    static zeroWidthToBytes(text) {
        const startIdx = text.indexOf(ZW_START);
        if (startIdx === -1) return null;
        const endIdx = text.indexOf(ZW_END, startIdx);
        if (endIdx === -1) return null;

        const payloadStr = text.substring(startIdx + 1, endIdx);
        const dibits = [];
        for (let i = 0; i < payloadStr.length; i++) {
            const ch = payloadStr[i];
            if (CHAR_TO_DIBIT[ch] !== undefined) {
                dibits.push(CHAR_TO_DIBIT[ch]);
            }
        }

        if (dibits.length % 4 !== 0) {
            // Incomplete or corrupted packet
            return null;
        }

        const bytes = new Uint8Array(dibits.length / 4);
        for (let i = 0; i < bytes.length; i++) {
            const d0 = dibits[i * 4];
            const d1 = dibits[i * 4 + 1];
            const d2 = dibits[i * 4 + 2];
            const d3 = dibits[i * 4 + 3];
            bytes[i] = (d0 << 6) | (d1 << 4) | (d2 << 2) | d3;
        }

        return bytes;
    }

    /**
     * Injects an invisible binary payload into a normal human message
     * @param {string} visibleText e.g. "Hola compañeros, buen ataque hoy"
     * @param {Uint8Array} payload
     * @returns {string} Text with hidden payload
     */
    static inject(visibleText, payload) {
        const zw = this.bytesToZeroWidth(payload);
        return visibleText + zw;
    }

    /**
     * Extracts payload and returns both payload and clean human text
     * @param {string} textWithHiddenPayload
     * @returns {{ cleanText: string, payload: Uint8Array|null }}
     */
    static extract(textWithHiddenPayload) {
        const payload = this.zeroWidthToBytes(textWithHiddenPayload);
        // Clean all zero-width characters for UI rendering
        const cleanText = textWithHiddenPayload.replace(/[\uFEFF\u2060\u200B\u200C\u200D\u200E]/g, '');
        return { cleanText, payload };
    }
}

