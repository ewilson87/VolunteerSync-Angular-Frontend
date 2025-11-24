import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { VolunteerService } from '../../services/volunteer-service.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';
import { Event } from '../../models/event.model';
import { Organization } from '../../models/organization.model';
import { Signup, Attendance } from '../../models/signup.model';
import { forkJoin, of, from, Observable } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { InputValidationService } from '../../services/input-validation.service';
import { CryptoService } from '../../services/crypto.service';

interface EventWithRegistrations extends Event {
  registrations?: Signup[];
  userDetails?: Map<number, User>;
  showRegistrations?: boolean;
}

@Component({
  selector: 'app-organizer-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './organizer-dashboard.component.html',
  styleUrl: './organizer-dashboard.component.css'
})
export class OrganizerDashboardComponent implements OnInit {
  // User & Organization
  currentUser: User | null = null;
  organization: Organization | null = null;
  isLoading = true;
  error = '';
  success = '';

  // Organization Editing
  isEditingOrganization = false;
  editableOrg: Organization | null = null;

  // Support Message (for rejection response)
  showSupportModal = false;
  supportForm = {
    name: '',
    email: '',
    subject: '',
    message: ''
  };
  isSubmittingSupport = false;
  supportSubmitted = false;
  supportError = '';

  // Events Management
  events: EventWithRegistrations[] = [];
  selectedEvent: EventWithRegistrations | null = null;
  isEditingEvent = false;
  showDeleteEventConfirmation = false;
  activeEventTab: 'upcoming' | 'past' | 'all' = 'upcoming';

  // Attendance Management
  editingAttendanceForSignup: number | null = null;
  attendanceForm = {
    status: 'completed' as 'completed' | 'no_show' | 'excused',
    hours: null as number | null
  };

  // Tabs
  activeTab = 'events';

  // Admin organization selection
  allOrganizations: Organization[] = [];
  selectedOrgId: number | null = null;

  constructor(
    private volunteerService: VolunteerService,
    private authService: AuthService,
    private inputValidation: InputValidationService,
    private route: ActivatedRoute,
    private router: Router,
    private cryptoService: CryptoService
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
    this.error = 'You must be logged in to access the organizer dashboard.';
    this.isLoading = false;
  }

  /**
   * Processes user data and determines access level (organizer or admin).
   * Loads organization and events based on user role.
   * 
   * @param userData - The user data to process
   */
  processUserData(userData: User): void {
    this.currentUser = userData;

    const isOrganizer = userData.role === 'organizer';
    const isAdmin = userData.role === 'admin';

    if (!isOrganizer && !isAdmin) {
      this.isLoading = false;
      this.error = 'Access denied. Only organizers and admins can access this page.';
      return;
    }

    if (isOrganizer) {
      if (userData.organizationId) {
        this.loadOrganization(userData.organizationId);
      } else {
        this.isLoading = false;
      }
      this.loadEvents();
    } else if (isAdmin) {
      this.route.queryParams.subscribe(params => {
        const orgId = params['orgId'] ? parseInt(params['orgId'], 10) : null;
        
        if (orgId) {
          this.selectedOrgId = orgId;
          this.loadOrganization(orgId);
          this.loadEvents();
        } else {
          this.loadAllOrganizationsForAdmin();
        }
      });
    }
  }

  /**
   * Loads organization data for the specified organization ID.
   * 
   * @param organizationId - The ID of the organization to load
   */
  loadOrganization(organizationId: number): void {
    if (!organizationId) {
      this.organization = null;
      return;
    }

    this.volunteerService.getOrganization(organizationId).subscribe({
      next: (orgData) => {
        if (Array.isArray(orgData)) {
          if (orgData.length > 0) {
            this.organization = orgData[0];
          } else {
            this.organization = null;
          }
        } else {
          this.organization = orgData;
        }

        this.isLoading = false;
        this.loadEvents();
      },
      error: (error) => {
        this.error = 'Failed to load organization details';
        this.isLoading = false;
      }
    });
  }

