import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { VolunteerService } from '../../services/volunteer-service.service';
import { Event } from '../../models/event.model';
import { Organization } from '../../models/organization.model';
import { AuthService } from '../../services/auth.service';
import { InputValidationService } from '../../services/input-validation.service';
import { Tag } from '../../models/tag.model';
import { forkJoin } from 'rxjs';

@Component({
    selector: 'app-create-event',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './create-event.component.html',
    styleUrl: './create-event.component.css'
})
export class CreateEventComponent implements OnInit {
    event: Event = {
        title: '',
        description: '',
        eventDate: '',
        eventTime: '',
        eventLengthHours: 1,
        locationName: '',
        address: '',
        city: '',
        state: '',
        numNeeded: 1,
        numSignedUp: 0, // Explicitly set to zero for new events
        createdBy: 0, // Will be set from current user
        organizationId: 0
    };

    organizations: Organization[] = [];
    userOrganization: Organization | null = null; // Store the user's organization to check approval status
    loading: boolean = true;
    successMessage: string = '';
    errorMessage: string = '';
    debugUserState: string = '';
    isOrganizer: boolean = false;
    isAdmin: boolean = false;
    userOrgId: number | null = null;
    today: string = '';

    // Tags
    availableTags: Tag[] = [];
    selectedTagIds: number[] = [];
    tagsLoading = false;
    tagsError = '';
    tagsDropdownOpen = false;
    tagSearchQuery = '';

    // Time picker properties (15-minute intervals)
    eventHour: number = 9;
    eventMinute: number = 0;
    eventAmPm: 'AM' | 'PM' = 'AM';
    readonly availableMinutes = [0, 15, 30, 45];
    readonly availableHours = Array.from({ length: 12 }, (_, i) => i + 1);

    /**
     * Converts 12-hour format (hour, minute, AM/PM) to 24-hour format (HH:MM)
     */
    updateEventTime(): void {
        // Ensure values are numbers (select elements may return strings)
        let hour = typeof this.eventHour === 'string' ? parseInt(this.eventHour, 10) : this.eventHour;
        let minute = typeof this.eventMinute === 'string' ? parseInt(this.eventMinute, 10) : this.eventMinute;
        
        // Use default values if invalid
        if (isNaN(hour) || hour < 1 || hour > 12) {
            console.warn('Invalid hour value, using default:', { hour: this.eventHour });
            hour = 9;
            this.eventHour = 9;
        }
        if (isNaN(minute) || minute < 0 || minute > 59) {
            console.warn('Invalid minute value, using default:', { minute: this.eventMinute });
            minute = 0;
            this.eventMinute = 0;
        }
        
        let hour24 = hour;
        
        // Convert to 24-hour format
        if (this.eventAmPm === 'PM' && hour !== 12) {
            hour24 = hour + 12;
        } else if (this.eventAmPm === 'AM' && hour === 12) {
            hour24 = 0;
        }
        
        const hourStr = hour24.toString().padStart(2, '0');
        const minuteStr = minute.toString().padStart(2, '0');
        // Format as HH:MM for API (API expects HH:MM format, not HH:MM:SS)
        this.event.eventTime = `${hourStr}:${minuteStr}`;
    }

    /**
     * Parses eventTime (HH:MM:SS or HH:MM) and sets hour, minute, and AM/PM
     */
    parseEventTime(): void {
        if (this.event.eventTime) {
            const timeParts = this.event.eventTime.split(':');
            const hour24 = parseInt(timeParts[0], 10) || 9;
            const minute = parseInt(timeParts[1], 10) || 0;
            
            // Convert 24-hour to 12-hour format
            if (hour24 === 0) {
                this.eventHour = 12;
                this.eventAmPm = 'AM';
            } else if (hour24 === 12) {
                this.eventHour = 12;
                this.eventAmPm = 'PM';
            } else if (hour24 < 12) {
                this.eventHour = hour24;
                this.eventAmPm = 'AM';
            } else {
                this.eventHour = hour24 - 12;
                this.eventAmPm = 'PM';
            }
            
            // Round minute to nearest 15-minute interval
            const roundedMinute = Math.round(minute / 15) * 15;
            this.eventMinute = roundedMinute === 60 ? 0 : roundedMinute;
            this.updateEventTime();
        }
    }

