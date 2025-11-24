import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Guard for routes that require any authenticated user
export const authGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isLoggedInValue) {
        return true;
    }

    // Redirect to login page with return URL
    router.navigate(['/unauthorized'], {
        queryParams: {
            returnUrl: state.url,
            message: 'Please sign in to continue where you left off.'
        }
    });
    return false;
};

// Guard for routes that require organizer or admin role
export const organizerGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const currentUser = authService.currentUserValue;

    if (authService.isLoggedInValue && currentUser &&
        (currentUser.role === 'organizer' || currentUser.role === 'admin')) {
        return true;
    }

    if (!authService.isLoggedInValue) {
        router.navigate(['/unauthorized'], {
            queryParams: {
                returnUrl: state.url,
                message: 'Please sign in as an organizer or admin to continue.'
            }
        });
    } else {
        router.navigate(['/forbidden'], {
            queryParams: {
                message: 'Only organizers have access to this area.'
            }
        });
    }
    return false;
};

// Guard for routes that require admin role
export const adminGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const currentUser = authService.currentUserValue;

    if (authService.isLoggedInValue && currentUser && currentUser.role === 'admin') {
        return true;
    }

    if (!authService.isLoggedInValue) {
        router.navigate(['/unauthorized'], {
            queryParams: {
                returnUrl: state.url,
                message: 'Please sign in with an admin account to continue.'
            }
        });
    } else {
        router.navigate(['/forbidden'], {
            queryParams: {
                message: 'Administrator access is required for this section.'
            }
        });
    }
    return false;
}; 