import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { VolunteerService } from '../../services/volunteer-service.service';
import { AuthService } from '../../services/auth.service';
import type { Event } from '../../models/event.model';
import { Organization } from '../../models/organization.model';
import { User } from '../../models/user.model';
import { Signup } from '../../models/signup.model';
import { Tag, EventTagWithDetails } from '../../models/tag.model';
import { forkJoin } from 'rxjs';

@Component({
    selector: 'app-event-management',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
    templateUrl: './event-management.component.html',
    styleUrl: './event-management.component.css'
})
export class EventManagementComponent implements OnInit {
    // User and organization data
    currentUser: User | null = null;
    userOrganization: Organization | null = null;

    // Event data
    events: Event[] = [];
    selectedEvent: Event | null = null;
    eventForm: FormGroup;
    isEditMode = false;

    // Signup data
    eventSignups: Signup[] = [];
    signupUsers: Map<number, User> = new Map();
    selectedEventId: number | null = null;

    // UI state
    isLoading = true;
    error = '';
    success = '';
    showDeleteConfirmation = false;
    showRegistrations = false;

    // Form states
    states = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
    ];

    // Tags
    availableTags: Tag[] = [];
    selectedTagIds: number[] = [];
    originalTagIds: number[] = [];
    tagsDropdownOpen = false;
    tagSearchQuery = '';
    tagsLoading = false;

    constructor(
        private fb: FormBuilder,
        private volunteerService: VolunteerService,
        private authService: AuthService
    ) {
        this.eventForm = this.createEventForm();
    }

    /**
     * Initializes the component and loads organization and events for organizers/admins.
     */
    ngOnInit(): void {
        this.authService.currentUser.subscribe(user => {
            this.currentUser = user;
            if (user && (user.role === 'organizer' || user.role === 'admin')) {
                if (user.organizationId) {
                    this.loadOrganization(user.organizationId);
                    this.loadOrganizationEvents(user.organizationId);
                    this.loadTags();
                } else {
                    this.isLoading = false;
                    this.error = 'You are not associated with any organization.';
                }
            } else {
                this.isLoading = false;
            }
        });
    }

    /**
     * Loads all available tags for use in the event form.
     */
    loadTags(): void {
        this.tagsLoading = true;
        this.volunteerService.getAllTags().subscribe({
            next: (tags) => {
                this.availableTags = tags || [];
                this.tagsLoading = false;
            },
            error: (error) => {
                // Tags are optional; log error but don't block the page
                console.error('Failed to load tags for event management', error);
                this.tagsLoading = false;
            }
        });
    }

    /**
     * Creates and returns a FormGroup for event creation/editing.
     * 
     * @returns A FormGroup with event form controls and validators
     */
    createEventForm(): FormGroup {
        return this.fb.group({
            title: ['', [Validators.required, Validators.maxLength(100)]],
            description: ['', [Validators.required, Validators.maxLength(500)]],
            eventDate: ['', Validators.required],
            eventTime: ['', Validators.required],
            locationName: ['', [Validators.required, Validators.maxLength(100)]],
            address: ['', [Validators.required, Validators.maxLength(200)]],
            city: ['', [Validators.required, Validators.maxLength(100)]],
            state: ['', [Validators.required, Validators.maxLength(2)]],
            numNeeded: [1, [Validators.required, Validators.min(1), Validators.max(1000)]]
        });
    }

    /**
     * Loads organization details for the specified organization ID.
     * 
     * @param organizationId - The ID of the organization to load
     */
    loadOrganization(organizationId: number): void {
        this.volunteerService.getOrganization(organizationId).subscribe({
            next: (organization) => {
                this.userOrganization = organization;
            },
            error: (error) => {
                this.error = 'Failed to load organization details.';
            }
        });
    }

    /**
     * Loads all events for the specified organization.
     * 
     * @param organizationId - The ID of the organization to load events for
     */
    loadOrganizationEvents(organizationId: number): void {
        this.volunteerService.getEvents().subscribe({
            next: (events) => {
                this.events = events.filter(event => event.organizationId === organizationId);
                this.isLoading = false;
            },
            error: (error) => {
                this.error = 'Failed to load events.';
                this.isLoading = false;
            }
        });
    }

    /**
     * Prepares the form for creating a new event.
     */
    onCreateEvent(): void {
        this.isEditMode = false;
        this.selectedEvent = null;
        this.selectedTagIds = [];
        this.originalTagIds = [];
        this.tagsDropdownOpen = false;
        this.tagSearchQuery = '';
        this.eventForm.reset({
            numNeeded: 1,
            state: ''
        });
    }

    /**
     * Prepares the form for editing an existing event.
     * 
     * @param event - The event to edit
     */
    onEditEvent(event: Event): void {
        this.isEditMode = true;
        this.selectedEvent = event;
        this.tagsDropdownOpen = false;
        this.tagSearchQuery = '';

        this.eventForm.patchValue({
            title: event.title,
            description: event.description,
            eventDate: event.eventDate,
            eventTime: event.eventTime,
            locationName: event.locationName,
            address: event.address,
            city: event.city,
            state: event.state,
            numNeeded: event.numNeeded
        });

        this.selectedTagIds = [];
        this.originalTagIds = [];

        if (event.eventId) {
            this.volunteerService.getTagsForEvent(event.eventId).subscribe({
                next: (eventTags: EventTagWithDetails[]) => {
                    const ids = eventTags.map(t => t.tagId);
                    this.selectedTagIds = [...ids];
                    this.originalTagIds = [...ids];
                },
                error: (error) => {
                    console.error('Failed to load tags for event', error);
                }
            });
        }

        // Scroll to the form after a brief delay to ensure DOM is updated
        setTimeout(() => {
            const formCard = document.getElementById('event-form-card');
            if (formCard) {
                formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    }

    /**
     * Shows the delete confirmation dialog for an event.
     * 
     * @param event - The event to delete
     */
    confirmDeleteEvent(event: Event): void {
        this.selectedEvent = event;
        this.showDeleteConfirmation = true;
    }

    /**
     * Cancels the delete confirmation dialog.
     */
    cancelDelete(): void {
        this.selectedEvent = null;
        this.showDeleteConfirmation = false;
    }

    /**
     * Deletes the selected event.
     */
    deleteEvent(): void {
        if (!this.selectedEvent || !this.selectedEvent.eventId) return;

        this.volunteerService.deleteEvent(this.selectedEvent.eventId).subscribe({
            next: () => {
                this.success = `Event "${this.selectedEvent!.title}" deleted successfully.`;
                this.events = this.events.filter(e => e.eventId !== this.selectedEvent!.eventId);
                this.showDeleteConfirmation = false;
                this.selectedEvent = null;
            },
            error: (error) => {
                this.error = 'Failed to delete event. Please ensure all registrations are cancelled first.';
            }
        });
    }

    /**
     * Handles form submission for creating or updating an event.
     */
    onSubmitEvent(): void {
        if (this.eventForm.invalid) {
            Object.keys(this.eventForm.controls).forEach(key => {
                const control = this.eventForm.get(key);
                control?.markAsTouched();
            });
            return;
        }

        const eventData: Event = {
            ...this.eventForm.value,
            organizationId: this.currentUser?.organizationId || 0,
            createdBy: this.currentUser?.userId || 0
        };

        const syncTagsAndFinalize = (eventId: number, isUpdate: boolean) => {
            const currentIds = this.selectedTagIds || [];
            const originalIds = this.originalTagIds || [];

            const tagsToAdd = currentIds.filter(id => !originalIds.includes(id));
            const tagsToRemove = originalIds.filter(id => !currentIds.includes(id));

            const requests = [
                ...tagsToAdd.map(id => this.volunteerService.addTagToEvent(eventId, id)),
                ...tagsToRemove.map(id => this.volunteerService.removeTagFromEvent(eventId, id))
            ];

            if (requests.length === 0) {
                this.finalizeEventSave(eventData, eventId, isUpdate);
                return;
            }

            forkJoin(requests).subscribe({
                next: () => {
                    this.finalizeEventSave(eventData, eventId, isUpdate);
                },
                error: (error) => {
                    console.error('Failed to update tags for event', error);
                    this.finalizeEventSave(eventData, eventId, isUpdate);
                }
            });
        };

        if (this.isEditMode && this.selectedEvent?.eventId) {
            this.volunteerService.updateEvent(this.selectedEvent.eventId, eventData).subscribe({
                next: () => {
                    this.success = `Event "${eventData.title}" updated successfully.`;
                    syncTagsAndFinalize(this.selectedEvent!.eventId!, true);
                },
                error: (error) => {
                    this.error = 'Failed to update event.';
                }
            });
        } else {
            this.volunteerService.createEvent(eventData).subscribe({
                next: (response) => {
                    const newEventId: number | undefined =
                        response?.eventId ?? response?.insertId ?? response?.id;

                    if (!newEventId) {
                        this.success = `Event "${eventData.title}" created successfully.`;
                        this.eventForm.reset({
                            numNeeded: 1,
                            state: ''
                        });
                        return;
                    }

                    syncTagsAndFinalize(newEventId, false);
                },
                error: (error) => {
                    this.error = 'Failed to create event.';
                }
            });
        }
    }

    /**
     * Cancels the form and resets to initial state.
     */
    cancelForm(): void {
        this.eventForm.reset({
            numNeeded: 1,
            state: ''
        });
        this.isEditMode = false;
        this.selectedEvent = null;
        this.selectedTagIds = [];
        this.originalTagIds = [];
        this.tagsDropdownOpen = false;
        this.tagSearchQuery = '';
    }

    /**
     * Shows registrations for a specific event.
     * 
     * @param eventId - The ID of the event to view registrations for
     */
    viewRegistrations(eventId: number): void {
        this.selectedEventId = eventId;
        this.showRegistrations = true;
        this.loadEventSignups(eventId);
    }

    /**
     * Hides the registrations view and clears related data.
     */
    hideRegistrations(): void {
        this.showRegistrations = false;
        this.selectedEventId = null;
        this.eventSignups = [];
        this.signupUsers.clear();
    }

    /**
     * Loads signups for a specific event and fetches user details.
     * 
     * @param eventId - The ID of the event to load signups for
     */
    loadEventSignups(eventId: number): void {
        this.volunteerService.getEventSignups(eventId).subscribe({
            next: (signups) => {
                this.eventSignups = signups;

                signups.forEach(signup => {
                    if (signup.userId) {
                        this.volunteerService.getUser(signup.userId).subscribe({
                            next: (user) => {
                                this.signupUsers.set(signup.userId!, user);
                            },
                            error: (error) => {
                                // Silently fail - user details are optional
                            }
                        });
                    }
                });
            },
            error: (error) => {
                this.error = 'Failed to load event registrations.';
            }
        });
    }

    /**
     * Cancels a user's registration for an event.
     * 
     * @param signupId - The ID of the signup to cancel
     */
    cancelRegistration(signupId: number): void {
        this.volunteerService.deleteSignup(signupId).subscribe({
            next: () => {
                this.success = 'Registration cancelled successfully.';
                this.eventSignups = this.eventSignups.filter(s => s.signupId !== signupId);
            },
            error: (error) => {
                this.error = 'Failed to cancel registration.';
            }
        });
    }

    /**
     * Gets the full name of a user by their ID.
     * 
     * @param userId - The ID of the user
     * @returns The user's full name or "Unknown User" if not found
     */
    getUserName(userId: number): string {
        const user = this.signupUsers.get(userId);
        return user ? `${user.firstName} ${user.lastName}` : 'Unknown User';
    }

    /**
     * Gets the email of a user by their ID.
     * 
     * @param userId - The ID of the user
     * @returns The user's email or "Unknown" if not found
     */
    getUserEmail(userId: number): string {
        const user = this.signupUsers.get(userId);
        return user ? user.email : 'Unknown';
    }

    /**
     * Determines if an event date is in the past.
     * 
     * @param event - The event to check
     * @returns True if the event date is before today, false otherwise
     */
    isEventInPast(event: Event): boolean {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [year, month, day] = event.eventDate.split('-').map(num => parseInt(num));
        const eventDate = new Date(year, month - 1, day);

        return eventDate < today;
    }

    /**
     * Gets the currently selected event from the events array.
     * 
     * @returns The selected event or undefined if not found
     */
    getSelectedEvent(): Event | undefined {
        return this.events.find(e => e.eventId === this.selectedEventId);
    }

    /**
     * Toggles tag selection by clicking on it in the dropdown.
     * 
     * @param tagId - ID of the tag to toggle
     */
    toggleTag(tagId: number): void {
        if (this.selectedTagIds.includes(tagId)) {
            this.selectedTagIds = this.selectedTagIds.filter(id => id !== tagId);
        } else {
            this.selectedTagIds = [...this.selectedTagIds, tagId];
        }
    }

    /**
     * Removes a selected tag.
     * 
     * @param tagId - ID of the tag to remove
     */
    removeTag(tagId: number): void {
        this.selectedTagIds = this.selectedTagIds.filter(id => id !== tagId);
    }

    /**
     * Gets filtered tags based on search query.
     */
    get filteredTags(): Tag[] {
        if (!this.tagSearchQuery.trim()) {
            return this.availableTags;
        }
        const query = this.tagSearchQuery.toLowerCase();
        return this.availableTags.filter(tag =>
            tag.name.toLowerCase().includes(query)
        );
    }

    /**
     * Gets selected tags as Tag objects.
     */
    get selectedTags(): Tag[] {
        return this.availableTags.filter(tag => this.selectedTagIds.includes(tag.tagId));
    }

    /**
     * Closes the tags dropdown when clicking outside.
     */
    closeTagsDropdown(): void {
        this.tagsDropdownOpen = false;
        this.tagSearchQuery = '';
    }

    /**
     * Listens for clicks outside the dropdown to close it.
     */
    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (!target.closest('.event-mgmt-tags-dropdown-wrapper')) {
            this.closeTagsDropdown();
        }
    }

    /**
     * Finalizes local state after creating or updating an event,
     * updating the events array and resetting the form.
     */
    private finalizeEventSave(eventData: Event, eventId: number, isUpdate: boolean): void {
        if (isUpdate) {
            const index = this.events.findIndex(e => e.eventId === eventId);
            if (index !== -1) {
                this.events[index] = { ...eventData, eventId };
            }
        } else {
            this.events.push({ ...eventData, eventId });
        }

        this.eventForm.reset({
            numNeeded: 1,
            state: ''
        });
        this.isEditMode = false;
        this.selectedEvent = null;
        this.selectedTagIds = [];
        this.originalTagIds = [];
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