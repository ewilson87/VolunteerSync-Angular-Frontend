import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, map, from, switchMap, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { User } from '../models/user.model';
import { Event } from '../models/event.model';
import { Organization } from '../models/organization.model';
import { Signup } from '../models/signup.model';
import { AuditLog, AuditLogResponse } from '../models/audit-log.model';
import { VolunteerMetrics, OrganizerMetrics, AdminMetrics } from '../models/metrics.model';
import { Tag, EventTagWithDetails } from '../models/tag.model';
import {
    OrganizationWithFollowInfo,
    UserWithFollowInfo,
    FollowStatus,
    FollowerCount,
    FollowingCount,
    TagWithFollowInfo,
    UserWithTagFollowInfo,
    TagFollowStatus,
    TagFollowerCount,
    TagFollowingCount
} from '../models/follow.model';
import { CryptoService } from './crypto.service';
import { AuthService } from './auth.service';
import { CacheService } from './cache.service';

/**
 * Service for managing VolunteerSync data
 * Handles CRUD operations for users, events, organizations, and signups
 */
@Injectable({
    providedIn: 'root'
})
export class VolunteerService {
    private host = "https://localhost:5000";

    // Add headers to prevent caching
    private headers = new HttpHeaders({
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Expires': '0'
    });

    constructor(
        private http: HttpClient,
        private cryptoService: CryptoService,
        private authService: AuthService,
        private cacheService: CacheService
    ) { }

