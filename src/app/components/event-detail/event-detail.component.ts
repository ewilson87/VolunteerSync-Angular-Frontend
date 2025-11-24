import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { VolunteerService } from '../../services/volunteer-service.service';
import { Event } from '../../models/event.model';
import { Signup } from '../../models/signup.model';
import { Organization } from '../../models/organization.model';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-event-detail',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './event-detail.component.html',
    styleUrl: './event-detail.component.css'
})
export class EventDetailComponent implements OnInit {
    eventId: number = 0;
    event: Event | null = null;
    organization: Organization | null = null;
    loading: boolean = true;
    error: string = '';
    signupSuccess: boolean = false;
    signupError: string = '';
    cancellationMessage: string = '';
    isPastEvent: boolean = false;

    // Authentication state from auth service
    isLoggedIn: boolean = false;
    currentUserId: number | null = null;

    // Registration status
    isRegistered: boolean = false;
    userSignup: Signup | null = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private volunteerService: VolunteerService,
        private authService: AuthService
    ) { }

    /**
     * Initializes the component, loads event details, and sets up authentication subscriptions.
     */
    ngOnInit(): void {
        this.route.params.subscribe(params => {
            this.eventId = +params['id'];
            this.loadEventDetails();
        });

        this.authService.isLoggedIn.subscribe(isLoggedIn => {
            this.isLoggedIn = isLoggedIn;

            if (isLoggedIn && this.currentUserId && this.eventId) {
                this.checkIfUserIsRegistered();
            } else {
                this.isRegistered = false;
                this.userSignup = null;
            }
        });

        this.authService.currentUser.subscribe(user => {
            this.currentUserId = user?.userId || null;

            if (this.isLoggedIn && this.currentUserId && this.eventId) {
                this.checkIfUserIsRegistered();
            } else {
                this.isRegistered = false;
                this.userSignup = null;
            }
        });
    }

    /**
     * Loads event details from the API.
     */
    loadEventDetails(): void {
        this.loading = true;
        this.volunteerService.getEvent(this.eventId).subscribe({
            next: (response) => {
                if (Array.isArray(response)) {
                    this.event = response[0];
                } else {
                    this.event = response;
                }

                if (this.event) {
                    this.isPastEvent = this.isEventInPast(this.event);
                }

                if (this.event && this.event.organizationId) {
                    this.loadOrganizationDetails(this.event.organizationId);
                } else {
                    this.loading = false;
                }

                if (this.isLoggedIn && this.currentUserId) {
                    this.checkIfUserIsRegistered();
                }
            },
            error: (error) => {
                this.error = 'Failed to load event details. Please try again later.';
                this.loading = false;
            }
        });
    }

    /**
     * Loads organization details for the event.
     * 
     * @param organizationId - The ID of the organization to load
     */
    loadOrganizationDetails(organizationId: number): void {
        this.volunteerService.getOrganization(organizationId).subscribe({
            next: (response) => {
                if (Array.isArray(response)) {
                    this.organization = response[0];
                } else {
                    this.organization = response;
                }
                this.loading = false;
            },
            error: (error) => {
                this.loading = false;
            }
        });
    }

    /**
     * Checks if the current user is already registered for this event.
     */
    checkIfUserIsRegistered(): void {
        if (!this.currentUserId || !this.eventId) {
            this.isRegistered = false;
            return;
        }

        this.volunteerService.getUserSignups(this.currentUserId).subscribe({
            next: (signups) => {
                console.log('User signups:', signups);
                // Find if user is registered for this event
                const eventSignup = signups.find(signup =>
                    signup.eventId === this.eventId &&
                    signup.status === 'registered'
                );

                this.isRegistered = !!eventSignup;
                this.userSignup = eventSignup || null;
                console.log('User registration status:', this.isRegistered ? 'Registered' : 'Not registered');
                if (eventSignup) {
                    console.log('Signup details:', eventSignup);
                }
            },
            error: (error) => {
                console.error('Error checking registration status', error);
                this.isRegistered = false;
            }
        });
    }

    signupForEvent(): void {
        // Check if user is logged in
        if (!this.isLoggedIn) {
            this.signupError = 'Please log in to sign up for this event.';
            return;
        }

        // Check if event was loaded
        if (!this.event || !this.event.eventId) {
            this.signupError = 'Event information not available.';
            return;
        }

        const userId = this.authService.currentUserValue?.userId;
        if (!userId) {
            this.signupError = 'User information not available.';
            return;
        }

        // Create a signup object with the required fields
        const signup: Signup = {
            userId: userId,
            eventId: this.event.eventId,
            signupDate: new Date().toISOString(),
            status: 'active'
        };

        this.volunteerService.createSignup(signup).subscribe({
            next: (response) => {
                console.log('Signup successful:', response);
                this.signupSuccess = true;
                this.signupError = '';
                this.cancellationMessage = '';

                // Update the isRegistered flag and store the signup
                this.isRegistered = true;
                this.userSignup = response;

                // Update the event to show the increased number of signups
                this.loadEventDetails();
            },
            error: (error) => {
                console.error('Error signing up:', error);
                this.signupError = 'Failed to sign up for this event. Please try again.';
                this.signupSuccess = false;
            }
        });
    }

    cancelRegistration(): void {
        if (!this.userSignup || !this.userSignup.signupId) {
            this.signupError = 'Could not find your registration for this event.';
            return;
        }

        this.volunteerService.deleteSignup(this.userSignup.signupId).subscribe({
            next: () => {
                this.signupSuccess = false;
                this.signupError = '';
                this.isRegistered = false;
                this.userSignup = null;
                this.cancellationMessage = 'You have successfully cancelled your registration.';
                console.log('Registration cancelled successfully');

                // Refresh event details to update the count
                this.loadEventDetails();
            },
            error: (error) => {
                console.error('Error cancelling registration', error);
                this.signupError = 'Failed to cancel your registration. Please try again later.';
            }
        });
    }

    // Check if an event is in the past
    isEventInPast(event: Event): boolean {
        // Create date objects
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to midnight for date-only comparison

        // Parse event date (format: YYYY-MM-DD)
        const [year, month, day] = event.eventDate.split('-').map(num => parseInt(num));
        const eventDate = new Date(year, month - 1, day); // Month is 0-indexed in JS Date

        return eventDate < today;
    }
} 