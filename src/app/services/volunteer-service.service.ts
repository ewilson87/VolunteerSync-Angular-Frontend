import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, map, from, switchMap } from 'rxjs';
import { tap } from 'rxjs/operators';
import { User } from '../models/user.model';
import { Event } from '../models/event.model';
import { Organization } from '../models/organization.model';
import { Signup } from '../models/signup.model';
import { CryptoService } from './crypto.service';

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
        private cryptoService: CryptoService
    ) { }

    // User-related API methods
    getUsers(): Observable<User[]> {
        return this.http.get<User[]>(`${this.host}/users`, { headers: this.headers });
    }

    getUser(userId: number): Observable<User> {
        return this.http.get<User>(`${this.host}/users/${userId}`, { headers: this.headers });
    }

    getUserByEmail(email: string): Observable<User[]> {
        return this.http.get<User[]>(`${this.host}/users/email/${email}`, { headers: this.headers });
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
        return this.http.get<Event[]>(`${this.host}/events`, { headers: this.headers });
    }

    getEvent(eventId: number): Observable<any> {
        return this.http.get<any>(`${this.host}/events/${eventId}`, { headers: this.headers });
    }

    searchEvents(params: { city?: string, state?: string, date?: string, organizationId?: number }): Observable<Event[]> {
        let httpParams = new HttpParams();

        if (params.city) httpParams = httpParams.append('city', params.city);
        if (params.state) httpParams = httpParams.append('state', params.state);
        if (params.date) httpParams = httpParams.append('date', params.date);
        if (params.organizationId) httpParams = httpParams.append('organizationId', params.organizationId.toString());

        return this.http.get<Event[]>(`${this.host}/events/search`, {
            headers: this.headers,
            params: httpParams
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
        return this.http.post(`${this.host}/events`, eventToSend, { headers: this.headers });
    }

    updateEvent(eventId: number, event: Event): Observable<any> {
        // Ensure the event has the right eventId
        const eventToUpdate = { ...event, eventId };
        return this.http.put(`${this.host}/events`, eventToUpdate, { headers: this.headers });
    }

    deleteEvent(eventId: number): Observable<any> {
        return this.http.delete(`${this.host}/events/${eventId}`, { headers: this.headers });
    }

    // Organization-related API methods
    getOrganizations(): Observable<Organization[]> {
        return this.http.get<Organization[]>(`${this.host}/organizations`, { headers: this.headers });
    }

    getOrganization(organizationId: number): Observable<any> {
        return this.http.get<any>(`${this.host}/organizations/${organizationId}`, { headers: this.headers });
    }

    findOrganizationByName(name: string): Observable<Organization[]> {
        // Create a parameter to search by organization name
        const params = new HttpParams().set('name', name);
        console.log(`Searching for organization with name: ${name}`);
        return this.http.get<Organization[]>(`${this.host}/organizations`, {
            headers: this.headers,
            params: params
        }).pipe(
            tap(orgs => console.log(`Found ${orgs.length} organizations matching "${name}"`))
        );
    }

    createOrganization(organization: Organization): Observable<any> {
        return this.http.post(`${this.host}/organizations`, organization, { headers: this.headers });
    }

    updateOrganization(organizationId: number, organization: Organization): Observable<any> {
        // Ensure the organization object has the organizationId property set
        const organizationWithId = { ...organization, organizationId };
        return this.http.put(`${this.host}/organizations`, organizationWithId, { headers: this.headers });
    }

    deleteOrganization(organizationId: number): Observable<any> {
        return this.http.delete(`${this.host}/organizations/${organizationId}`, { headers: this.headers });
    }

    // Signup-related API methods
    getSignups(): Observable<Signup[]> {
        return this.http.get<Signup[]>(`${this.host}/signups`, { headers: this.headers });
    }

    getUserSignups(userId: number): Observable<Signup[]> {
        return this.http.get<Signup[]>(`${this.host}/signups/user/${userId}`, { headers: this.headers });
    }

    getEventSignups(eventId: number): Observable<Signup[]> {
        return this.http.get<Signup[]>(`${this.host}/signups/event/${eventId}`, { headers: this.headers });
    }

    createSignup(signup: Signup): Observable<any> {
        return this.http.post(`${this.host}/signups`, signup, { headers: this.headers });
    }

    updateSignup(signupId: number, signup: Signup): Observable<any> {
        return this.http.put(`${this.host}/signups/${signupId}`, signup, { headers: this.headers });
    }

    deleteSignup(signupId: number): Observable<any> {
        return this.http.delete(`${this.host}/signups/${signupId}`, { headers: this.headers });
    }

    // User update and delete methods
    updateUser(userId: number, user: User): Observable<any> {
        console.log(`Updating user ${userId} with data:`, { ...user, passwordHash: user.passwordHash ? '[REDACTED]' : undefined });
        // Ensure the user object has the userId property set
        const userWithId = { ...user, userId };
        return this.http.put(`${this.host}/users`, userWithId, { headers: this.headers });
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
            })
        );
    }

    updateUserOrganization(userId: number, organizationId: number): Observable<any> {
        console.log(`Linking user ${userId} to organization ${organizationId}`);
        return this.http.patch(`${this.host}/users/${userId}`, { organizationId }, { headers: this.headers });
    }

    deleteUser(userId: number): Observable<any> {
        console.log(`Deleting user ${userId}`);
        return this.http.delete(`${this.host}/users/${userId}`, { headers: this.headers });
    }

    // Support Messages API methods
    getSupportMessages(): Observable<any[]> {
        return this.http.get<any[]>(`${this.host}/support-messages`, { headers: this.headers });
    }

    getSupportMessage(messageId: number): Observable<any> {
        return this.http.get<any>(`${this.host}/support-messages/${messageId}`, { headers: this.headers });
    }

    createSupportMessage(message: any): Observable<any> {
        console.log('Creating support message:', message);
        return this.http.post(`${this.host}/support-messages`, message, { headers: this.headers });
    }

    updateSupportMessage(messageId: number, message: any): Observable<any> {
        console.log(`Updating support message ${messageId}:`, message);
        return this.http.put(`${this.host}/support-messages/${messageId}`, message, { headers: this.headers });
    }

    deleteSupportMessage(messageId: number): Observable<any> {
        console.log(`Deleting support message ${messageId}`);
        return this.http.delete(`${this.host}/support-messages/${messageId}`, { headers: this.headers });
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
        console.log('Verifying certificate with URL:', url);
        console.log('Verification code (original):', verificationCode);
        console.log('Verification code (encoded):', encodedCode);
        return this.http.get<any>(url, { headers: this.headers });
    }
} 