import { Injectable } from '@angular/core';

/**
 * Service for input validation and sanitization to prevent XSS and injection attacks
 */
@Injectable({
    providedIn: 'root'
})
export class InputValidationService {

    // Maximum lengths based on database schema constraints
    readonly MAX_LENGTHS = {
        firstName: 50,
        lastName: 50,
        email: 100,
        password: 100, // Updated to match backend requirement
        organizationName: 100,
        organizationDescription: 65535, // TEXT field
        contactPhone: 20,
        website: 255,
        eventTitle: 100,
        eventDescription: 65535, // TEXT field
        locationName: 100,
        address: 65535, // TEXT field
        city: 100,
        state: 2,
        subject: 150,
        message: 65535 // TEXT field
    };

    /**
     * Sanitize text input by removing potentially dangerous characters
     * Removes: < > & " ' and null bytes
     */
    sanitizeText(input: string): string {
        if (!input || typeof input !== 'string') {
            return '';
        }
        
        // Remove null bytes and control characters
        let sanitized = input.replace(/\0/g, '').replace(/[\x00-\x1F\x7F]/g, '');
        
        // Remove HTML tags (basic protection)
        sanitized = sanitized.replace(/<[^>]*>/g, '');
        
        // Escape HTML entities
        sanitized = sanitized
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        
        // Trim whitespace
        sanitized = sanitized.trim();
        
        return sanitized;
    }

    /**
     * Validate and sanitize email address
     */
    validateEmail(email: string): { isValid: boolean; sanitized: string; error?: string } {
        if (!email || typeof email !== 'string') {
            return { isValid: false, sanitized: '', error: 'Email is required' };
        }

        // Trim and convert to lowercase
        const trimmed = email.trim().toLowerCase();

        // Check length
        if (trimmed.length > this.MAX_LENGTHS.email) {
            return { isValid: false, sanitized: trimmed.substring(0, this.MAX_LENGTHS.email), error: `Email must be ${this.MAX_LENGTHS.email} characters or less` };
        }

        // Basic email regex validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmed)) {
            return { isValid: false, sanitized: trimmed, error: 'Invalid email format' };
        }

        // Check for dangerous characters (but allow @ and .)
        if (/[<>"']/.test(trimmed)) {
            return { isValid: false, sanitized: this.sanitizeText(trimmed), error: 'Email contains invalid characters' };
        }

        return { isValid: true, sanitized: trimmed };
    }

