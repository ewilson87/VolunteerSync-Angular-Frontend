import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';

@Component({
    selector: 'app-navbar',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './navbar.component.html',
    styleUrl: './navbar.component.css'
})
export class NavbarComponent implements OnInit {
    title = 'VolunteerSync';
    isLoggedIn = false;
    currentUser: User | null = null;

    constructor(private authService: AuthService) { }

    /**
     * Initializes the component and subscribes to authentication state changes.
     */
    ngOnInit(): void {
        this.authService.isLoggedIn.subscribe(loggedIn => {
            this.isLoggedIn = loggedIn;
        });

        this.authService.currentUser.subscribe(user => {
            this.currentUser = user;
        });
    }

    /**
     * Logs out the current user.
     */
    logout(): void {
        this.authService.logout();
    }

    /**
     * Checks if the current user is an admin.
     * 
     * @returns True if user is an admin, false otherwise
     */
    isAdmin(): boolean {
        return this.currentUser?.role === 'admin';
    }

    /**
     * Checks if the current user is an organizer.
     * 
     * @returns True if user is an organizer, false otherwise
     */
    isOrganizer(): boolean {
        return this.currentUser?.role === 'organizer';
    }

    /**
     * Checks if the current user is an organizer with an associated organization.
     * 
     * @returns True if user is an organizer with a valid organization ID, false otherwise
     */
    isOrganizerWithOrg(): boolean {
        return this.currentUser?.role === 'organizer' && this.currentUser?.organizationId !== undefined && this.currentUser?.organizationId > 0;
    }
} 