import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ErrorHandlerService {

    constructor(private router: Router) { }

    /**
     * Handle HTTP errors globally
     */
    handleError(error: HttpErrorResponse) {
        let errorMessage = '';

        if (error.status === 0) {
            // A client-side or network error occurred
            console.error('A network error occurred:', error.error);
            errorMessage = 'A network error occurred. Please check your connection.';
        } else if (error.status === 404) {
            // Not found error
            console.error(`Backend returned code ${error.status}, body was:`, error.error);
            this.router.navigate(['/not-found']);
            return throwError(() => error);
        } else if (error.status === 500) {
            // Server error
            console.error(`Backend returned code ${error.status}, body was:`, error.error);
            this.router.navigate(['/server-error']);
            return throwError(() => error);
        } else {
            // The backend returned an unsuccessful response code
            console.error(
                `Backend returned code ${error.status}, body was:`, error.error);
            errorMessage = error.error?.message || 'An unexpected error occurred.';
        }

        // Return an observable with a user-facing error message
        return throwError(() => new Error(errorMessage));
    }
} 