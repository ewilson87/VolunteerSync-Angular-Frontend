export interface Tag {
    tagId: number;
    name: string;
}

export interface EventTag {
    eventId: number;
    tagId: number;
}

export interface EventTagWithDetails {
    eventId: number;
    tagId: number;
    tagName: string;
    tagDescription: string | null;
}