  /**
   * Loads events for the current organizer's organization or selected organization (for admins).
   * Filters events by organization ID and initializes registration display state.
   */
  loadEvents(): void {
    let orgId: number | null = null;
    
    if (this.currentUser?.role === 'organizer') {
      orgId = this.currentUser.organizationId || null;
    } else if (this.currentUser?.role === 'admin') {
      orgId = this.selectedOrgId || this.organization?.organizationId || null;
    }

    if (!orgId) {
      this.events = [];
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.volunteerService.getEvents().subscribe({
      next: (events) => {
        this.events = events
          .filter(event => event.organizationId === orgId)
          .map(event => ({
            ...event,
            showRegistrations: false,
            userDetails: new Map<number, User>()
          }));
        this.isLoading = false;
      },
      error: (error) => {
        this.error = 'Failed to load events';
        this.isLoading = false;
      }
    });
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
   * Loads registrations for a specific event.
   * For past events, uses the attendance API which includes attendance data.
   * For upcoming events, uses the regular signups API.
   * 
   * @param event - The event to load registrations for
   * @param forceReload - If true, forces a reload and keeps the registrations section expanded
   */
  loadEventRegistrations(event: EventWithRegistrations, forceReload: boolean = false): void {
    if (!forceReload) {
      event.showRegistrations = !event.showRegistrations;
    }

    if (forceReload) {
      event.showRegistrations = true;
    }

    if ((!event.registrations && event.showRegistrations) || forceReload) {
      const isPast = this.isEventInPast(event);
      
      const apiCall = isPast 
        ? this.volunteerService.getEventAttendance(event.eventId!)
        : this.volunteerService.getEventSignups(event.eventId!);
      
      apiCall.subscribe({
        next: (signups) => {
          const validSignups = signups.filter(s => s.signupId);
          
          event.registrations = validSignups;

          if (validSignups.length > 0) {
            event.userDetails = new Map<number, User>();

            const userObservables = validSignups.map(signup => {
              return this.volunteerService.getUser(signup.userId).pipe(
                catchError((err) => {
                  return of(null);
                })
              );
            });

            forkJoin(userObservables).subscribe({
              next: (users) => {
                users.forEach((userData, index) => {
                  if (event.userDetails && validSignups[index]) {
                    if (userData === null) {
                      return;
                    }
                    
                    let user: User;
                    if (Array.isArray(userData)) {
                      if (userData.length > 0) {
                        user = userData[0];
                      } else {
                        return;
                      }
                    } else {
                      user = userData;
                    }

                    event.userDetails.set(validSignups[index].userId, user);
                  }
                });
              },
              error: (error) => {
                // Some users may fail to load due to permissions - silently continue
              }
            });
          }
        },
        error: (error) => {
          this.error = 'Failed to load event registrations';
        }
      });
    }
  }

  /**
   * Retrieves user details for a signup from the event's user details map.
   * 
   * @param event - The event containing the user details map
   * @param userId - The ID of the user to retrieve
   * @returns The user object if found, undefined otherwise
   */
  getUserDetails(event: EventWithRegistrations, userId: number): User | undefined {
    if (!event.userDetails) {
      return undefined;
    }

    return event.userDetails.get(userId);
  }

  // Delete a user's registration from an event
  cancelUserRegistration(event: EventWithRegistrations, signupId: number): void {
    this.volunteerService.deleteSignup(signupId).subscribe({
      next: () => {
        this.success = 'Registration cancelled successfully';

        // Update the local registrations list
        if (event.registrations) {
          event.registrations = event.registrations.filter(signup => signup.signupId !== signupId);
        }
      },
      error: (error) => {
        console.error('Error cancelling registration', error);
        this.error = 'Failed to cancel registration';
      }
    });
  }

  // Attendance Management Methods
  startEditingAttendance(event: EventWithRegistrations, signup: Signup): void {
    console.log('Starting to edit attendance for signup:', signup);
    
    if (!signup.signupId) {
      console.error('Cannot edit attendance - signup missing signupId:', signup);
      this.error = 'Cannot edit attendance: Invalid signup data. Please refresh the page.';
      return;
    }
    
    this.editingAttendanceForSignup = signup.signupId;
    
    // Pre-fill form with existing attendance data if available
    if (signup.attendance) {
      this.attendanceForm.status = signup.attendance.status;
      // Use existing hours, or default to event length if null
      this.attendanceForm.hours = signup.attendance.hours ?? event.eventLengthHours ?? null;
    } else {
      // Default values for new attendance
      this.attendanceForm.status = 'completed';
      // Default to event's eventLengthHours, or null if not set
      this.attendanceForm.hours = event.eventLengthHours ?? null;
    }
    
  }

  /**
   * Cancels the attendance editing process and resets the form.
   */
  cancelEditingAttendance(): void {
    this.editingAttendanceForSignup = null;
    this.attendanceForm.status = 'completed';
    this.attendanceForm.hours = null;
  }

  /**
   * Saves attendance data for a signup.
   * Creates or updates attendance record and manages certificate creation/deletion
   * based on attendance status changes.
   * 
   * @param event - The event containing the signup
   * @param signup - The signup to save attendance for
   */
  saveAttendance(event: EventWithRegistrations, signup: Signup): void {
    if (!signup.signupId) {
      this.error = 'Invalid signup ID. Please refresh the page and try again.';
      return;
    }

    // Validate hours - now required
    if (this.attendanceForm.hours === null || this.attendanceForm.hours === undefined) {
      this.error = 'Hours is required. Please enter the number of hours.';
      return;
    }
    
    const hoursValidation = this.inputValidation.validateNumber(
      this.attendanceForm.hours,
      0,
      1000,
      'Hours'
    );
    if (!hoursValidation.isValid) {
      this.error = hoursValidation.error || 'Invalid hours';
      return;
    }
    this.attendanceForm.hours = hoursValidation.sanitized;

    const hasExistingAttendance = signup.attendance && signup.attendance.attendanceId;
    const previousStatus = signup.attendance?.status;
    const newStatus = this.attendanceForm.status;
    const wasCompleted = previousStatus === 'completed';
    const isNowCompleted = newStatus === 'completed';

    // Hours is now required, so it should always have a value at this point
    const attendanceData = {
      status: this.attendanceForm.status,
      hours: this.attendanceForm.hours! // Non-null assertion is safe here due to validation above
    };

    const apiCall = hasExistingAttendance
      ? this.volunteerService.updateAttendance(signup.attendance!.attendanceId!, attendanceData)
      : this.volunteerService.markAttendance({
          signupId: signup.signupId,
          ...attendanceData
        });

    apiCall.pipe(
      switchMap(() => {
        // Handle certificate creation/deletion based on attendance status
        if (isNowCompleted && !wasCompleted) {
          // Status changed to completed - create certificate
          return this.createCertificateForAttendance(event, signup).pipe(
            catchError((certError) => {
              return of(null);
            })
          );
        } else if (!isNowCompleted && wasCompleted) {
          return this.deleteCertificateForSignup(event, signup.signupId!).pipe(
            catchError((certError) => {
              return of(null);
            })
          );
        } else {
          return of(null);
        }
      })
    ).subscribe({
      next: () => {
        this.success = hasExistingAttendance ? 'Attendance updated successfully' : 'Attendance marked successfully';
        
        event.registrations = undefined;
        this.loadEventRegistrations(event, true);
        
        this.cancelEditingAttendance();
      },
      error: (error) => {
        this.error = 'Failed to save attendance. Please try again.';
      }
    });
  }

  /**
   * Generates a unique verification code for a certificate.
   * Format: VS-XXXX-XXXX where XXXX is alphanumeric.
   * Ensures uniqueness by incorporating signupId and timestamp.
   * 
   * @param signupId - The signup ID to incorporate into the code
   * @returns A unique verification code string
   */
  private generateVerificationCode(signupId: number): string {
    // Format: VS-XXXX-XXXX where XXXX is alphanumeric
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0, O, I, 1
    
    // Use signupId and timestamp to seed uniqueness
    // Convert signupId to base-32-like encoding (using our char set)
    const signupHash = this.encodeNumberToBase32(signupId, chars);
    
    // Get current timestamp (milliseconds) and encode part of it
    const timestamp = Date.now();
    const timeHash = this.encodeNumberToBase32(timestamp % 1000000, chars); // Use last 6 digits of timestamp
    
    // Combine: VS-[4 chars from signupId]-[4 chars from timestamp + random]
    // This ensures uniqueness while maintaining readability
    const part1 = signupHash.padStart(4, chars[signupId % chars.length]).substring(0, 4);
    const part2 = (timeHash + this.getRandomChar(chars)).padStart(4, chars[(timestamp % chars.length)]).substring(0, 4);
    
    return `VS-${part1}-${part2}`;
  }

  /**
   * Encodes a number to a base-32-like string using a custom character set.
   * 
   * @param num - The number to encode
   * @param chars - The character set to use for encoding
   * @returns The encoded string
   */
  private encodeNumberToBase32(num: number, chars: string): string {
    let result = '';
    let n = Math.abs(num);
    const base = chars.length;
    
    if (n === 0) {
      return chars[0];
    }
    
    while (n > 0) {
      result = chars[n % base] + result;
      n = Math.floor(n / base);
    }
    
    return result;
  }

  /**
   * Gets a random character from the provided character set.
   * 
   * @param chars - The character set to select from
   * @returns A random character from the set
   */
  private getRandomChar(chars: string): string {
    return chars[Math.floor(Math.random() * chars.length)];
  }

  /**
   * Creates a certificate record for completed attendance.
   * Generates a unique verification code and SHA-256 hash.
   * 
   * @param event - The event containing the signup
   * @param signup - The signup to create a certificate for
   * @returns Observable that completes when the certificate is created
   */
  private createCertificateForAttendance(event: EventWithRegistrations, signup: Signup): Observable<any> {
    if (!signup.signupId) {
      return of(null);
    }

    const signupId = signup.signupId;
    if (typeof signupId !== 'number') {
      return of(null);
    }

    const certificateUid = this.generateVerificationCode(signupId);
    
    return from(this.cryptoService.hashPassword(certificateUid)).pipe(
      switchMap((verificationHash) => {
        const certificateData = {
          signupId: signupId,
          certificateUid: certificateUid,
          verificationHash: verificationHash
        };

        return this.volunteerService.createCertificate(certificateData);
      })
    );
  }

  /**
   * Deletes a certificate record for a signup.
   * 
   * @param event - The event containing the signup
   * @param signupId - The signup ID to delete the certificate for
   * @returns Observable that completes when the certificate is deleted
   */
  private deleteCertificateForSignup(event: EventWithRegistrations, signupId: number): Observable<any> {
    if (!event.eventId) {
      return of(null);
    }
    
    // Get all certificates for the event and find the one matching the signup
    return this.volunteerService.getCertificatesForEvent(event.eventId).pipe(
      switchMap((certificates) => {
        // Find certificate with matching signupId
        // The certificate object should have a signupId field
        const certificate = certificates.find((cert: any) => cert.signupId === signupId);
        
        if (certificate && certificate.certificateId) {
          console.log('Found certificate to delete:', certificate.certificateId);
          return this.volunteerService.deleteCertificate(certificate.certificateId);
        } else {
          console.warn('No certificate found for signup:', signupId);
          // Certificate might not exist, which is fine
          return of(null);
        }
      }),
      catchError((error) => {
        console.error('Error finding or deleting certificate:', error);
        // Don't fail if certificate doesn't exist or can't be found
        return of(null);
      })
    );
  }

  deleteAttendance(event: EventWithRegistrations, signup: Signup): void {
    if (!signup.attendance || !signup.attendance.attendanceId) {
      this.error = 'No attendance record to delete';
      return;
    }

    if (!confirm('Are you sure you want to delete this attendance record?')) {
      return;
    }

    const wasCompleted = signup.attendance.status === 'completed';

    this.volunteerService.deleteAttendance(signup.attendance.attendanceId).pipe(
      switchMap(() => {
        // If attendance was completed, also delete the certificate
        if (wasCompleted && signup.signupId) {
          return this.deleteCertificateForSignup(event, signup.signupId).pipe(
            catchError((certError) => {
              console.error('Error deleting certificate:', certError);
              // Don't fail the whole operation if certificate deletion fails
              return of(null);
            })
          );
        }
        return of(null);
      })
    ).subscribe({
      next: () => {
        this.success = 'Attendance record deleted successfully';
        
        // Reload the event registrations to get updated attendance data
        // Pass forceReload=true to keep the list expanded
        event.registrations = undefined; // Clear to force reload
        this.loadEventRegistrations(event, true);
      },
      error: (error) => {
        console.error('Error deleting attendance', error);
        this.error = 'Failed to delete attendance record. Please try again.';
      }
    });
  }

  getAttendanceStatusBadgeClass(status: string | undefined): string {
    if (!status) return 'bg-secondary text-white';
    
    switch (status) {
      case 'completed':
        return 'bg-success text-white';
      case 'no_show':
        return 'bg-danger text-white';
      case 'excused':
        return 'bg-warning text-dark';
      default:
        return 'bg-secondary text-white';
    }
  }

  getAttendanceStatusLabel(status: string | undefined): string {
    if (!status) return 'Not Marked';
    
    switch (status) {
      case 'completed':
        return 'Attended';
      case 'no_show':
        return 'No Show';
      case 'excused':
        return 'Excused';
      default:
        return status;
    }
  }

  // Edit event functionality
  editEvent(event: EventWithRegistrations): void {
    // Create a deep copy of the event
    this.selectedEvent = { ...event };

    // Ensure date is in the correct format for the date input (YYYY-MM-DD)
    if (this.selectedEvent.eventDate) {
      // Convert date to YYYY-MM-DD format if needed
      // Handle various date formats that might come from the API
      const dateStr = this.selectedEvent.eventDate;
      let formattedDate = dateStr;
      
      // If the date includes time or is in a different format, extract just the date part
      if (dateStr.includes('T')) {
        // ISO format with time: "2024-01-15T10:00:00" -> "2024-01-15"
        formattedDate = dateStr.split('T')[0];
      } else if (dateStr.includes(' ')) {
        // Format with space: "2024-01-15 10:00:00" -> "2024-01-15"
        formattedDate = dateStr.split(' ')[0];
      }
      
      // Ensure it's in YYYY-MM-DD format (required by HTML date input)
      const dateObj = new Date(formattedDate);
      if (!isNaN(dateObj.getTime())) {
        // Format as YYYY-MM-DD
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        formattedDate = `${year}-${month}-${day}`;
      }
      
      this.selectedEvent.eventDate = formattedDate;
      console.log('Original event date:', dateStr, 'Formatted for input:', formattedDate);
    }

    this.isEditingEvent = true;
    
    // Scroll to the edit form after a delay to ensure it's rendered
    // Use a longer delay and better scroll positioning
    setTimeout(() => {
      const editForm = document.querySelector('.organizer-edit-event');
      if (editForm) {
        // Scroll with some offset from the top for better visibility
        const yOffset = -20; // Offset in pixels from top
        const y = editForm.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, 200);
  }

  // Cancel editing event
  cancelEditEvent(): void {
    this.selectedEvent = null;
    this.isEditingEvent = false;
  }

  // Save edited event
  saveEvent(): void {
    if (!this.selectedEvent || !this.selectedEvent.eventId) return;

    // Validate and sanitize all event fields (same validation as create-event)
    // Validate title
    const titleValidation = this.inputValidation.validateTextField(
      this.selectedEvent.title || '',
      this.inputValidation.MAX_LENGTHS.eventTitle,
      'Event title'
    );
    if (!titleValidation.isValid) {
      this.error = titleValidation.error || 'Invalid event title';
      return;
    }
    this.selectedEvent.title = titleValidation.sanitized;

    // Validate description
    const descValidation = this.inputValidation.validateTextField(
      this.selectedEvent.description || '',
      this.inputValidation.MAX_LENGTHS.eventDescription,
      'Event description'
    );
    if (!descValidation.isValid) {
      this.error = descValidation.error || 'Invalid event description';
      return;
    }
    this.selectedEvent.description = descValidation.sanitized;

    // Validate date
    const dateValidation = this.inputValidation.validateDate(this.selectedEvent.eventDate || '');
    if (!dateValidation.isValid) {
      this.error = dateValidation.error || 'Invalid event date';
      return;
    }
    this.selectedEvent.eventDate = dateValidation.sanitized;

    // Validate time
    const timeValidation = this.inputValidation.validateTime(this.selectedEvent.eventTime || '');
    if (!timeValidation.isValid) {
      this.error = timeValidation.error || 'Invalid event time';
      return;
    }
    this.selectedEvent.eventTime = timeValidation.sanitized;

    // Validate location name
    const locationValidation = this.inputValidation.validateTextField(
      this.selectedEvent.locationName || '',
      this.inputValidation.MAX_LENGTHS.locationName,
      'Location name'
    );
    if (!locationValidation.isValid) {
      this.error = locationValidation.error || 'Invalid location name';
      return;
    }
    this.selectedEvent.locationName = locationValidation.sanitized;

    // Validate address
    const addressValidation = this.inputValidation.validateTextField(
      this.selectedEvent.address || '',
      this.inputValidation.MAX_LENGTHS.address,
      'Address'
    );
    if (!addressValidation.isValid) {
      this.error = addressValidation.error || 'Invalid address';
      return;
    }
    this.selectedEvent.address = addressValidation.sanitized;

    // Validate city
    const cityValidation = this.inputValidation.validateTextField(
      this.selectedEvent.city || '',
      this.inputValidation.MAX_LENGTHS.city,
      'City'
    );
    if (!cityValidation.isValid) {
      this.error = cityValidation.error || 'Invalid city';
      return;
    }
    this.selectedEvent.city = cityValidation.sanitized;

    // Validate state
    const stateValidation = this.inputValidation.validateState(this.selectedEvent.state || '');
    if (!stateValidation.isValid) {
      this.error = stateValidation.error || 'Invalid state';
      return;
    }
    this.selectedEvent.state = stateValidation.sanitized;

    // Validate numNeeded
    const numNeededValidation = this.inputValidation.validateNumber(
      this.selectedEvent.numNeeded || 1,
      1,
      10000,
      'Number of volunteers needed'
    );
    if (!numNeededValidation.isValid) {
      this.error = numNeededValidation.error || 'Invalid number of volunteers';
      return;
    }
    this.selectedEvent.numNeeded = numNeededValidation.sanitized;

    // Log the event data being sent to the API
    console.log('Saving event with data:', JSON.stringify(this.selectedEvent));

    this.volunteerService.updateEvent(this.selectedEvent.eventId, this.selectedEvent).subscribe({
      next: () => {
        this.success = 'Event updated successfully';
        this.isEditingEvent = false;

        // Update the local events list
        const index = this.events.findIndex(e => e.eventId === this.selectedEvent!.eventId);
        if (index !== -1) {
          this.events[index] = {
            ...this.selectedEvent!,
            showRegistrations: this.events[index].showRegistrations,
            registrations: this.events[index].registrations,
            userDetails: this.events[index].userDetails
          };
        }

        this.selectedEvent = null;
      },
      error: (error) => {
        console.error('Error updating event', error);
        this.error = 'Failed to update event';
      }
    });
  }

  // Show delete event confirmation
  confirmDeleteEvent(event: EventWithRegistrations): void {
    this.selectedEvent = event;
    this.showDeleteEventConfirmation = true;
  }

  // Cancel delete event
  cancelDeleteEvent(): void {
    this.selectedEvent = null;
    this.showDeleteEventConfirmation = false;
  }

  // Delete event
  deleteEvent(): void {
    if (!this.selectedEvent || !this.selectedEvent.eventId) return;

    this.volunteerService.deleteEvent(this.selectedEvent.eventId).subscribe({
      next: () => {
        this.success = 'Event deleted successfully';
        // Remove from local list
        this.events = this.events.filter(e => e.eventId !== this.selectedEvent!.eventId);
        this.showDeleteEventConfirmation = false;
        this.selectedEvent = null;
      },
      error: (error) => {
        console.error('Error deleting event', error);
        this.error = 'Failed to delete event. Ensure all registrations are cancelled first.';
      }
    });
  }

  // Edit organization functionality
  startEditingOrganization(): void {
    if (this.organization) {
      this.editableOrg = { ...this.organization };
    } else {
      // Creating a new organization
      this.editableOrg = {
        name: '',
        description: '',
        contactEmail: '',
        contactPhone: '',
        website: ''
      };
    }
    this.isEditingOrganization = true;
  }

  // Cancel editing organization
  cancelEditingOrganization(): void {
    this.editableOrg = null;
    this.isEditingOrganization = false;
  }

  // Save organization changes
  saveOrganization(): void {
    if (!this.editableOrg) return;

    // Validate and sanitize organization fields
    // Validate organization name
    const orgNameValidation = this.inputValidation.validateTextField(
      this.editableOrg.name || '',
      this.inputValidation.MAX_LENGTHS.organizationName,
      'Organization name'
    );
    if (!orgNameValidation.isValid) {
      this.error = orgNameValidation.error || 'Invalid organization name';
      return;
    }
    this.editableOrg.name = orgNameValidation.sanitized;

    // Validate organization description
    const orgDescValidation = this.inputValidation.validateTextField(
      this.editableOrg.description || '',
      this.inputValidation.MAX_LENGTHS.organizationDescription,
      'Organization description'
    );
    if (!orgDescValidation.isValid) {
      this.error = orgDescValidation.error || 'Invalid organization description';
      return;
    }
    this.editableOrg.description = orgDescValidation.sanitized;

    // Validate contact email
    const orgEmailValidation = this.inputValidation.validateEmail(this.editableOrg.contactEmail || '');
    if (!orgEmailValidation.isValid) {
      this.error = 'Contact email: ' + (orgEmailValidation.error || 'Invalid email');
      return;
    }
    this.editableOrg.contactEmail = orgEmailValidation.sanitized;

    // Validate contact phone
    const phoneValidation = this.inputValidation.validatePhone(this.editableOrg.contactPhone || '');
    if (!phoneValidation.isValid) {
      this.error = 'Contact phone: ' + (phoneValidation.error || 'Invalid phone number');
      return;
    }
    this.editableOrg.contactPhone = phoneValidation.sanitized;

    // Validate website if provided
    if (this.editableOrg.website && this.editableOrg.website.trim()) {
      const websiteValidation = this.inputValidation.validateUrl(this.editableOrg.website);
      if (!websiteValidation.isValid) {
        this.error = 'Website: ' + (websiteValidation.error || 'Invalid URL');
        return;
      }
      this.editableOrg.website = websiteValidation.sanitized;
    }

    if (this.organization && this.organization.organizationId) {
      // Update existing organization
      this.volunteerService.updateOrganization(this.organization.organizationId, this.editableOrg).subscribe({
        next: () => {
          this.success = 'Organization updated successfully';

          // Ensure we have a valid organization object
          if (this.editableOrg) {
            this.organization = {
              organizationId: this.organization!.organizationId,
              name: this.editableOrg.name || '',
              description: this.editableOrg.description || '',
              contactEmail: this.editableOrg.contactEmail || '',
              contactPhone: this.editableOrg.contactPhone || '',
              website: this.editableOrg.website || ''
            };
          }

          this.isEditingOrganization = false;
        },
        error: (error) => {
          console.error('Error updating organization', error);
          this.error = 'Failed to update organization';
        }
      });
    } else {
      // Create new organization
      this.volunteerService.createOrganization(this.editableOrg).subscribe({
        next: (response) => {
          this.success = 'Organization created successfully';

          // Ensure we have a valid organization object
          if (this.editableOrg) {
            this.organization = {
              organizationId: response.organizationId,
              name: this.editableOrg.name || '',
              description: this.editableOrg.description || '',
              contactEmail: this.editableOrg.contactEmail || '',
              contactPhone: this.editableOrg.contactPhone || '',
              website: this.editableOrg.website || ''
            };
          }

          // Update user with new organization
          if (this.currentUser && this.currentUser.userId) {
            this.volunteerService.updateUserOrganization(this.currentUser.userId, response.organizationId).subscribe({
              next: () => {
                console.log('User organization updated successfully');
                if (this.currentUser) {
                  this.currentUser.organizationId = response.organizationId;
                }
              },
              error: (err) => console.error('Error updating user organization', err)
            });
          }

          this.isEditingOrganization = false;
        },
        error: (error) => {
          console.error('Error creating organization', error);
          this.error = 'Failed to create organization';
        }
      });
    }
  }

  // Support Message Methods (for rejection response)
  showSupportMessageModal(): void {
    if (!this.currentUser || !this.organization) return;
    
    // Pre-fill form with user and organization info
    this.supportForm = {
      name: `${this.currentUser.firstName} ${this.currentUser.lastName}`,
      email: this.currentUser.email,
      subject: `Re: Organization Rejection - ${this.organization.name}`,
      message: `Hello,\n\nI would like to appeal the rejection of my organization "${this.organization.name}".\n\n`
    };
    
    // If there's a rejection reason, include it in the message
    if (this.organization.rejectionReason) {
      this.supportForm.message += `Rejection Reason: ${this.organization.rejectionReason}\n\n`;
    }
    
    this.supportForm.message += `Please review my organization and consider re-approval.\n\nThank you.`;
    this.supportSubmitted = false;
    this.supportError = '';
    this.showSupportModal = true;
  }

  cancelSupportMessage(): void {
    this.showSupportModal = false;
    this.supportForm = {
      name: '',
      email: '',
      subject: '',
      message: ''
    };
    this.supportError = '';
    this.supportSubmitted = false;
  }

  submitSupportMessage(): void {
    this.supportError = '';
    this.isSubmittingSupport = true;

    // Validate and sanitize name
    const nameValidation = this.inputValidation.validateName(this.supportForm.name, 'Name');
    if (!nameValidation.isValid) {
      this.supportError = nameValidation.error || 'Invalid name';
      this.isSubmittingSupport = false;
      return;
    }
    const sanitizedName = nameValidation.sanitized;

    // Validate and sanitize email
    const emailValidation = this.inputValidation.validateEmail(this.supportForm.email);
    if (!emailValidation.isValid) {
      this.supportError = emailValidation.error || 'Invalid email';
      this.isSubmittingSupport = false;
      return;
    }
    const sanitizedEmail = emailValidation.sanitized;

    // Validate and sanitize subject
    const subjectValidation = this.inputValidation.validateTextField(
      this.supportForm.subject,
      this.inputValidation.MAX_LENGTHS.subject,
      'Subject'
    );
    if (!subjectValidation.isValid) {
      this.supportError = subjectValidation.error || 'Invalid subject';
      this.isSubmittingSupport = false;
      return;
    }
    const sanitizedSubject = subjectValidation.sanitized;

    // Validate and sanitize message
    const messageValidation = this.inputValidation.validateTextField(
      this.supportForm.message,
      this.inputValidation.MAX_LENGTHS.message,
      'Message'
    );
    if (!messageValidation.isValid) {
      this.supportError = messageValidation.error || 'Invalid message';
      this.isSubmittingSupport = false;
      return;
    }
    const sanitizedMessage = messageValidation.sanitized;

    // Get current user
    const currentUser = this.authService.currentUserValue;
    const userId = currentUser?.userId || null;

    // Prepare support message data
    const supportMessage = {
      userId: userId,
      name: sanitizedName,
      email: sanitizedEmail,
      subject: sanitizedSubject,
      message: sanitizedMessage,
      isResolved: 0,
      respondedBy: null,
      responseMessage: null,
      respondedAt: null
    };

    // Submit to API
    this.volunteerService.createSupportMessage(supportMessage).subscribe({
      next: (response) => {
        console.log('Support message submitted successfully:', response);
        this.supportSubmitted = true;
        this.isSubmittingSupport = false;
        this.success = 'Your message has been sent successfully. We will review it and get back to you soon.';
        
        // Close modal after a delay
        setTimeout(() => {
          this.cancelSupportMessage();
        }, 2000);
      },
      error: (error) => {
        console.error('Error submitting support message:', error);
        this.supportError = 'Failed to send message. Please try again later.';
        this.isSubmittingSupport = false;
      }
    });
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

  get upcomingEventsList(): EventWithRegistrations[] {
    return this.events.filter(event => !this.isEventInPast(event));
  }

  get pastEventsList(): EventWithRegistrations[] {
    return this.events.filter(event => this.isEventInPast(event));
  }

  get displayedEvents(): EventWithRegistrations[] {
    if (this.activeEventTab === 'upcoming') {
      return this.upcomingEventsList;
    }
    if (this.activeEventTab === 'past') {
      return this.pastEventsList;
    }
    return this.events;
  }

  get totalRegistrations(): number {
    return this.events.reduce((sum, event) => sum + (event.numSignedUp || 0), 0);
  }

  setActiveEventTab(tab: 'upcoming' | 'past' | 'all'): void {
    this.activeEventTab = tab;
  }

  // Getter to check if user is organizer or admin
  get isOrganizerUser(): boolean {
    return this.currentUser?.role === 'organizer' || this.currentUser?.role === 'admin';
  }

  // Load all organizations for admin selection
  loadAllOrganizationsForAdmin(): void {
    this.isLoading = true;
    this.volunteerService.getOrganizations().subscribe({
      next: (orgs) => {
        this.allOrganizations = orgs;
        this.isLoading = false;
        
        // If no orgId in query params, show selection UI
        if (!this.selectedOrgId && orgs.length > 0) {
          // Don't set error, just show the selection UI
          this.error = '';
        }
      },
      error: (error) => {
        console.error('Error loading organizations for admin:', error);
        this.error = 'Failed to load organizations. Please try again.';
        this.isLoading = false;
      }
    });
  }

  // Admin selects an organization
  onAdminOrgSelect(orgId: number): void {
    this.selectedOrgId = orgId;
    this.router.navigate(['/organizer'], { queryParams: { orgId: orgId } });
    this.loadOrganization(orgId);
    this.loadEvents();
  }
}
