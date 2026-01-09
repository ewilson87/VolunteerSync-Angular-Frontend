/**
 * Audit log entry interface representing a single audit log record.
 */
export interface AuditLog {
    logId: number;
    occurredAt: string; // ISO 8601 date string
    actorUserId: number | null;
    action: string;
    entityType: string;
    entityId: number | null;
    details: any | null; // JSON object
}

/**
 * Audit log response interface containing logs and pagination information.
 */
export interface AuditLogResponse {
    logs: AuditLog[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
    };
}

