import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { VolunteerService } from '../../services/volunteer-service.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';
import { Event } from '../../models/event.model';
import { Organization } from '../../models/organization.model';
import { Signup, Attendance } from '../../models/signup.model';
import { OrganizerMetrics } from '../../models/metrics.model';
import { Tag, EventTagWithDetails } from '../../models/tag.model';
import { forkJoin, of, from, Observable } from 'rxjs';
import { catchError, switchMap, map } from 'rxjs/operators';
import { InputValidationService } from '../../services/input-validation.service';
import { CryptoService } from '../../services/crypto.service';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, registerables } from 'chart.js';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

// Register Chart.js components
Chart.register(...registerables);

interface EventWithRegistrations extends Omit<Event, 'tags'> {
  registrations?: Signup[];
  userDetails?: Map<number, User>;
  showRegistrations?: boolean;
  tags?: Tag[];
}

@Component({
  selector: 'app-organizer-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, BaseChartDirective],
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
  appealResponse: any | null = null; // Admin response to organization rejection appeal

  // Add Organizer
  showAddOrganizerModal = false;
  addOrganizerEmail = '';
  isAddingOrganizer = false;
  organizersSectionExpanded = false;
  organizationMembers: Array<{ firstName: string, lastName: string, email: string }> = [];
  loadingOrganizationMembers = false;

  // Events Management
  events: EventWithRegistrations[] = [];
  selectedEvent: EventWithRegistrations | null = null;
  isEditingEvent = false;
  showDeleteEventConfirmation = false;
  activeEventTab: 'upcoming' | 'past' | 'all' = 'upcoming';

  // Events Pagination
  eventsPageSize = 10;
  eventsCurrentPage = 1;
  eventsPageSizeOptions = [5, 10, 25, 50];

  // Tags
  availableTags: Tag[] = [];
  selectedTagIds: number[] = [];
  originalTagIds: number[] = [];
  tagsDropdownOpen = false;
  tagSearchQuery = '';
  tagsLoading = false;

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
    if (this.selectedEvent) {
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
      this.selectedEvent.eventTime = `${hourStr}:${minuteStr}`;
    }
  }

  /**
   * Parses eventTime (HH:MM:SS or HH:MM) and sets hour, minute, and AM/PM
   */
  parseEventTime(): void {
    if (this.selectedEvent?.eventTime) {
      const timeParts = this.selectedEvent.eventTime.split(':');
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

  // Attendance Management
  editingAttendanceForSignup: number | null = null;
  attendanceForm = {
    status: 'completed' as 'completed' | 'no_show' | 'excused',
    hours: null as number | null
  };

  // Tabs
  activeTab = 'events';
  // Collapsible sections
  eventsSectionExpanded = false;
  metricsSectionExpanded = false;

  // Admin organization selection
  allOrganizations: Organization[] = [];
  selectedOrgId: number | null = null;

  // Metrics properties
  organizerMetrics: OrganizerMetrics | null = null;
  loadingMetrics = false;
  metricsError = '';
  selectedChartType: 'pie' | 'bar' | 'line' = 'bar';
  selectedMetricChart: 'events' | 'hours' | 'topEvents' = 'events';
  // Date range filtering
  dateRangePreset: 'all' | 'last3' | 'last6' | 'last12' | 'custom' = 'all';
  customStartMonth: string = '';
  customEndMonth: string = '';

  // Top Volunteers
  topVolunteers: Array<{ userId: number, firstName: string, lastName: string, email: string, totalHours: number }> = [];
  loadingTopVolunteers = false;

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
   * Also loads support messages to check for appeal responses.
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

        // Load support messages to check for appeal responses
        if (this.organization && this.organization.approvalStatus === 'rejected') {
          this.loadAppealResponse();
        }

        this.isLoading = false;
        this.loadEvents();
        this.loadOrganizerMetrics();
        this.loadTags();
      },
      error: (error) => {
        this.error = 'Failed to load organization details';
        this.isLoading = false;
      }
    });
  }

  /**
   * Loads support messages to find any admin responses to organization rejection appeals.
   * Checks for resolved support messages related to the organization rejection.
   */
  loadAppealResponse(): void {
    if (!this.currentUser || !this.organization) {
      return;
    }

    this.volunteerService.getSupportMessages().subscribe({
      next: (messages) => {
        // Filter for messages from this user related to organization rejection
        const orgName = this.organization?.name || '';
        const appealMessages = messages.filter((msg: any) => {
          const userId = msg.userId || msg.user_id;
          const isResolved = msg.isResolved === 1 || msg.isResolved === true;
          const hasResponse = !!(msg.responseMessage || msg.response_message);
          const subject = (msg.subject || '').toLowerCase();
          const messageText = (msg.message || '').toLowerCase();

          // Check if message is from current user and related to organization rejection
          return userId === this.currentUser?.userId &&
            isResolved &&
            hasResponse &&
            (subject.includes('rejection') ||
              subject.includes('re: organization rejection') ||
              subject.includes(orgName.toLowerCase()) ||
              messageText.includes(orgName.toLowerCase()));
        });

        // Get the most recent resolved appeal response
        if (appealMessages.length > 0) {
          // Sort by date (most recent first)
          appealMessages.sort((a: any, b: any) => {
            const dateA = new Date(a.respondedAt || a.responded_at || 0).getTime();
            const dateB = new Date(b.respondedAt || b.responded_at || 0).getTime();
            return dateB - dateA;
          });

          this.appealResponse = appealMessages[0];
        } else {
          this.appealResponse = null;
        }
      },
      error: (err) => {
        // Silently fail - appeal response is optional
        this.appealResponse = null;
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
        const filteredEvents = events.filter(event => event.organizationId === orgId);

        // Load tags for each event
        const eventsWithTags = filteredEvents.map(event => ({
          ...event,
          showRegistrations: false,
          userDetails: new Map<number, User>(),
          tags: [] as Tag[]
        }));

        // Load tags for all events in parallel
        const tagObservables = eventsWithTags
          .filter(event => event.eventId)
          .map(event =>
            this.volunteerService.getTagsForEvent(event.eventId!).pipe(
              catchError((error) => {
                console.error('Error loading tags for event', event.eventId, error);
                // If it's a 500 error, it's likely a backend SQL issue
                if (error.status === 500) {
                  console.warn('Backend error loading tags for event', event.eventId, '- this may be a backend SQL issue. Check backend logs.');
                }
                return of([]);
              }),
              map((tags: EventTagWithDetails[]) => {
                console.log('Tags loaded for event', event.eventId, ':', tags);
                return { eventId: event.eventId, tags };
              })
            )
          );

        if (tagObservables.length > 0) {
          forkJoin(tagObservables).subscribe({
            next: (tagResults) => {
              console.log('All tag results:', tagResults);
              // Map tags to events
              tagResults.forEach(({ eventId, tags }) => {
                const event = eventsWithTags.find(e => e.eventId === eventId);
                if (event) {
                  // Convert EventTagWithDetails to Tag objects
                  event.tags = tags.map(et => ({
                    tagId: et.tagId,
                    name: et.tagName || 'Unknown Tag'
                  } as Tag));
                  console.log('Mapped tags for event', eventId, ':', event.tags);
                }
              });
              this.events = eventsWithTags;
              // Sort events by date and time (next event first)
              this.sortEventsByDateTime();
              console.log('Final events with tags:', this.events.map(e => ({ id: e.eventId, title: e.title, tagsCount: e.tags?.length || 0 })));
              this.isLoading = false;
            },
            error: (error) => {
              console.error('Error loading tags for events:', error);
              // If tags fail to load, still show events without tags
              this.events = eventsWithTags;
              // Sort events by date and time (next event first)
              this.sortEventsByDateTime();
              this.isLoading = false;
            }
          });
        } else {
          this.events = eventsWithTags;
          // Sort events by date and time (next event first)
          this.sortEventsByDateTime();
          this.isLoading = false;
        }
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
  isEventInPast(event: { eventDate: string }): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = event.eventDate.split('-').map(num => parseInt(num));
    const eventDate = new Date(year, month - 1, day);

    return eventDate < today;
  }

  /**
   * Sorts events by date and time, with the next upcoming event first.
   * Past events are sorted by most recent first.
   */
  sortEventsByDateTime(): void {
    const now = new Date();
    
    this.events.sort((a, b) => {
      const aDateTime = this.getEventDateTime(a);
      const bDateTime = this.getEventDateTime(b);
      
      const aIsPast = aDateTime < now;
      const bIsPast = bDateTime < now;
      
      // Upcoming events come before past events
      if (aIsPast !== bIsPast) {
        return aIsPast ? 1 : -1;
      }
      
      // If both are upcoming, sort by date/time ascending (next event first)
      if (!aIsPast) {
        return aDateTime.getTime() - bDateTime.getTime();
      }
      
      // If both are past, sort by date/time descending (most recent first)
      return bDateTime.getTime() - aDateTime.getTime();
    });
  }

  /**
   * Gets a Date object for an event's date and time.
   * 
   * @param event - The event to get the date/time for
   * @returns Date object representing when the event occurs
   */
  getEventDateTime(event: { eventDate: string; eventTime?: string }): Date {
    const [year, month, day] = event.eventDate.split('-').map(num => parseInt(num, 10));
    
    let hour = 0;
    let minute = 0;
    
    if (event.eventTime) {
      const timeParts = event.eventTime.split(':');
      hour = parseInt(timeParts[0], 10) || 0;
      minute = parseInt(timeParts[1], 10) || 0;
    }
    
    return new Date(year, month - 1, day, hour, minute, 0);
  }

  /**
   * Sets the active event tab and resets pagination.
   * 
   * @param tab - The tab to set as active ('upcoming', 'past', or 'all')
   */
  setActiveEventTab(tab: 'upcoming' | 'past' | 'all'): void {
    this.activeEventTab = tab;
    this.eventsCurrentPage = 1;
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

  /**
   * Duplicates an event and navigates to create-event page with pre-filled data.
   * 
   * @param event - The event to duplicate
   */
  duplicateEvent(event: EventWithRegistrations): void {
    // Prepare clean duplicate data
    const duplicateData = this.prepareEventDuplicate(event);
    
    // Navigate to create-event page with router state
    this.router.navigate(['/create-event'], {
      state: {
        duplicateEvent: duplicateData,
        sourceEventTitle: event.title
      }
    });
  }

  /**
   * Prepares a clean event object for duplication by stripping out fields that shouldn't be copied.
   * 
   * @param event - The source event to duplicate
   * @returns Clean event object ready for creating a new event
   */
  private prepareEventDuplicate(event: EventWithRegistrations): any {
    // Create a clean copy of the event, removing fields that shouldn't be duplicated
    const duplicate: any = {
      title: event.title || '',
      description: event.description || '',
      eventDate: '', // Reset date - user should set new date
      eventTime: event.eventTime || '', // Keep time, but user can change
      eventLengthHours: event.eventLengthHours || 1, // Keep duration, but validate
      locationName: event.locationName || '',
      address: event.address || '',
      city: event.city || '',
      state: event.state || '',
      numNeeded: event.numNeeded || 1, // Keep capacity, but user can change
      organizationId: event.organizationId || 0, // Keep organization
      // Tags will be handled separately - store tag IDs
      tagIds: event.tags && event.tags.length > 0 
        ? event.tags.map(tag => tag.tagId) 
        : []
    };

    // Strip out fields that should NOT be copied:
    // - eventId (will be assigned by backend)
    // - numSignedUp (new event starts at 0)
    // - createdBy (will be set from current user)
    // - organizationName (derived field)
    // - registrations (new event has none)
    // - userDetails (new event has none)
    // - showRegistrations (UI state)
    // - Any timestamps or audit fields

    return duplicate;
  }

  // Edit event functionality
  editEvent(event: EventWithRegistrations): void {
    // Create a deep copy of the event
    this.selectedEvent = { ...event };

    // Set default eventLengthHours to 1 if not set
    if (!this.selectedEvent.eventLengthHours || this.selectedEvent.eventLengthHours < 1) {
      this.selectedEvent.eventLengthHours = 1;
    }

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

    // Parse event time for the time picker
    this.parseEventTime();

    this.isEditingEvent = true;
    this.tagsDropdownOpen = false;
    this.tagSearchQuery = '';
    this.selectedTagIds = [];
    this.originalTagIds = [];
    this.tagsLoading = true;

    // Load all available tags first
    const loadAvailableTags = this.availableTags.length > 0
      ? of(this.availableTags)
      : from(this.volunteerService.getAllTags()).pipe(
        catchError(error => {
          console.error('Failed to load tags', error);
          return of([]);
        })
      );

    loadAvailableTags.subscribe({
      next: (tags) => {
        this.availableTags = tags || [];
        console.log('Available tags loaded:', this.availableTags.length);

        // Use tags from event object if available, otherwise load from API
        if (event.tags && event.tags.length > 0) {
          // Tags already loaded in the event object
          const ids = event.tags.map(t => t.tagId);
          this.selectedTagIds = [...ids];
          this.originalTagIds = [...ids];
          this.tagsLoading = false;
          console.log('Using tags from event object:', ids, event.tags.map(t => t.name));
        } else if (event.eventId) {
          // Load tags from API if not in event object
          this.volunteerService.getTagsForEvent(event.eventId).subscribe({
            next: (eventTags: EventTagWithDetails[]) => {
              const ids = eventTags.map(t => t.tagId);
              this.selectedTagIds = [...ids];
              this.originalTagIds = [...ids];
              this.tagsLoading = false;
              console.log('Loaded event tags from API:', ids);
            },
            error: (error) => {
              console.error('Failed to load tags for event', error);
              this.tagsLoading = false;
            }
          });
        } else {
          this.tagsLoading = false;
        }
      }
    });

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
    this.selectedTagIds = [];
    this.originalTagIds = [];
    this.tagsDropdownOpen = false;
    this.tagSearchQuery = '';
  }

  /**
   * Loads all available tags.
   */
  loadTags(): void {
    this.tagsLoading = true;
    this.volunteerService.getAllTags().subscribe({
      next: (tags) => {
        this.availableTags = tags || [];
        this.tagsLoading = false;
      },
      error: (error) => {
        console.error('Failed to load tags', error);
        this.tagsLoading = false;
      }
    });
  }

  /**
   * Toggles tag selection.
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
   * Closes the tags dropdown.
   */
  closeTagsDropdown(): void {
    this.tagsDropdownOpen = false;
    this.tagSearchQuery = '';
  }

  /**
   * Gets filtered events based on active tab.
   * Note: This getter is used for pagination calculations, actual displayed events use displayedEvents getter which includes sorting.
   */
  get filteredEvents(): EventWithRegistrations[] {
    switch (this.activeEventTab) {
      case 'upcoming':
        return this.upcomingEventsList;
      case 'past':
        return this.pastEventsList;
      case 'all':
      default:
        return this.events;
    }
  }

  /**
   * Gets paginated events for display, sorted by date/time.
   */
  get displayedEvents(): EventWithRegistrations[] {
    // Get the appropriate events based on active tab
    let eventsToDisplay: EventWithRegistrations[];
    
    switch (this.activeEventTab) {
      case 'upcoming':
        eventsToDisplay = this.upcomingEventsList;
        break;
      case 'past':
        eventsToDisplay = this.pastEventsList;
        break;
      case 'all':
      default:
        eventsToDisplay = this.events;
        break;
    }
    
    // Sort by date/time (next event first for upcoming, most recent first for past)
    const sortedEvents = [...eventsToDisplay];
    const now = new Date();
    
    sortedEvents.sort((a, b) => {
      const aDateTime = this.getEventDateTime(a);
      const bDateTime = this.getEventDateTime(b);
      
      const aIsPast = aDateTime < now;
      const bIsPast = bDateTime < now;
      
      // Upcoming events come before past events (only relevant for 'all' tab)
      if (aIsPast !== bIsPast && this.activeEventTab === 'all') {
        return aIsPast ? 1 : -1;
      }
      
      // If both are upcoming, sort by date/time ascending (next event first)
      if (!aIsPast) {
        return aDateTime.getTime() - bDateTime.getTime();
      }
      
      // If both are past, sort by date/time descending (most recent first)
      return bDateTime.getTime() - aDateTime.getTime();
    });
    
    // Apply pagination
    const startIndex = (this.eventsCurrentPage - 1) * this.eventsPageSize;
    const endIndex = startIndex + this.eventsPageSize;
    return sortedEvents.slice(startIndex, endIndex);
  }

  /**
   * Gets total number of pages for events.
   */
  get totalEventsPages(): number {
    let eventsCount: number;
    
    switch (this.activeEventTab) {
      case 'upcoming':
        eventsCount = this.upcomingEventsList.length;
        break;
      case 'past':
        eventsCount = this.pastEventsList.length;
        break;
      case 'all':
      default:
        eventsCount = this.events.length;
        break;
    }
    
    return Math.ceil(eventsCount / this.eventsPageSize);
  }

  /**
   * Gets upcoming events list (for metrics and tabs).
   * Sorted by date/time with next event first.
   */
  get upcomingEventsList(): EventWithRegistrations[] {
    const now = new Date();
    const upcoming = this.events.filter(event => {
      const eventDateTime = this.getEventDateTime(event);
      return eventDateTime >= now;
    });
    
    // Sort by date/time ascending (next event first)
    return upcoming.sort((a, b) => {
      const aDateTime = this.getEventDateTime(a);
      const bDateTime = this.getEventDateTime(b);
      return aDateTime.getTime() - bDateTime.getTime();
    });
  }

  /**
   * Gets past events list.
   * Sorted by date/time with most recent first.
   */
  get pastEventsList(): EventWithRegistrations[] {
    const now = new Date();
    const past = this.events.filter(event => {
      const eventDateTime = this.getEventDateTime(event);
      return eventDateTime < now;
    });
    
    // Sort by date/time descending (most recent first)
    return past.sort((a, b) => {
      const aDateTime = this.getEventDateTime(a);
      const bDateTime = this.getEventDateTime(b);
      return bDateTime.getTime() - aDateTime.getTime();
    });
  }


  /**
   * Changes the events page.
   */
  goToEventsPage(page: number): void {
    if (page >= 1 && page <= this.totalEventsPages) {
      this.eventsCurrentPage = page;
    }
  }

  /**
   * Changes the events page size.
   */
  changeEventsPageSize(size: number): void {
    this.eventsPageSize = size;
    this.eventsCurrentPage = 1;
  }

  /**
   * Listens for clicks outside the dropdown to close it.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.organizer-tags-dropdown-wrapper')) {
      this.closeTagsDropdown();
    }
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

    // Ensure time is updated from time picker before validation
    this.updateEventTime();
    
    // Ensure eventTime is set and is a string
    if (!this.selectedEvent.eventTime || typeof this.selectedEvent.eventTime !== 'string') {
      this.error = 'Please select a valid event time';
      return;
    }

    // Validate time
    const timeValidation = this.inputValidation.validateTime(this.selectedEvent.eventTime);
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

    // Validate eventLengthHours (required, must be 1-24)
    const hoursValidation = this.inputValidation.validateNumber(
      this.selectedEvent.eventLengthHours || 1,
      1,
      24,
      'Event length (hours)'
    );
    if (!hoursValidation.isValid) {
      this.error = hoursValidation.error || 'Event length must be between 1 and 24 hours';
      return;
    }
    this.selectedEvent.eventLengthHours = hoursValidation.sanitized;

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

    // Convert EventWithRegistrations to Event for API (remove tags property as it's Tag[], not string[])
    const eventForApi: Event = {
      ...this.selectedEvent,
      tags: undefined // Remove tags - they're handled separately via syncEventTags
    };
    delete (eventForApi as any).registrations;
    delete (eventForApi as any).userDetails;
    delete (eventForApi as any).showRegistrations;

    // Log the event data being sent to the API
    console.log('Saving event with data:', JSON.stringify(eventForApi));

    this.volunteerService.updateEvent(this.selectedEvent.eventId, eventForApi).subscribe({
      next: () => {
        // Sync tags after event is updated
        if (this.selectedEvent?.eventId) {
          this.syncEventTags(this.selectedEvent.eventId);
        } else {
          this.finalizeEventSave();
        }
      },
      error: (error) => {
        console.error('Error updating event', error);
        this.error = 'Failed to update event';
      }
    });
  }

  /**
   * Syncs tags for an event by comparing selected vs original tag IDs.
   */
  private syncEventTags(eventId: number): void {
    const currentIds = this.selectedTagIds || [];
    const originalIds = this.originalTagIds || [];

    const tagsToAdd = currentIds.filter(id => !originalIds.includes(id));
    const tagsToRemove = originalIds.filter(id => !currentIds.includes(id));

    const requests = [
      ...tagsToAdd.map(id => this.volunteerService.addTagToEvent(eventId, id)),
      ...tagsToRemove.map(id => this.volunteerService.removeTagFromEvent(eventId, id))
    ];

    if (requests.length === 0) {
      this.finalizeEventSave();
      return;
    }

    forkJoin(requests).subscribe({
      next: () => {
        this.finalizeEventSave();
      },
      error: (error) => {
        console.error('Failed to update tags for event', error);
        // Still finalize the save even if tags fail
        this.finalizeEventSave();
      }
    });
  }

  /**
   * Finalizes the event save by updating local state and showing success message.
   */
  private finalizeEventSave(): void {
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
    this.selectedTagIds = [];
    this.originalTagIds = [];
    this.tagsDropdownOpen = false;
    this.tagSearchQuery = '';
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

  /**
   * Formats a date string for appeal response display.
   * 
   * @param dateString - The date string to format
   * @returns Formatted date string
   */
  formatAppealResponseDate(dateString: string | undefined): string {
    if (!dateString) return '';
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

  get totalRegistrations(): number {
    return this.events.reduce((sum, event) => sum + (event.numSignedUp || 0), 0);
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
        // Sort organizations alphabetically by name
        this.allOrganizations = orgs.sort((a, b) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
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

  /**
   * Called when chart type or metric selection changes.
   * This prevents unnecessary method calls during change detection.
   */
  onChartTypeChange(): void {
    // Chart data will be recalculated when the template re-renders
    // This method exists to prevent the template from calling chart methods on every change detection
  }

  /**
   * Loads organizer metrics from the API.
   */
  loadOrganizerMetrics(): void {
    if (!this.currentUser || (this.currentUser.role !== 'organizer' && this.currentUser.role !== 'admin')) {
      return;
    }

    this.loadingMetrics = true;
    this.metricsError = '';

    // For admin users, pass the selected organization ID
    // For organizer users, pass their organization ID
    let organizationId: number | undefined;
    if (this.currentUser.role === 'admin') {
      organizationId = this.selectedOrgId || this.organization?.organizationId || undefined;
    } else if (this.currentUser.role === 'organizer') {
      // For organizers, use their organization ID from organization object or user object
      organizationId = this.organization?.organizationId || this.currentUser.organizationId || undefined;
    }

    this.volunteerService.getOrganizerMetrics(organizationId).subscribe({
      next: (metrics) => {
        // Map API property names to frontend expected names
        if (metrics && metrics.eventsByMonth) {
          metrics.eventsByMonth = metrics.eventsByMonth.map((m: any) => ({
            month: m.month || m.yearMonth,
            eventsCreated: m.eventsCreated ?? m.eventsHeld ?? 0,
            volunteerHours: m.volunteerHours ?? 0
          }));
        }

        // Map API property names to frontend expected names
        // API returns: totalActiveUpcomingEvents, but frontend expects: activeUpcomingEvents
        if (metrics && (metrics as any).totalActiveUpcomingEvents !== undefined) {
          (metrics as any).activeUpcomingEvents = (metrics as any).totalActiveUpcomingEvents;
        } else if (metrics && metrics.activeUpcomingEvents === undefined) {
          (metrics as any).activeUpcomingEvents = 0;
        }

        // Map topEventsByAttendance property names
        // API returns: title, registeredCount, attendedCount
        // Frontend expects: eventTitle, volunteersRegistered, volunteersAttended
        if (metrics && metrics.topEventsByAttendance) {
          metrics.topEventsByAttendance = metrics.topEventsByAttendance.map((e: any) => ({
            eventId: e.eventId ?? e.event_id ?? 0,
            eventTitle: e.title || e.eventTitle || e.event_title || 'Untitled Event',
            volunteersRegistered: e.registeredCount ?? e.volunteersRegistered ?? e.volunteers_registered ?? 0,
            volunteersAttended: e.attendedCount ?? e.volunteersAttended ?? e.volunteers_attended ?? 0,
            fillRate: e.fillRate ?? e.fill_rate ?? 0,
            volunteerHours: e.volunteerHours ?? e.volunteer_hours ?? 0,
            date: e.date || e.eventDate || null
          }));
        }

        this.organizerMetrics = metrics;
        // Calculate top volunteers when metrics are loaded
        this.calculateTopVolunteers();
        // Debug: Log the metrics to see what we're getting
        if (metrics) {
          console.log('Organizer Metrics received:', {
            totalEventsCreated: metrics.totalEventsCreated,
            activeUpcomingEvents: metrics.activeUpcomingEvents,
            eventsByMonth: metrics.eventsByMonth?.length || 0,
            eventsByMonthData: metrics.eventsByMonth,
            firstMonthSample: metrics.eventsByMonth?.[0],
            topEventsByAttendance: metrics.topEventsByAttendance?.length || 0,
            topEventsData: metrics.topEventsByAttendance,
            firstTopEventSample: metrics.topEventsByAttendance?.[0]
          });
        }
        this.loadingMetrics = false;
      },
      error: (error) => {
        console.error('Error loading organizer metrics:', error);
        this.metricsError = 'Failed to load metrics. Please try again later.';
        this.loadingMetrics = false;
      }
    });
  }

  /**
   * Gets chart data for attendance rates (pie chart).
   * 
   * @returns Chart data configuration
   */
  getAttendanceRatesChartData(): ChartData<'pie'> {
    if (!this.organizerMetrics) {
      return { labels: [], datasets: [] };
    }

    // Convert decimal percentages to actual percentages (multiply by 100)
    const attendanceRate = this.organizerMetrics.attendanceRate * 100;
    const noShowRate = this.organizerMetrics.noShowRate * 100;
    const excusedRate = this.organizerMetrics.excusedRate * 100;

    return {
      labels: ['Attended', 'No Show', 'Excused'],
      datasets: [{
        data: [
          attendanceRate,
          noShowRate,
          excusedRate
        ],
        backgroundColor: ['#28a745', '#dc3545', '#ffc107'],
        borderColor: ['#1e7e34', '#c82333', '#e0a800'],
        borderWidth: 2
      }]
    };
  }

  /**
   * Gets the filtered months based on the selected date range.
   * 
   * @param months - Array of month objects to filter
   * @returns Filtered array of months
   */
  private getFilteredMonths<T extends { month?: string; yearMonth?: string }>(months: T[]): T[] {
    if (!months || months.length === 0) {
      return [];
    }

    let startDate: Date | null = null;
    let endDate: Date | null = null;

    // Calculate date range based on preset
    const now = new Date();
    switch (this.dateRangePreset) {
      case 'last3':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last6':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last12':
        startDate = new Date(now.getFullYear(), now.getMonth() - 12, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'custom':
        if (this.customStartMonth) {
          const [startYear, startMonth] = this.customStartMonth.split('-').map(Number);
          startDate = new Date(startYear, startMonth - 1, 1);
        }
        if (this.customEndMonth) {
          const [endYear, endMonth] = this.customEndMonth.split('-').map(Number);
          endDate = new Date(endYear, endMonth, 0); // Last day of the month
        }
        break;
      case 'all':
      default:
        // No filtering
        return months;
    }

    // Filter months within the date range
    return months.filter(m => {
      const monthValue = m.month || (m as any).yearMonth;
      if (!monthValue) return false;

      const [year, month] = monthValue.split('-').map(Number);
      const monthDate = new Date(year, month - 1, 1);

      if (startDate && monthDate < startDate) return false;
      if (endDate && monthDate > endDate) return false;

      return true;
    });
  }

  /**
   * Gets chart data for monthly events (bar/line chart).
   * 
   * @returns Chart data configuration
   */
  getMonthlyEventsChartData(): ChartData<'bar' | 'line'> {
    if (!this.organizerMetrics || !this.organizerMetrics.eventsByMonth || this.organizerMetrics.eventsByMonth.length === 0) {
      console.log('getMonthlyEventsChartData: No data available');
      return { labels: [], datasets: [] };
    }

    // Filter out any entries with missing month data
    // API returns: yearMonth, eventsHeld, volunteerHours
    // Frontend expects: month, eventsCreated, volunteerHours
    let validMonths = this.organizerMetrics.eventsByMonth.filter(m => {
      if (!m) return false;
      // Check for month property in various formats
      const month = m.month || (m as any).yearMonth || (m as any).month_key || (m as any).month_value;
      return !!month;
    });

    // Apply date range filter
    validMonths = this.getFilteredMonths(validMonths);

    if (validMonths.length === 0) {
      return { labels: [], datasets: [] };
    }

    const labels = validMonths.map(m => {
      // Check for month property in various formats
      const monthValue = m.month || (m as any).yearMonth || (m as any).month_key || (m as any).month_value;
      if (!monthValue) return 'Unknown';
      const [year, month] = monthValue.split('-');
      if (!year || !month) return 'Invalid Date';
      const date = new Date(parseInt(year), parseInt(month) - 1);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });

    const data = validMonths.map(m => {
      // Check for eventsCreated in various formats (API uses eventsHeld)
      const value = m.eventsCreated ?? (m as any).eventsHeld ?? (m as any).events_created ?? 0;
      return typeof value === 'number' ? value : 0;
    });

    console.log('getMonthlyEventsChartData: Chart data prepared:', {
      labelsCount: labels.length,
      dataCount: data.length,
      labels: labels.slice(0, 5), // First 5 labels
      data: data.slice(0, 5) // First 5 data points
    });

    const chartData = {
      labels: labels,
      datasets: [{
        label: 'Events Created',
        data: data,
        backgroundColor: 'rgba(31, 125, 96, 0.6)',
        borderColor: '#1f7d60',
        borderWidth: 2
      }]
    };

    // Ensure we have valid data
    if (labels.length === 0 || data.length === 0 || labels.length !== data.length) {
      console.warn('getMonthlyEventsChartData: Invalid chart data structure', chartData);
      return { labels: [], datasets: [] };
    }

    return chartData;
  }

  /**
   * Gets chart data for monthly volunteer hours (bar/line chart).
   * 
   * @returns Chart data configuration
   */
  getMonthlyHoursChartData(): ChartData<'bar' | 'line'> {
    if (!this.organizerMetrics || !this.organizerMetrics.eventsByMonth || this.organizerMetrics.eventsByMonth.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Filter out any entries with missing month data
    // API returns: yearMonth, eventsHeld, volunteerHours
    // Frontend expects: month, eventsCreated, volunteerHours
    let validMonths = this.organizerMetrics.eventsByMonth.filter(m => {
      if (!m) return false;
      // Check for month property in various formats
      const month = m.month || (m as any).yearMonth || (m as any).month_key || (m as any).month_value;
      return !!month;
    });

    // Apply date range filter
    validMonths = this.getFilteredMonths(validMonths);

    if (validMonths.length === 0) {
      return { labels: [], datasets: [] };
    }

    const labels = validMonths.map(m => {
      // Check for month property in various formats
      const monthValue = m.month || (m as any).yearMonth || (m as any).month_key || (m as any).month_value;
      if (!monthValue) return 'Unknown';
      const [year, month] = monthValue.split('-');
      if (!year || !month) return 'Invalid Date';
      const date = new Date(parseInt(year), parseInt(month) - 1);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });

    const data = validMonths.map(m => {
      const value = m.volunteerHours ?? (m as any).volunteer_hours ?? 0;
      return typeof value === 'number' ? value : 0;
    });

    console.log('getMonthlyHoursChartData: Chart data prepared:', {
      labelsCount: labels.length,
      dataCount: data.length
    });

    const chartData = {
      labels: labels,
      datasets: [{
        label: 'Volunteer Hours',
        data: data,
        backgroundColor: 'rgba(40, 167, 69, 0.6)',
        borderColor: '#28a745',
        borderWidth: 2
      }]
    };

    // Ensure we have valid data
    if (labels.length === 0 || data.length === 0 || labels.length !== data.length) {
      console.warn('getMonthlyHoursChartData: Invalid chart data structure', chartData);
      return { labels: [], datasets: [] };
    }

    return chartData;
  }

  /**
   * Gets the filtered events based on the selected date range.
   * 
   * @param events - Array of event objects to filter
   * @returns Filtered array of events
   */
  private getFilteredEvents<T extends { date?: string }>(events: T[]): T[] {
    if (!events || events.length === 0) {
      return [];
    }

    let startDate: Date | null = null;
    let endDate: Date | null = null;

    // Calculate date range based on preset
    const now = new Date();
    switch (this.dateRangePreset) {
      case 'last3':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last6':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last12':
        startDate = new Date(now.getFullYear(), now.getMonth() - 12, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'custom':
        if (this.customStartMonth) {
          const [startYear, startMonth] = this.customStartMonth.split('-').map(Number);
          startDate = new Date(startYear, startMonth - 1, 1);
        }
        if (this.customEndMonth) {
          const [endYear, endMonth] = this.customEndMonth.split('-').map(Number);
          endDate = new Date(endYear, endMonth, 0); // Last day of the month
        }
        break;
      case 'all':
      default:
        // No filtering
        return events;
    }

    // Filter events within the date range
    return events.filter(e => {
      const eventDateStr = e.date;
      if (!eventDateStr) return true; // Include events without dates if no filter is set

      const eventDate = new Date(eventDateStr);
      if (isNaN(eventDate.getTime())) return true; // Include invalid dates

      if (startDate && eventDate < startDate) return false;
      if (endDate && eventDate > endDate) return false;

      return true;
    });
  }

  /**
   * Gets chart data for top events by attendance (bar chart).
   * 
   * @returns Chart data configuration
   */
  getTopEventsChartData(): ChartData<'bar'> {
    if (!this.organizerMetrics || !this.organizerMetrics.topEventsByAttendance || this.organizerMetrics.topEventsByAttendance.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Filter out any entries with missing eventTitle
    // After mapping, eventTitle should be set from API's 'title'
    let validEvents = this.organizerMetrics.topEventsByAttendance.filter(e => {
      if (!e) return false;
      const title = e.eventTitle || (e as any).title;
      return !!title;
    });

    // Apply date range filter
    validEvents = this.getFilteredEvents(validEvents);

    if (validEvents.length === 0) {
      return { labels: [], datasets: [] };
    }

    const top10 = validEvents.slice(0, 10);
    const labels = top10.map(e => {
      const title = e.eventTitle || (e as any).title || 'Untitled Event';
      return title.length > 30 ? title.substring(0, 30) + '...' : title;
    });

    // After mapping, volunteersAttended should be set from API's 'attendedCount'
    const data = top10.map(e => {
      const value = e.volunteersAttended ?? 0;
      return typeof value === 'number' ? value : 0;
    });

    return {
      labels: labels,
      datasets: [{
        label: 'Volunteers Attended',
        data: data,
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
              return `${label}: ${value.toFixed(1)}% (${percentage}% of total)`;
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
        },
        tooltip: {
          enabled: true
        }
      }
    };
  }

  /**
   * Checks if chart data is available for rendering.
   * 
   * @param chartType - The type of chart to check
   * @param metricType - The metric type to check
   * @returns True if chart data is available
   */
  hasChartData(chartType: string, metricType: string): boolean {
    if (!this.organizerMetrics) {
      return false;
    }

    if (chartType === 'pie') {
      return this.organizerMetrics.attendanceRate !== undefined &&
        this.organizerMetrics.noShowRate !== undefined &&
        this.organizerMetrics.excusedRate !== undefined;
    }

    if (metricType === 'events' || metricType === 'hours') {
      return this.organizerMetrics.eventsByMonth && this.organizerMetrics.eventsByMonth.length > 0;
    }

    if (metricType === 'topEvents') {
      return this.organizerMetrics.topEventsByAttendance && this.organizerMetrics.topEventsByAttendance.length > 0;
    }

    return false;
  }


  /**
   * Gets the chart type as a literal string for the current selection.
   * 
   * @returns The chart type as a string literal
   */
  getChartType(): 'bar' | 'line' | 'pie' {
    return this.selectedChartType;
  }

  // ========== Metrics Export Methods ==========

  /**
   * Downloads organizer metrics as a PDF report.
   * Includes summary statistics, data tables, and chart images.
   */
  downloadMetricsAsPDF(): void {
    if (!this.organizerMetrics || !this.organization) {
      return;
    }

    // Ensure metrics section is expanded so charts are visible for capture
    this.metricsSectionExpanded = true;

    // Wait a moment for charts to render, then generate PDF
    setTimeout(() => {
      this.generateOrganizerPDFWithCharts();
    }, 500);
  }

  /**
   * Internal method to generate the PDF with charts.
   * Called after ensuring charts are visible and rendered.
   */
  private generateOrganizerPDFWithCharts(): void {
    if (!this.organizerMetrics || !this.organization) {
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
      doc.text('Organization Metrics Report', pageWidth / 2, 20, { align: 'center' });

      // Organization name
      doc.setFontSize(16);
      doc.setFont('helvetica', 'normal');
      doc.text(this.organization.name, pageWidth / 2, 30, { align: 'center' });

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
        ['Total Events Created', this.organizerMetrics.totalEventsCreated.toString()],
        ['Active Upcoming Events', (this.organizerMetrics.activeUpcomingEvents || 0).toString()],
        ['Total Volunteers Registered', this.organizerMetrics.totalVolunteersRegistered.toString()],
        ['Total Volunteer Hours', this.organizerMetrics.totalVolunteerHoursDelivered.toString()],
        ['Average Fill Rate', `${(this.organizerMetrics.averageFillRate * 100).toFixed(1)}%`],
        ['Attendance Rate', `${(this.organizerMetrics.attendanceRate * 100).toFixed(1)}%`],
        ['No Show Rate', `${(this.organizerMetrics.noShowRate * 100).toFixed(1)}%`],
        ['Excused Rate', `${(this.organizerMetrics.excusedRate * 100).toFixed(1)}%`]
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

      // Monthly Events Section
      if (this.organizerMetrics.eventsByMonth && this.organizerMetrics.eventsByMonth.length > 0) {
        checkPageBreak(60);

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Monthly Events History', 20, yPosition);
        yPosition += 10;

        const monthlyData = [['Month', 'Events Created', 'Volunteer Hours']];
        this.organizerMetrics.eventsByMonth.forEach(month => {
          const monthValue = month.month || (month as any).yearMonth;
          if (monthValue) {
            const [year, monthNum] = monthValue.split('-');
            const date = new Date(parseInt(year), parseInt(monthNum) - 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            monthlyData.push([
              monthName,
              (month.eventsCreated ?? (month as any).eventsHeld ?? 0).toString(),
              (month.volunteerHours ?? 0).toString()
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

      // Top Events Section
      if (this.organizerMetrics.topEventsByAttendance && this.organizerMetrics.topEventsByAttendance.length > 0) {
        checkPageBreak(60);

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Top Events by Attendance', 20, yPosition);
        yPosition += 10;

        const topEventsData = [['Event', 'Registered', 'Attended', 'Fill Rate']];
        this.organizerMetrics.topEventsByAttendance.slice(0, 10).forEach(event => {
          const eventTitle = event.eventTitle || event.title || 'Untitled Event';
          const shortTitle = eventTitle.length > 30 ? eventTitle.substring(0, 27) + '...' : eventTitle;
          topEventsData.push([
            shortTitle,
            (event.volunteersRegistered ?? (event as any).registeredCount ?? 0).toString(),
            (event.volunteersAttended ?? (event as any).attendedCount ?? 0).toString(),
            `${((event.fillRate ?? 0) * 100).toFixed(1)}%`
          ]);
        });

        // Draw top events table
        doc.setFillColor(245, 247, 250);
        const tableHeight = topEventsData.length * 6 + 5;
        doc.rect(20, yPosition - 5, pageWidth - 40, tableHeight, 'F');

        let topEventsTableY = yPosition;
        topEventsData.forEach((row, index) => {
          if (index === 0) {
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.rect(20, topEventsTableY - 5, pageWidth - 40, 6, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
          } else {
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
          }

          doc.text(row[0], 25, topEventsTableY, { maxWidth: pageWidth - 120 });
          doc.text(row[1], pageWidth - 90, topEventsTableY, { align: 'center' });
          doc.text(row[2], pageWidth - 60, topEventsTableY, { align: 'center' });
          doc.text(row[3], pageWidth - 25, topEventsTableY, { align: 'right' });

          if (index < topEventsData.length - 1) {
            doc.line(20, topEventsTableY + 1, pageWidth - 20, topEventsTableY + 1);
          }

          topEventsTableY += 6;
        });

        yPosition = topEventsTableY + 15;
      }

      // Top Volunteers Section
      if (this.topVolunteers && this.topVolunteers.length > 0) {
        checkPageBreak(50);

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Top 5 Volunteers by Hours', 20, yPosition);
        yPosition += 10;

        const topVolunteersData = [['Rank', 'Name', 'Email', 'Total Hours']];
        this.topVolunteers.forEach((volunteer, index) => {
          topVolunteersData.push([
            `#${index + 1}`,
            `${volunteer.firstName} ${volunteer.lastName}`,
            volunteer.email,
            volunteer.totalHours.toFixed(1)
          ]);
        });

        // Draw top volunteers table
        doc.setFillColor(245, 247, 250);
        const tableHeight = topVolunteersData.length * 6 + 5;
        doc.rect(20, yPosition - 5, pageWidth - 40, tableHeight, 'F');

        let topVolunteersTableY = yPosition;
        topVolunteersData.forEach((row, index) => {
          if (index === 0) {
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.rect(20, topVolunteersTableY - 5, pageWidth - 40, 6, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
          } else {
            doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
          }

          doc.text(row[0], 25, topVolunteersTableY);
          doc.text(row[1], 50, topVolunteersTableY, { maxWidth: 60 });
          doc.text(row[2], 115, topVolunteersTableY, { maxWidth: 60 });
          doc.text(row[3], pageWidth - 25, topVolunteersTableY, { align: 'right' });

          if (index < topVolunteersData.length - 1) {
            doc.line(20, topVolunteersTableY + 1, pageWidth - 20, topVolunteersTableY + 1);
          }

          topVolunteersTableY += 6;
        });

        yPosition = topVolunteersTableY + 15;
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
        if (!this.organization) return;

        // 1. Attendance Rates Pie Chart
        const pieChartCanvas = document.querySelector('.organizer-metrics canvas[data-chart-type="pie"]') as HTMLCanvasElement;
        if (pieChartCanvas) {
          try {
            const pieChartImage = pieChartCanvas.toDataURL('image/png');
            checkPageBreak(60);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Attendance Rates', 20, yPosition);
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

        // 2. Monthly Events Chart (bar or line)
        const barCharts = document.querySelectorAll('.organizer-metrics canvas[type="bar"]');
        const lineCharts = document.querySelectorAll('.organizer-metrics canvas[type="line"]');
        const monthlyChart = (barCharts.length > 0 ? barCharts[0] : (lineCharts.length > 0 ? lineCharts[0] : null)) as HTMLCanvasElement;

        if (monthlyChart) {
          try {
            const monthlyChartImage = monthlyChart.toDataURL('image/png');
            checkPageBreak(60);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            let chartTitle = 'Monthly Events';
            if (this.selectedMetricChart === 'events') {
              chartTitle = 'Monthly Events Created';
            } else if (this.selectedMetricChart === 'hours') {
              chartTitle = 'Monthly Volunteer Hours';
            } else if (this.selectedMetricChart === 'topEvents') {
              chartTitle = 'Top Events by Attendance';
            }
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
        doc.text('This report was generated from VolunteerSync. For interactive charts and detailed data, visit your dashboard.', pageWidth / 2, footerY, { align: 'center' });

        // Save the PDF
        const fileName = `organization-metrics-${this.organization.name.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
      };

      // Execute chart capture and PDF generation
      addChartsToPDF().catch((error) => {
        console.error('Error adding charts to PDF:', error);
        // Still save the PDF even if charts fail
        const footerY = pageHeight - 15;
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('This report was generated from VolunteerSync. Charts could not be included.', pageWidth / 2, footerY, { align: 'center' });
        if (this.organization) {
          const fileName = `organization-metrics-${this.organization.name.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().split('T')[0]}.pdf`;
          doc.save(fileName);
        }
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      this.error = 'Failed to generate PDF report. Please try again.';
    }
  }

  /**
   * Downloads organizer metrics as an Excel file.
   * Includes all data in spreadsheet format with multiple sheets.
   */
  downloadMetricsAsExcel(): void {
    if (!this.organizerMetrics || !this.organization) {
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();

      // Summary Statistics Sheet
      const summaryData = [
        ['Organization Metrics Report'],
        [`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`],
        [`Organization: ${this.organization.name}`],
        [],
        ['Metric', 'Value'],
        ['Total Events Created', this.organizerMetrics.totalEventsCreated],
        ['Active Upcoming Events', this.organizerMetrics.activeUpcomingEvents || 0],
        ['Total Volunteers Registered', this.organizerMetrics.totalVolunteersRegistered],
        ['Total Volunteer Hours', this.organizerMetrics.totalVolunteerHoursDelivered],
        ['Average Fill Rate', this.organizerMetrics.averageFillRate],
        ['Attendance Rate', this.organizerMetrics.attendanceRate],
        ['No Show Rate', this.organizerMetrics.noShowRate],
        ['Excused Rate', this.organizerMetrics.excusedRate]
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      // Monthly Events Sheet
      if (this.organizerMetrics.eventsByMonth && this.organizerMetrics.eventsByMonth.length > 0) {
        const monthlyData = [['Month', 'Events Created', 'Volunteer Hours']];
        this.organizerMetrics.eventsByMonth.forEach(month => {
          const monthValue = month.month || (month as any).yearMonth;
          if (monthValue) {
            const [year, monthNum] = monthValue.split('-');
            const date = new Date(parseInt(year), parseInt(monthNum) - 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            monthlyData.push([
              monthName,
              month.eventsCreated ?? (month as any).eventsHeld ?? 0,
              month.volunteerHours ?? 0
            ]);
          }
        });
        const monthlySheet = XLSX.utils.aoa_to_sheet(monthlyData);
        XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Monthly History');
      }

      // Top Events Sheet
      if (this.organizerMetrics.topEventsByAttendance && this.organizerMetrics.topEventsByAttendance.length > 0) {
        const topEventsData = [['Event Title', 'Date', 'Registered', 'Attended', 'Fill Rate', 'Volunteer Hours']];
        this.organizerMetrics.topEventsByAttendance.forEach(event => {
          topEventsData.push([
            event.eventTitle || event.title || 'Untitled Event',
            event.date || 'N/A',
            event.volunteersRegistered ?? (event as any).registeredCount ?? 0,
            event.volunteersAttended ?? (event as any).attendedCount ?? 0,
            event.fillRate,
            event.volunteerHours ?? 0
          ]);
        });
        const topEventsSheet = XLSX.utils.aoa_to_sheet(topEventsData);
        XLSX.utils.book_append_sheet(workbook, topEventsSheet, 'Top Events');
      }

      // Top Volunteers Sheet
      if (this.topVolunteers && this.topVolunteers.length > 0) {
        const topVolunteersData = [['Rank', 'First Name', 'Last Name', 'Email', 'Total Hours']];
        this.topVolunteers.forEach((volunteer, index) => {
          topVolunteersData.push([
            (index + 1).toString(),
            volunteer.firstName,
            volunteer.lastName,
            volunteer.email,
            volunteer.totalHours.toString()
          ]);
        });
        const topVolunteersSheet = XLSX.utils.aoa_to_sheet(topVolunteersData);
        XLSX.utils.book_append_sheet(workbook, topVolunteersSheet, 'Top Volunteers');
      }

      // Save the Excel file
      const fileName = `organization-metrics-${this.organization.name.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error generating Excel file:', error);
      this.error = 'Failed to generate Excel file. Please try again.';
    }
  }

  // Add Organizer Methods
  toggleOrganizersSection(): void {
    this.organizersSectionExpanded = !this.organizersSectionExpanded;
    if (this.organizersSectionExpanded && this.organizationMembers.length === 0 && !this.loadingOrganizationMembers) {
      this.loadOrganizationMembers();
    }
  }

  loadOrganizationMembers(): void {
    if (!this.organization || !this.organization.organizationId) {
      return;
    }

    this.loadingOrganizationMembers = true;
    // For organizers, backend uses organizationId from JWT token
    // For admins, we can optionally pass organizationId
    const organizationId = this.currentUser?.role === 'admin' ? this.organization.organizationId : undefined;

    this.volunteerService.getOrganizationMembers(organizationId).subscribe({
      next: (members) => {
        this.organizationMembers = members;
        this.loadingOrganizationMembers = false;
      },
      error: (error) => {
        console.error('Error loading organization members', error);
        this.loadingOrganizationMembers = false;
        this.error = 'Failed to load organization members. Please try again.';
      }
    });
  }

  openAddOrganizerModal(): void {
    this.showAddOrganizerModal = true;
    this.addOrganizerEmail = '';
    this.isAddingOrganizer = false;
    this.error = '';
    this.success = '';
  }

  closeAddOrganizerModal(): void {
    this.showAddOrganizerModal = false;
    this.addOrganizerEmail = '';
    this.isAddingOrganizer = false;
  }

  addOrganizerToOrganization(): void {
    if (!this.addOrganizerEmail.trim()) {
      this.error = 'Please enter an email address.';
      return;
    }

    if (!this.organization || !this.organization.organizationId) {
      this.error = 'Organization information is missing.';
      return;
    }

    this.isAddingOrganizer = true;
    this.error = '';

    const email = this.addOrganizerEmail.trim().toLowerCase();
    const organizationId = this.organization.organizationId;

    // Directly attempt to add organizer using PUT /users with email, role, and organizationId
    // Backend will look up user by email and validate
    this.volunteerService.addOrganizerByEmail(email, organizationId).subscribe({
      next: () => {
        this.success = `Successfully added organizer for your organization.`;
        this.closeAddOrganizerModal();
        this.isAddingOrganizer = false;
        // Reload organization members to show the new organizer
        this.loadOrganizationMembers();
      },
      error: (error) => {
        console.error('Error adding organizer', error);
        // Extract error message from response
        const errorMessage = error.error?.message || error.error?.error?.message;
        if (error.status === 404 || errorMessage?.toLowerCase().includes('not found')) {
          this.error = 'User not found with that email address.';
        } else {
          this.error = errorMessage || 'Failed to add organizer. Please try again.';
        }
        this.isAddingOrganizer = false;
      }
    });
  }

  /**
   * Calculates the top 5 volunteers by total hours volunteered to this organization.
   * Aggregates hours from all past events with attendance data.
   */
  calculateTopVolunteers(): void {
    this.loadingTopVolunteers = true;

    // Get all past events
    const pastEvents = this.events.filter(event => this.isEventInPast(event));

    if (pastEvents.length === 0) {
      this.topVolunteers = [];
      this.loadingTopVolunteers = false;
      return;
    }

    // Create a map to aggregate hours by userId
    const volunteerHoursMap = new Map<number, number>();

    // Load attendance for all past events
    const attendanceObservables = pastEvents
      .filter(event => event.eventId)
      .map(event =>
        this.volunteerService.getEventAttendance(event.eventId!).pipe(
          catchError((error) => {
            console.error('Error loading attendance for event', event.eventId, error);
            return of([]);
          }),
          map((signups: Signup[]) => ({ eventId: event.eventId, signups }))
        )
      );

    if (attendanceObservables.length === 0) {
      this.topVolunteers = [];
      this.loadingTopVolunteers = false;
      return;
    }

    forkJoin(attendanceObservables).subscribe({
      next: (attendanceResults) => {
        // Aggregate hours by volunteer
        attendanceResults.forEach(({ signups }) => {
          signups.forEach((signup: Signup) => {
            if (signup.attendance && signup.attendance.hours !== null && signup.attendance.hours !== undefined) {
              const currentHours = volunteerHoursMap.get(signup.userId) || 0;
              volunteerHoursMap.set(signup.userId, currentHours + signup.attendance.hours);
            }
          });
        });

        // Get user details for all volunteers
        const userIds = Array.from(volunteerHoursMap.keys());
        if (userIds.length === 0) {
          this.topVolunteers = [];
          this.loadingTopVolunteers = false;
          return;
        }

        const userObservables = userIds.map(userId =>
          this.volunteerService.getUser(userId).pipe(
            catchError((err) => {
              console.error('Error loading user', userId, err);
              return of(null);
            })
          )
        );

        forkJoin(userObservables).subscribe({
          next: (users) => {
            const topVolunteersList: Array<{ userId: number, firstName: string, lastName: string, email: string, totalHours: number }> = [];

            users.forEach((userData, index) => {
              if (userData === null) return;

              const userId = userIds[index];
              const totalHours = volunteerHoursMap.get(userId) || 0;

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

              topVolunteersList.push({
                userId: user.userId!,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                email: user.email || '',
                totalHours: totalHours
              });
            });

            // Sort by total hours (descending) and take top 5
            topVolunteersList.sort((a, b) => b.totalHours - a.totalHours);
            this.topVolunteers = topVolunteersList.slice(0, 5);
            this.loadingTopVolunteers = false;
          },
          error: (error) => {
            console.error('Error loading user details for top volunteers:', error);
            this.loadingTopVolunteers = false;
          }
        });
      },
      error: (error) => {
        console.error('Error loading attendance data for top volunteers:', error);
        this.loadingTopVolunteers = false;
      }
    });
  }

  /**
   * Exports all events (past and upcoming) to Excel.
   * Includes event details, location, registrations, and attendance data.
   */
  exportEventsToExcel(): void {
    if (!this.events || this.events.length === 0) {
      this.error = 'No events to export';
      return;
    }

    // Show loading message
    this.success = 'Loading event data for export...';

    // Load registrations for all events that don't have them loaded yet
    const eventsNeedingRegistrations = this.events.filter(e =>
      e.eventId && (!e.registrations || e.registrations.length === 0)
    );

    if (eventsNeedingRegistrations.length > 0) {
      // Load registrations for all events
      const registrationObservables = eventsNeedingRegistrations.map(event => {
        const isPast = this.isEventInPast(event);
        const apiCall = isPast
          ? this.volunteerService.getEventAttendance(event.eventId!)
          : this.volunteerService.getEventSignups(event.eventId!);

        return apiCall.pipe(
          catchError((error) => {
            console.error('Error loading registrations for event', event.eventId, error);
            return of([]);
          }),
          map((signups: Signup[]) => ({ eventId: event.eventId, signups }))
        );
      });

      forkJoin(registrationObservables).subscribe({
        next: (results) => {
          // Update events with loaded registrations
          const eventsToProcess: Array<{ event: EventWithRegistrations, signups: Signup[] }> = [];

          results.forEach(({ eventId, signups }) => {
            const event = this.events.find(e => e.eventId === eventId);
            if (event) {
              event.registrations = signups.filter(s => s.signupId);
              if (event.registrations.length > 0) {
                eventsToProcess.push({ event, signups: event.registrations });
              }
            }
          });

          // Load user details for all registrations at once
          if (eventsToProcess.length > 0) {
            const allUserObservables: Observable<User | null>[] = [];
            const userEventMap: Map<number, EventWithRegistrations> = new Map();
            const userSignupMap: Map<number, Signup> = new Map();

            eventsToProcess.forEach(({ event, signups }) => {
              if (!event.userDetails) {
                event.userDetails = new Map<number, User>();
              }
              signups.forEach(signup => {
                allUserObservables.push(
                  this.volunteerService.getUser(signup.userId).pipe(
                    catchError((err) => of(null))
                  )
                );
                userEventMap.set(allUserObservables.length - 1, event);
                userSignupMap.set(allUserObservables.length - 1, signup);
              });
            });

            if (allUserObservables.length > 0) {
              forkJoin(allUserObservables).subscribe({
                next: (users) => {
                  users.forEach((userData, index) => {
                    if (userData) {
                      const event = userEventMap.get(index);
                      const signup = userSignupMap.get(index);
                      if (event && signup && event.userDetails) {
                        let user: User;
                        if (Array.isArray(userData)) {
                          user = userData.length > 0 ? userData[0] : null as any;
                        } else {
                          user = userData;
                        }
                        if (user) {
                          event.userDetails.set(signup.userId, user);
                        }
                      }
                    }
                  });
                  this.generateEventsExcel();
                },
                error: () => {
                  this.generateEventsExcel();
                }
              });
            } else {
              this.generateEventsExcel();
            }
          } else {
            this.generateEventsExcel();
          }
        },
        error: () => {
          this.generateEventsExcel();
        }
      });
    } else {
      // All events already have registrations loaded, generate Excel immediately
      this.generateEventsExcel();
    }
  }

  /**
   * Internal method to generate the Excel file with all event data.
   */
  private generateEventsExcel(): void {
    try {
      const workbook = XLSX.utils.book_new();

      // Sort events by date (upcoming first, then past)
      const sortedEvents = [...this.events].sort((a, b) => {
        const dateA = new Date(a.eventDate);
        const dateB = new Date(b.eventDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const aIsPast = dateA < today;
        const bIsPast = dateB < today;

        if (aIsPast !== bIsPast) {
          return aIsPast ? 1 : -1; // Upcoming first
        }

        return dateA.getTime() - dateB.getTime();
      });

      // Main Events Sheet
      const eventsData = [
        ['Events Export'],
        [`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`],
        [`Organization: ${this.organization?.name || 'N/A'}`],
        [],
        ['Event ID', 'Title', 'Description', 'Date', 'Time', 'Location Name', 'Address', 'City', 'State',
          'Volunteers Needed', 'Volunteers Registered', 'Status', 'Tags']
      ];

      sortedEvents.forEach(event => {
        const isPast = this.isEventInPast(event);
        const tags = event.tags && event.tags.length > 0
          ? event.tags.map(t => t.name).join(', ')
          : 'None';

        eventsData.push([
          (event.eventId || '').toString(),
          event.title || '',
          event.description || '',
          event.eventDate || '',
          event.eventTime || '',
          event.locationName || '',
          event.address || '',
          event.city || '',
          event.state || '',
          (event.numNeeded || 0).toString(),
          (event.numSignedUp || 0).toString(),
          isPast ? 'Past' : 'Upcoming',
          tags
        ]);
      });

      const eventsSheet = XLSX.utils.aoa_to_sheet(eventsData);
      XLSX.utils.book_append_sheet(workbook, eventsSheet, 'All Events');

      // Registrations Sheet - For events with registrations
      const registrationsData = [
        ['Event Registrations'],
        [`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`],
        [],
        ['Event ID', 'Event Title', 'Event Date', 'Volunteer Name', 'Volunteer Email', 'Signup Date',
          'Status', 'Attendance Status', 'Hours']
      ];

      // Collect all registrations
      sortedEvents.forEach(event => {
        if (event.registrations && event.registrations.length > 0) {
          event.registrations.forEach((signup: Signup) => {
            const user = this.getUserDetails(event, signup.userId);
            const userName = user ? `${user.firstName} ${user.lastName}` : 'Unknown';
            const userEmail = user?.email || 'N/A';

            let attendanceStatus = 'N/A';
            let hours = '';

            if (this.isEventInPast(event) && signup.attendance) {
              if (signup.attendance.status === 'completed') {
                attendanceStatus = 'Attended';
              } else if (signup.attendance.status === 'no_show') {
                attendanceStatus = 'No Show';
              } else if (signup.attendance.status === 'excused') {
                attendanceStatus = 'Excused';
              }

              if (signup.attendance.hours !== null && signup.attendance.hours !== undefined) {
                hours = signup.attendance.hours.toString();
              }
            } else if (!this.isEventInPast(event)) {
              attendanceStatus = 'Pending';
            }

            registrationsData.push([
              (event.eventId || '').toString(),
              event.title || '',
              event.eventDate || '',
              userName,
              userEmail,
              signup.signupDate ? new Date(signup.signupDate).toLocaleDateString() : '',
              signup.status || '',
              attendanceStatus,
              hours
            ]);
          });
        }
      });

      if (registrationsData.length > 4) { // More than just headers
        const registrationsSheet = XLSX.utils.aoa_to_sheet(registrationsData);
        XLSX.utils.book_append_sheet(workbook, registrationsSheet, 'Registrations');
      }

      // Save the Excel file
      const fileName = `events-export-${this.organization?.name.replace(/[^a-z0-9]/gi, '_') || 'organization'}-${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      this.success = 'Events exported to Excel successfully';
    } catch (error) {
      console.error('Error generating Excel file:', error);
      this.error = 'Failed to export events to Excel. Please try again.';
    }
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
