import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { VolunteerService } from '../../services/volunteer-service.service';
import { Event } from '../../models/event.model';
import { Organization } from '../../models/organization.model';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';
import { Signup } from '../../models/signup.model';

@Component({
    selector: 'app-event-list',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './event-list.component.html',
    styleUrl: './event-list.component.css'
})
export class EventListComponent implements OnInit {
    events: Event[] = [];
    filteredEvents: Event[] = [];
    upcomingEvents: Event[] = [];
    pastEvents: Event[] = [];
    loading: boolean = true;
    error: string = '';
    isLoggedIn: boolean = false;
    currentUser: User | null = null;
    showPastEvents: boolean = false;

    // Filter properties
    cityFilter: string = '';
    stateFilter: string = '';
    dateStartFilter: string = '';
    dateEndFilter: string = '';
    organizationFilter: number = 0;
    organizations: Organization[] = [];
    sortColumn: 'title' | 'date' | 'location' | 'tags' | 'volunteers' = 'date';
    sortDirection: 'asc' | 'desc' = 'asc';
    registeredEventIds: Set<number> = new Set<number>();
    featuredEvent: Event | null = null;
    pageSizeOptions: number[] = [10, 25, 50, 100];
    pageSize = 10;
    currentPage = 1;
    paginatedEvents: Event[] = [];

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

    get totalPages(): number {
        return this.filteredEvents.length === 0 ? 1 : Math.ceil(this.filteredEvents.length / this.pageSize);
    }

    get pageNumbers(): number[] {
        return Array.from({ length: this.totalPages }, (_, index) => index + 1);
    }

    constructor(
        private volunteerService: VolunteerService,
        private route: ActivatedRoute,
        private authService: AuthService
    ) { }

