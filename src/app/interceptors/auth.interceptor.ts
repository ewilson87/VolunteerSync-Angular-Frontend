import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const authService = inject(AuthService);
    const router = inject(Router);
    
    // Skip adding auth header for login, registration, and public verification endpoints
    const isAuthEndpoint = req.url.includes('/users/login') || 
                           req.url.includes('/users/register') ||
                           req.url.includes('/users/email/') || 
                           req.url.includes('/certificates/verify/');
    
    if (isAuthEndpoint) {
        return next(req);
    }
    
    // Get token from AuthService (which handles browser/server checks)
    const token = authService.getToken();
    const isLoggedIn = authService.isLoggedInValue;

    // Helper function to handle authentication errors (401/403)
    const handleAuthError = (error: HttpErrorResponse) => {
        // Only logout if user appears to be logged in (has token or isLoggedIn is true)
        // This prevents logging out users who are already logged out or on public pages
        if ((token || isLoggedIn) && (error.status === 401 || error.status === 403)) {
            // Check if this is a business logic error (not an auth error)
            const errorMessage = error.error?.message || error.error?.error?.message || '';
            const isBusinessLogicError = errorMessage.includes('Cannot change the role') ||
                                        errorMessage.includes('cannot delete your own account') ||
                                        errorMessage.includes('only remaining admin') ||
                                        errorMessage.includes('only organizer');
            
            if (isBusinessLogicError) {
                // This is a business logic error, not an auth failure - don't log out
                console.log(`Received ${error.status} Forbidden - business logic error: ${errorMessage}`);
                return throwError(() => error);
            }
            
            // This is an actual auth error - log out the user
            console.log(`Received ${error.status} ${error.status === 401 ? 'Unauthorized' : 'Forbidden'} - token may be expired or invalid`);
            
            // Logout the user (this will update the auth state, clear localStorage, and redirect)
            authService.logout();
        }
        return throwError(() => error);
    };

    // Clone the request and add the Authorization header if token exists
    if (token && !req.headers.has('Authorization')) {
        const cloned = req.clone({
            setHeaders: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        return next(cloned).pipe(
            catchError(handleAuthError)
        );
    }
    
    return next(req).pipe(
        catchError(handleAuthError)
    );
};

