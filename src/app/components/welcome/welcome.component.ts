import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';

@Component({
    selector: 'app-welcome',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './welcome.component.html',
    styleUrl: './welcome.component.css'
})
export class WelcomeComponent implements OnInit {
    title = 'Welcome to';
    isLoggedIn = false;
    currentUser: User | null = null;
    isAdmin = false;
    isOrganizer = false;

    constructor(private authService: AuthService) { }

    /**
     * Initializes the component and subscribes to authentication state changes.
     */
    ngOnInit(): void {
        this.isLoggedIn = this.authService.isLoggedInValue;
        this.currentUser = this.authService.currentUserValue;
        this.updateUserInfo();

        this.authService.isLoggedIn.subscribe(status => {
            this.isLoggedIn = status;
            if (!status) {
                this.currentUser = null;
            }
            this.updateUserInfo();
        });

        this.authService.currentUser.subscribe(user => {
            this.currentUser = user;
            this.updateUserInfo();
        });
    }

    /**
     * Updates user role flags based on current user.
     */
    private updateUserInfo(): void {
        if (this.currentUser) {
            this.isAdmin = this.currentUser.role?.toLowerCase() === 'admin';
            this.isOrganizer = this.currentUser.role?.toLowerCase() === 'organizer';
        } else {
            this.isAdmin = false;
            this.isOrganizer = false;
        }
    }
} 