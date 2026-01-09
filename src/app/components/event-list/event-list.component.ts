import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { VolunteerService } from '../../services/volunteer-service.service';
import { Event } from '../../models/event.model';
import { Organization } from '../../models/organization.model';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';
import { Signup } from '../../models/signup.model';
import { Tag, EventTagWithDetails } from '../../models/tag.model';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

interface EventWithTags extends Omit<Event, 'tags'> {
    tags?: Tag[];
}

@Component({
    selector: 'app-event-list',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './event-list.component.html',
    styleUrl: './event-list.component.css'
})
export class EventListComponent implements OnInit {
    events: EventWithTags[] = [];
    filteredEvents: EventWithTags[] = [];
    upcomingEvents: EventWithTags[] = [];
    pastEvents: EventWithTags[] = [];
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
    selectedTagIds: number[] = [];
    organizations: Organization[] = [];
    availableTags: Tag[] = [];
    tagsLoading: boolean = false;
    tagsDropdownOpen: boolean = false;
    tagSearchQuery: string = '';
    sortColumn: 'title' | 'date' | 'location' | 'tags' | 'volunteers' = 'date';
    sortDirection: 'asc' | 'desc' = 'asc';
    registeredEventIds: Set<number> = new Set<number>();
    featuredEvent: EventWithTags | null = null;
    pageSizeOptions: number[] = [10, 25, 50, 100];
    pageSize = 10;
    currentPage = 1;
    paginatedEvents: EventWithTags[] = [];

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
        this.loadTags();