    get canCreateEvents(): boolean {
        // Admins can always create events
        if (this.isAdmin) {
            return true;
        }
        // Organizers can only create events if their organization is approved
        if (this.isOrganizer && this.userOrganization) {
            return this.userOrganization.approvalStatus?.toLowerCase() === 'approved';
        }
        return false;
    }

    // US States list (alphabetical by state name)
    readonly usStates = [
        { code: 'AL', name: 'Alabama' },
        { code: 'AK', name: 'Alaska' },
        { code: 'AZ', name: 'Arizona' },
        { code: 'AR', name: 'Arkansas' },
        { code: 'CA', name: 'California' },
        { code: 'CO', name: 'Colorado' },
        { code: 'CT', name: 'Connecticut' },
        { code: 'DE', name: 'Delaware' },
        { code: 'FL', name: 'Florida' },
        { code: 'GA', name: 'Georgia' },
        { code: 'HI', name: 'Hawaii' },
        { code: 'ID', name: 'Idaho' },
        { code: 'IL', name: 'Illinois' },
        { code: 'IN', name: 'Indiana' },
        { code: 'IA', name: 'Iowa' },
        { code: 'KS', name: 'Kansas' },
        { code: 'KY', name: 'Kentucky' },
        { code: 'LA', name: 'Louisiana' },
        { code: 'ME', name: 'Maine' },
        { code: 'MD', name: 'Maryland' },
        { code: 'MA', name: 'Massachusetts' },
        { code: 'MI', name: 'Michigan' },
        { code: 'MN', name: 'Minnesota' },
        { code: 'MS', name: 'Mississippi' },
        { code: 'MO', name: 'Missouri' },
        { code: 'MT', name: 'Montana' },
        { code: 'NE', name: 'Nebraska' },
        { code: 'NV', name: 'Nevada' },
        { code: 'NH', name: 'New Hampshire' },
        { code: 'NJ', name: 'New Jersey' },
        { code: 'NM', name: 'New Mexico' },
        { code: 'NY', name: 'New York' },
        { code: 'NC', name: 'North Carolina' },
        { code: 'ND', name: 'North Dakota' },
        { code: 'OH', name: 'Ohio' },
        { code: 'OK', name: 'Oklahoma' },
        { code: 'OR', name: 'Oregon' },
        { code: 'PA', name: 'Pennsylvania' },
        { code: 'RI', name: 'Rhode Island' },
        { code: 'SC', name: 'South Carolina' },
        { code: 'SD', name: 'South Dakota' },
        { code: 'TN', name: 'Tennessee' },
        { code: 'TX', name: 'Texas' },
        { code: 'UT', name: 'Utah' },
        { code: 'VT', name: 'Vermont' },
        { code: 'VA', name: 'Virginia' },
        { code: 'WA', name: 'Washington' },
        { code: 'WV', name: 'West Virginia' },
        { code: 'WI', name: 'Wisconsin' },
        { code: 'WY', name: 'Wyoming' }
    ];

    constructor(
        private volunteerService: VolunteerService,
        private router: Router,
        private authService: AuthService,
        private inputValidation: InputValidationService
    ) { }

