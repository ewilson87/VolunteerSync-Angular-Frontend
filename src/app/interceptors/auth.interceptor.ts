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
        console.log('AuthInterceptor: Skipping auth header for public endpoint:', req.url);
        return next(req);
    }
    
    // Get token from AuthService (which handles browser/server checks)
    const token = authService.getToken();
    
    console.log('AuthInterceptor: Processing request to', req.url);
    console.log('AuthInterceptor: Token exists?', !!token);
    if (token) {
        console.log('AuthInterceptor: Token (first 20 chars):', token.substring(0, 20) + '...');
    }

    // Clone the request and add the Authorization header if token exists
    if (token && !req.headers.has('Authorization')) {
        const cloned = req.clone({
            setHeaders: {
                'Authorization': `Bearer ${token}`
            }
        });
        console.log('AuthInterceptor: Added Authorization header to request');
        console.log('AuthInterceptor: Request headers:', cloned.headers.keys());
        
        return next(cloned).pipe(
            catchError((error: HttpErrorResponse) => {
                // Handle 401 Unauthorized errors
                if (error.status === 401) {
                    console.log('Received 401 Unauthorized - token may be expired or invalid');
                    // Clear the token and user data
                    try {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                    } catch (e) {
                        console.error('Error clearing localStorage:', e);
                    }
                    // Logout the user
                    authService.logout();
                    // Redirect to login with return URL
                    const currentUrl = router.url;
                    router.navigate(['/login'], {
                        queryParams: { returnUrl: currentUrl }
                    });
                }
                return throwError(() => error);
            })
        );
    }

    // If no token or header already exists, just pass the request through
    if (!token) {
        console.log('AuthInterceptor: No token found, passing request through without Authorization header');
    } else {
        console.log('AuthInterceptor: Authorization header already exists, passing through');
    }
    
    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
            // Handle 401 even without token (in case token was removed)
            if (error.status === 401) {
                try {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                } catch (e) {
                    console.error('Error clearing localStorage:', e);
                }
                authService.logout();
            }
            return throwError(() => error);
        })
    );
};