    // User-related API methods
    getUsers(): Observable<User[]> {
        const cacheKey = 'users';
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<User[]>(`${this.host}/users`, { headers: this.headers });
        });
    }

    getUser(userId: number): Observable<User> {
        const cacheKey = `user:${userId}`;
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<User>(`${this.host}/users/${userId}`, { headers: this.headers });
        });
    }

    getUserByEmail(email: string): Observable<User[]> {
        const cacheKey = `user:email:${email}`;
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<User[]>(`${this.host}/users/email/${email}`, { headers: this.headers });
        }, { ttl: 2 * 60 * 1000, staleWhileRevalidate: false });
    }

    getOrganizationMembers(organizationId?: number): Observable<Array<{ firstName: string, lastName: string, email: string }>> {
        // GET /users/organization/members
        // For organizers: uses organizationId from JWT token
        // For admins: can optionally provide organizationId as query parameter
        const cacheKey = organizationId ? `org-members:${organizationId}` : 'org-members';
        return this.cacheService.get(cacheKey, () => {
            let url = `${this.host}/users/organization/members`;
            if (organizationId) {
                url += `?organizationId=${organizationId}`;
            }
            return this.http.get<Array<{ firstName: string, lastName: string, email: string }>>(url, { headers: this.headers });
        }, { ttl: 2 * 60 * 1000, staleWhileRevalidate: false });
    }

    registerUser(user: any): Observable<any> {
        // Send plain text password to backend - backend will validate complexity and hash it
        // Backend expects camelCase field names: firstName, lastName, email, password, role, organizationId
        // The backend will hash the password and store it as password_hash in the database
        const userToRegister: any = {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role
        };

        // Get password from either passwordHash or password field (handle both cases)
        const plainTextPassword = user.passwordHash || user.password;

        // Send plain text password in 'password' field (camelCase) - backend will hash it
        if (plainTextPassword && plainTextPassword.trim().length > 0) {
            userToRegister.password = plainTextPassword; // Plain text password - backend will hash it
            console.log('Password field set, length:', plainTextPassword.length);
        } else {
            console.error('WARNING: passwordHash/password is missing or empty!');
            console.error('User object received:', {
                ...user,
                passwordHash: user.passwordHash ? '[HAS VALUE]' : '[MISSING]',
                password: user.password ? '[HAS VALUE]' : '[MISSING]'
            });
        }

        // Add organizationId if present (camelCase)
        if (user.organizationId) {
            userToRegister.organizationId = user.organizationId;
        }

        console.log('Sending registration request with plain text password in password field (camelCase)');
        console.log('Registration payload keys:', Object.keys(userToRegister));
        console.log('Registration payload (password redacted):', {
            ...userToRegister,
            password: userToRegister.password ? '[REDACTED - ' + userToRegister.password.length + ' chars]' : '[MISSING]'
        });

        return this.http.post(`${this.host}/users/register`, userToRegister, { headers: this.headers });
    }

    loginUser(credentials: { email: string, password: string }): Observable<{ token: string, user: User }> {
        // JWT login endpoint - returns { token, user }
        const loginUrl = `${this.host}/users/login`;
        console.log('Attempting login to:', loginUrl);
        console.log('Login credentials:', { email: credentials.email, password: '[REDACTED]' });

        return this.http.post<{ token: string, user: User }>(loginUrl, credentials, { headers: this.headers });
    }

    // Event-related API methods
    getEvents(): Observable<Event[]> {
        const cacheKey = 'events:all';
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<Event[]>(`${this.host}/events`, { headers: this.headers });
        });
    }

    getEvent(eventId: number): Observable<any> {
        const cacheKey = `event:${eventId}`;
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<any>(`${this.host}/events/${eventId}`, { headers: this.headers });
        });
    }

    searchEvents(params: { city?: string, state?: string, date?: string, organizationId?: number }): Observable<Event[]> {
        // Build cache key from search parameters
        const paramString = Object.entries(params)
            .filter(([_, value]) => value !== undefined && value !== null)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
            .join('&');
        const cacheKey = `events:search?${paramString}`;

        return this.cacheService.get(cacheKey, () => {
            let httpParams = new HttpParams();

            if (params.city) httpParams = httpParams.append('city', params.city);
            if (params.state) httpParams = httpParams.append('state', params.state);
            if (params.date) httpParams = httpParams.append('date', params.date);
            if (params.organizationId) httpParams = httpParams.append('organizationId', params.organizationId.toString());

            return this.http.get<Event[]>(`${this.host}/events/search`, {
                headers: this.headers,
                params: httpParams
            });
        });
    }

    createEvent(event: Event): Observable<any> {
        // Safety check to ensure createdBy is never null
        if (!event.createdBy || event.createdBy <= 0) {
            console.warn('Invalid createdBy value detected:', event.createdBy);
            // Set to a default value to prevent database errors
            event.createdBy = 1;
        }

        // Create a copy of the event with all fields explicitly set
        const eventToSend = {
            ...event,
            // Force numeric fields to be numbers to prevent type issues
            createdBy: Number(event.createdBy),
            organizationId: Number(event.organizationId),
            numNeeded: Number(event.numNeeded)
        };

        console.log('Sending event to API:', JSON.stringify(eventToSend));
        return this.http.post(`${this.host}/events`, eventToSend, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate all event-related caches
                this.cacheService.invalidatePattern('events');
                this.cacheService.invalidatePattern('event:');
            })
        );
    }

    updateEvent(eventId: number, event: Event): Observable<any> {
        // Ensure the event has the right eventId
        const eventToUpdate = { ...event, eventId };
        return this.http.put(`${this.host}/events`, eventToUpdate, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate specific event and all event lists
                this.cacheService.invalidate(`event:${eventId}`);
                this.cacheService.invalidatePattern('events');
            })
        );
    }

    deleteEvent(eventId: number): Observable<any> {
        return this.http.delete(`${this.host}/events/${eventId}`, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate specific event and all event lists
                this.cacheService.invalidate(`event:${eventId}`);
                this.cacheService.invalidatePattern('events');
            })
        );
    }

    // Organization-related API methods
    getOrganizations(): Observable<Organization[]> {
        const cacheKey = 'organizations';
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<Organization[]>(`${this.host}/organizations`, { headers: this.headers });
        });
    }

    getOrganization(organizationId: number): Observable<any> {
        const cacheKey = `organization:${organizationId}`;
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<any>(`${this.host}/organizations/${organizationId}`, { headers: this.headers });
        });
    }

    findOrganizationByName(name: string): Observable<Organization[]> {
        const cacheKey = `organizations:search?name=${encodeURIComponent(name)}`;
        return this.cacheService.get(cacheKey, () => {
            // Create a parameter to search by organization name
            const params = new HttpParams().set('name', name);
            console.log(`Searching for organization with name: ${name}`);
            return this.http.get<Organization[]>(`${this.host}/organizations`, {
                headers: this.headers,
                params: params
            }).pipe(
                tap(orgs => console.log(`Found ${orgs.length} organizations matching "${name}"`))
            );
        });
    }

    createOrganization(organization: Organization): Observable<any> {
        return this.http.post(`${this.host}/organizations`, organization, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate all organization-related caches
                this.cacheService.invalidatePattern('organizations');
                this.cacheService.invalidatePattern('organization:');
            })
        );
    }

    updateOrganization(organizationId: number, organization: Organization): Observable<any> {
        // Ensure the organization object has the organizationId property set
        const organizationWithId = { ...organization, organizationId };
        return this.http.put(`${this.host}/organizations`, organizationWithId, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate specific organization and all organization lists
                this.cacheService.invalidate(`organization:${organizationId}`);
                this.cacheService.invalidatePattern('organizations');
            })
        );
    }

    deleteOrganization(organizationId: number): Observable<any> {
        return this.http.delete(`${this.host}/organizations/${organizationId}`, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate specific organization and all organization lists
                this.cacheService.invalidate(`organization:${organizationId}`);
                this.cacheService.invalidatePattern('organizations');
            })
        );
    }

    // Signup-related API methods
    getSignups(): Observable<Signup[]> {
        const cacheKey = 'signups';
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<Signup[]>(`${this.host}/signups`, { headers: this.headers });
        });
    }

    getUserSignups(userId: number): Observable<Signup[]> {
        const cacheKey = `signups:user:${userId}`;
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<Signup[]>(`${this.host}/signups/user/${userId}`, { headers: this.headers });
        });
    }

    getEventSignups(eventId: number): Observable<Signup[]> {
        const cacheKey = `signups:event:${eventId}`;
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<Signup[]>(`${this.host}/signups/event/${eventId}`, { headers: this.headers });
        });
    }

    createSignup(signup: Signup): Observable<any> {
        return this.http.post(`${this.host}/signups`, signup, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate signup caches and related event caches
                this.cacheService.invalidatePattern('signups');
                if (signup.eventId) {
                    this.cacheService.invalidate(`event:${signup.eventId}`);
                    this.cacheService.invalidatePattern('events');
                }
            })
        );
    }

    updateSignup(signupId: number, signup: Signup): Observable<any> {
        return this.http.put(`${this.host}/signups/${signupId}`, signup, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate signup caches and related event caches
                this.cacheService.invalidate(`signup:${signupId}`);
                this.cacheService.invalidatePattern('signups');
                if (signup.eventId) {
                    this.cacheService.invalidate(`event:${signup.eventId}`);
                    this.cacheService.invalidatePattern('events');
                }
            })
        );
    }

    deleteSignup(signupId: number): Observable<any> {
        return this.http.delete(`${this.host}/signups/${signupId}`, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate signup caches (we don't know eventId here, so invalidate all event caches)
                this.cacheService.invalidatePattern('signups');
                this.cacheService.invalidatePattern('events');
            })
        );
    }

    // User update and delete methods
    updateUser(userId: number, user: User): Observable<any> {
        console.log(`Updating user ${userId} with data:`, { ...user, passwordHash: user.passwordHash ? '[REDACTED]' : undefined });
        // Ensure the user object has the userId property set
        const userWithId = { ...user, userId };
        return this.http.put(`${this.host}/users`, userWithId, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate specific user and all user lists
                this.cacheService.invalidate(`user:${userId}`);
                this.cacheService.invalidate('users');
            })
        );
    }

    // Specialized method for updating user with password
    updateUserWithPassword(userId: number, user: any, newPassword: string): Observable<any> {
        console.log(`Updating user ${userId} with new password`);

        // Hash the password before sending to the API
        return from(this.cryptoService.hashPassword(newPassword)).pipe(
            switchMap(hashedPassword => {
                // Create a user object with the hashed password
                const userWithHashedPassword = {
                    ...user,
                    userId, // Ensure userId is set
                    passwordHash: hashedPassword // Set the hashed password
                };

                // Remove properties that might conflict with the API
                delete userWithHashedPassword.password;
                delete userWithHashedPassword.token;
                delete userWithHashedPassword.lastLogin;

                console.log(`Sending update with hashed password:`, {
                    ...userWithHashedPassword,
                    passwordHash: '[REDACTED]'
                });

                return this.http.put(`${this.host}/users`, userWithHashedPassword, { headers: this.headers });
            }),
            tap(() => {
                // Invalidate user cache
                this.cacheService.invalidate(`user:${userId}`);
                this.cacheService.invalidate('users');
            })
        );
    }

    updateUserOrganization(userId: number, organizationId: number): Observable<any> {
        console.log(`Linking user ${userId} to organization ${organizationId}`);
        return this.http.patch(`${this.host}/users/${userId}`, { organizationId }, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate user cache and organization members cache
                this.cacheService.invalidate(`user:${userId}`);
                this.cacheService.invalidate('users');
                if (organizationId) {
                    this.cacheService.invalidate(`org-members:${organizationId}`);
                    this.cacheService.invalidate('org-members');
                }
            })
        );
    }

    verifyAdminPassword(password: string): Observable<{ valid: boolean }> {
        // Verify admin password by attempting login
        const adminEmail = this.authService.currentUserValue?.email || '';
        return this.http.post<{ token: string, user: User }>(`${this.host}/users/login`, {
            email: adminEmail,
            password: password
        }, { headers: this.headers }).pipe(
            map(() => ({ valid: true })),
            catchError(() => of({ valid: false }))
        );
    }

    updateUserRole(userId: number, user: User, role: string, organizationId?: number | null, adminPassword?: string): Observable<any> {
        // Use the same pattern as updateUser - PUT /users with full user object
        // Include all required fields from the existing user, only update role and organizationId
        // Ensure all required fields are explicitly set and not undefined
        const updateData: any = {
            userId: userId,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            email: user.email || '',
            role: role
        };

        // Only include passwordHash if it exists (don't send empty string)
        if (user.passwordHash) {
            updateData.passwordHash = user.passwordHash;
        }

        // Handle organizationId
        if (organizationId !== undefined) {
            updateData.organizationId = organizationId || null;
        } else if (user.organizationId !== undefined) {
            updateData.organizationId = user.organizationId;
        }

        // Include adminPassword if provided
        if (adminPassword) {
            updateData.adminPassword = adminPassword;
        }

        console.log(`Updating user ${userId} role to ${role}`, {
            ...updateData,
            passwordHash: updateData.passwordHash ? '[REDACTED]' : '[NOT INCLUDED]',
            adminPassword: adminPassword ? '[REDACTED]' : undefined
        });
        return this.http.put(`${this.host}/users`, updateData, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate user cache and organization members cache if organization changed
                this.cacheService.invalidate(`user:${userId}`);
                this.cacheService.invalidate('users');
                if (organizationId !== undefined) {
                    // Invalidate org members cache for both old and new org
                    if (user.organizationId) {
                        this.cacheService.invalidate(`org-members:${user.organizationId}`);
                    }
                    if (organizationId) {
                        this.cacheService.invalidate(`org-members:${organizationId}`);
                    }
                    this.cacheService.invalidate('org-members');
                }
            })
        );
    }

    addOrganizerByEmail(email: string, organizationId: number): Observable<any> {
        // PUT /users (not /api/users) with email, role, and organizationId
        // Backend will look up user by email and validate that the authenticated user is an organizer
        const updateData = {
            email: email,
            role: 'organizer',
            organizationId: organizationId
        };
        console.log(`Adding organizer: email=${email}, organizationId=${organizationId}`);
        return this.http.put(`${this.host}/users`, updateData, { headers: this.headers });
    }

    deleteUser(userId: number): Observable<any> {
        console.log(`Deleting user ${userId}`);
        return this.http.delete(`${this.host}/users/${userId}`, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate specific user and all user lists
                this.cacheService.invalidate(`user:${userId}`);
                this.cacheService.invalidate('users');
            })
        );
    }

    // Support Messages API methods
    getSupportMessages(): Observable<any[]> {
        const cacheKey = 'support-messages';
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<any[]>(`${this.host}/support-messages`, { headers: this.headers });
        });
    }

    getSupportMessage(messageId: number): Observable<any> {
        const cacheKey = `support-message:${messageId}`;
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<any>(`${this.host}/support-messages/${messageId}`, { headers: this.headers });
        });
    }

    createSupportMessage(message: any): Observable<any> {
        return this.http.post(`${this.host}/support-messages`, message, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate all support message caches
                this.cacheService.invalidatePattern('support-messages');
                this.cacheService.invalidatePattern('support-message:');
            })
        );
    }

    updateSupportMessage(messageId: number, message: any): Observable<any> {
        return this.http.put(`${this.host}/support-messages/${messageId}`, message, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate specific message and all message lists
                this.cacheService.invalidate(`support-message:${messageId}`);
                this.cacheService.invalidate('support-messages');
            })
        );
    }

    deleteSupportMessage(messageId: number): Observable<any> {
        return this.http.delete(`${this.host}/support-messages/${messageId}`, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate specific message and all message lists
                this.cacheService.invalidate(`support-message:${messageId}`);
                this.cacheService.invalidate('support-messages');
            })
        );
    }

    // Event Attendance API methods
    getEventAttendance(eventId: number): Observable<any[]> {
        return this.http.get<any[]>(`${this.host}/event-attendance/event/${eventId}`, { headers: this.headers });
    }

    markAttendance(attendance: { signupId: number, status: 'completed' | 'no_show' | 'excused', hours?: number | null }): Observable<any> {
        return this.http.post(`${this.host}/event-attendance`, attendance, { headers: this.headers });
    }

    updateAttendance(attendanceId: number, attendance: { status: 'completed' | 'no_show' | 'excused', hours?: number | null }): Observable<any> {
        return this.http.put(`${this.host}/event-attendance/${attendanceId}`, attendance, { headers: this.headers });
    }

    getSignupAttendance(signupId: number): Observable<any> {
        return this.http.get<any>(`${this.host}/event-attendance/signup/${signupId}`, { headers: this.headers });
    }

    deleteAttendance(attendanceId: number): Observable<any> {
        return this.http.delete(`${this.host}/event-attendance/${attendanceId}`, { headers: this.headers });
    }

    // Tags API methods

    /**
     * Retrieves all available tags.
     */
    getAllTags(): Observable<Tag[]> {
        const cacheKey = 'tags';
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<Tag[]>(`${this.host}/tags`, { headers: this.headers });
        });
    }

    /**
     * Creates a new tag.
     * 
     * @param name - The name of the tag
     */
    createTag(name: string): Observable<any> {
        const payload = { name };
        return this.http.post(`${this.host}/tags`, payload, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate tags cache
                this.cacheService.invalidate('tags');
            })
        );
    }

    /**
     * Updates an existing tag.
     * 
     * @param tagId - The ID of the tag to update
     * @param name - The updated name of the tag
     */
    updateTag(tagId: number, name: string): Observable<any> {
        const payload = { tagId, name };
        return this.http.put(`${this.host}/tags`, payload, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate tags cache
                this.cacheService.invalidate('tags');
            })
        );
    }

    /**
     * Deletes a tag.
     * 
     * @param tagId - The ID of the tag to delete
     */
    deleteTag(tagId: number): Observable<any> {
        return this.http.delete(`${this.host}/tags/${tagId}`, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate tags cache
                this.cacheService.invalidate('tags');
            })
        );
    }

    /**
     * Retrieves all tags associated with a specific event.
     * Note: This is cached with a shorter TTL since event tags can change.
     * 
     * @param eventId - The ID of the event
     */
    getTagsForEvent(eventId: number): Observable<EventTagWithDetails[]> {
        const cacheKey = `event-tags:${eventId}`;
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<EventTagWithDetails[]>(`${this.host}/event-tags/event/${eventId}`, { headers: this.headers });
        });
    }

    /**
     * Adds a tag to an event.
     * 
     * @param eventId - The ID of the event
     * @param tagId - The ID of the tag
     */
    addTagToEvent(eventId: number, tagId: number): Observable<any> {
        const payload = { eventId, tagId };
        return this.http.post(`${this.host}/event-tags`, payload, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate event tags cache and event cache
                this.cacheService.invalidate(`event-tags:${eventId}`);
                this.cacheService.invalidate(`event:${eventId}`);
                this.cacheService.invalidatePattern('events');
            })
        );
    }

    /**
     * Removes a tag from an event.
     * 
     * @param eventId - The ID of the event
     * @param tagId - The ID of the tag
     */
    removeTagFromEvent(eventId: number, tagId: number): Observable<any> {
        return this.http.delete(`${this.host}/event-tags/event/${eventId}/tag/${tagId}`, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate event tags cache and event cache
                this.cacheService.invalidate(`event-tags:${eventId}`);
                this.cacheService.invalidate(`event:${eventId}`);
                this.cacheService.invalidatePattern('events');
            })
        );
    }

    // Certificate API methods
    createCertificate(certificate: { signupId: number, certificateUid: string, verificationHash: string }): Observable<any> {
        return this.http.post(`${this.host}/certificates`, certificate, { headers: this.headers });
    }

    updateCertificate(certificateId: number, certificate: any): Observable<any> {
        return this.http.put(`${this.host}/certificates/${certificateId}`, certificate, { headers: this.headers });
    }

    deleteCertificate(certificateId: number): Observable<any> {
        return this.http.delete(`${this.host}/certificates/${certificateId}`, { headers: this.headers });
    }

    getCertificatesForUser(userId: number): Observable<any[]> {
        return this.http.get<any[]>(`${this.host}/certificates/user/${userId}`, { headers: this.headers });
    }

    getCertificatesForEvent(eventId: number): Observable<any[]> {
        return this.http.get<any[]>(`${this.host}/certificates/event/${eventId}`, { headers: this.headers });
    }

    getCertificateBySignup(signupId: number): Observable<any> {
        // We'll need to get certificates for the event and find the one matching the signup
        // For now, we'll get all certificates for the event and filter client-side
        // This might need to be adjusted based on the actual API structure
        return this.http.get<any[]>(`${this.host}/certificates`, { headers: this.headers });
    }

    verifyCertificate(verificationCode: string): Observable<any> {
        // Public endpoint - no authentication required
        // URL encode the verification code to handle special characters like hyphens
        const encodedCode = encodeURIComponent(verificationCode);
        const url = `${this.host}/certificates/verify/${encodedCode}`;
        return this.http.get<any>(url, { headers: this.headers });
    }

    // Audit Log API methods

    /**
     * Gets paginated audit logs.
     * 
     * @param limit - Number of records per page (default: 100, max: 1000)
     * @param offset - Number of records to skip (default: 0)
     * @returns Observable of audit log response with pagination
     */
    getAuditLogs(limit: number = 100, offset: number = 0): Observable<AuditLogResponse> {
        const params = new HttpParams()
            .set('limit', limit.toString())
            .set('offset', offset.toString());
        return this.http.get<AuditLogResponse>(`${this.host}/audit-log`, {
            headers: this.headers,
            params: params
        });
    }

    /**
     * Gets a specific audit log by ID.
     * 
     * @param logId - The audit log ID
     * @returns Observable of audit log
     */
    getAuditLog(logId: number): Observable<AuditLog> {
        return this.http.get<AuditLog>(`${this.host}/audit-log/${logId}`, { headers: this.headers });
    }

    /**
     * Gets audit logs by actor (user) ID.
     * 
     * @param actorUserId - The user ID who performed the actions
     * @param limit - Number of records per page (default: 100, max: 1000)
     * @param offset - Number of records to skip (default: 0)
     * @returns Observable of audit log array
     */
    getAuditLogsByActor(actorUserId: number, limit: number = 100, offset: number = 0): Observable<AuditLog[]> {
        const params = new HttpParams()
            .set('limit', limit.toString())
            .set('offset', offset.toString());
        return this.http.get<AuditLog[]>(`${this.host}/audit-log/actor/${actorUserId}`, {
            headers: this.headers,
            params: params
        });
    }

    /**
     * Gets audit logs by entity type and ID.
     * 
     * @param entityType - Type of entity (e.g., "event", "organization", "user")
     * @param entityId - The entity ID
     * @param limit - Number of records per page (default: 100, max: 1000)
     * @param offset - Number of records to skip (default: 0)
     * @returns Observable of audit log array
     */
    getAuditLogsByEntity(entityType: string, entityId: number, limit: number = 100, offset: number = 0): Observable<AuditLog[]> {
        const params = new HttpParams()
            .set('limit', limit.toString())
            .set('offset', offset.toString());
        return this.http.get<AuditLog[]>(`${this.host}/audit-log/entity/${entityType}/${entityId}`, {
            headers: this.headers,
            params: params
        });
    }

    /**
     * Gets audit logs by action type.
     * 
     * @param action - Action type (e.g., "create", "update", "delete", "login")
     * @param limit - Number of records per page (default: 100, max: 1000)
     * @param offset - Number of records to skip (default: 0)
     * @returns Observable of audit log array
     */
    getAuditLogsByAction(action: string, limit: number = 100, offset: number = 0): Observable<AuditLog[]> {
        const params = new HttpParams()
            .set('limit', limit.toString())
            .set('offset', offset.toString());
        return this.http.get<AuditLog[]>(`${this.host}/audit-log/action/${action}`, {
            headers: this.headers,
            params: params
        });
    }

    // Metrics API methods

    /**
     * Gets volunteer metrics summary.
     * Requires volunteer role.
     * 
     * @returns Observable of volunteer metrics
     */
    getVolunteerMetrics(): Observable<VolunteerMetrics> {
        return this.http.get<VolunteerMetrics>(`${this.host}/api/metrics/volunteer/summary`, { headers: this.headers });
    }

    /**
     * Gets organizer metrics summary.
     * Requires organizer role.
     * For admin users, organizationId must be provided as a query parameter.
     * Note: This is cached with a short TTL since metrics change frequently.
     * 
     * @param organizationId - Optional organization ID (required for admin users)
     * @returns Observable of organizer metrics
     */
    getOrganizerMetrics(organizationId?: number): Observable<OrganizerMetrics> {
        const cacheKey = organizationId ? `metrics:organizer:${organizationId}` : 'metrics:organizer';
        return this.cacheService.get(cacheKey, () => {
            let url = `${this.host}/api/metrics/organizer/summary`;
            if (organizationId) {
                url += `?organizationId=${organizationId}`;
            }
            return this.http.get<OrganizerMetrics>(url, { headers: this.headers });
        });
    }

    /**
     * Gets admin metrics summary.
     * Requires admin role.
     * Note: This is cached with a short TTL since metrics change frequently.
     * 
     * @returns Observable of admin metrics
     */
    getAdminMetrics(): Observable<AdminMetrics> {
        const cacheKey = 'metrics:admin';
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<AdminMetrics>(`${this.host}/api/metrics/admin/summary`, { headers: this.headers });
        });
    }

    // ========== User Follow Organizations API Methods ==========

    /**
     * Gets all organizations followed by a user.
     * 
     * @param userId - The ID of the user
     * @returns Observable of organizations with follow info
     */
    getOrganizationsFollowedByUser(userId: number): Observable<OrganizationWithFollowInfo[]> {
        return this.http.get<OrganizationWithFollowInfo[]>(`${this.host}/api/user-follow-organizations/user/${userId}`, { headers: this.headers });
    }

    /**
     * Gets all users following an organization.
     * 
     * @param organizationId - The ID of the organization
     * @returns Observable of users with follow info
     */
    getUsersFollowingOrganization(organizationId: number): Observable<UserWithFollowInfo[]> {
        return this.http.get<UserWithFollowInfo[]>(`${this.host}/api/user-follow-organizations/organization/${organizationId}`, { headers: this.headers });
    }

    /**
     * Checks if a user follows an organization.
     * Note: This is cached with a short TTL since follow status can change.
     * 
     * @param userId - The ID of the user
     * @param organizationId - The ID of the organization
     * @returns Observable of follow status
     */
    checkUserFollowsOrganization(userId: number, organizationId: number): Observable<FollowStatus> {
        const cacheKey = `user-follow:${userId}:${organizationId}`;
        return this.cacheService.get(cacheKey, () => {
            return this.http.get<FollowStatus>(`${this.host}/api/user-follow-organizations/user/${userId}/organization/${organizationId}`, { headers: this.headers });
        });
    }

    /**
     * Gets the follower count for an organization.
     * 
     * @param organizationId - The ID of the organization
     * @returns Observable of follower count
     */
    getOrganizationFollowerCount(organizationId: number): Observable<FollowerCount> {
        return this.http.get<FollowerCount>(`${this.host}/api/user-follow-organizations/organization/${organizationId}/count`, { headers: this.headers });
    }

    /**
     * Gets the following count for a user (organizations).
     * 
     * @param userId - The ID of the user
     * @returns Observable of following count
     */
    getUserFollowingCount(userId: number): Observable<FollowingCount> {
        return this.http.get<FollowingCount>(`${this.host}/api/user-follow-organizations/user/${userId}/count`, { headers: this.headers });
    }

    /**
     * Follows an organization.
     * 
     * @param userId - The ID of the user
     * @param organizationId - The ID of the organization to follow
     * @returns Observable of success response
     */
    followOrganization(userId: number, organizationId: number): Observable<any> {
        const headers = new HttpHeaders({
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Content-Type': 'application/json'
        });
        return this.http.post(`${this.host}/api/user-follow-organizations`,
            { userId, organizationId },
            { headers }).pipe(
            tap(() => {
                // Invalidate follow status cache for this user-organization pair
                this.cacheService.invalidate(`user-follow:${userId}:${organizationId}`);
                // Also invalidate related caches (follower counts, etc.)
                this.cacheService.invalidatePattern(`user-follow:${userId}:`);
            })
        );
    }

    /**
     * Unfollows an organization.
     * 
     * @param userId - The ID of the user
     * @param organizationId - The ID of the organization to unfollow
     * @returns Observable of success response
     */
    unfollowOrganization(userId: number, organizationId: number): Observable<any> {
        return this.http.delete(`${this.host}/api/user-follow-organizations/user/${userId}/organization/${organizationId}`, { headers: this.headers }).pipe(
            tap(() => {
                // Invalidate follow status cache for this user-organization pair
                this.cacheService.invalidate(`user-follow:${userId}:${organizationId}`);
                // Also invalidate related caches (follower counts, etc.)
                this.cacheService.invalidatePattern(`user-follow:${userId}:`);
            })
        );
    }

    // ========== User Follow Tags API Methods ==========

    /**
     * Gets all tags followed by a user.
     * 
     * @param userId - The ID of the user
     * @returns Observable of tags with follow info
     */
    getTagsFollowedByUser(userId: number): Observable<TagWithFollowInfo[]> {
        return this.http.get<TagWithFollowInfo[]>(`${this.host}/api/user-follow-tags/user/${userId}`, { headers: this.headers });
    }

    /**
     * Gets all users following a tag.
     * 
     * @param tagId - The ID of the tag
     * @returns Observable of users with follow info
     */
    getUsersFollowingTag(tagId: number): Observable<UserWithTagFollowInfo[]> {
        return this.http.get<UserWithTagFollowInfo[]>(`${this.host}/api/user-follow-tags/tag/${tagId}`, { headers: this.headers });
    }

    /**
     * Checks if a user follows a tag.
     * 
     * @param userId - The ID of the user
     * @param tagId - The ID of the tag
     * @returns Observable of follow status
     */
    checkUserFollowsTag(userId: number, tagId: number): Observable<TagFollowStatus> {
        return this.http.get<TagFollowStatus>(`${this.host}/api/user-follow-tags/user/${userId}/tag/${tagId}`, { headers: this.headers });
    }

    /**
     * Gets the follower count for a tag.
     * 
     * @param tagId - The ID of the tag
     * @returns Observable of follower count
     */
    getTagFollowerCount(tagId: number): Observable<TagFollowerCount> {
        return this.http.get<TagFollowerCount>(`${this.host}/api/user-follow-tags/tag/${tagId}/count`, { headers: this.headers });
    }

    /**
     * Gets the following count for a user (tags).
     * 
     * @param userId - The ID of the user
     * @returns Observable of following count
     */
    getUserTagFollowingCount(userId: number): Observable<TagFollowingCount> {
        return this.http.get<TagFollowingCount>(`${this.host}/api/user-follow-tags/user/${userId}/count`, { headers: this.headers });
    }

    /**
     * Follows a tag.
     * 
     * @param userId - The ID of the user
     * @param tagId - The ID of the tag to follow
     * @returns Observable of success response
     */
    followTag(userId: number, tagId: number): Observable<any> {
        const headers = new HttpHeaders({
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Content-Type': 'application/json'
        });
        return this.http.post(`${this.host}/api/user-follow-tags`,
            { userId, tagId },
            { headers });
    }

    /**
     * Unfollows a tag.
     * 
     * @param userId - The ID of the user
     * @param tagId - The ID of the tag to unfollow
     * @returns Observable of success response
     */
    unfollowTag(userId: number, tagId: number): Observable<any> {
        return this.http.delete(`${this.host}/api/user-follow-tags/user/${userId}/tag/${tagId}`, { headers: this.headers });
    }

    /**
     * Generates reminder notifications for upcoming events (Admin only).
     * Finds signups for upcoming events and creates notification records in the database.
     * 
     * @returns Observable of the generation result
     */
    generateReminderNotifications(): Observable<{ message: string }> {
        // This is an admin-only action, no caching needed
        return this.http.post<{ message: string }>(
            `${this.host}/notifications/generate-reminders`,
            {},
            { headers: this.headers }
        );
    }

    /**
     * Processes pending email notifications (Admin only).
     * Manually triggers the email notification processing service.
     * 
     * @returns Observable of the processing result with sent, failed, and total counts
     */
    processPendingEmailNotifications(): Observable<{ message: string; sent: number; failed: number; total: number }> {
        // This is an admin-only action, no caching needed
        return this.http.post<{ message: string; sent: number; failed: number; total: number }>(
            `${this.host}/notifications/process-pending`,
            {},
            { headers: this.headers }
        );
    }
} 