        this.route.queryParams.subscribe(params => {
            if (params['showPast'] === 'true') {
                this.showPastEvents = true;
            }

            if (params['organizationId']) {
                this.organizationFilter = +params['organizationId'];
                this.applyFilters();
            } else if (params['tagId']) {
                // Handle tag filter from query parameter
                const tagId = +params['tagId'];
                this.selectedTagIds = [tagId];
                // Load events first, then applyFilters will be called in finishLoadingEvents
                this.loadEvents();
            } else {
                // Clear any previous filters
                this.organizationFilter = 0;
                this.selectedTagIds = [];
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
    isEventInPast(event: EventWithTags): boolean {
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

    /**
     * Loads all available tags for filtering.
     */
    loadTags(): void {
        this.tagsLoading = true;
        this.volunteerService.getAllTags().subscribe({
            next: (tags) => {
                this.availableTags = tags || [];
                this.tagsLoading = false;
            },
            error: (error) => {
                console.error('Error loading tags', error);
                this.availableTags = [];
                this.tagsLoading = false;
            }
        });
    }

    loadEvents(): void {
        this.loading = true;
        this.volunteerService.getEvents().subscribe({
            next: (events) => {
                // Convert events to EventWithTags and load tags for each
                const eventsWithTags: EventWithTags[] = events.map(event => ({
                    ...event,
                    tags: [] as Tag[]
                }));

                // Load tags for all events in parallel
                const tagObservables = eventsWithTags
                    .filter(event => event.eventId)
                    .map(event =>
                        this.volunteerService.getTagsForEvent(event.eventId!).pipe(
                            catchError(() => of([])),
                            map((tags: EventTagWithDetails[]) => ({ eventId: event.eventId, tags }))
                        )
                    );

                if (tagObservables.length > 0) {
                    forkJoin(tagObservables).subscribe({
                        next: (tagResults) => {
                            // Map tags to events
                            tagResults.forEach(({ eventId, tags }) => {
                                const event = eventsWithTags.find(e => e.eventId === eventId);
                                if (event) {
                                    event.tags = tags.map(et => ({
                                        tagId: et.tagId,
                                        name: et.tagName || 'Unknown Tag'
                                    } as Tag));
                                }
                            });
                            this.finishLoadingEvents(eventsWithTags);
                        },
                        error: () => {
                            // If tags fail to load, still show events without tags
                            this.finishLoadingEvents(eventsWithTags);
                        }
                    });
                } else {
                    this.finishLoadingEvents(eventsWithTags);
                }
            },
            error: (error) => {
                console.error('Error loading events', error);
                this.error = 'Failed to load events. Please try again later.';
                this.loading = false;
            }
        });
    }

    private finishLoadingEvents(events: EventWithTags[]): void {
        this.events = events;

        // Separate events into upcoming and past
        this.upcomingEvents = this.sortEvents(events.filter(event => !this.isEventInPast(event)));
        this.pastEvents = this.sortEvents(events.filter(event => this.isEventInPast(event)));
        this.featuredEvent = this.selectFeaturedEvent(this.upcomingEvents);

        // Apply filters including tag filter
        this.applyFilters();
        this.loading = false;
    }

    applyFilters(): void {
        // Start with the appropriate base list
        let baseEvents: EventWithTags[] = this.showPastEvents ? [...this.pastEvents] : [...this.upcomingEvents];

        // Apply tag filter first (client-side)
        if (this.selectedTagIds.length > 0) {
            baseEvents = baseEvents.filter(event => {
                if (!event.tags || event.tags.length === 0) {
                    return false;
                }
                const eventTagIds = event.tags.map(t => t.tagId);
                // Event must have at least one of the selected tags
                return this.selectedTagIds.some(tagId => eventTagIds.includes(tagId));
            });
        }

        // If no server-side filters needed, apply client-side filters and return
        // Note: cityFilter is always handled client-side for partial matching
        if (!this.stateFilter && !this.dateStartFilter && !this.dateEndFilter && !this.organizationFilter) {
            // Apply client-side city filter if present
            let cityFilteredEvents = baseEvents;
            if (this.cityFilter && this.cityFilter.trim()) {
                const citySearch = this.cityFilter.trim().toLowerCase();
                cityFilteredEvents = cityFilteredEvents.filter(event => {
                    if (!event.city) return false;
                    return event.city.toLowerCase().includes(citySearch);
                });
            }
            this.filteredEvents = this.sortEvents(cityFilteredEvents);
            this.currentPage = 1;
            this.updateDisplayedEvents();
            return;
        }

        // Apply server-side filters (city filter is handled client-side for partial matching)
        const params: any = {};
        // Note: cityFilter is handled client-side in finishApplyingFilters for partial matching
        if (this.stateFilter) params.state = this.stateFilter;
        if (this.dateStartFilter) params.startDate = this.dateStartFilter;
        if (this.dateEndFilter) params.endDate = this.dateEndFilter;
        if (this.organizationFilter) params.organizationId = this.organizationFilter;

        this.loading = true;
        this.volunteerService.searchEvents(params).subscribe({
            next: (events: Event[]) => {
                // Convert to EventWithTags and load tags
                const eventsWithTags: EventWithTags[] = events.map((event: Event) => ({
                    ...event,
                    tags: [] as Tag[]
                } as EventWithTags));

                // Load tags for search results
                const tagObservables = eventsWithTags
                    .filter(event => event.eventId)
                    .map(event =>
                        this.volunteerService.getTagsForEvent(event.eventId!).pipe(
                            catchError(() => of([])),
                            map((tags: EventTagWithDetails[]) => ({ eventId: event.eventId, tags }))
                        )
                    );

                if (tagObservables.length > 0) {
                    forkJoin(tagObservables).subscribe({
                        next: (tagResults) => {
                            tagResults.forEach(({ eventId, tags }) => {
                                const event = eventsWithTags.find(e => e.eventId === eventId);
                                if (event) {
                                    event.tags = tags.map(et => ({
                                        tagId: et.tagId,
                                        name: et.tagName || 'Unknown Tag'
                                    } as Tag));
                                }
                            });
                            this.finishApplyingFilters(eventsWithTags);
                        },
                        error: () => {
                            this.finishApplyingFilters(eventsWithTags);
                        }
                    });
                } else {
                    this.finishApplyingFilters(eventsWithTags);
                }
            },
            error: (error) => {
                console.error('Error searching events', error);
                this.error = 'Failed to search events. Please try again later.';
                this.loading = false;
            }
        });
    }

    private finishApplyingFilters(events: EventWithTags[]): void {
        // Apply the past/upcoming filter
        let dateFilteredEvents = events;
        if (this.dateStartFilter) {
            const start = this.parseEventDate(this.dateStartFilter);
            dateFilteredEvents = dateFilteredEvents.filter(event => this.parseEventDate(event.eventDate) >= start);
        }
        if (this.dateEndFilter) {
            const end = this.parseEventDate(this.dateEndFilter);
            dateFilteredEvents = dateFilteredEvents.filter(event => this.parseEventDate(event.eventDate) <= end);
        }

        // Apply client-side city filter with partial matching (case-insensitive)
        if (this.cityFilter && this.cityFilter.trim()) {
            const citySearch = this.cityFilter.trim().toLowerCase();
            dateFilteredEvents = dateFilteredEvents.filter(event => {
                if (!event.city) return false;
                return event.city.toLowerCase().includes(citySearch);
            });
        }

        if (this.showPastEvents) {
            this.filteredEvents = dateFilteredEvents.filter(event => this.isEventInPast(event));
        } else {
            this.filteredEvents = dateFilteredEvents.filter(event => !this.isEventInPast(event));
        }

        // Apply tag filter if tags are selected
        if (this.selectedTagIds.length > 0) {
            this.filteredEvents = this.filteredEvents.filter(event => {
                if (!event.tags || event.tags.length === 0) {
                    return false;
                }
                const eventTagIds = event.tags.map(t => t.tagId);
                return this.selectedTagIds.some(tagId => eventTagIds.includes(tagId));
            });
        }

        this.filteredEvents = this.sortEvents(this.filteredEvents);
        this.currentPage = 1;
        this.updateDisplayedEvents();
        this.loading = false;
    }

    clearFilters(): void {
        this.cityFilter = '';
        this.stateFilter = '';
        this.dateStartFilter = '';
        this.dateEndFilter = '';
        this.organizationFilter = 0;
        this.selectedTagIds = [];
        this.tagSearchQuery = '';
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

    private sortEvents(events: EventWithTags[]): EventWithTags[] {
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
                    aValue = (a.tags && a.tags.length > 0 ? a.tags.map((t: Tag) => t.name).join(', ') : '').toLowerCase();
                    bValue = (b.tags && b.tags.length > 0 ? b.tags.map((t: Tag) => t.name).join(', ') : '').toLowerCase();
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

    trackByEventId(index: number, event: EventWithTags): number | undefined {
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

    // Tag filtering methods
    toggleTag(tagId: number): void {
        const index = this.selectedTagIds.indexOf(tagId);
        if (index > -1) {
            this.selectedTagIds.splice(index, 1);
        } else {
            this.selectedTagIds.push(tagId);
        }
    }

    removeTag(tagId: number): void {
        this.selectedTagIds = this.selectedTagIds.filter(id => id !== tagId);
    }

    get filteredTags(): Tag[] {
        if (!this.tagSearchQuery.trim()) {
            return this.availableTags;
        }
        const query = this.tagSearchQuery.toLowerCase().trim();
        return this.availableTags.filter(tag =>
            tag.name.toLowerCase().includes(query)
        );
    }

    get selectedTags(): Tag[] {
        return this.availableTags.filter(tag => this.selectedTagIds.includes(tag.tagId));
    }

    closeTagsDropdown(): void {
        this.tagsDropdownOpen = false;
        this.tagSearchQuery = '';
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (!target.closest('.event-tags-dropdown-wrapper')) {
            this.closeTagsDropdown();
        }
    }

    private selectFeaturedEvent(events: EventWithTags[]): EventWithTags | null {
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