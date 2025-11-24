export interface Organization {
    organizationId?: number;
    name: string;
    description: string;
    contactEmail: string;
    contactPhone: string;
    website: string;
    approvalStatus?: string;
    approvedBy?: number;
    approvedAt?: string;
    rejectionReason?: string;
    createdAt?: string;
    updatedAt?: string;
} 