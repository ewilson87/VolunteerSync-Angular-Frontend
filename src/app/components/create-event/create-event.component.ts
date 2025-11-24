import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { VolunteerService } from '../../services/volunteer-service.service';
import { Event } from '../../models/event.model';
import { Organization } from '../../models/organization.model';
import { AuthService } from '../../services/auth.service';
import { InputValidationService } from '../../services/input-validation.service';

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
                this.successMessage = 'Event created successfully!';
                this.errorMessage = '';
                this.loading = false;

                // Redirect to events page after a delay
                setTimeout(() => {
                    this.router.navigate(['/events']);
                }, 2000);
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