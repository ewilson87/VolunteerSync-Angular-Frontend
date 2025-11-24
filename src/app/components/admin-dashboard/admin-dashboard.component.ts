import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { VolunteerService } from '../../services/volunteer-service.service';
import { AuthService } from '../../services/auth.service';
import { InputValidationService } from '../../services/input-validation.service';
import { User } from '../../models/user.model';
import { Event } from '../../models/event.model';
import { Organization } from '../../models/organization.model';

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './admin-dashboard.component.html',
    styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent implements OnInit {
    // User data
    currentUser: User | null = null;
    users: User[] = [];
    filteredUsers: User[] = [];
    paginatedUsers: User[] = [];
    selectedUser: User | null = null;
    showDeleteUserConfirmation = false;

    userSearchTerm = '';
    userRoleFilter: 'all' | 'volunteer' | 'organizer' | 'admin' = 'all';
    userSortColumn: 'name' | 'email' | 'role' | 'organization' = 'name';
    userSortDirection: 'asc' | 'desc' = 'asc';
    userPageSizeOptions: number[] = [10, 25, 50, 100];
    userPageSize = 10;
    userCurrentPage = 1;

    // Organization data
    organizations: Organization[] = [];
    filteredOrganizations: Organization[] = [];
    paginatedOrganizations: Organization[] = [];
    selectedOrganization: Organization | null = null;
    showDeleteOrganizationConfirmation = false;
    showRejectOrganizationModal = false;
    rejectionReason = '';

    organizationSearchTerm = '';
    organizationWebsiteOnly = false;
    organizationApprovalStatusFilter: 'all' | 'approved' | 'pending' | 'rejected' = 'all';
    organizationSortColumn: 'name' | 'contact' | 'description' = 'name';
    organizationSortDirection: 'asc' | 'desc' = 'asc';
    organizationPageSizeOptions: number[] = [10, 25, 50, 100];
    organizationPageSize = 10;
    organizationCurrentPage = 1;

    // Event data
    events: Event[] = [];
    filteredEvents: Event[] = [];
    paginatedEvents: Event[] = [];
    selectedEvent: Event | null = null;
    showDeleteEventConfirmation = false;

    eventSearchTerm = '';
    eventStatusFilter: 'all' | 'upcoming' | 'past' = 'all';
    eventSortColumn: 'title' | 'date' | 'organization' | 'status' = 'date';
    eventSortDirection: 'asc' | 'desc' = 'asc';
    eventPageSizeOptions: number[] = [10, 25, 50, 100];
    eventPageSize = 10;
    eventCurrentPage = 1;

    // Loading and error states
    isLoading = true;
    private pendingRequests = 0;
    error = '';
    success = '';

    // Tabs
    activeTab = 'users';

    constructor(
        private volunteerService: VolunteerService,
        private authService: AuthService,
        private inputValidation: InputValidationService
    ) { }

    /**
     * Initializes the component and loads all data if user is an admin.
     */
    ngOnInit(): void {
        this.authService.currentUser.subscribe(user => {
            this.currentUser = user;
            if (user && user.role === 'admin') {
                this.pendingRequests = 3;
                this.loadUsers();
                this.loadOrganizations();
                this.loadEvents();
            } else {
                this.isLoading = false;
            }
        });
    }

    /**
     * Tracks completion of async requests and sets loading state when all are complete.
     */
    private completeRequest(): void {
        this.pendingRequests = Math.max(0, this.pendingRequests - 1);
        if (this.pendingRequests === 0) {
            this.isLoading = false;
        }
    }

    /**
     * Loads all users from the API.
     */
    loadUsers(): void {
        this.volunteerService.getUsers().subscribe({
            next: (users) => {
                this.users = users;
                this.applyUserFilters();
                this.completeRequest();
            },
            error: (error) => {
                this.error = 'Failed to load users';
                this.completeRequest();
            }
        });
    }

    /**
     * Applies search and role filters to the users list.
     */
    applyUserFilters(): void {
        let result = [...this.users];
        const term = this.userSearchTerm.trim().toLowerCase();
        if (term) {
            result = result.filter(user =>
                `${user.firstName} ${user.lastName}`.toLowerCase().includes(term) ||
                user.email?.toLowerCase().includes(term)
            );
        }
        if (this.userRoleFilter !== 'all') {
            result = result.filter(user => user.role === this.userRoleFilter);
        }
        this.filteredUsers = this.sortUsers(result);
        this.userCurrentPage = 1;
        this.updateUserPagination();
    }

    /**
     * Sorts users by the current sort column and direction.
     * 
     * @param users - The users array to sort
     * @returns The sorted users array
     */
    sortUsers(users: User[]): User[] {
        const sorted = [...users];
        sorted.sort((a, b) => {
            let aValue = '';
            let bValue = '';
            switch (this.userSortColumn) {
                case 'name':
                    aValue = `${a.firstName} ${a.lastName}`.toLowerCase();
                    bValue = `${b.firstName} ${b.lastName}`.toLowerCase();
                    break;
                case 'email':
                    aValue = a.email?.toLowerCase() || '';
                    bValue = b.email?.toLowerCase() || '';
                    break;
                case 'role':
                    aValue = a.role?.toLowerCase() || '';
                    bValue = b.role?.toLowerCase() || '';
                    break;
                case 'organization':
                    aValue = this.getOrganizationName(a.organizationId || 0).toLowerCase();
                    bValue = this.getOrganizationName(b.organizationId || 0).toLowerCase();
                    break;
            }
            if (aValue < bValue) return this.userSortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.userSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }

    setUserSort(column: 'name' | 'email' | 'role' | 'organization'): void {
        if (this.userSortColumn === column) {
            this.userSortDirection = this.userSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.userSortColumn = column;
            this.userSortDirection = 'asc';
        }
        this.filteredUsers = this.sortUsers(this.filteredUsers);
        this.updateUserPagination();
    }

    getUserSortIcon(column: 'name' | 'email' | 'role' | 'organization'): string {
        if (this.userSortColumn !== column) return 'bi-arrow-down-up';
        return this.userSortDirection === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
    }

    updateUserPagination(): void {
        const start = (this.userCurrentPage - 1) * this.userPageSize;
        this.paginatedUsers = this.filteredUsers.slice(start, start + this.userPageSize);
    }

    changeUserPageSize(size: string | number): void {
        this.userPageSize = Number(size);
        this.userCurrentPage = 1;
        this.updateUserPagination();
    }

    goToUserPage(page: number): void {
        if (page < 1 || page > this.userTotalPages) return;
        this.userCurrentPage = page;
        this.updateUserPagination();
    }

    get userTotalPages(): number {
        return this.filteredUsers.length === 0 ? 1 : Math.ceil(this.filteredUsers.length / this.userPageSize);
    }

    get userPageNumbers(): number[] {
        return Array.from({ length: this.userTotalPages }, (_, index) => index + 1);
    }

    confirmDeleteUser(user: User): void {
        this.selectedUser = user;
        this.showDeleteUserConfirmation = true;
    }

    cancelDeleteUser(): void {
        this.selectedUser = null;
        this.showDeleteUserConfirmation = false;
    }

    deleteUser(): void {
        if (!this.selectedUser || !this.selectedUser.userId) return;

        this.volunteerService.deleteUser(this.selectedUser.userId).subscribe({
            next: () => {
                this.success = `User ${this.selectedUser!.firstName} ${this.selectedUser!.lastName} deleted successfully`;
                this.users = this.users.filter(u => u.userId !== this.selectedUser!.userId);
                this.applyUserFilters();
                this.showDeleteUserConfirmation = false;
                this.selectedUser = null;
            },
            error: (error) => {
                console.error('Error deleting user', error);
                this.error = 'Failed to delete user. The user may have associated data (events, signups) that need to be deleted first.';
            }
        });
    }

    // ORGANIZATIONS MANAGEMENT

    loadOrganizations(): void {
        this.volunteerService.getOrganizations().subscribe({
            next: (organizations) => {
                this.organizations = organizations;
                this.applyOrganizationFilters();
                this.completeRequest();
            },
            error: (error) => {
                console.error('Error loading organizations', error);
                this.error = 'Failed to load organizations';
                this.completeRequest();
            }
        });
    }

    applyOrganizationFilters(): void {
        let result = [...this.organizations];
        const term = this.organizationSearchTerm.trim().toLowerCase();
        if (term) {
            result = result.filter(org =>
                org.name?.toLowerCase().includes(term) ||
                org.description?.toLowerCase().includes(term) ||
                org.contactEmail?.toLowerCase().includes(term)
            );
        }
        if (this.organizationWebsiteOnly) {
            result = result.filter(org => !!org.website);
        }
        if (this.organizationApprovalStatusFilter !== 'all') {
            const target = this.organizationApprovalStatusFilter.toLowerCase();
            result = result.filter(org => (org.approvalStatus || '').toLowerCase() === target);
        }
        this.filteredOrganizations = this.sortOrganizations(result);
        this.organizationCurrentPage = 1;
        this.updateOrganizationPagination();
    }

    sortOrganizations(orgs: Organization[]): Organization[] {
        const sorted = [...orgs];
        sorted.sort((a, b) => {
            let aValue = '';
            let bValue = '';
            switch (this.organizationSortColumn) {
                case 'name':
                    aValue = a.name?.toLowerCase() || '';
                    bValue = b.name?.toLowerCase() || '';
                    break;
                case 'description':
                    aValue = a.description?.toLowerCase() || '';
                    bValue = b.description?.toLowerCase() || '';
                    break;
                case 'contact':
                    aValue = a.contactEmail?.toLowerCase() || '';
                    bValue = b.contactEmail?.toLowerCase() || '';
                    break;
            }
            if (aValue < bValue) return this.organizationSortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.organizationSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }

    setOrganizationSort(column: 'name' | 'contact' | 'description'): void {
        if (this.organizationSortColumn === column) {
            this.organizationSortDirection = this.organizationSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.organizationSortColumn = column;
            this.organizationSortDirection = 'asc';
        }
        this.filteredOrganizations = this.sortOrganizations(this.filteredOrganizations);
        this.updateOrganizationPagination();
    }

    getOrganizationSortIcon(column: 'name' | 'contact' | 'description'): string {
        if (this.organizationSortColumn !== column) return 'bi-arrow-down-up';
        return this.organizationSortDirection === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
    }

    updateOrganizationPagination(): void {
        const start = (this.organizationCurrentPage - 1) * this.organizationPageSize;
        this.paginatedOrganizations = this.filteredOrganizations.slice(start, start + this.organizationPageSize);
    }

    changeOrganizationPageSize(size: string | number): void {
        this.organizationPageSize = Number(size);
        this.organizationCurrentPage = 1;
        this.updateOrganizationPagination();
    }

    goToOrganizationPage(page: number): void {
        if (page < 1 || page > this.organizationTotalPages) return;
        this.organizationCurrentPage = page;
        this.updateOrganizationPagination();
    }

    get organizationTotalPages(): number {
        return this.filteredOrganizations.length === 0 ? 1 : Math.ceil(this.filteredOrganizations.length / this.organizationPageSize);
    }

    get organizationPageNumbers(): number[] {
        return Array.from({ length: this.organizationTotalPages }, (_, index) => index + 1);
    }

    confirmDeleteOrganization(organization: Organization): void {
        this.selectedOrganization = organization;
        this.showDeleteOrganizationConfirmation = true;
    }

    cancelDeleteOrganization(): void {
        this.selectedOrganization = null;
        this.showDeleteOrganizationConfirmation = false;
    }

    deleteOrganization(): void {
        if (!this.selectedOrganization || !this.selectedOrganization.organizationId) return;

        this.volunteerService.deleteOrganization(this.selectedOrganization.organizationId).subscribe({
            next: () => {
                this.success = `Organization ${this.selectedOrganization!.name} deleted successfully`;
                this.organizations = this.organizations.filter(o => o.organizationId !== this.selectedOrganization!.organizationId);
                this.applyOrganizationFilters();
                this.showDeleteOrganizationConfirmation = false;
                this.selectedOrganization = null;
            },
            error: (error) => {
                console.error('Error deleting organization', error);
                this.error = 'Failed to delete organization. The organization may have associated events that need to be deleted first.';
            }
        });
    }

    approveOrganization(organization: Organization): void {
        if (!organization || !organization.organizationId) return;

        // Update organization with approvalStatus = "approved"
        // Clear any previous rejection reason when approving
        // Backend will automatically set approvedBy and approvedAt
        // Note: Sending empty string as some backends ignore null values
        const updatedOrg: any = {
            ...organization,
            approvalStatus: 'approved',
            rejectionReason: '' // Clear rejection reason when approving (backend should set to NULL)
        };

        this.volunteerService.updateOrganization(organization.organizationId, updatedOrg).subscribe({
            next: () => {
                this.success = `Organization "${organization.name}" approved successfully`;
                // Reload organizations to get updated status
                this.loadOrganizations();
            },
            error: (error) => {
                console.error('Error approving organization', error);
                this.error = error?.error?.message || 'Failed to approve organization. Please try again.';
            }
        });
    }

    setOrganizationToPending(organization: Organization): void {
        if (!organization || !organization.organizationId) return;

        // Update organization with approvalStatus = "pending"
        // Clear any previous rejection reason when setting to pending
        // Note: Sending empty string as some backends ignore null values
        const updatedOrg: any = {
            ...organization,
            approvalStatus: 'pending',
            rejectionReason: '' // Clear rejection reason when setting to pending (backend should set to NULL)
        };

        this.volunteerService.updateOrganization(organization.organizationId, updatedOrg).subscribe({
            next: () => {
                this.success = `Organization "${organization.name}" set to pending`;
                // Reload organizations to get updated status
                this.loadOrganizations();
            },
            error: (error) => {
                console.error('Error setting organization to pending', error);
                this.error = error?.error?.message || 'Failed to update organization status. Please try again.';
            }
        });
    }

    showRejectModal(organization: Organization): void {
        this.selectedOrganization = organization;
        this.rejectionReason = organization.rejectionReason || '';
        this.showRejectOrganizationModal = true;
    }

    cancelRejectOrganization(): void {
        this.selectedOrganization = null;
        this.rejectionReason = '';
        this.showRejectOrganizationModal = false;
    }

    rejectOrganization(): void {
        if (!this.selectedOrganization || !this.selectedOrganization.organizationId) return;

        // Validate and sanitize rejection reason
        const reasonValidation = this.inputValidation.validateTextField(
            this.rejectionReason,
            255,
            'Rejection reason'
        );
        if (!reasonValidation.isValid) {
            this.error = reasonValidation.error || 'Invalid rejection reason';
            return;
        }

        const sanitizedReason = reasonValidation.sanitized;

        // Update organization with approvalStatus = "rejected" and rejectionReason
        // Backend will automatically set approvedBy and approvedAt
        const updatedOrg: Organization = {
            ...this.selectedOrganization,
            approvalStatus: 'rejected',
            rejectionReason: sanitizedReason
        };

        this.volunteerService.updateOrganization(this.selectedOrganization.organizationId, updatedOrg).subscribe({
            next: () => {
                this.success = `Organization "${this.selectedOrganization!.name}" rejected successfully`;
                this.showRejectOrganizationModal = false;
                this.rejectionReason = '';
                this.selectedOrganization = null;
                // Reload organizations to get updated status
                this.loadOrganizations();
            },
            error: (error) => {
                console.error('Error rejecting organization', error);
                this.error = error?.error?.message || 'Failed to reject organization. Please try again.';
            }
        });
    }

    getApprovalStatusBadgeClass(status: string | undefined): string {
        switch (status?.toLowerCase()) {
            case 'approved':
                return 'badge bg-success';
            case 'pending':
                return 'badge bg-warning text-dark';
            case 'rejected':
                return 'badge bg-danger';
            default:
                return 'badge bg-secondary';
        }
    }

    // EVENTS MANAGEMENT

    loadEvents(): void {
        this.volunteerService.getEvents().subscribe({
            next: (events) => {
                this.events = events;
                this.applyEventFilters();
                this.completeRequest();
            },
            error: (error) => {
                console.error('Error loading events', error);
                this.error = 'Failed to load events';
                this.completeRequest();
            }
        });
    }

    applyEventFilters(): void {
        let result = [...this.events];
        const term = this.eventSearchTerm.trim().toLowerCase();
        if (term) {
            result = result.filter(event =>
                event.title?.toLowerCase().includes(term) ||
                this.getOrganizationName(event.organizationId).toLowerCase().includes(term)
            );
        }
        if (this.eventStatusFilter !== 'all') {
            result = result.filter(event => this.eventStatusFilter === 'upcoming' ? !this.isEventInPast(event) : this.isEventInPast(event));
        }
        this.filteredEvents = this.sortEvents(result);
        this.eventCurrentPage = 1;
        this.updateEventPagination();
    }

    sortEvents(events: Event[]): Event[] {
        const sorted = [...events];
        sorted.sort((a, b) => {
            let aValue = '';
            let bValue = '';
            switch (this.eventSortColumn) {
                case 'title':
                    aValue = a.title?.toLowerCase() || '';
                    bValue = b.title?.toLowerCase() || '';
                    break;
                case 'date':
                    aValue = `${a.eventDate}T${a.eventTime}`;
                    bValue = `${b.eventDate}T${b.eventTime}`;
                    break;
                case 'organization':
                    aValue = this.getOrganizationName(a.organizationId).toLowerCase();
                    bValue = this.getOrganizationName(b.organizationId).toLowerCase();
                    break;
                case 'status':
                    aValue = this.isEventInPast(a) ? 'past' : 'upcoming';
                    bValue = this.isEventInPast(b) ? 'past' : 'upcoming';
                    break;
            }
            if (aValue < bValue) return this.eventSortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.eventSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }

    setEventSort(column: 'title' | 'date' | 'organization' | 'status'): void {
        if (this.eventSortColumn === column) {
            this.eventSortDirection = this.eventSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.eventSortColumn = column;
            this.eventSortDirection = 'asc';
        }
        this.filteredEvents = this.sortEvents(this.filteredEvents);
        this.updateEventPagination();
    }

    getEventSortIcon(column: 'title' | 'date' | 'organization' | 'status'): string {
        if (this.eventSortColumn !== column) return 'bi-arrow-down-up';
        return this.eventSortDirection === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
    }

    updateEventPagination(): void {
        const start = (this.eventCurrentPage - 1) * this.eventPageSize;
        this.paginatedEvents = this.filteredEvents.slice(start, start + this.eventPageSize);
    }

    changeEventPageSize(size: string | number): void {
        this.eventPageSize = Number(size);
        this.eventCurrentPage = 1;
        this.updateEventPagination();
    }

    goToEventPage(page: number): void {
        if (page < 1 || page > this.eventTotalPages) return;
        this.eventCurrentPage = page;
        this.updateEventPagination();
    }

    get eventTotalPages(): number {
        return this.filteredEvents.length === 0 ? 1 : Math.ceil(this.filteredEvents.length / this.eventPageSize);
    }

    get eventPageNumbers(): number[] {
        return Array.from({ length: this.eventTotalPages }, (_, index) => index + 1);
    }

    confirmDeleteEvent(event: Event): void {
        this.selectedEvent = event;
        this.showDeleteEventConfirmation = true;
    }

    cancelDeleteEvent(): void {
        this.selectedEvent = null;
        this.showDeleteEventConfirmation = false;
    }

    deleteEvent(): void {
        if (!this.selectedEvent || !this.selectedEvent.eventId) return;

        this.volunteerService.deleteEvent(this.selectedEvent.eventId).subscribe({
            next: () => {
                this.success = `Event ${this.selectedEvent!.title} deleted successfully`;
                this.events = this.events.filter(e => e.eventId !== this.selectedEvent!.eventId);
                this.applyEventFilters();
                this.showDeleteEventConfirmation = false;
                this.selectedEvent = null;
            },
            error: (error) => {
                console.error('Error deleting event', error);
                this.error = 'Failed to delete event. Ensure all registrations are cancelled first.';
            }
        });
    }

    // Helper methods
    isEventInPast(event: Event): boolean {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [year, month, day] = event.eventDate.split('-').map(num => parseInt(num));
        const eventDate = new Date(year, month - 1, day);

        return eventDate < today;
    }

    getOrganizationName(organizationId: number): string {
        const org = this.organizations.find(o => o.organizationId === organizationId);
        return org ? org.name : 'Unknown';
    }

    getUserFullName(userId: number): string {
        const user = this.users.find(u => u.userId === userId);
        return user ? `${user.firstName} ${user.lastName}` : 'Unknown';
    }

    get totalUsers(): number {
        return this.users.length;
    }

    get totalOrganizations(): number {
        return this.organizations.length;
    }

    get totalEvents(): number {
        return this.events.length;
    }

    get upcomingEvents(): Event[] {
        return this.events.filter(event => !this.isEventInPast(event));
    }

    get pastEvents(): Event[] {
        return this.events.filter(event => this.isEventInPast(event));
    }
} 