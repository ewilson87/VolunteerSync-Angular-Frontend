import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { User } from '../../models/user.model';
import { Organization } from '../../models/organization.model';
import { AuthService } from '../../services/auth.service';
import { VolunteerService } from '../../services/volunteer-service.service';
import { Signup } from '../../models/signup.model';
import { Event } from '../../models/event.model';
import { VolunteerMetrics } from '../../models/metrics.model';
import { InputValidationService } from '../../services/input-validation.service';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

interface EventWithDetails extends Event {
  signupId?: number;
  signupDate?: string;
  signupStatus?: string;
  isPast?: boolean;
}

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, BaseChartDirective],
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.css'
})
export class UserProfileComponent implements OnInit {
  user: User | null = null;
  editableUser: User | null = null;
  organization: Organization | null = null;
  editableOrg: Organization | null = null;
  isLoading = true;
  error = '';
  success = '';
  isEditingProfile = false;
  isEditingOrganization = false;
  showDeleteConfirmation = false;
  password = '';
  isOrganizer = false;

  // Password change properties
  showPasswordChange = false;
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordError = '';
  
  // Password validation feedback
  passwordRequirements = {
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false
  };
  passwordsMatch = false;

  // Event signups properties
  userSignups: Signup[] = [];
  userEvents: EventWithDetails[] = [];
  upcomingEvents: EventWithDetails[] = [];
  pastEvents: EventWithDetails[] = [];
  paginatedUpcomingEvents: EventWithDetails[] = [];
  paginatedPastEvents: EventWithDetails[] = [];
  loadingEvents = false;
  eventsError = '';
  activeEventTab: 'upcoming' | 'past' = 'upcoming';
  eventsPageSizeOptions: number[] = [5, 10, 25, 50];
  eventsPageSize = 5;
  eventsCurrentPage = 1;
  
  // Certificates properties
  userCertificates: any[] = [];
  paginatedCertificates: any[] = [];
  loadingCertificates = false;
  certificatesError = '';
  certificatesPageSizeOptions: number[] = [5, 10, 25, 50];
  certificatesPageSize = 5;
  certificatesCurrentPage = 1;
  
  // Support Messages properties
  userSupportMessages: any[] = [];
  paginatedSupportMessages: any[] = [];
  loadingSupportMessages = false;
  supportMessagesError = '';
  supportMessagesPageSizeOptions: number[] = [5, 10, 25, 50];
  supportMessagesPageSize = 5;
  supportMessagesCurrentPage = 1;
  showSupportMessageModal = false;
  selectedSupportMessageForReply: any | null = null;
  followUpForm = {
    subject: '',
    message: ''
  };
  isSubmittingFollowUp = false;
  expandedMessages: Set<number> = new Set();
  shouldScrollToSupport = false;
  
  // Collapsible sections
  eventsSectionExpanded = false;
  certificatesSectionExpanded = false;
  metricsSectionExpanded = false;
  supportMessagesSectionExpanded = false;
  followedOrganizationsSectionExpanded = false;
  followedTagsSectionExpanded = false;
  
  // Followed Organizations properties
  followedOrganizations: any[] = [];
  loadingFollowedOrganizations = false;
  followedOrganizationsError = '';
  
