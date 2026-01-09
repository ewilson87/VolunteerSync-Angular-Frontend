// User Follow Organization interfaces
export interface UserFollowOrganization {
    userId: number;
    organizationId: number;
    followedAt?: Date | null;
}

// Response from GET /api/user-follow-organizations/user/:userId
export interface OrganizationWithFollowInfo {
    userId: number;
    organizationId: number;
    followedAt: string; // ISO date string
    organizationName: string;
    organizationDescription: string;
    organizationContactEmail: string;
    organizationWebsite: string;
}

// Response from GET /api/user-follow-organizations/organization/:organizationId
export interface UserWithFollowInfo {
    userId: number;
    organizationId: number;
    followedAt: string; // ISO date string
    userEmail: string;
    userFirstName: string;
    userLastName: string;
}

// Response from GET /api/user-follow-organizations/user/:userId/organization/:organizationId
export interface FollowStatus {
    userId: number;
    organizationId: number;
    isFollowing: boolean;
    followedAt: string | null; // ISO date string or null
}

// Response from count endpoints
export interface FollowerCount {
    organizationId: number;
    followerCount: number;
}

export interface FollowingCount {
    userId: number;
    followingCount: number;
}

// User Follow Tag interfaces
export interface UserFollowTag {
    userId: number;
    tagId: number;
    followedAt?: Date | null;
}

// Response from GET /api/user-follow-tags/user/:userId
export interface TagWithFollowInfo {
    userId: number;
    tagId: number;
    followedAt: string; // ISO date string
    tagName: string;
}

// Response from GET /api/user-follow-tags/tag/:tagId
export interface UserWithTagFollowInfo {
    userId: number;
    tagId: number;
    followedAt: string; // ISO date string
    userEmail: string;
    userFirstName: string;
    userLastName: string;
}

// Response from GET /api/user-follow-tags/user/:userId/tag/:tagId
export interface TagFollowStatus {
    userId: number;
    tagId: number;
    isFollowing: boolean;
    followedAt: string | null; // ISO date string or null
}

// Response from tag count endpoints
export interface TagFollowerCount {
    tagId: number;
    followerCount: number;
}

export interface TagFollowingCount {
    userId: number;
    followingCount: number;
}

