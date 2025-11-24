import { Injectable } from '@angular/core';

/**
 * Service for handling cryptographic operations
 * Provides methods for hashing passwords
 */
@Injectable({
    providedIn: 'root'
})
export class CryptoService {
    constructor() { }

    /**
     * Hashes a password using SHA-256 algorithm
     * @param password The plain text password to hash
     * @returns A promise that resolves to the hashed password
     */
    async hashPassword(password: string): Promise<string> {
        // Convert the string to an array buffer
        const encoder = new TextEncoder();
        const data = encoder.encode(password);

        // Generate hash using SubtleCrypto
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);

        // Convert to hex string
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return hashHex;
    }
} 