import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { VolunteerService } from '../../services/volunteer-service.service';
import { Event } from '../../models/event.model';
import { Signup } from '../../models/signup.model';
import { Organization } from '../../models/organization.model';
import { AuthService } from '../../services/auth.service';
import { Tag, EventTagWithDetails } from '../../models/tag.model';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

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

    // Tags
    eventTags: Tag[] = [];

    // Follow status
    isFollowingOrganization: boolean = false;
    isCheckingFollow: boolean = false;
    isTogglingFollow: boolean = false;

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
                    // Load tags for this event
                    if (this.event.eventId) {
                        this.loadEventTags(this.event.eventId);
                    }
                }

                if (this.event && this.event.organizationId) {
                    this.loadOrganizationDetails(this.event.organizationId);
                    // Check if user follows this organization
                    if (this.isLoggedIn && this.currentUserId) {
                        this.checkFollowStatus(this.event.organizationId);
                    }
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
     * Loads tags for the event.
     * 
     * @param eventId - The ID of the event to load tags for
     */
    loadEventTags(eventId: number): void {
        console.log('Loading tags for event:', eventId);
        this.volunteerService.getTagsForEvent(eventId).subscribe({
            next: (eventTags: EventTagWithDetails[]) => {
                console.log('Tags loaded for event', eventId, ':', eventTags);
                this.eventTags = eventTags.map(et => ({
                    tagId: et.tagId,
                    name: et.tagName || 'Unknown Tag'
                } as Tag));
                console.log('Mapped tags:', this.eventTags);
            },
            error: (error) => {
                console.error('Failed to load event tags for event', eventId, error);
                // If it's a 500 error, it's likely a backend SQL issue
                if (error.status === 500) {
                    console.warn('Backend error loading tags - this may be a backend SQL issue. Check backend logs.');
                }
                this.eventTags = [];
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
     * Checks if the current user follows the organization.
     * 
     * @param organizationId - The ID of the organization
     */
    checkFollowStatus(organizationId: number): void {
        if (!this.isLoggedIn || !this.currentUserId) {
            return;
        }
        this.isCheckingFollow = true;
        this.volunteerService.checkUserFollowsOrganization(this.currentUserId, organizationId).subscribe({
            next: (status) => {
                this.isFollowingOrganization = status.isFollowing;
                this.isCheckingFollow = false;
            },
            error: (error) => {
                // Silently handle 404 errors (endpoint may not be implemented yet)
                if (error.status !== 404) {
                    console.error('Error checking follow status', error);
                }
                this.isFollowingOrganization = false;
                this.isCheckingFollow = false;
            }
        });
    }

    /**
     * Toggles follow status for the organization.
     */
    toggleFollowOrganization(): void {
        if (!this.isLoggedIn || !this.currentUserId || !this.organization?.organizationId || this.isTogglingFollow) {
            return;
        }

        this.isTogglingFollow = true;
        const organizationId = this.organization.organizationId;

        if (this.isFollowingOrganization) {
            // Unfollow
            this.volunteerService.unfollowOrganization(this.currentUserId, organizationId).subscribe({
                next: () => {
                    this.isFollowingOrganization = false;
                    this.isTogglingFollow = false;
                },
                error: (error) => {
                    // Only log non-404 errors (404 means endpoint not implemented)
                    if (error.status !== 404) {
                        console.error('Error unfollowing organization', error);
                    } else {
                        console.warn('Follow organization endpoint not available (404). Backend may need to implement this feature.');
                    }
                    this.isTogglingFollow = false;
                }
            });
        } else {
            // Follow
            this.volunteerService.followOrganization(this.currentUserId, organizationId).subscribe({
                next: () => {
                    this.isFollowingOrganization = true;
                    this.isTogglingFollow = false;
                },
                error: (error) => {
                    // Only log non-404 errors (404 means endpoint not implemented)
                    if (error.status !== 404) {
                        console.error('Error following organization', error);
                    } else {
                        console.warn('Follow organization endpoint not available (404). Backend may need to implement this feature.');
                    }
                    this.isTogglingFollow = false;
                }
            });
        }
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

    /**
     * Converts 24-hour time format (HH:MM or HH:MM:SS) to 12-hour AM/PM format
     * @param time24 - Time in 24-hour format (e.g., "14:30" or "14:30:00")
     * @returns Time in 12-hour format with AM/PM (e.g., "2:30 PM")
     */
    formatTime12Hour(time24: string | null | undefined): string {
        if (!time24) {
            return '';
        }

        // Handle both HH:MM and HH:MM:SS formats
        const timeParts = time24.trim().split(':');
        if (timeParts.length < 2) {
            return time24; // Return original if format is unexpected
        }

        const hour24 = parseInt(timeParts[0], 10);
        const minute = parseInt(timeParts[1], 10);

        if (isNaN(hour24) || isNaN(minute)) {
            return time24; // Return original if parsing fails
        }

        let hour12 = hour24;
        const amPm = hour24 >= 12 ? 'PM' : 'AM';

        if (hour24 === 0) {
            hour12 = 12; // Midnight
        } else if (hour24 === 12) {
            hour12 = 12; // Noon
        } else if (hour24 > 12) {
            hour12 = hour24 - 12;
        }

        return `${hour12}:${minute.toString().padStart(2, '0')} ${amPm}`;
    }
} 