    /**
     * Initializes the component, validates user authorization, and loads organizations.
     */
    ngOnInit(): void {
        this.today = new Date().toISOString().split('T')[0];
        // Initialize time picker
        if (this.event.eventTime) {
            this.parseEventTime();
        } else {
            this.updateEventTime(); // Set default time (9:00 AM)
        }
        const currentUser = this.authService.currentUserValue;

        if (!currentUser) {
            this.errorMessage = 'You must be logged in to create events';
            this.router.navigate(['/login']);
            return;
        }

        if (currentUser.role === 'organizer') {
            this.isOrganizer = true;
            this.userOrgId = currentUser.organizationId || null;

            if (!this.userOrgId) {
                this.errorMessage = 'Your account is not linked to an organization. Please update your profile first.';
                setTimeout(() => {
                    this.router.navigate(['/profile']);
                }, 2000);
                return;
            }
        } else if (currentUser.role === 'admin') {
            this.isAdmin = true;
        } else {
            this.errorMessage = 'Only organizers or admins can create events';
            setTimeout(() => {
                this.router.navigate(['/events']);
            }, 2000);
            return;
        }

        if (currentUser.userId) {
            this.event.createdBy = currentUser.userId;
        } else {
            this.errorMessage = 'Invalid user account. Please contact support.';
            return;
        }

        this.loadOrganizations();
        this.loadTags();
    }

    /**
     * Loads organizations based on user role.
     * Organizers see only their organization; admins see all organizations.
     */
    loadOrganizations(): void {
        this.loading = true;

        if (this.isOrganizer && this.userOrgId) {
            this.volunteerService.getOrganization(this.userOrgId).subscribe({
                next: (organization) => {
                    let org: Organization;
                    if (Array.isArray(organization)) {
                        org = organization[0];
                        this.organizations = organization;
                    } else {
                        org = organization;
                        this.organizations = [organization];
                    }
                    
                    this.userOrganization = org;
                    
                    const approvalStatus = org.approvalStatus?.toLowerCase() || 'pending';
                    if (approvalStatus !== 'approved') {
                        if (approvalStatus === 'rejected') {
                            this.errorMessage = 'Your organization has been rejected. You cannot create events. Please contact support if you believe this is an error.';
                        } else {
                            this.errorMessage = 'Your organization is pending approval. You cannot create events until your organization is approved.';
                        }
                        this.loading = false;
                        return;
                    }
                    
                    this.loading = false;

                    if (this.organizations.length > 0 && this.organizations[0].organizationId) {
                        this.event.organizationId = this.organizations[0].organizationId;
                    }
                },
                error: (error) => {
                    this.errorMessage = 'Failed to load your organization. Please try again later.';
                    this.loading = false;
                }
            });
        }
        else if (this.isAdmin) {
            this.volunteerService.getOrganizations().subscribe({
                next: (organizations) => {
                    // Filter to only show approved organizations for admins (best practice)
                    // Admins should only create events for approved organizations
                    const approvedOrgs = organizations.filter(org => 
                        org.approvalStatus?.toLowerCase() === 'approved'
                    );
                    
                    // Sort organizations alphabetically by name
                    this.organizations = approvedOrgs.sort((a, b) => {
                        const nameA = (a.name || '').toLowerCase();
                        const nameB = (b.name || '').toLowerCase();
                        return nameA.localeCompare(nameB);
                    });
                    
                    this.loading = false;

                    // Set default organization if available
                    if (this.organizations.length > 0 && this.organizations[0].organizationId) {
                        this.event.organizationId = this.organizations[0].organizationId;
                    } else if (organizations.length > 0) {
                        // If no approved organizations, show warning
                        this.errorMessage = 'No approved organizations available. Please approve an organization first.';
                    }
                },
                error: (error) => {
                    console.error('Error loading organizations', error);
                    this.errorMessage = 'Failed to load organizations. Please try again later.';
                    this.loading = false;
                }
            });
        }
    }

    /**
     * Loads all available tags for use on the event form.
     */
    loadTags(): void {
        this.tagsLoading = true;
        this.tagsError = '';

        this.volunteerService.getAllTags().subscribe({
            next: (tags) => {
                this.availableTags = tags || [];
                this.tagsLoading = false;
            },
            error: (error) => {
                console.error('Error loading tags', error);
                this.tagsError = 'Tags could not be loaded. You can still create the event without tags.';
                this.tagsLoading = false;
            }
        });
    }