    /**
     * Initializes the component, sets up authentication subscriptions,
     * loads organizations, and handles route parameters.
     */
    ngOnInit(): void {
        this.authService.isLoggedIn.subscribe(loggedIn => {
            this.isLoggedIn = loggedIn;
        });

        this.authService.currentUser.subscribe(user => {
            this.currentUser = user;
            if (user && user.userId) {
                this.loadUserSignups(user.userId);
            } else {
                this.registeredEventIds.clear();
            }
        });

        this.loadOrganizations();

        this.route.queryParams.subscribe(params => {
            if (params['showPast'] === 'true') {
                this.showPastEvents = true;
            }

            if (params['organizationId']) {
                this.organizationFilter = +params['organizationId'];
                this.applyFilters();
            } else {
                this.loadEvents();
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
        const eventDate = this.parseEventDate(event.eventDate);
        return eventDate < today;
    }

    /**
     * Toggles between showing upcoming and past events.
     */
    togglePastEvents(): void {
        this.showPastEvents = !this.showPastEvents;
        this.applyFilters();
    }

    /**
     * Checks if the current user can create events (organizer or admin).
     * 
     * @returns True if user is an organizer or admin, false otherwise
     */
    canCreateEvent(): boolean {
        if (!this.isLoggedIn || !this.currentUser) {
            return false;
        }
        return this.currentUser.role === 'organizer' || this.currentUser.role === 'admin';
    }

    /**
     * Checks if the current user is an organizer.
     * 
     * @returns True if user is an organizer, false otherwise
     */
    isOrganizer(): boolean {
        if (!this.isLoggedIn || !this.currentUser) {
            return false;
        }
        return this.currentUser.role === 'organizer';
    }

    /**
     * Checks if the current user is an admin.
     * 
     * @returns True if user is an admin, false otherwise
     */
    isAdmin(): boolean {
        if (!this.isLoggedIn || !this.currentUser) {
            return false;
        }
        return this.currentUser.role === 'admin';
    }

    /**
     * Loads all organizations for the filter dropdown.
     */
    loadOrganizations(): void {
        this.volunteerService.getOrganizations().subscribe({
            next: (organizations) => {
                this.organizations = organizations;
            },
            error: (error) => {
                // Silently fail - organizations filter is optional
            }
        });
    }

    loadEvents(): void {
        this.loading = true;
        this.volunteerService.getEvents().subscribe({
            next: (events) => {
                this.events = events;

                // Separate events into upcoming and past
                this.upcomingEvents = this.sortEvents(events.filter(event => !this.isEventInPast(event)));
                this.pastEvents = this.sortEvents(events.filter(event => this.isEventInPast(event)));
                this.featuredEvent = this.selectFeaturedEvent(this.upcomingEvents);

                // By default, show only upcoming events unless showPastEvents is true
                this.filteredEvents = this.showPastEvents ? [...this.pastEvents] : [...this.upcomingEvents];
                this.currentPage = 1;
                this.updateDisplayedEvents();

                this.loading = false;
            },
            error: (error) => {
                console.error('Error loading events', error);
                this.error = 'Failed to load events. Please try again later.';
                this.loading = false;
            }
        });
    }

    applyFilters(): void {
        if (!this.cityFilter && !this.stateFilter && !this.dateStartFilter && !this.dateEndFilter && !this.organizationFilter) {
            // No filters applied, but respect the past/upcoming toggle
            this.filteredEvents = this.showPastEvents ? [...this.pastEvents] : [...this.upcomingEvents];
            this.filteredEvents = this.sortEvents(this.filteredEvents);
            this.currentPage = 1;
            this.updateDisplayedEvents();
            return;
        }

        const params: any = {};
        if (this.cityFilter) params.city = this.cityFilter;
        if (this.stateFilter) params.state = this.stateFilter;
        if (this.dateStartFilter) params.startDate = this.dateStartFilter;
        if (this.dateEndFilter) params.endDate = this.dateEndFilter;
        if (this.organizationFilter) params.organizationId = this.organizationFilter;

        this.loading = true;
        this.volunteerService.searchEvents(params).subscribe({
            next: (events) => {
                // Apply the past/upcoming filter on top of the search results
                let dateFilteredEvents = events;
                if (this.dateStartFilter) {
                    const start = this.parseEventDate(this.dateStartFilter);
                    dateFilteredEvents = dateFilteredEvents.filter(event => this.parseEventDate(event.eventDate) >= start);
                }
                if (this.dateEndFilter) {
                    const end = this.parseEventDate(this.dateEndFilter);
                    dateFilteredEvents = dateFilteredEvents.filter(event => this.parseEventDate(event.eventDate) <= end);
                }

                if (this.showPastEvents) {
                    this.filteredEvents = dateFilteredEvents.filter(event => this.isEventInPast(event));
                } else {
                    this.filteredEvents = dateFilteredEvents.filter(event => !this.isEventInPast(event));
                }
                this.filteredEvents = this.sortEvents(this.filteredEvents);
                this.currentPage = 1;
                this.updateDisplayedEvents();
                this.loading = false;
            },
            error: (error) => {
                console.error('Error searching events', error);
                this.error = 'Failed to search events. Please try again later.';
                this.loading = false;
            }
        });
    }

    clearFilters(): void {
        this.cityFilter = '';
        this.stateFilter = '';
        this.dateStartFilter = '';
        this.dateEndFilter = '';
        this.organizationFilter = 0;
        // Reset to the appropriate list based on show past setting
        this.filteredEvents = this.showPastEvents ? [...this.pastEvents] : [...this.upcomingEvents];
        this.filteredEvents = this.sortEvents(this.filteredEvents);
        this.currentPage = 1;
        this.updateDisplayedEvents();
    }

    setSort(column: 'title' | 'date' | 'location' | 'tags' | 'volunteers'): void {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = column === 'date' ? 'asc' : 'asc';
        }
        this.filteredEvents = this.sortEvents(this.filteredEvents);
        this.upcomingEvents = this.sortEvents(this.upcomingEvents);
        this.pastEvents = this.sortEvents(this.pastEvents);
        if (this.currentPage > this.totalPages) {
            this.currentPage = this.totalPages;
        }
        this.updateDisplayedEvents();
    }

    getSortIcon(column: 'title' | 'date' | 'location' | 'tags' | 'volunteers'): string {
        if (this.sortColumn !== column) {
            return 'bi-arrow-down-up';
        }
        return this.sortDirection === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
    }

    isRegistered(eventId?: number): boolean {
        if (!eventId || !this.isLoggedIn) {
            return false;
        }
        return this.registeredEventIds.has(eventId);
    }

    private sortEvents(events: Event[]): Event[] {
        const sorted = [...events].sort((a, b) => {
            let aValue: string | number | Date = '';
            let bValue: string | number | Date = '';

            switch (this.sortColumn) {
                case 'title':
                    aValue = a.title?.toLowerCase() || '';
                    bValue = b.title?.toLowerCase() || '';
                    break;
                case 'date':
                    aValue = this.parseEventDate(a.eventDate);
                    bValue = this.parseEventDate(b.eventDate);
                    if (aValue instanceof Date && isNaN(aValue.getTime())) aValue = new Date(0);
                    if (bValue instanceof Date && isNaN(bValue.getTime())) bValue = new Date(0);
                    break;
                case 'location':
                    aValue = `${a.city || ''} ${a.state || ''}`.trim().toLowerCase();
                    bValue = `${b.city || ''} ${b.state || ''}`.trim().toLowerCase();
                    break;
                case 'tags':
                    aValue = (a.tags && a.tags.length > 0 ? a.tags.join(', ') : '').toLowerCase();
                    bValue = (b.tags && b.tags.length > 0 ? b.tags.join(', ') : '').toLowerCase();
                    break;
                case 'volunteers':
                    aValue = (a.numSignedUp || 0) / Math.max(a.numNeeded || 1, 1);
                    bValue = (b.numSignedUp || 0) / Math.max(b.numNeeded || 1, 1);
                    break;
                default:
                    break;
            }

            const directionMultiplier = this.sortDirection === 'asc' ? 1 : -1;

            if (aValue instanceof Date && bValue instanceof Date) {
                return (aValue.getTime() - bValue.getTime()) * directionMultiplier;
            }

            return aValue < bValue ? -1 * directionMultiplier : aValue > bValue ? 1 * directionMultiplier : 0;
        });

        return sorted;
    }

    private loadUserSignups(userId: number): void {
        this.volunteerService.getUserSignups(userId).subscribe({
            next: (signups: Signup[]) => {
                this.registeredEventIds = new Set(signups.map(signup => signup.eventId));
            },
            error: error => {
                console.error('Error loading user signups', error);
                this.registeredEventIds.clear();
            }
        });
    }

    trackByEventId(index: number, event: Event): number | undefined {
        return event.eventId ?? index;
    }

    changePageSize(size: number): void {
        this.pageSize = size;
        this.currentPage = 1;
        this.updateDisplayedEvents();
    }

    goToPage(page: number): void {
        if (page < 1 || page > this.totalPages) {
            return;
        }
        this.currentPage = page;
        this.updateDisplayedEvents();
    }

    previousPage(): void {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updateDisplayedEvents();
        }
    }

    nextPage(): void {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.updateDisplayedEvents();
        }
    }

