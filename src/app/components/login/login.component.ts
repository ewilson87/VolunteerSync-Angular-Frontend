import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { VolunteerService } from '../../services/volunteer-service.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './login.component.html',
    styleUrl: './login.component.css'
})
export class LoginComponent {
    email: string = '';
    password: string = '';
    errorMessage: string = '';
    returnUrl: string = '';

    constructor(
        private volunteerService: VolunteerService,
        private authService: AuthService,
        private router: Router,
        private route: ActivatedRoute
    ) {
        this.route.queryParams.subscribe(params => {
            this.returnUrl = params['returnUrl'] || '/';
        });
    }

    /**
     * Handles user login submission.
     * Validates credentials, authenticates user, stores JWT token, and redirects based on user role.
     */
    onLogin(): void {
        if (!this.email || !this.password) {
            this.errorMessage = 'Please enter both email and password';
            return;
        }

        const credentials = {
            email: this.email,
            password: this.password
        };

        this.volunteerService.loginUser(credentials).subscribe({
            next: (response) => {
                const { token, user } = response;

                if (!token || !user) {
                    this.errorMessage = 'Invalid response from server';
                    return;
                }

                this.authService.setToken(token);
                this.authService.setCurrentUser(user);

                let redirectUrl = this.returnUrl;
                
                if (this.returnUrl === '/' || this.returnUrl === '/login') {
                    if (user.role === 'admin') {
                        redirectUrl = '/admin';
                    } else if (user.role === 'organizer') {
                        redirectUrl = '/organizer';
                    } else {
                        redirectUrl = '/events';
                    }
                }

                this.router.navigateByUrl(redirectUrl);
            },
            error: (error) => {
                if (error.status === 401) {
                    this.errorMessage = 'Invalid email or password';
                } else if (error.status === 0) {
                    this.errorMessage = 'We\'re having trouble connecting to our servers. Please try again in a few moments, or contact support if the problem persists.';
                } else if (error.status === 404) {
                    this.errorMessage = 'Service temporarily unavailable. Please try again later.';
                } else if (error.error && typeof error.error === 'string' && error.error.includes('<!DOCTYPE')) {
                    this.errorMessage = 'Service temporarily unavailable. Please try again later.';
                } else {
                    this.errorMessage = error.error?.message || error.message || 'Login failed. Please try again.';
                }
            }
        });
    }
} 