  // Followed Tags properties
  followedTags: any[] = [];
  availableTagsForFollowing: any[] = [];
  loadingFollowedTags = false;
  loadingAvailableTags = false;
  followedTagsError = '';
  tagsDropdownOpen = false;
  tagSearchQuery = '';

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.profile-tags-dropdown-wrapper')) {
      this.tagsDropdownOpen = false;
      this.tagSearchQuery = '';
    }
  }
  
  // Properties for admin viewing other users' profiles
  viewingUserId: number | null = null;
  isViewingOtherUser = false;
  
  // Metrics properties
  volunteerMetrics: VolunteerMetrics | null = null;
  loadingMetrics = false;
  metricsError = '';
  selectedChartType: 'pie' | 'bar' | 'line' = 'bar';
  selectedMetricChart: 'events' | 'hours' = 'events';
  
  // Computed property to determine if user can edit profile
  get canEditProfile(): boolean {
    return !this.isViewingOtherUser;
  }
  
  // Computed property to determine if user can manage registrations
  get canManageRegistrations(): boolean {
    return !this.isViewingOtherUser;
  }

  constructor(
    private authService: AuthService,
    private volunteerService: VolunteerService,
    private router: Router,
    private route: ActivatedRoute,
    private inputValidation: InputValidationService
  ) { }

  /**
   * Initializes the component and loads user data after a brief delay
   * to ensure the authentication service is fully initialized.
   * Also checks for query parameters to auto-scroll to specific sections.
   */
  ngOnInit(): void {
    // Check for query parameters to scroll to support messages section
    this.route.queryParams.subscribe(params => {
      if (params['section'] === 'support') {
        this.shouldScrollToSupport = true;
      }
    });
    
    setTimeout(() => {
      this.loadUserData();
    }, 500);
  }

  /**
   * Scrolls to the support messages section and expands the first message if available.
   */
  scrollToSupportMessages(): void {
    const supportSection = document.querySelector('#support-messages');
    if (supportSection) {
      supportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      // Expand the first message if there are any
      if (this.userSupportMessages.length > 0) {
        const firstMessageId = this.getMessageId(this.userSupportMessages[0]);
        if (!this.isMessageExpanded(firstMessageId)) {
          this.toggleMessageExpanded(firstMessageId);
        }
      }
    }
  }

  /**
   * Loads the current user's data from the authentication service or localStorage.
   * Falls back to localStorage if the auth service doesn't have the user data.
   */
  loadUserData(): void {
    this.isLoading = true;
    this.error = '';
    this.success = '';

    const currentUser = this.authService.currentUserValue;

    if (currentUser && currentUser.userId) {
      this.processUserData(currentUser);
    } else {
      try {
        const storedUserStr = localStorage.getItem('user');
        if (storedUserStr) {
          const storedUser = JSON.parse(storedUserStr);

          if (storedUser && storedUser.userId) {
            this.processUserData(storedUser);
          } else {
            this.handleNoUser('No valid user found in localStorage');
          }
        } else {
          this.handleNoUser('No user found in localStorage');
        }
      } catch (error) {
        this.handleNoUser('Error accessing user data');
      }
    }
  }

  /**
   * Handles the case when no user data is available.
   * 
   * @param message - Error message to log
   */
  private handleNoUser(message: string): void {
    this.error = 'You must be logged in to view your profile.';
    this.isLoading = false;

    // Redirect to login after a short delay
    setTimeout(() => {
      this.router.navigate(['/login']);
    }, 2000);
  }

  /**
   * Processes user data and loads related information (organization, events, certificates).
   * Fetches fresh user data from the API to ensure the latest information is displayed.
   * 
   * @param userData - The user data to process
   */
  processUserData(userData: User): void {
    if (!userData || !userData.userId) {
      this.isLoading = false;
      this.error = 'Invalid user data received.';
      return;
    }

    this.user = userData;
    this.isOrganizer = userData.role === 'organizer';

    this.volunteerService.getUser(userData.userId).subscribe({
      next: (freshUserData) => {
        if (Array.isArray(freshUserData)) {
          if (freshUserData.length > 0) {
            const user = freshUserData[0];
            this.user = user;

            if (this.authService.currentUserValue) {
              const token = this.authService.currentUserValue.token;
              const updatedUser: User = {
                ...user,
                token: token
              };
              this.authService.setCurrentUser(updatedUser);
            }
          }
        } else {
          this.user = freshUserData;
        }

        this.checkAndLoadOrganization();
        this.loadUserSignups();
        this.loadUserCertificates();
        this.loadUserSupportMessages();
        this.loadVolunteerMetrics();
        this.loadFollowedOrganizations();
        this.loadFollowedTags();
      },
      error: (err) => {
        this.checkAndLoadOrganization();
        this.loadUserSignups();
        this.loadUserCertificates();
        this.loadUserSupportMessages();
        this.loadVolunteerMetrics();
      }
    });
  }

  /**
   * Checks if the user is an organizer and loads their organization data if applicable.
   */
  checkAndLoadOrganization(): void {
    if (!this.user || !this.user.userId) {
      this.isLoading = false;
      return;
    }

    this.isOrganizer = this.user.role === 'organizer';

    if (this.isOrganizer) {
      // Check if the user has an organization ID
      if (this.user.organizationId && this.user.organizationId > 0) {
        console.log('User is an organizer with organizationId:', this.user.organizationId);
        this.loadOrganizationById(this.user.organizationId);
      } else {
        console.log('User is an organizer but has no organizationId');
        // No organization linked yet, init an empty one for creating new
        this.organization = null;
        this.editableOrg = this.initNewOrganization();
        this.isLoading = false;
      }
    } else {
      console.log('User is not an organizer, no organization to load');
      this.organization = null;
      this.isLoading = false;
    }
  }

  private initNewOrganization(): Organization {
    return {
      name: '',
      description: '',
      contactEmail: this.user?.email || '',
      contactPhone: '',
      website: ''
    };
  }

  loadOrganizationById(organizationId: number): void {
    console.log('Loading organization with ID:', organizationId);
    this.volunteerService.getOrganization(organizationId).subscribe({
      next: (orgData) => {
        console.log('Organization data received:', orgData);

        // Check if the API returned an array of organizations 
        if (Array.isArray(orgData)) {
          if (orgData.length > 0) {
            this.organization = orgData[0];
            console.log('Using first organization from array:', this.organization);
          } else {
            console.error('Organization data array is empty');
            this.organization = null;
          }
        } else {
          // It's already a single object
          this.organization = orgData;
        }

        // Create a copy for editing
        if (this.organization) {
          this.editableOrg = { ...this.organization };
        } else {
          this.editableOrg = this.initNewOrganization();
        }

        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading organization:', err);
        this.error = 'Failed to load organization details.';
        this.organization = null;
        this.editableOrg = this.initNewOrganization();
        this.isLoading = false;
      }
    });
  }

  startEditingProfile(): void {
    if (this.user) {
      // Create a copy of the user object to edit
      this.editableUser = { ...this.user };
      this.isEditingProfile = true;
    }
  }

  cancelEditingProfile(): void {
    this.editableUser = null;
    this.isEditingProfile = false;
  }

  saveProfile(): void {
    this.isLoading = true;
    this.error = '';
    this.success = '';

    if (!this.editableUser || !this.user || !this.user.userId) {
      this.error = 'No user data to save.';
      this.isLoading = false;
      return;
    }

    // Validate and sanitize first name
    const firstNameValidation = this.inputValidation.validateName(this.editableUser.firstName || '', 'First name');
    if (!firstNameValidation.isValid) {
      this.error = firstNameValidation.error || 'Invalid first name';
      this.isLoading = false;
      return;
    }

    // Validate and sanitize last name
    const lastNameValidation = this.inputValidation.validateName(this.editableUser.lastName || '', 'Last name');
    if (!lastNameValidation.isValid) {
      this.error = lastNameValidation.error || 'Invalid last name';
      this.isLoading = false;
      return;
    }

    // Validate and sanitize email
    const emailValidation = this.inputValidation.validateEmail(this.editableUser.email || '');
    if (!emailValidation.isValid) {
      this.error = emailValidation.error || 'Invalid email';
      this.isLoading = false;
      return;
    }

    // Ensure userId is properly set in the editable user object
    const updatedUser = {
      ...this.editableUser,
      userId: this.user.userId,
      firstName: firstNameValidation.sanitized,
      lastName: lastNameValidation.sanitized,
      email: emailValidation.sanitized
    };

    // Update the user data
    this.volunteerService.updateUser(this.user.userId, updatedUser).subscribe({
      next: (response: any) => {
        console.log('User updated successfully:', response);

        // Instead of saving the API response, update the user with the data we sent
        // Keep the original user properties that weren't edited
        const mergedUser = { ...this.user, ...updatedUser };

        // If we have a token from the current user, make sure it's preserved
        if (this.authService.currentUserValue?.token) {
          mergedUser.token = this.authService.currentUserValue.token;
        }

        // Update local state
        this.user = mergedUser;

        // Update the stored user in auth service
        this.authService.setCurrentUser(mergedUser);

        this.success = 'Profile updated successfully!';
        this.isEditingProfile = false;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error updating user:', error);
        this.error = 'Failed to update profile: ' + (error.message || 'Unknown error');
        this.isLoading = false;
      }
    });
  }

  startEditingOrganization(): void {
    if (this.organization) {
      // Create a copy of the organization object to edit
      this.editableOrg = { ...this.organization };
    } else {
      // Create a new organization
      this.editableOrg = {
        name: '',
        description: '',
        contactEmail: this.user?.email || '',
        contactPhone: '',
        website: ''
      };
    }
    this.isEditingOrganization = true;
  }

  cancelEditingOrganization(): void {
    this.editableOrg = null;
    this.isEditingOrganization = false;
  }

  saveOrganization(): void {
    if (!this.user || !this.user.userId) {
      this.error = 'You must be logged in to manage an organization.';
      return;
    }

    this.isLoading = true;
    this.error = '';
    this.success = '';

    if (!this.editableOrg) {
      this.error = 'No organization data to save.';
      this.isLoading = false;
      return;
    }

    // Check if this is an update or create operation
    const isUpdate = this.editableOrg.organizationId && this.editableOrg.organizationId > 0;
    console.log('Organization operation:', isUpdate ? 'update' : 'create');

    // Validate and sanitize organization name
    const orgNameValidation = this.inputValidation.validateTextField(
      this.editableOrg.name || '',
      this.inputValidation.MAX_LENGTHS.organizationName,
      'Organization name'
    );
    if (!orgNameValidation.isValid) {
      this.error = orgNameValidation.error || 'Invalid organization name';
      this.isLoading = false;
      return;
    }

    // Validate and sanitize organization description
    const orgDescValidation = this.inputValidation.validateTextField(
      this.editableOrg.description || '',
      this.inputValidation.MAX_LENGTHS.organizationDescription,
      'Organization description'
    );
    if (!orgDescValidation.isValid) {
      this.error = orgDescValidation.error || 'Invalid organization description';
      this.isLoading = false;
      return;
    }

    // Validate and sanitize contact email
    const orgEmailValidation = this.inputValidation.validateEmail(this.editableOrg.contactEmail || '');
    if (!orgEmailValidation.isValid) {
      this.error = 'Contact email: ' + (orgEmailValidation.error || 'Invalid email');
      this.isLoading = false;
      return;
    }

    // Validate and sanitize contact phone
    const phoneValidation = this.inputValidation.validatePhone(this.editableOrg.contactPhone || '');
    if (!phoneValidation.isValid) {
      this.error = 'Contact phone: ' + (phoneValidation.error || 'Invalid phone number');
      this.isLoading = false;
      return;
    }

    // Validate website if provided
    let sanitizedWebsite = '';
    if (this.editableOrg.website && this.editableOrg.website.trim()) {
      const websiteValidation = this.inputValidation.validateUrl(this.editableOrg.website);
      if (!websiteValidation.isValid) {
        this.error = 'Website: ' + (websiteValidation.error || 'Invalid URL');
        this.isLoading = false;
        return;
      }
      sanitizedWebsite = websiteValidation.sanitized;
    }

    // Ensure all required fields have values
    const organizationData: Organization = {
      name: orgNameValidation.sanitized,
      description: orgDescValidation.sanitized,
      contactEmail: orgEmailValidation.sanitized,
      contactPhone: phoneValidation.sanitized,
      website: sanitizedWebsite,
      organizationId: this.editableOrg.organizationId || 0
    };

    if (isUpdate) {
      // Update existing organization
      console.log('Updating organization:', organizationData);
      const orgId = organizationData.organizationId!;  // Non-null assertion is safe due to the check above

      this.volunteerService.updateOrganization(orgId, organizationData).subscribe({
        next: (response: any) => {
          console.log('Organization updated successfully:', response);
          // Instead of saving the response directly, use our known good data
          this.organization = { ...organizationData };
          this.isEditingOrganization = false;
          this.success = 'Organization updated successfully!';
          this.isLoading = false;
        },
        error: (err: any) => {
          console.error('Error updating organization:', err);
          this.error = 'Failed to update organization: ' + (err.message || 'Unknown error');
          this.isLoading = false;
        }
      });
    } else {
      // Create new organization
      console.log('Creating new organization:', organizationData);
      this.volunteerService.createOrganization(organizationData).subscribe({
        next: (response: any) => {
          console.log('Organization created successfully:', response);

          // Get the organization ID from the response
          let organizationId: number | undefined;

          if (typeof response === 'object' && response !== null) {
            if (response.insertId) {
              organizationId = response.insertId;
            } else if (response.organizationId) {
              organizationId = response.organizationId;
            }
          }

          if (organizationId) {
            // Create a proper organization object with the new ID
            const newOrganization: Organization = {
              ...organizationData,
              organizationId
            };

            this.organization = newOrganization;
            this.isEditingOrganization = false;
            this.success = 'Organization created successfully!';

            // Link the organization to the user
            if (this.user && this.user.userId) {
              console.log(`Linking organization ${organizationId} to user ${this.user.userId} using updateUserOrganization`);

              // Use the dedicated method for updating organizationId
              this.volunteerService.updateUserOrganization(this.user.userId, organizationId).subscribe({
                next: (updatedUser: User) => {
                  console.log('User updated with organization successfully:', updatedUser);

                  // Update local user object
                  if (this.user) {
                    this.user = {
                      ...this.user,
                      organizationId: organizationId
                    };
                  }

                  // Update the user in auth service to persist changes across the app
                  if (this.authService.currentUserValue) {
                    const updatedAuthUser: User = {
                      ...this.authService.currentUserValue,
                      firstName: this.authService.currentUserValue.firstName,
                      lastName: this.authService.currentUserValue.lastName,
                      email: this.authService.currentUserValue.email,
                      role: this.authService.currentUserValue.role,
                      organizationId: organizationId
                    };
                    this.authService.setCurrentUser(updatedAuthUser);
                    console.log('Updated user in auth service with organization ID');
                  }

                  this.isLoading = false;
                },
                error: (err: any) => {
                  console.error('Error linking organization to user:', err);
                  this.error = 'The organization was created, but there was an error linking it to your account.';
                  this.isLoading = false;
                }
              });
            } else {
              console.error('Missing user ID or organization ID for linking');
              this.isLoading = false;
            }
          } else {
            console.error('Missing organization ID in response');
            this.isLoading = false;
          }
        },
        error: (err: any) => {
          console.error('Error creating organization:', err);
          this.error = 'Failed to create organization. Please try again.';
          this.isLoading = false;
        }
      });
    }
  }

  showDeleteAccountConfirmation(): void {
    this.showDeleteConfirmation = true;
    this.password = '';
  }

  cancelDeleteAccount(): void {
    this.showDeleteConfirmation = false;
    this.password = '';
  }

  deleteAccount(): void {
    if (!this.user || !this.user.userId) {
      this.error = 'No user data available.';
      return;
    }

    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      this.isLoading = true;
      this.error = '';

      // Delete the user
      this.volunteerService.deleteUser(this.user.userId).subscribe({
        next: () => {
          this.success = 'Your account has been deleted successfully.';
          this.isLoading = false;

          // Log out and redirect
          setTimeout(() => {
            this.authService.logout();
            this.router.navigate(['/']);
          }, 2000);
        },
        error: (err: any) => {
          console.error('Error deleting account:', err);
          this.error = 'Failed to delete account. Please try again.';
          this.isLoading = false;
        }
      });
    }
  }

  // Show password change form
  showChangePassword(): void {
    this.showPasswordChange = true;
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.passwordError = '';
    this.resetPasswordValidation();
  }

  /**
   * Resets password validation feedback to initial state.
   */
  resetPasswordValidation(): void {
    this.passwordRequirements = {
      length: false,
      uppercase: false,
      lowercase: false,
      number: false,
      special: false
    };
    this.passwordsMatch = false;
  }

  /**
   * Validates password in real-time and updates requirement feedback.
   * Called on input change for the new password field.
   */
  validatePasswordRequirements(): void {
    const password = this.newPassword || '';
    
    this.passwordRequirements = {
      length: password.length >= 8 && password.length <= 100,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[@$!%*?&]/.test(password)
    };
    
    // Also check password match when password changes
    this.checkPasswordsMatch();
  }

  /**
   * Checks if the new password and confirm password match.
   * Called on input change for either password field.
   */
  checkPasswordsMatch(): void {
    if (this.confirmPassword && this.newPassword) {
      this.passwordsMatch = this.newPassword === this.confirmPassword;
    } else {
      this.passwordsMatch = false;
    }
  }

  /**
   * Checks if all password requirements are met.
   * 
   * @returns True if all requirements are satisfied
   */
  get allPasswordRequirementsMet(): boolean {
    return Object.values(this.passwordRequirements).every(req => req === true);
  }

  // Cancel password change
  cancelChangePassword(): void {
    this.showPasswordChange = false;
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.passwordError = '';
  }

  // Save new password
  saveNewPassword(): void {
    this.passwordError = '';
    this.error = '';
    this.success = '';

    // Check if passwords match
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError = 'New passwords do not match.';
      return;
    }

    // Validate password
    const passwordValidation = this.inputValidation.validatePassword(this.newPassword);
    if (!passwordValidation.isValid) {
      this.passwordError = passwordValidation.error || 'Invalid password';
      return;
    }

    if (!this.user || !this.user.userId) {
      this.error = 'No user data available.';
      return;
    }

    this.isLoading = true;

    // Verify current password using the loginUser method which will check credentials
    this.volunteerService.loginUser({
      email: this.user.email,
      password: this.currentPassword
    }).subscribe({
      next: (response) => {
        // Current password is correct, proceed with password change
        if (!response) {
          this.passwordError = 'Failed to verify current password.';
          this.isLoading = false;
          return;
        }

        if (!this.user || typeof this.user.userId !== 'number') {
          this.error = 'Invalid user ID';
          this.isLoading = false;
          return;
        }

        // Create a base user object with just the required fields for update
        const userBase = {
          firstName: this.user.firstName,
          lastName: this.user.lastName,
          email: this.user.email,
          role: this.user.role,
          organizationId: this.user.organizationId || null
        };

        console.log('Updating user password...');

        // Use the specialized method for password updates
        this.volunteerService.updateUserWithPassword(
          this.user.userId,
          userBase,
          this.newPassword
        ).subscribe({
          next: (response: any) => {
            console.log('Password updated successfully:', response);

            this.success = 'Password updated successfully!';
            this.showPasswordChange = false;
            this.currentPassword = '';
            this.newPassword = '';
            this.confirmPassword = '';
            this.isLoading = false;
          },
          error: (error: any) => {
            console.error('Error updating password:', error);
            this.error = 'Failed to update password. Please try again.';
            this.isLoading = false;
          }
        });
      },
      error: (error) => {
        console.error('Error verifying current password:', error);
        this.passwordError = 'Current password is incorrect.';
        this.isLoading = false;
      }
    });
  }

  // Add this new method to load user signups and their associated events
  loadUserSignups(): void {
    if (!this.user || !this.user.userId) {
      console.error('Cannot load signups: No user ID available');
      return;
    }

    this.loadingEvents = true;
    this.eventsError = '';
    this.userEvents = [];
    this.upcomingEvents = [];
    this.pastEvents = [];

    console.log(`Loading signups for user ID: ${this.user.userId}`);
    this.volunteerService.getUserSignups(this.user.userId).subscribe({
      next: (signups) => {
        console.log(`Received ${signups.length} signups for user`);
        this.userSignups = signups;

        // If no signups, we're done
        if (signups.length === 0) {
          this.loadingEvents = false;
          return;
        }

        // For each signup, get the event details
        let completedRequests = 0;
        signups.forEach(signup => {
          if (!signup.eventId) {
            console.error('Signup missing eventId:', signup);
            completedRequests++;
            checkIfAllDone();
            return;
          }

          this.volunteerService.getEvent(signup.eventId).subscribe({
            next: (eventData) => {
              console.log(`Received event data for event ID ${signup.eventId}:`, eventData);

              // API may return array or single object
              let event: Event;
              if (Array.isArray(eventData)) {
                if (eventData.length > 0) {
                  event = eventData[0];
                } else {
                  console.error('Event data array is empty for event ID:', signup.eventId);
                  completedRequests++;
                  checkIfAllDone();
                  return;
                }
              } else {
                event = eventData;
              }

              // Add signup details to the event
              const eventWithDetails: EventWithDetails = {
                ...event,
                signupId: signup.signupId,
                signupDate: signup.signupDate,
                signupStatus: signup.status
              };

              // Determine if the event is in the past
              const now = new Date();
              // Set hours, minutes, seconds to 0 for today's date for a proper date-only comparison
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

              // Parse event date carefully
              const dateParts = event.eventDate.split('-');
              // JavaScript months are 0-indexed, so we subtract 1 from the month
              const eventFullDate = new Date(
                parseInt(dateParts[0]), // year
                parseInt(dateParts[1]) - 1, // month (0-indexed)
                parseInt(dateParts[2]) // day
              );

              // Compare dates only (not time)
              eventWithDetails.isPast = eventFullDate < today;

              console.log(`Event: ${event.title}, Date: ${event.eventDate}, Is Past: ${eventWithDetails.isPast}`);

              // Add to appropriate arrays
              this.userEvents.push(eventWithDetails);
              if (eventWithDetails.isPast) {
                this.pastEvents.push(eventWithDetails);
              } else {
                this.upcomingEvents.push(eventWithDetails);
              }

              completedRequests++;
              checkIfAllDone();
            },
            error: (err) => {
              console.error(`Error fetching event ${signup.eventId}:`, err);
              completedRequests++;
              checkIfAllDone();
            }
          });
        });

        // Helper function to check if all requests are done
        const checkIfAllDone = () => {
          if (completedRequests === signups.length) {
            console.log('All event data loaded');
            console.log(`Upcoming events: ${this.upcomingEvents.length}, Past events: ${this.pastEvents.length}`);

            // Sort events by date (upcoming: closest first, past: most recent first)
            this.upcomingEvents.sort((a, b) =>
              new Date(a.eventDate + 'T' + a.eventTime).getTime() -
              new Date(b.eventDate + 'T' + b.eventTime).getTime()
            );

            this.pastEvents.sort((a, b) =>
              new Date(b.eventDate + 'T' + b.eventTime).getTime() -
              new Date(a.eventDate + 'T' + a.eventTime).getTime()
            );

            // Update pagination after sorting
            this.updateEventsPagination();

            this.loadingEvents = false;
            this.updateEventsPagination();
          }
        };
      },
      error: (err) => {
        console.error('Error fetching user signups:', err);
        this.eventsError = 'Failed to load your event registrations.';
        this.loadingEvents = false;
      }
    });
  }

  cancelSignup(signupId: number): void {
    if (!signupId) return;

    console.log(`Canceling signup ${signupId}`);
    this.volunteerService.deleteSignup(signupId).subscribe({
      next: (result) => {
        console.log('Signup canceled successfully:', result);
        this.success = 'Event registration successfully canceled.';

        // Reload signups to reflect the change
        this.loadUserSignups();
      },
      error: (err) => {
        console.error('Error canceling signup:', err);
        this.error = 'Failed to cancel event registration. Please try again.';
      }
    });
  }

  loadUserCertificates(): void {
    if (!this.user || !this.user.userId) {
      console.error('Cannot load certificates: No user ID available');
      return;
    }

    this.loadingCertificates = true;
    this.certificatesError = '';

    // First get the list of certificates for the user
    this.volunteerService.getCertificatesForUser(this.user.userId).subscribe({
      next: (certificates) => {
        console.log('Certificates loaded:', certificates);
        
        if (!certificates || certificates.length === 0) {
          this.userCertificates = [];
          this.loadingCertificates = false;
          return;
        }

        // For each certificate, fetch full details using the verification endpoint
        // This ensures we get all the joined data (user, event, organization, attendance)
        // Use the same mapping as the verification page
        const verificationObservables = certificates.map((cert: any) => {
          const certificateUid = cert.certificateUid || cert.certificate_uid;
          if (!certificateUid) {
            console.warn('Certificate missing UID:', cert);
            return null;
          }
          
          return this.volunteerService.verifyCertificate(certificateUid).pipe(
            // Map the response using the same logic as verification page
            map((fullDetails: any) => {
              // Use the same mapping structure as verification page
              const mapped = {
                certificateId: fullDetails.certificateId || fullDetails.certificate_id,
                certificateUid: fullDetails.certificateUid || fullDetails.certificate_uid || certificateUid,
                signupId: fullDetails.signupId || fullDetails.signup_id,
                userId: fullDetails.userId || fullDetails.user_id,
                eventId: fullDetails.eventId || fullDetails.event_id,
                issuedAt: fullDetails.issuedAt || fullDetails.issued_at,
                signedBy: fullDetails.signedBy || fullDetails.signed_by,
                // Handle nested user object or flat structure
                volunteerName: fullDetails.volunteerName || 
                             fullDetails.volunteer_name ||
                             (fullDetails.user ? `${fullDetails.user.firstName || fullDetails.user.first_name || ''} ${fullDetails.user.lastName || fullDetails.user.last_name || ''}`.trim() : undefined) ||
                             (fullDetails.firstName || fullDetails.first_name ? `${fullDetails.firstName || fullDetails.first_name} ${fullDetails.lastName || fullDetails.last_name}`.trim() : undefined),
                volunteerEmail: fullDetails.volunteerEmail || 
                              fullDetails.volunteer_email ||
                              fullDetails.user?.email ||
                              fullDetails.email,
                // Handle nested event object or flat structure
                eventName: fullDetails.eventName || 
                         fullDetails.event_name ||
                         fullDetails.event?.title ||
                         fullDetails.event?.name ||
                         fullDetails.title,
                eventDate: fullDetails.eventDate || 
                         fullDetails.event_date ||
                         fullDetails.event?.eventDate ||
                         fullDetails.event?.event_date,
                eventTime: fullDetails.eventTime || 
                         fullDetails.event_time ||
                         fullDetails.event?.eventTime ||
                         fullDetails.event?.event_time,
                // Handle nested organization object or flat structure
                organizationName: fullDetails.organizationName || 
                                fullDetails.organization_name ||
                                fullDetails.organization?.name ||
                                fullDetails.event?.organization?.name ||
                                fullDetails.event?.organizationName,
                // Handle nested attendance object or flat structure
                hours: fullDetails.hours !== null && fullDetails.hours !== undefined ? fullDetails.hours : 
                      (fullDetails.attendance?.hours !== null && fullDetails.attendance?.hours !== undefined ? fullDetails.attendance.hours : 
                      (fullDetails.event_attendance?.hours !== null && fullDetails.event_attendance?.hours !== undefined ? fullDetails.event_attendance.hours : null)),
                attendanceStatus: fullDetails.attendanceStatus || 
                                fullDetails.attendance_status ||
                                fullDetails.attendance?.status ||
                                fullDetails.event_attendance?.status
              };
              return mapped;
            }),
            catchError((err) => {
              console.error('Error fetching full certificate details:', err);
              // Return the basic cert data if verification fails
              return of(cert);
            })
          );
        }).filter((obs: any) => obs !== null);

        // Use forkJoin to wait for all verification calls to complete
        if (verificationObservables.length === 0) {
          this.userCertificates = [];
          this.loadingCertificates = false;
          return;
        }

        forkJoin(verificationObservables).subscribe({
          next: (fullCertificates) => {
            this.userCertificates = fullCertificates;
            console.log('Full certificates with details:', this.userCertificates);
            this.loadingCertificates = false;
            this.updateCertificatesPagination();
          },
          error: (err) => {
            console.error('Error fetching certificate details:', err);
            this.certificatesError = 'Failed to load some certificate details.';
            this.loadingCertificates = false;
          }
        });
      },
      error: (err) => {
        console.error('Error fetching certificates:', err);
        this.certificatesError = 'Failed to load certificates.';
        this.loadingCertificates = false;
      }
    });
  }

  /**
   * Generates and downloads a PDF certificate for the given certificate data.
   * Creates a landscape A4 PDF with the VolunteerSync branding, certificate details,
   * and verification information.
   * 
   * @param certificate - The certificate data to generate the PDF from
   */
  downloadCertificateAsPDF(certificate: any): void {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const primaryColor = [47, 125, 96];
      const secondaryColor = [16, 185, 129];
      const textColor = [30, 41, 59];

      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, 297, 210, 'F');

      doc.setFillColor(255, 255, 255);
      doc.roundedRect(20, 15, 257, 175, 5, 5, 'F');

      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = 'assets/VS_Logo_Banner.png';
      
      const addContentAndSave = () => {
        const verificationCode = certificate.certificateUid || certificate.certificate_uid || 'N/A';
        
        // Header (reduced spacing between lines)
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFontSize(30);
        doc.setFont('helvetica', 'bold');
        doc.text('CERTIFICATE OF', 148.5, 72, { align: 'center' });
        doc.text('VOLUNTEER SERVICE', 148.5, 85, { align: 'center' });

        // Decorative line
        doc.setDrawColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.setLineWidth(2);
        doc.line(60, 93, 237, 93);

        // This is to certify that (reduced spacing)
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'normal');
        doc.text('This is to certify that', 148.5, 108, { align: 'center' });

        // Volunteer name (reduced spacing)
        const volunteerName = certificate.volunteerName || 
                             (certificate.firstName && certificate.lastName ? `${certificate.firstName} ${certificate.lastName}` : 'N/A');
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(volunteerName, 148.5, 125, { align: 'center', maxWidth: 230 });

        // Has successfully completed (reduced spacing)
        doc.setFontSize(13);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text('has successfully completed', 148.5, 138, { align: 'center' });

        // Event name (reduced spacing)
        const eventName = certificate.eventName || certificate.title || 'Volunteer Service';
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(eventName, 148.5, 151, { align: 'center', maxWidth: 230 });

        // Event details (reduced spacing between lines)
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        
        const eventDate = certificate.eventDate ? new Date(certificate.eventDate).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }) : 'N/A';
        
        const hours = certificate.hours !== null && certificate.hours !== undefined ? 
                      `${certificate.hours} ${certificate.hours === 1 ? 'hour' : 'hours'}` : 'N/A';
        
        const orgName = certificate.organizationName || certificate.organization?.name || 'N/A';
        
        doc.text(`Date: ${eventDate}`, 148.5, 164, { align: 'center' });
        doc.text(`Hours: ${hours}`, 148.5, 172, { align: 'center' });
        doc.text(`Organization: ${orgName}`, 148.5, 180, { align: 'center', maxWidth: 230 });

        // Combined verification code and footer - single white background box (positioned on green background, below white content area)
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(35, 198, 227, 10, 2, 2, 'F');
        
        // Verification code text
        doc.setFontSize(9);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(`Verification Code: ${verificationCode}`, 148.5, 202.5, { align: 'center' });

        // Footer text
        doc.setFontSize(7);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('Verify this certificate at: volunteersync.com/verify', 148.5, 207.5, { align: 'center' });

        // Save the PDF
        const filename = `Certificate_${verificationCode.replace(/[^A-Z0-9]/g, '_')}.pdf`;
        doc.save(filename);
      };
      
      // Wait for image to load, then add logo and all content
      logoImg.onload = () => {
        try {
          // Add logo at the top center, within the white box area
          const logoWidth = 85; // mm
          const logoHeight = (logoImg.height / logoImg.width) * logoWidth; // Maintain aspect ratio
          const logoX = (297 - logoWidth) / 2; // Center horizontally
          const logoY = 18; // Top margin, within white box (which starts at 15)
          
          doc.addImage(logoImg, 'PNG', logoX, logoY, logoWidth, logoHeight);
          addContentAndSave();
        } catch (error) {
          console.error('Error adding logo to PDF:', error);
          // If logo fails, still add content and save
          addContentAndSave();
        }
      };
      
      logoImg.onerror = () => {
        console.warn('Logo image failed to load, saving PDF without logo');
        // If logo fails to load, still add content and save
        addContentAndSave();
      };
      
      // If image is already loaded (cached), trigger onload immediately
      if (logoImg.complete) {
        logoImg.onload(null as any);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      this.error = 'Failed to generate PDF certificate. Please try again.';
    }
  }

  formatCertificateDate(dateString: string | undefined): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  /**
   * Formats a certificate date and optional time string into a human-readable format.
   * 
   * @param dateString - The date string to format
   * @param timeString - Optional time string to include
   * @returns Formatted date and time string or "N/A" if invalid
   */
  formatCertificateDateTime(dateString: string | undefined, timeString?: string | undefined): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    let formatted = date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    if (timeString) {
      const time = new Date(`1970-01-01T${timeString}`);
      formatted += ' at ' + time.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }
    
    return formatted;
  }

  /**
   * Loads support messages for the current user.
   * Filters all support messages to show only those belonging to the current user.
   */
  loadUserSupportMessages(): void {
    if (!this.user || !this.user.userId) {
      return;
    }

    this.loadingSupportMessages = true;
    this.supportMessagesError = '';

    this.volunteerService.getSupportMessages().subscribe({
      next: (allMessages) => {
        // Filter messages to only show those from the current user
        this.userSupportMessages = allMessages.filter(
          (message: any) => message.userId === this.user!.userId || message.user_id === this.user!.userId
        );
        
        // Sort by date (most recent first)
        this.userSupportMessages.sort((a, b) => {
          const dateA = new Date(a.createdAt || a.submittedAt || a.created_at || a.submitted_at || 0).getTime();
          const dateB = new Date(b.createdAt || b.submittedAt || b.created_at || b.submitted_at || 0).getTime();
          return dateB - dateA;
        });
        
        this.loadingSupportMessages = false;
        this.updateSupportMessagesPagination();
        
        // Scroll to support messages if requested via query parameter
        if (this.shouldScrollToSupport) {
          setTimeout(() => {
            this.scrollToSupportMessages();
            this.shouldScrollToSupport = false; // Reset flag
          }, 300);
        }
      },
      error: (err) => {
        this.supportMessagesError = 'Failed to load support messages.';
        this.loadingSupportMessages = false;
      }
    });
  }

  /**
   * Formats a date string for display in support messages.
   * 
   * @param dateString - The date string to format
   * @returns Formatted date string
   */
  formatSupportMessageDate(dateString: string | undefined): string {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  }

  /**
   * Checks if a support message has been resolved (has an admin response).
   * 
   * @param message - The support message to check
   * @returns True if the message has been resolved
   */
  isSupportMessageResolved(message: any): boolean {
    return message.isResolved === 1 || message.isResolved === true || !!message.responseMessage || !!message.response_message;
  }

  /**
   * Toggles the expanded state of a support message.
   * 
   * @param messageId - The ID of the message to toggle
   */
  toggleMessageExpanded(messageId: number): void {
    if (this.expandedMessages.has(messageId)) {
      this.expandedMessages.delete(messageId);
    } else {
      this.expandedMessages.add(messageId);
    }
  }

  /**
   * Checks if a support message is expanded.
   * 
   * @param messageId - The ID of the message to check
   * @returns True if the message is expanded
   */
  isMessageExpanded(messageId: number): boolean {
    return this.expandedMessages.has(messageId);
  }

  /**
   * Gets the message ID from a support message object.
   * 
   * @param message - The support message object
   * @returns The message ID
   */
  getMessageId(message: any): number {
    return message.messageId || message.message_id || 0;
  }

  /**
   * Opens the follow-up message modal for a support message.
   * 
   * @param message - The support message to reply to
   */
  openFollowUpModal(message: any): void {
    this.selectedSupportMessageForReply = message;
    const originalSubject = message.subject || '';
    this.followUpForm.subject = originalSubject.startsWith('Re: ') ? originalSubject : `Re: ${originalSubject}`;
    this.followUpForm.message = '';
    this.showSupportMessageModal = true;
  }

  /**
   * Closes the follow-up message modal.
   */
  closeFollowUpModal(): void {
    this.selectedSupportMessageForReply = null;
    this.followUpForm.subject = '';
    this.followUpForm.message = '';
    this.showSupportMessageModal = false;
  }

  /**
   * Submits a follow-up support message.
   * Creates a new support message that references the original message.
   */
  submitFollowUpMessage(): void {
    if (!this.user || !this.selectedSupportMessageForReply) {
      return;
    }

    this.isSubmittingFollowUp = true;
    this.supportMessagesError = '';

    // Validate subject
    const subjectValidation = this.inputValidation.validateTextField(
      this.followUpForm.subject,
      this.inputValidation.MAX_LENGTHS.subject,
      'Subject'
    );
    if (!subjectValidation.isValid) {
      this.supportMessagesError = subjectValidation.error || 'Invalid subject';
      this.isSubmittingFollowUp = false;
      return;
    }

    // Validate message
    const messageValidation = this.inputValidation.validateTextField(
      this.followUpForm.message,
      this.inputValidation.MAX_LENGTHS.message,
      'Message'
    );
    if (!messageValidation.isValid) {
      this.supportMessagesError = messageValidation.error || 'Invalid message';
      this.isSubmittingFollowUp = false;
      return;
    }

    const sanitizedSubject = subjectValidation.sanitized;
    const sanitizedMessage = messageValidation.sanitized;

    // Include context about the original message in the follow-up
    const originalMessageId = this.selectedSupportMessageForReply.messageId || this.selectedSupportMessageForReply.message_id;
    const followUpMessageText = `[Follow-up to message #${originalMessageId}]\n\n${sanitizedMessage}`;

    const supportMessage = {
      userId: this.user.userId,
      name: `${this.user.firstName} ${this.user.lastName}`,
      email: this.user.email,
      subject: sanitizedSubject,
      message: followUpMessageText,
      isResolved: 0,
      respondedBy: null,
      responseMessage: null,
      respondedAt: null
    };

    this.volunteerService.createSupportMessage(supportMessage).subscribe({
      next: (response) => {
        this.success = 'Your follow-up message has been sent successfully.';
        this.closeFollowUpModal();
        this.loadUserSupportMessages();
        this.isSubmittingFollowUp = false;
      },
      error: (error) => {
        this.supportMessagesError = 'Failed to send follow-up message. Please try again.';
        this.isSubmittingFollowUp = false;
      }
    });
  }

  /**
   * Loads volunteer metrics from the API.
   * Only loads if the user is a volunteer (not organizer or admin).
   */
  loadVolunteerMetrics(): void {
    if (!this.user || this.user.role !== 'volunteer') {
      return;
    }

    this.loadingMetrics = true;
    this.metricsError = '';

    this.volunteerService.getVolunteerMetrics().subscribe({
      next: (metrics) => {
        // Map API property names to frontend expected names
        // API returns: yearMonth, but frontend expects: month
        if (metrics && metrics.historyByMonth) {
          metrics.historyByMonth = metrics.historyByMonth.map((m: any) => ({
            month: m.month || m.yearMonth,
            yearMonth: m.yearMonth || m.month,
            eventsAttended: m.eventsAttended ?? m.events_attended ?? 0,
            hoursAttended: m.hoursAttended ?? m.hours_attended ?? 0
          }));
        }
        
        this.volunteerMetrics = metrics;
        this.loadingMetrics = false;
      },
      error: (error) => {
        this.metricsError = 'Failed to load metrics. Please try again later.';
        this.loadingMetrics = false;
      }
    });
  }

  /**
   * Loads organizations followed by the user.
   */
  loadFollowedOrganizations(): void {
    if (!this.user || !this.user.userId) {
      return;
    }

    this.loadingFollowedOrganizations = true;
    this.followedOrganizationsError = '';

    this.volunteerService.getOrganizationsFollowedByUser(this.user.userId).subscribe({
      next: (organizations) => {
        this.followedOrganizations = organizations || [];
        this.loadingFollowedOrganizations = false;
      },
      error: (error) => {
        // Handle 404 gracefully (endpoint may not be implemented yet)
        if (error.status === 404) {
          this.followedOrganizations = [];
          this.followedOrganizationsError = 'Follow organizations feature is not yet available.';
        } else {
          console.error('Error loading followed organizations', error);
          this.followedOrganizationsError = 'Failed to load followed organizations.';
        }
        this.loadingFollowedOrganizations = false;
      }
    });
  }


  /**
   * Unfollows an organization.
   * 
   * @param organizationId - The ID of the organization to unfollow
   */
  unfollowOrganization(organizationId: number): void {
    if (!this.user || !this.user.userId) {
      return;
    }

    this.volunteerService.unfollowOrganization(this.user.userId, organizationId).subscribe({
      next: () => {
        // Remove from list
        this.followedOrganizations = this.followedOrganizations.filter(org => org.organizationId !== organizationId);
      },
      error: (error) => {
        console.error('Error unfollowing organization', error);
        this.followedOrganizationsError = 'Failed to unfollow organization.';
      }
    });
  }

  /**
   * Loads tags followed by the user and available tags for following.
   */
  loadFollowedTags(): void {
    if (!this.user || !this.user.userId) {
      return;
    }

    this.loadingFollowedTags = true;
    this.followedTagsError = '';

    // Load both followed tags and available tags in parallel
    forkJoin({
      followed: this.volunteerService.getTagsFollowedByUser(this.user.userId).pipe(
        catchError(() => of([]))
      ),
      available: this.volunteerService.getAllTags().pipe(
        catchError(() => of([]))
      )
    }).subscribe({
      next: ({ followed, available }) => {
        this.followedTags = followed || [];
        this.availableTagsForFollowing = available || [];
        this.loadingFollowedTags = false;
      },
        error: (error) => {
          // Handle 404 gracefully (endpoint may not be implemented yet)
          if (error.status === 404) {
            this.followedTags = [];
            this.followedTagsError = 'Follow tags feature is not yet available.';
          } else {
            console.error('Error loading followed tags', error);
            this.followedTagsError = 'Failed to load tags.';
          }
          this.loadingFollowedTags = false;
        }
    });
  }

  /**
   * Toggles follow status for a tag.
   * 
   * @param tagId - The ID of the tag to toggle
   */
  toggleFollowTag(tagId: number): void {
    if (!this.user || !this.user.userId) {
      return;
    }

    const isFollowing = this.followedTags.some(tag => tag.tagId === tagId);

    if (isFollowing) {
      // Unfollow
      this.volunteerService.unfollowTag(this.user.userId, tagId).subscribe({
        next: () => {
          this.followedTags = this.followedTags.filter(tag => tag.tagId !== tagId);
        },
        error: (error) => {
          if (error.status === 404) {
            this.followedTagsError = 'Follow tags feature is not yet available.';
          } else {
            console.error('Error unfollowing tag', error);
            this.followedTagsError = 'Failed to unfollow tag.';
          }
        }
      });
    } else {
      // Follow
      this.volunteerService.followTag(this.user.userId, tagId).subscribe({
        next: (response) => {
          // Add to followed tags list
          const tag = this.availableTagsForFollowing.find(t => t.tagId === tagId);
          if (tag) {
            this.followedTags.push({
              userId: this.user!.userId,
              tagId: tagId,
              followedAt: new Date().toISOString(),
              tagName: tag.name
            });
          }
        },
        error: (error) => {
          if (error.status === 404) {
            this.followedTagsError = 'Follow tags feature is not yet available.';
          } else {
            console.error('Error following tag', error);
            this.followedTagsError = 'Failed to follow tag.';
          }
        }
      });
    }
  }

  /**
   * Gets filtered tags for the tag selection dropdown.
   */
  get filteredTagsForFollowing(): any[] {
    if (!this.tagSearchQuery.trim()) {
      return this.availableTagsForFollowing;
    }
    const query = this.tagSearchQuery.toLowerCase().trim();
    return this.availableTagsForFollowing.filter(tag => 
      tag.name.toLowerCase().includes(query) &&
      !this.followedTags.some(followed => followed.tagId === tag.tagId)
    );
  }

  /**
   * Checks if a tag is being followed.
   * 
   * @param tagId - The ID of the tag to check
   * @returns True if the tag is being followed
   */
  isTagFollowed(tagId: number): boolean {
    return this.followedTags.some(tag => tag.tagId === tagId);
  }

  /**
   * Gets chart data for event attendance breakdown (pie chart).
   * 
   * @returns Chart data configuration
   */
  getEventAttendanceChartData(): ChartData<'pie'> {
    if (!this.volunteerMetrics) {
      return { labels: [], datasets: [] };
    }

    return {
      labels: ['Attended', 'No Show', 'Excused'],
      datasets: [{
        data: [
          this.volunteerMetrics.totalEventsAttended,
          this.volunteerMetrics.totalEventsNoShow,
          this.volunteerMetrics.totalEventsExcused
        ],
        backgroundColor: ['#28a745', '#dc3545', '#ffc107'],
        borderColor: ['#1e7e34', '#c82333', '#e0a800'],
        borderWidth: 2
      }]
    };
  }

  /**
   * Gets chart data for monthly hours (bar/line chart).
   * 
   * @returns Chart data configuration
   */
  getMonthlyHoursChartData(): ChartData<'bar' | 'line'> {
    if (!this.volunteerMetrics || !this.volunteerMetrics.historyByMonth || this.volunteerMetrics.historyByMonth.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Filter out any entries with missing month data
    // API returns: yearMonth, but frontend expects: month
    let validMonths = this.volunteerMetrics.historyByMonth.filter(m => {
      if (!m) return false;
      const monthValue = m.month || (m as any).yearMonth;
      return !!monthValue;
    });
    
    if (validMonths.length === 0) {
      return { labels: [], datasets: [] };
    }

    const labels = validMonths.map(m => {
      const monthValue = m.month || (m as any).yearMonth;
      if (!monthValue) return 'Unknown';
      const [year, month] = monthValue.split('-');
      if (!year || !month) return 'Invalid Date';
      const date = new Date(parseInt(year), parseInt(month) - 1);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });

    return {
      labels: labels,
      datasets: [{
        label: 'Hours Attended',
        data: validMonths.map(m => m.hoursAttended ?? (m as any).hours_attended ?? 0),
        backgroundColor: 'rgba(40, 167, 69, 0.6)',
        borderColor: '#28a745',
        borderWidth: 2
      }]
    };
  }

  /**
   * Gets chart data for monthly events (bar/line chart).
   * 
   * @returns Chart data configuration
   */
  getMonthlyEventsChartData(): ChartData<'bar' | 'line'> {
    if (!this.volunteerMetrics || !this.volunteerMetrics.historyByMonth || this.volunteerMetrics.historyByMonth.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Filter out any entries with missing month data
    // API returns: yearMonth, but frontend expects: month
    let validMonths = this.volunteerMetrics.historyByMonth.filter(m => {
      if (!m) return false;
      const monthValue = m.month || (m as any).yearMonth;
      return !!monthValue;
    });
    
    if (validMonths.length === 0) {
      return { labels: [], datasets: [] };
    }

    const labels = validMonths.map(m => {
      const monthValue = m.month || (m as any).yearMonth;
      if (!monthValue) return 'Unknown';
      const [year, month] = monthValue.split('-');
      if (!year || !month) return 'Invalid Date';
      const date = new Date(parseInt(year), parseInt(month) - 1);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });

    return {
      labels: labels,
      datasets: [{
        label: 'Events Attended',
        data: validMonths.map(m => m.eventsAttended ?? (m as any).events_attended ?? 0),
        backgroundColor: 'rgba(31, 125, 96, 0.6)',
        borderColor: '#1f7d60',
        borderWidth: 2
      }]
    };
  }

  /**
   * Gets chart options for pie charts.
   * 
   * @returns Chart options
   */
  getPieChartOptions(): ChartConfiguration<'pie'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1, // Force 1:1 aspect ratio for circular pie charts
      plugins: {
        legend: {
          position: 'bottom'
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    };
  }

  /**
   * Gets chart options for bar/line charts.
   * 
   * @returns Chart options
   */
  getBarLineChartOptions(): ChartConfiguration<'bar' | 'line'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      }
    };
  }

  // ========== Pagination Methods ==========

  /**
   * Updates pagination for events based on current tab.
   */
  updateEventsPagination(): void {
    const sourceArray = this.activeEventTab === 'upcoming' ? this.upcomingEvents : this.pastEvents;
    const start = (this.eventsCurrentPage - 1) * this.eventsPageSize;
    const paginated = sourceArray.slice(start, start + this.eventsPageSize);
    
    if (this.activeEventTab === 'upcoming') {
      this.paginatedUpcomingEvents = paginated;
    } else {
      this.paginatedPastEvents = paginated;
    }
  }

  /**
   * Gets total pages for events.
   */
  get eventsTotalPages(): number {
    const sourceArray = this.activeEventTab === 'upcoming' ? this.upcomingEvents : this.pastEvents;
    return sourceArray.length === 0 ? 1 : Math.ceil(sourceArray.length / this.eventsPageSize);
  }

  /**
   * Gets page numbers for events pagination.
   */
  get eventsPageNumbers(): number[] {
    return Array.from({ length: this.eventsTotalPages }, (_, index) => index + 1);
  }

  /**
   * Changes the page size for events.
   */
  changeEventsPageSize(size: string | number): void {
    this.eventsPageSize = Number(size);
    this.eventsCurrentPage = 1;
    this.updateEventsPagination();
  }

  /**
   * Navigates to a specific page for events.
   */
  goToEventsPage(page: number): void {
    if (page < 1 || page > this.eventsTotalPages) return;
    this.eventsCurrentPage = page;
    this.updateEventsPagination();
  }

  /**
   * Updates pagination for certificates.
   */
  updateCertificatesPagination(): void {
    const start = (this.certificatesCurrentPage - 1) * this.certificatesPageSize;
    this.paginatedCertificates = this.userCertificates.slice(start, start + this.certificatesPageSize);
  }

  /**
   * Gets total pages for certificates.
   */
  get certificatesTotalPages(): number {
    return this.userCertificates.length === 0 ? 1 : Math.ceil(this.userCertificates.length / this.certificatesPageSize);
  }

  /**
   * Gets page numbers for certificates pagination.
   */
  get certificatesPageNumbers(): number[] {
    return Array.from({ length: this.certificatesTotalPages }, (_, index) => index + 1);
  }

  /**
   * Changes the page size for certificates.
   */
  changeCertificatesPageSize(size: string | number): void {
    this.certificatesPageSize = Number(size);
    this.certificatesCurrentPage = 1;
    this.updateCertificatesPagination();
  }

  /**
   * Navigates to a specific page for certificates.
   */
  goToCertificatesPage(page: number): void {
    if (page < 1 || page > this.certificatesTotalPages) return;
    this.certificatesCurrentPage = page;
    this.updateCertificatesPagination();
  }

  /**
   * Updates pagination for support messages.
   */
  updateSupportMessagesPagination(): void {
    const start = (this.supportMessagesCurrentPage - 1) * this.supportMessagesPageSize;
    this.paginatedSupportMessages = this.userSupportMessages.slice(start, start + this.supportMessagesPageSize);
  }

  /**
   * Gets total pages for support messages.
   */
  get supportMessagesTotalPages(): number {
    return this.userSupportMessages.length === 0 ? 1 : Math.ceil(this.userSupportMessages.length / this.supportMessagesPageSize);
  }

  /**
   * Gets page numbers for support messages pagination.
   */
  get supportMessagesPageNumbers(): number[] {
    return Array.from({ length: this.supportMessagesTotalPages }, (_, index) => index + 1);
  }

  /**
   * Changes the page size for support messages.
   */
  changeSupportMessagesPageSize(size: string | number): void {
    this.supportMessagesPageSize = Number(size);
    this.supportMessagesCurrentPage = 1;
    this.updateSupportMessagesPagination();
  }

  /**
   * Navigates to a specific page for support messages.
   */
  goToSupportMessagesPage(page: number): void {
    if (page < 1 || page > this.supportMessagesTotalPages) return;
    this.supportMessagesCurrentPage = page;
    this.updateSupportMessagesPagination();
  }

  /**
   * Handles event tab change and updates pagination.
   */
  setActiveEventTab(tab: 'upcoming' | 'past'): void {
    this.activeEventTab = tab;
    this.eventsCurrentPage = 1;
    this.updateEventsPagination();
  }

  // ========== Metrics Export Methods ==========

  /**
   * Downloads volunteer metrics as a PDF report.
   * Includes summary statistics, data tables, and chart images.
   */
  downloadMetricsAsPDF(): void {
    if (!this.volunteerMetrics || !this.user) {
      return;
    }

    // Ensure metrics section is expanded so charts are visible for capture
    this.metricsSectionExpanded = true;

    // Wait a moment for charts to render, then generate PDF
    setTimeout(() => {
      this.generatePDFWithCharts();
    }, 500);
  }

  /**
   * Internal method to generate the PDF with charts.
   * Called after ensuring charts are visible and rendered.
   */
  private generatePDFWithCharts(): void {
    if (!this.volunteerMetrics || !this.user) {
      return;
    }

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const primaryColor = [47, 125, 96];
      const secondaryColor = [16, 185, 129];
      const textColor = [30, 41, 59];
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPosition = 20;

      // Helper function to add a new page if needed
      const checkPageBreak = (requiredSpace: number): void => {
        if (yPosition + requiredSpace > pageHeight - 20) {
          doc.addPage();
          yPosition = 20;
        }
      };

      // Header with background
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, 40, 'F');

      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('Volunteer Metrics Report', pageWidth / 2, 20, { align: 'center' });

      // User name
      doc.setFontSize(16);
      doc.setFont('helvetica', 'normal');
      doc.text(`${this.user.firstName} ${this.user.lastName}`, pageWidth / 2, 30, { align: 'center' });

      // Date
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, pageWidth / 2, 36, { align: 'center' });

      yPosition = 50;

      // Summary Statistics Section
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary Statistics', 20, yPosition);
      yPosition += 10;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const summaryData = [
        ['Metric', 'Value'],
        ['Total Events Registered', this.volunteerMetrics.totalEventsRegistered.toString()],
        ['Events Attended', this.volunteerMetrics.totalEventsAttended.toString()],
        ['Events No Show', this.volunteerMetrics.totalEventsNoShow.toString()],
        ['Events Excused', this.volunteerMetrics.totalEventsExcused.toString()],
        ['Total Hours Attended', this.volunteerMetrics.totalHoursAttended.toString()],
        ['Upcoming Events', this.volunteerMetrics.upcomingEventsCount.toString()],
        ['Canceled by Volunteer', this.volunteerMetrics.canceledByVolunteerCount.toString()]
      ];

      // Draw summary table
      doc.setFillColor(245, 247, 250);
      doc.rect(20, yPosition - 5, pageWidth - 40, summaryData.length * 7 + 5, 'F');
      
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      
      let tableY = yPosition;
      summaryData.forEach((row, index) => {
        if (index === 0) {
          // Header row
          doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          doc.rect(20, tableY - 5, pageWidth - 40, 7, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setTextColor(textColor[0], textColor[1], textColor[2]);
          doc.setFont('helvetica', 'normal');
        }
        
        doc.text(row[0], 25, tableY);
        doc.text(row[1], pageWidth - 25, tableY, { align: 'right' });
        
        if (index < summaryData.length - 1) {
          doc.line(20, tableY + 2, pageWidth - 20, tableY + 2);
        }
        
        tableY += 7;
      });

      yPosition = tableY + 15;

      // Monthly History Section
      if (this.volunteerMetrics.historyByMonth && this.volunteerMetrics.historyByMonth.length > 0) {
        checkPageBreak(60);

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Monthly History', 20, yPosition);
        yPosition += 10;

        const monthlyData = [['Month', 'Events Attended', 'Hours Attended']];
        this.volunteerMetrics.historyByMonth.forEach(month => {
          const monthValue = month.month || (month as any).yearMonth;
          if (monthValue) {
            const [year, monthNum] = monthValue.split('-');
            const date = new Date(parseInt(year), parseInt(monthNum) - 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            monthlyData.push([
              monthName,
              (month.eventsAttended ?? (month as any).events_attended ?? 0).toString(),
              (month.hoursAttended ?? (month as any).hours_attended ?? 0).toString()
            ]);
          }
        });

        // Draw monthly table
        doc.setFillColor(245, 247, 250);
        const tableHeight = monthlyData.length * 6 + 5;
        doc.rect(20, yPosition - 5, pageWidth - 40, tableHeight, 'F');

        let monthlyTableY = yPosition;
        monthlyData.forEach((row, index) => {
          if (index === 0) {
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.rect(20, monthlyTableY - 5, pageWidth - 40, 6, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
          } else {
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.setFont('helvetica', 'normal');
          }

          doc.text(row[0], 25, monthlyTableY);
          doc.text(row[1], (pageWidth - 40) / 2 + 20, monthlyTableY, { align: 'center' });
          doc.text(row[2], pageWidth - 25, monthlyTableY, { align: 'right' });

          if (index < monthlyData.length - 1) {
            doc.line(20, monthlyTableY + 1, pageWidth - 20, monthlyTableY + 1);
          }

          monthlyTableY += 6;
        });

        yPosition = monthlyTableY + 15;
      }

      // Charts Section - Capture and add chart images
      checkPageBreak(80);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text('Charts', 20, yPosition);
      yPosition += 10;

      // Capture and add charts asynchronously
      const addChartsToPDF = async () => {
        if (!this.user) return; // Ensure user is still available
        // 1. Event Attendance Pie Chart
        const pieChartCanvas = document.querySelector('canvas[data-chart-type="pie"]') as HTMLCanvasElement;
        if (pieChartCanvas) {
          try {
            const pieChartImage = pieChartCanvas.toDataURL('image/png');
            checkPageBreak(60);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Event Attendance Breakdown', 20, yPosition);
            yPosition += 8;
            
            // Pie charts should be circular (1:1 aspect ratio)
            // Force square dimensions regardless of canvas dimensions to prevent distortion
            const maxImgWidth = pageWidth - 40;
            const imgWidth = maxImgWidth;
            const imgHeight = imgWidth; // Force 1:1 aspect ratio for circular pie charts
            
            doc.addImage(pieChartImage, 'PNG', 20, yPosition, imgWidth, imgHeight);
            yPosition += imgHeight + 10;
          } catch (error) {
            console.error('Error capturing pie chart:', error);
          }
        }

        // 2. Monthly Events Chart (bar or line) - get the first visible chart
        const barCharts = document.querySelectorAll('canvas[type="bar"]');
        const lineCharts = document.querySelectorAll('canvas[type="line"]');
        const monthlyChart = (barCharts.length > 0 ? barCharts[0] : (lineCharts.length > 0 ? lineCharts[0] : null)) as HTMLCanvasElement;
        
        if (monthlyChart) {
          try {
            const monthlyChartImage = monthlyChart.toDataURL('image/png');
            checkPageBreak(60);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            const chartTitle = this.selectedMetricChart === 'events' ? 'Monthly Events Attended' : 'Monthly Hours Attended';
            doc.text(chartTitle, 20, yPosition);
            yPosition += 8;
            
            const imgWidth = pageWidth - 40;
            const imgHeight = (imgWidth * 0.6);
            doc.addImage(monthlyChartImage, 'PNG', 20, yPosition, imgWidth, imgHeight);
            yPosition += imgHeight + 10;
          } catch (error) {
            console.error('Error capturing monthly chart:', error);
          }
        }

        // Footer
        checkPageBreak(15);
        const footerY = pageHeight - 15;
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('This report was generated from VolunteerSync. For interactive charts and detailed data, visit your profile page.', pageWidth / 2, footerY, { align: 'center' });

        // Save the PDF
        if (this.user) {
          const fileName = `volunteer-metrics-${this.user.firstName}-${this.user.lastName}-${new Date().toISOString().split('T')[0]}.pdf`;
          doc.save(fileName);
        }
      };

      // Execute chart capture and PDF generation
      addChartsToPDF().catch((error) => {
        console.error('Error adding charts to PDF:', error);
        // Still save the PDF even if charts fail
        const footerY = pageHeight - 15;
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('This report was generated from VolunteerSync. Charts could not be included.', pageWidth / 2, footerY, { align: 'center' });
        if (this.user) {
          const fileName = `volunteer-metrics-${this.user.firstName}-${this.user.lastName}-${new Date().toISOString().split('T')[0]}.pdf`;
          doc.save(fileName);
        }
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      this.error = 'Failed to generate PDF report. Please try again.';
    }
  }

  /**
   * Downloads volunteer metrics as an Excel file.
   * Includes all data in spreadsheet format with multiple sheets.
   */
  downloadMetricsAsExcel(): void {
    if (!this.volunteerMetrics || !this.user) {
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();

      // Summary Statistics Sheet
      const summaryData = [
        ['Volunteer Metrics Report'],
        [`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`],
        [`Volunteer: ${this.user.firstName} ${this.user.lastName}`],
        [`Email: ${this.user.email}`],
        [],
        ['Metric', 'Value'],
        ['Total Events Registered', this.volunteerMetrics.totalEventsRegistered],
        ['Events Attended', this.volunteerMetrics.totalEventsAttended],
        ['Events No Show', this.volunteerMetrics.totalEventsNoShow],
        ['Events Excused', this.volunteerMetrics.totalEventsExcused],
        ['Total Hours Attended', this.volunteerMetrics.totalHoursAttended],
        ['Upcoming Events', this.volunteerMetrics.upcomingEventsCount],
        ['Canceled by Volunteer', this.volunteerMetrics.canceledByVolunteerCount]
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      // Monthly History Sheet
      if (this.volunteerMetrics.historyByMonth && this.volunteerMetrics.historyByMonth.length > 0) {
        const monthlyData = [['Month', 'Events Attended', 'Hours Attended']];
        this.volunteerMetrics.historyByMonth.forEach(month => {
          const monthValue = month.month || (month as any).yearMonth;
          if (monthValue) {
            const [year, monthNum] = monthValue.split('-');
            const date = new Date(parseInt(year), parseInt(monthNum) - 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            monthlyData.push([
              monthName,
              month.eventsAttended ?? (month as any).events_attended ?? 0,
              month.hoursAttended ?? (month as any).hours_attended ?? 0
            ]);
          }
        });
        const monthlySheet = XLSX.utils.aoa_to_sheet(monthlyData);
        XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Monthly History');
      }

      // Calculate percentages sheet
      const totalEvents = this.volunteerMetrics.totalEventsRegistered;
      if (totalEvents > 0) {
        const percentageData = [
          ['Attendance Breakdown'],
          [],
          ['Category', 'Count', 'Percentage'],
          ['Attended', this.volunteerMetrics.totalEventsAttended, `${((this.volunteerMetrics.totalEventsAttended / totalEvents) * 100).toFixed(1)}%`],
          ['No Show', this.volunteerMetrics.totalEventsNoShow, `${((this.volunteerMetrics.totalEventsNoShow / totalEvents) * 100).toFixed(1)}%`],
          ['Excused', this.volunteerMetrics.totalEventsExcused, `${((this.volunteerMetrics.totalEventsExcused / totalEvents) * 100).toFixed(1)}%`]
        ];
        const percentageSheet = XLSX.utils.aoa_to_sheet(percentageData);
        XLSX.utils.book_append_sheet(workbook, percentageSheet, 'Attendance Breakdown');
      }

      // Save the Excel file
      const fileName = `volunteer-metrics-${this.user.firstName}-${this.user.lastName}-${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error generating Excel file:', error);
      this.error = 'Failed to generate Excel file. Please try again.';
    }
  }
}