    private updateDisplayedEvents(): void {
        if (this.filteredEvents.length === 0) {
            this.paginatedEvents = [];
            this.currentPage = 1;
            return;
        }

        if (this.currentPage > this.totalPages) {
            this.currentPage = this.totalPages;
        }

        if (this.currentPage < 1) {
            this.currentPage = 1;
        }

        const startIndex = (this.currentPage - 1) * this.pageSize;
        this.paginatedEvents = this.filteredEvents.slice(startIndex, startIndex + this.pageSize);
    }

    private parseEventDate(dateString: string): Date {
        if (!dateString) {
            return new Date(0);
        }
        const [year, month, day] = dateString.split('-').map(num => parseInt(num, 10));
        if (!year || !month || !day) {
            return new Date(dateString);
        }
        return new Date(year, month - 1, day);
    }

    private selectFeaturedEvent(events: Event[]): Event | null {
        if (!events || events.length === 0) {
            return null;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thirtyDaysOut = new Date(today);
        thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

        const upcomingWindow = events.filter(event => {
            const eventDate = this.parseEventDate(event.eventDate);
            return eventDate >= today && eventDate <= thirtyDaysOut;
        });

        const pool = upcomingWindow.length > 0 ? upcomingWindow : events;
        const index = Math.floor(Math.random() * pool.length);
        return pool[index] ?? null;
    }
} 