    /**
     * Validate and sanitize URL
     */
    validateUrl(url: string): { isValid: boolean; sanitized: string; error?: string } {
        if (!url || typeof url !== 'string') {
            return { isValid: false, sanitized: '', error: 'URL is required' };
        }

        const trimmed = url.trim();

        // Check length
        if (trimmed.length > this.MAX_LENGTHS.website) {
            return { isValid: false, sanitized: trimmed.substring(0, this.MAX_LENGTHS.website), error: `URL must be ${this.MAX_LENGTHS.website} characters or less` };
        }

        // Basic URL validation (http, https, or relative)
        try {
            // If it doesn't start with http:// or https://, add https:// for validation
            const testUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://') 
                ? trimmed 
                : `https://${trimmed}`;
            new URL(testUrl);
        } catch {
            return { isValid: false, sanitized: trimmed, error: 'Invalid URL format' };
        }

        // Remove dangerous characters but preserve URL structure
        let sanitized = trimmed.replace(/[<>"']/g, '');

        return { isValid: true, sanitized };
    }

    /**
     * Validate and sanitize phone number
     */
    validatePhone(phone: string): { isValid: boolean; sanitized: string; error?: string } {
        if (!phone || typeof phone !== 'string') {
            return { isValid: false, sanitized: '', error: 'Phone number is required' };
        }

        // Remove all non-digit characters except +, -, (, ), and spaces
        let sanitized = phone.replace(/[^\d+\-() ]/g, '');

        // Check length
        if (sanitized.length > this.MAX_LENGTHS.contactPhone) {
            return { isValid: false, sanitized: sanitized.substring(0, this.MAX_LENGTHS.contactPhone), error: `Phone number must be ${this.MAX_LENGTHS.contactPhone} characters or less` };
        }

        // Basic phone validation (at least 10 digits)
        const digitsOnly = sanitized.replace(/\D/g, '');
        if (digitsOnly.length < 10) {
            return { isValid: false, sanitized, error: 'Phone number must contain at least 10 digits' };
        }

        return { isValid: true, sanitized };
    }

    /**
     * Validate and sanitize name field
     */
    validateName(name: string, fieldName: string = 'Name'): { isValid: boolean; sanitized: string; error?: string } {
        if (!name || typeof name !== 'string') {
            return { isValid: false, sanitized: '', error: `${fieldName} is required` };
        }

        const sanitized = this.sanitizeText(name);

        // Check length (use firstName max length as default)
        const maxLength = this.MAX_LENGTHS.firstName;
        if (sanitized.length > maxLength) {
            return { isValid: false, sanitized: sanitized.substring(0, maxLength), error: `${fieldName} must be ${maxLength} characters or less` };
        }

        if (sanitized.length < 1) {
            return { isValid: false, sanitized: '', error: `${fieldName} cannot be empty` };
        }

        return { isValid: true, sanitized };
    }

    /**
     * Validate and sanitize password
     * Note: Backend performs full validation including complexity requirements.
     * This method only checks length and basic sanitization.
     */
    validatePassword(password: string): { isValid: boolean; sanitized: string; error?: string } {
        if (!password || typeof password !== 'string') {
            return { isValid: false, sanitized: '', error: 'Password is required' };
        }

        // Check minimum length
        if (password.length < 8) {
            return { isValid: false, sanitized: password, error: 'Password must be at least 8 characters' };
        }

        // Check maximum length (updated to match backend requirement of 100)
        if (password.length > this.MAX_LENGTHS.password) {
            return { isValid: false, sanitized: password.substring(0, this.MAX_LENGTHS.password), error: `Password must be ${this.MAX_LENGTHS.password} characters or less` };
        }

        // Remove null bytes and control characters (but don't sanitize password content)
        const sanitized = password.replace(/\0/g, '').replace(/[\x00-\x1F\x7F]/g, '');

        // Note: Complexity validation (uppercase, lowercase, number, special char) is handled by the backend
        return { isValid: true, sanitized };
    }

    /**
     * Validate and sanitize text field with max length
     */
    validateTextField(text: string, maxLength: number, fieldName: string = 'Field'): { isValid: boolean; sanitized: string; error?: string } {
        if (!text || typeof text !== 'string') {
            return { isValid: false, sanitized: '', error: `${fieldName} is required` };
        }

        const sanitized = this.sanitizeText(text);

        if (sanitized.length > maxLength) {
            return { isValid: false, sanitized: sanitized.substring(0, maxLength), error: `${fieldName} must be ${maxLength} characters or less` };
        }

        return { isValid: true, sanitized };
    }

    /**
     * Validate state code (2 characters, uppercase)
     */
    validateState(state: string): { isValid: boolean; sanitized: string; error?: string } {
        if (!state || typeof state !== 'string') {
            return { isValid: false, sanitized: '', error: 'State is required' };
        }

        const sanitized = state.trim().toUpperCase().substring(0, 2);

        if (sanitized.length !== 2) {
            return { isValid: false, sanitized, error: 'State must be a 2-letter code' };
        }

        // Only allow letters
        if (!/^[A-Z]{2}$/.test(sanitized)) {
            return { isValid: false, sanitized, error: 'State must contain only letters' };
        }

        return { isValid: true, sanitized };
    }

    /**
     * Validate numeric input
     */
    validateNumber(value: any, min?: number, max?: number, fieldName: string = 'Number'): { isValid: boolean; sanitized: number; error?: string } {
        if (value === null || value === undefined || value === '') {
            return { isValid: false, sanitized: 0, error: `${fieldName} is required` };
        }

        const num = Number(value);

        if (isNaN(num)) {
            return { isValid: false, sanitized: 0, error: `${fieldName} must be a valid number` };
        }

        if (min !== undefined && num < min) {
            return { isValid: false, sanitized: num, error: `${fieldName} must be at least ${min}` };
        }

        if (max !== undefined && num > max) {
            return { isValid: false, sanitized: num, error: `${fieldName} must be at most ${max}` };
        }

        return { isValid: true, sanitized: num };
    }

    /**
     * Validate date string
     */
    validateDate(dateString: string): { isValid: boolean; sanitized: string; error?: string } {
        if (!dateString || typeof dateString !== 'string') {
            return { isValid: false, sanitized: '', error: 'Date is required' };
        }

        const trimmed = dateString.trim();

        // Check format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return { isValid: false, sanitized: trimmed, error: 'Date must be in YYYY-MM-DD format' };
        }

        // Validate it's a real date
        const date = new Date(trimmed);
        if (isNaN(date.getTime())) {
            return { isValid: false, sanitized: trimmed, error: 'Invalid date' };
        }

        return { isValid: true, sanitized: trimmed };
    }

    /**
     * Validate time string
     */
    validateTime(timeString: string): { isValid: boolean; sanitized: string; error?: string } {
        if (!timeString || typeof timeString !== 'string') {
            return { isValid: false, sanitized: '', error: 'Time is required' };
        }

        const trimmed = timeString.trim();

        // Check format (HH:MM or HH:MM:SS)
        if (!/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
            return { isValid: false, sanitized: trimmed, error: 'Time must be in HH:MM or HH:MM:SS format' };
        }

        return { isValid: true, sanitized: trimmed };
    }
}

