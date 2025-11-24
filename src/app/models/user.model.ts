export interface User {
    userId?: number;
    firstName: string;
    lastName: string;
    email: string;
    passwordHash?: string;
    role: string;
    token?: string;
    lastLogin?: string;
    createdAt?: string;
    updatedAt?: string;
    organizationId?: number; // Link to organization for organizers
} 