    /**
     * Toggles a tag selection when the checkbox is changed.
     * 
     * @param tagId - ID of the tag to toggle
     * @param checked - Whether the checkbox is checked
     */
    onTagToggle(tagId: number, checked: boolean): void {
        if (checked) {
            if (!this.selectedTagIds.includes(tagId)) {
                this.selectedTagIds = [...this.selectedTagIds, tagId];
            }
        } else {
            this.selectedTagIds = this.selectedTagIds.filter(id => id !== tagId);
        }
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
     * Gets the name of a tag by its ID.
     */
    getTagName(tagId: number): string {
        const tag = this.availableTags.find(t => t.tagId === tagId);
        return tag ? tag.name : '';
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
        if (!target.closest('.create-event-tags-dropdown-wrapper')) {
            this.closeTagsDropdown();
        }
    }

    onSubmit(): void {
        // Check if organizer's organization is approved (additional security check)
        if (this.isOrganizer && this.userOrganization) {
            const approvalStatus = this.userOrganization.approvalStatus?.toLowerCase() || 'pending';
            if (approvalStatus !== 'approved') {
                if (approvalStatus === 'rejected') {
                    this.errorMessage = 'Your organization has been rejected. You cannot create events. Please contact support if you believe this is an error.';
                } else {
                    this.errorMessage = 'Your organization is pending approval. You cannot create events until your organization is approved.';
                }
                return;
            }
        }
        
        // Validate and sanitize title
        const titleValidation = this.inputValidation.validateTextField(
            this.event.title,
            this.inputValidation.MAX_LENGTHS.eventTitle,
            'Event title'
        );
        if (!titleValidation.isValid) {
            this.errorMessage = titleValidation.error || 'Invalid event title';
            return;
        }
        this.event.title = titleValidation.sanitized;

        // Validate and sanitize description
        const descValidation = this.inputValidation.validateTextField(
            this.event.description,
            this.inputValidation.MAX_LENGTHS.eventDescription,
            'Event description'
        );
        if (!descValidation.isValid) {
            this.errorMessage = descValidation.error || 'Invalid event description';
            return;
        }
        this.event.description = descValidation.sanitized;

        // Validate date
        const dateValidation = this.inputValidation.validateDate(this.event.eventDate);
        if (!dateValidation.isValid) {
            this.errorMessage = dateValidation.error || 'Invalid event date';
            return;
        }
        this.event.eventDate = dateValidation.sanitized;

        // Ensure time is updated from time picker before validation
        this.updateEventTime();
        
        // Ensure eventTime is set and is a string
        if (!this.event.eventTime || typeof this.event.eventTime !== 'string') {
            this.errorMessage = 'Please select a valid event time';
            return;
        }

        // Validate time
        const timeValidation = this.inputValidation.validateTime(this.event.eventTime);
        if (!timeValidation.isValid) {
            this.errorMessage = timeValidation.error || 'Invalid event time';
            return;
        }
        this.event.eventTime = timeValidation.sanitized;

        // Validate location name
        const locationValidation = this.inputValidation.validateTextField(
            this.event.locationName,
            this.inputValidation.MAX_LENGTHS.locationName,
            'Location name'
        );
        if (!locationValidation.isValid) {
            this.errorMessage = locationValidation.error || 'Invalid location name';
            return;
        }
        this.event.locationName = locationValidation.sanitized;

        // Validate address
        const addressValidation = this.inputValidation.validateTextField(
            this.event.address,
            this.inputValidation.MAX_LENGTHS.address,
            'Address'
        );
        if (!addressValidation.isValid) {
            this.errorMessage = addressValidation.error || 'Invalid address';
            return;
        }
        this.event.address = addressValidation.sanitized;

        // Validate city
        const cityValidation = this.inputValidation.validateTextField(
            this.event.city,
            this.inputValidation.MAX_LENGTHS.city,
            'City'
        );
        if (!cityValidation.isValid) {
            this.errorMessage = cityValidation.error || 'Invalid city';
            return;
        }
        this.event.city = cityValidation.sanitized;

        // Validate state
        const stateValidation = this.inputValidation.validateState(this.event.state);
        if (!stateValidation.isValid) {
            this.errorMessage = stateValidation.error || 'Invalid state';
            return;
        }
        this.event.state = stateValidation.sanitized;

        // Validate eventLengthHours (required, must be 1-24)
        const hoursValidation = this.inputValidation.validateNumber(
            this.event.eventLengthHours,
            1,
            24,
            'Event length (hours)'
        );
        if (!hoursValidation.isValid) {
            this.errorMessage = hoursValidation.error || 'Event length must be between 1 and 24 hours';
            return;
        }
        this.event.eventLengthHours = hoursValidation.sanitized;

        // Validate numNeeded
        const numNeededValidation = this.inputValidation.validateNumber(
            this.event.numNeeded,
            1,
            10000,
            'Number of volunteers needed'
        );
        if (!numNeededValidation.isValid) {
            this.errorMessage = numNeededValidation.error || 'Invalid number of volunteers';
            return;
        }
        this.event.numNeeded = numNeededValidation.sanitized;

        // Ensure organizationId is set and valid
        if (!this.event.organizationId || this.event.organizationId <= 0) {
            this.errorMessage = 'Please select a valid organization';
            return;
        }

        // For organizers, validate they can only create events for their organization
        if (this.isOrganizer && this.userOrgId && this.event.organizationId !== this.userOrgId) {
            this.errorMessage = 'You can only create events for your own organization';
            return;
        }

        // Prevent creating events in the past
        const eventDateTime = new Date(`${this.event.eventDate}T${this.event.eventTime || '00:00'}`);
        if (isNaN(eventDateTime.getTime())) {
            this.errorMessage = 'Please provide a valid event date and time';
            return;
        }

        const now = new Date();
        if (eventDateTime < now) {
            this.errorMessage = 'Event date and time must be in the future';
            return;
        }

        // Ensure createdBy is set
        if (!this.event.createdBy || this.event.createdBy <= 0) {
            const currentUser = this.authService.currentUserValue;
            if (currentUser && currentUser.userId) {
                this.event.createdBy = currentUser.userId;
            } else {
                this.errorMessage = 'User authentication issue. Please log in again.';
                this.authService.logout();
                this.router.navigate(['/login']);
                return;
            }
        }

        console.log('Submitting event with data:', JSON.stringify(this.event));
        this.loading = true;
        this.volunteerService.createEvent(this.event).subscribe({
            next: (response) => {
                // Try to determine the new event ID from the response
                const newEventId: number | undefined =
                    response?.eventId ?? response?.insertId ?? response?.id;

                const finalizeSuccess = () => {
                    this.successMessage = 'Event created successfully!';
                    this.errorMessage = '';
                    this.loading = false;

                    // Redirect to events page after a delay
                    setTimeout(() => {
                        this.router.navigate(['/events']);
                    }, 2000);
                };

                // If we have tags selected and a valid event ID, add tags
                if (newEventId && this.selectedTagIds.length > 0) {
                    const tagRequests = this.selectedTagIds.map(tagId =>
                        this.volunteerService.addTagToEvent(newEventId, tagId)
                    );

                    forkJoin(tagRequests).subscribe({
                        next: () => {
                            finalizeSuccess();
                        },
                        error: (tagError) => {
                            console.error('Error adding tags to event', tagError);
                            // Still consider the event created, but show a warning
                            this.successMessage = 'Event created, but some tags could not be saved.';
                            this.loading = false;
                            setTimeout(() => {
                                this.router.navigate(['/events']);
                            }, 2000);
                        }
                    });
                } else {
                    finalizeSuccess();
                }
            },
            error: (error) => {
                console.error('Error creating event', error);
                this.errorMessage = 'Failed to create event. Please try again later.';
                this.successMessage = '';
                this.loading = false;
            }
        });
    }
} 