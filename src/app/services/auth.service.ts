import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { User } from '../models/user.model';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private currentUserSubject: BehaviorSubject<User | null>;
    public currentUser: Observable<User | null>;
    private isLoggedInSubject: BehaviorSubject<boolean>;
    public isLoggedIn: Observable<boolean>;

    constructor(
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        let userObject = null;
        let isUserLoggedIn = false;

        // Only access localStorage when in the browser
        if (isPlatformBrowser(this.platformId)) {
            try {
                const storedUser = localStorage.getItem('user');
                const storedToken = localStorage.getItem('token');
                
                // Only restore session if both user and token exist (JWT requirement)
                if (storedUser && storedToken) {
                    try {
                        userObject = JSON.parse(storedUser);
                        isUserLoggedIn = true;
                        console.log('Auth service initialized with stored user and token:', {
                            ...userObject,
                            hasToken: !!storedToken
                        });
                    } catch (parseError) {
                        console.error('Error parsing stored user:', parseError);
                        // Remove invalid data
                        localStorage.removeItem('user');
                        localStorage.removeItem('token');
                    }
                } else {
                    // If one exists without the other, clean up (inconsistent state)
                    if (storedUser && !storedToken) {
                        console.log('Found user without token - clearing user data');
                        localStorage.removeItem('user');
                    } else if (storedToken && !storedUser) {
                        console.log('Found token without user - clearing token');
                        localStorage.removeItem('token');
                    } else {
                        console.log('No user or token found in localStorage');
                    }
                }
            } catch (error) {
                console.error('Error accessing localStorage:', error);
                // Fallback to default values
            }
        } else {
            console.log('Auth service initialized in server environment');
        }

        this.currentUserSubject = new BehaviorSubject<User | null>(userObject);
        this.currentUser = this.currentUserSubject.asObservable();

        this.isLoggedInSubject = new BehaviorSubject<boolean>(isUserLoggedIn);
        this.isLoggedIn = this.isLoggedInSubject.asObservable();
    }

    public get currentUserValue(): User | null {
        return this.currentUserSubject.value;
    }

    public get isLoggedInValue(): boolean {
        return this.isLoggedInSubject.value;
    }

    public getToken(): string | null {
        // Get token from localStorage (stored separately for JWT)
        if (isPlatformBrowser(this.platformId)) {
            try {
                return localStorage.getItem('token');
            } catch (error) {
                console.error('Error accessing localStorage for token:', error);
                return null;
            }
        }
        return null;
    }

    public setToken(token: string): void {
        // Store token separately in localStorage
        if (isPlatformBrowser(this.platformId)) {
            try {
                localStorage.setItem('token', token);
                console.log('Token saved to localStorage');
            } catch (error) {
                console.error('Error setting token in localStorage:', error);
            }
        }
    }

    public clearToken(): void {
        // Remove token from localStorage
        if (isPlatformBrowser(this.platformId)) {
            try {
                localStorage.removeItem('token');
                console.log('Token removed from localStorage');
            } catch (error) {
                console.error('Error removing token from localStorage:', error);
            }
        }
    }

    setCurrentUser(user: User): void {
        console.log('Setting current user:', {
            ...user,
            token: user?.token ? '[REDACTED]' : undefined
        });

        if (!user) {
            console.error('Attempted to set null user');
            return;
        }

        // Validate the user object - make sure it's not just a database response
        if (!user.email || typeof user.userId === 'undefined') {
            console.error('Attempted to set invalid user object:', user);
            return;
        }

        // If we're getting a database response object instead of a user, don't proceed
        if ('affectedRows' in user || 'fieldCount' in user || 'insertId' in user) {
            console.error('Attempted to set database response as user:', user);
            return;
        }

        // Update subjects
        this.currentUserSubject.next(user);
        this.isLoggedInSubject.next(true);

        // Only access localStorage when in the browser
        if (isPlatformBrowser(this.platformId)) {
            try {
                // Update localStorage
                // Don't store token in user object - it's stored separately
                const userWithoutToken = { ...user };
                delete userWithoutToken.token;
                localStorage.setItem('user', JSON.stringify(userWithoutToken));
                console.log('User saved to localStorage');
            } catch (error) {
                console.error('Error setting localStorage:', error);
                // Continue even if localStorage fails
            }
        }
    }

    logout(): void {
        console.log('Logging out user');

        // Clear the subjects
        this.currentUserSubject.next(null);
        this.isLoggedInSubject.next(false);

        // Only access localStorage when in the browser
        if (isPlatformBrowser(this.platformId)) {
            try {
                // Remove user and token from localStorage
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                console.log('User and token removed from localStorage');
            } catch (error) {
                console.error('Error removing from localStorage:', error);
                // Continue even if localStorage fails
            }
        }

        // Redirect to login
        this.router.navigate(['/login']);
    }

    getUserRole(): string | undefined {
        return this.currentUserValue?.role;
    }

    isOrganizationAdmin(): boolean {
        return this.currentUserValue?.role === 'organizer';
    }

    isVolunteer(): boolean {
        return this.currentUserValue?.role === 'volunteer';
    }
} 