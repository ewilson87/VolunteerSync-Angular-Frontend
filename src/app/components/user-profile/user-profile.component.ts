import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { User } from '../../models/user.model';
import { Organization } from '../../models/organization.model';
import { AuthService } from '../../services/auth.service';
import { VolunteerService } from '../../services/volunteer-service.service';
import { Signup } from '../../models/signup.model';
import { Event } from '../../models/event.model';
import { InputValidationService } from '../../services/input-validation.service';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import jsPDF from 'jspdf';

interface EventWithDetails extends Event {
  signupId?: number;
  signupDate?: string;
  signupStatus?: string;
  isPast?: boolean;
}

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
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

  // Event signups properties
  userSignups: Signup[] = [];
  userEvents: EventWithDetails[] = [];
  upcomingEvents: EventWithDetails[] = [];
  pastEvents: EventWithDetails[] = [];
  loadingEvents = false;
  eventsError = '';
  activeEventTab: 'upcoming' | 'past' = 'upcoming';
  
  // Certificates properties
  userCertificates: any[] = [];
  loadingCertificates = false;
  certificatesError = '';
  
  // Properties for admin viewing other users' profiles
  viewingUserId: number | null = null;
  isViewingOtherUser = false;
  
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
    private inputValidation: InputValidationService
  ) { }

  /**
   * Initializes the component and loads user data after a brief delay
   * to ensure the authentication service is fully initialized.
   */
  ngOnInit(): void {
    setTimeout(() => {
      this.loadUserData();
    }, 500);
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
      },
      error: (err) => {
        this.checkAndLoadOrganization();
        this.loadUserSignups();
        this.loadUserCertificates();
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

            this.loadingEvents = false;
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
}
