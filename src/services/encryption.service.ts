/**
 * Browser-Compatible Encryption Service
 * Uses Web Crypto API instead of Node.js crypto module
 * AES-256-GCM encryption for sensitive credentials
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const ITERATIONS = 100000; // 100,000 iterations for PBKDF2. If performance is an issue, this can be reduced, but it may impact security.

export class EncryptionService {
    private masterKey: Uint8Array;

    constructor() {
        // Master key should be stored in environment variable
        const masterKeyHex = import.meta.env.VITE_ENCRYPTION_MASTER_KEY;

        if (!masterKeyHex) {
            throw new Error('VITE_ENCRYPTION_MASTER_KEY environment variable is required');
        }

        if (masterKeyHex.length !== 64) {
            throw new Error('VITE_ENCRYPTION_MASTER_KEY must be 64 hex characters (256 bits)');
        }

        this.masterKey = this.hexToBytes(masterKeyHex);
    }

    /**
     * Encrypt a plaintext value
     * Returns base64-encoded encrypted string with embedded salt, IV, and auth tag
     */
    async encrypt(plaintext: string): Promise<string> {
        if (!plaintext) {
            throw new Error('Plaintext cannot be empty');
        }

        try {
            // Generate random salt and IV
            const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
            const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

            // Derive key from master key using PBKDF2
            const key = await this.deriveKey(this.masterKey, salt, ITERATIONS, KEY_LENGTH);

            // Encrypt using Web Crypto API
            const encoder = new TextEncoder();
            const data = encoder.encode(plaintext);

            const encrypted = await crypto.subtle.encrypt(
                {
                    name: ALGORITHM,
                    iv: iv,
                    tagLength: TAG_LENGTH * 8, // bits
                },
                key,
                data
            );

            // Extract ciphertext and auth tag
            const encryptedArray = new Uint8Array(encrypted);
            const ciphertext = encryptedArray.slice(0, encryptedArray.length - TAG_LENGTH);
            const tag = encryptedArray.slice(encryptedArray.length - TAG_LENGTH);

            // Combine: salt + iv + tag + encrypted data
            const combined = this.concatenateBytes([salt, iv, tag, ciphertext]);

            // Return as base64
            return this.bytesToBase64(combined);
        } catch (error) {
            throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Decrypt an encrypted value (not needed for frontend, but included for completeness)
     */
    async decrypt(encryptedString: string): Promise<string> {
        if (!encryptedString) {
            throw new Error('Encrypted string cannot be empty');
        }

        try {
            // Decode from base64
            const combined = this.base64ToBytes(encryptedString);

            // Extract components
            const salt = combined.slice(0, SALT_LENGTH);
            const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
            const tag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
            const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

            // Derive key from master key
            const key = await this.deriveKey(this.masterKey, salt, ITERATIONS, KEY_LENGTH);

            // Combine ciphertext and tag for Web Crypto API
            const encryptedData = this.concatenateBytes([ciphertext, tag]);

            // Decrypt
            const decrypted = await crypto.subtle.decrypt(
                {
                    name: ALGORITHM,
                    iv: iv,
                    tagLength: TAG_LENGTH * 8,
                },
                key,
                encryptedData
            );

            // Convert to string
            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Derive encryption key using PBKDF2
     */
    private async deriveKey(
        masterKey: Uint8Array,
        salt: Uint8Array,
        iterations: number,
        keyLength: number
    ): Promise<CryptoKey> {
        // Import master key as raw key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            masterKey.slice().buffer as ArrayBuffer,
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        // Derive key using PBKDF2
        const derivedKey = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt.slice().buffer as ArrayBuffer,
                iterations: iterations,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: ALGORITHM, length: keyLength * 8 }, // bits
            false,
            ['encrypt', 'decrypt']
        );

        return derivedKey;
    }

    /**
     * Convert hex string to Uint8Array
     */
    private hexToBytes(hex: string): Uint8Array {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        }
        return bytes;
    }

    /**
     * Convert base64 string to Uint8Array
     */
    private base64ToBytes(base64: string): Uint8Array {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Convert Uint8Array to base64 string
     */
    private bytesToBase64(bytes: Uint8Array): string {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Concatenate multiple Uint8Arrays
     */
    private concatenateBytes(arrays: Uint8Array[]): Uint8Array {
        const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    }

    /**
     * Validate that a master key has the correct format
     */
    static validateMasterKey(key: string): boolean {
        return /^[0-9a-f]{64}$/i.test(key);
    }

    /**
     * Generate a new random master key (for initial setup)
     */
    static generateMasterKey(): string {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
}

// Singleton instance
let encryptionServiceInstance: EncryptionService | null = null;

export function getEncryptionService(): EncryptionService {
    if (!encryptionServiceInstance) {
        encryptionServiceInstance = new EncryptionService();
    }
    return encryptionServiceInstance;
}

// Helper functions for direct use
export async function encryptCredential(plaintext: string): Promise<string> {
    return await getEncryptionService().encrypt(plaintext);
}

export async function decryptCredential(encrypted: string): Promise<string> {
    return await getEncryptionService().decrypt(encrypted);
}
