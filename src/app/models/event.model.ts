export interface Event {
    eventId?: number;
    title: string;
    description: string;
    eventDate: string;
    eventTime: string;
    locationName: string;
    address: string;
    city: string;
    state: string;
    numNeeded: number;
    numSignedUp?: number;
    createdBy: number;
    organizationId: number;
    organizationName?: string;
    tags?: string[];
    eventLengthHours?: number;
} 