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
import { AuditLog, AuditLogResponse } from '../../models/audit-log.model';
import { AdminMetrics } from '../../models/metrics.model';
import { Tag } from '../../models/tag.model';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, registerables } from 'chart.js';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

// Register Chart.js components
Chart.register(...registerables);

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, BaseChartDirective],
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
    deleteUserPassword = '';
    isDeletingUser = false;
    showEditRoleModal = false;
    editingUser: User | null = null;
    newRole: 'volunteer' | 'organizer' | 'admin' = 'volunteer';
    selectedOrganizationId: number | null = null;
    adminPassword = '';
    showOnlyOrganizerWarning = false;
    showAdminRoleWarning = false;
    isUpdatingRole = false;

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

    // Support Messages data
    supportMessages: any[] = [];
    filteredSupportMessages: any[] = [];
    paginatedSupportMessages: any[] = [];
    selectedSupportMessage: any | null = null;
    showDeleteSupportMessageConfirmation = false;
    showRespondSupportMessageModal = false;

    supportMessageSearchTerm = '';
    supportMessageStatusFilter: 'all' | 'resolved' | 'unresolved' = 'unresolved';
    supportMessageSortColumn: 'date' | 'subject' | 'name' | 'status' = 'date';
    supportMessageSortDirection: 'asc' | 'desc' = 'desc';
    supportMessagePageSizeOptions: number[] = [10, 25, 50, 100];
    supportMessagePageSize = 10;
    supportMessageCurrentPage = 1;
    responseMessage = '';

    // Audit Log data
    auditLogs: AuditLog[] = [];
    filteredAuditLogs: AuditLog[] = [];
    paginatedAuditLogs: AuditLog[] = [];
    selectedAuditLog: AuditLog | null = null;
    showAuditLogDetailsModal = false;
    auditLogPagination: { total: number; limit: number; offset: number; hasMore: boolean } | null = null;

    auditLogSearchTerm = '';
    auditLogActionFilter: 'all' | string = 'all';
    auditLogEntityTypeFilter: 'all' | string = 'all';
    auditLogActorFilter: string = '';
    auditLogEntityIdFilter: string = '';
    auditLogSortColumn: 'date' | 'action' | 'entityType' | 'actor' = 'date';
    auditLogSortDirection: 'asc' | 'desc' = 'desc';
    auditLogPageSizeOptions: number[] = [25, 50, 100, 250, 500];
    auditLogPageSize = 100;
    auditLogCurrentPage = 1;
    loadingAuditLogs = false;

    // Common action and entity types for filters
    readonly commonActions = ['create', 'update', 'delete', 'login', 'approve', 'reject', 'unauthorized_access', 'system_cleanup'];
    readonly commonEntityTypes = ['event', 'organization', 'user', 'auth', 'signup', 'audit_log', 'support_message', 'certificate'];

    // Admin Metrics properties
    adminMetrics: AdminMetrics | null = null;
    loadingAdminMetrics = false;
    adminMetricsError = '';
    selectedAdminChartType: 'pie' | 'bar' | 'line' = 'bar';
    selectedAdminMetricChart: 'users' | 'orgs' | 'events' | 'hours' | 'activeUsers' = 'users';
    // Date range filtering
    adminDateRangePreset: 'all' | 'last3' | 'last6' | 'last12' | 'custom' = 'all';
    adminCustomStartMonth: string = '';
    adminCustomEndMonth: string = '';

    // Loading and error states
    isLoading = true;
    private pendingRequests = 0;
    error = '';
    success = '';

    // Email notification processing
    isProcessingEmails = false;

    // Tag data
    tags: Tag[] = [];
    filteredTags: Tag[] = [];
    paginatedTags: Tag[] = [];
    selectedTag: Tag | null = null;
    showDeleteTagConfirmation = false;
    showEditTagModal = false;
    editingTag: Tag | null = null;
    newTagName = '';
    isCreatingTag = false;
    isUpdatingTag = false;
    isDeletingTag = false;

    tagSearchTerm = '';
    tagSortColumn: 'name' | 'id' = 'name';
    tagSortDirection: 'asc' | 'desc' = 'asc';
    tagPageSizeOptions: number[] = [10, 25, 50, 100];
    tagPageSize = 25;
    tagCurrentPage = 1;

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
                this.pendingRequests = 5;
                this.loadUsers();
                this.loadOrganizations();
                this.loadEvents();
                this.loadSupportMessages();
                this.loadAdminMetrics();
                // Audit logs are loaded on-demand when the tab is selected
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

    get sortedOrganizations(): Organization[] {
        if (!this.organizations || this.organizations.length === 0) {
            return [];
        }
        const sorted = [...this.organizations].sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
        return sorted;
    }

    confirmDeleteUser(user: User): void {
        // Prevent admin from deleting their own account
        if (this.currentUser && user.userId === this.currentUser.userId) {
            this.error = 'You cannot delete your own account.';
            return;
        }
        this.selectedUser = user;
        this.deleteUserPassword = '';
        this.showDeleteUserConfirmation = true;
    }

    cancelDeleteUser(): void {
        this.selectedUser = null;
        this.deleteUserPassword = '';
        this.showDeleteUserConfirmation = false;
        this.isDeletingUser = false;
    }

    deleteUser(): void {
        if (!this.selectedUser || !this.selectedUser.userId) return;

        // Prevent admin from deleting their own account (double check)
        if (this.currentUser && this.selectedUser.userId === this.currentUser.userId) {
            this.error = 'You cannot delete your own account.';
            this.cancelDeleteUser();
            return;
        }

        if (!this.deleteUserPassword.trim()) {
            this.error = 'Please enter your admin password to confirm deletion.';
            return;
        }

        this.isDeletingUser = true;
        this.error = '';

        // First verify admin password
        this.volunteerService.verifyAdminPassword(this.deleteUserPassword).subscribe({
            next: (result) => {
                if (!result.valid) {
                    this.error = 'Invalid admin password. Please try again.';
                    this.isDeletingUser = false;
                    return;
                }

                // Password verified, proceed with deletion
                this.volunteerService.deleteUser(this.selectedUser!.userId!).subscribe({
                    next: () => {
                        this.success = `User ${this.selectedUser!.firstName} ${this.selectedUser!.lastName} deleted successfully`;
                        this.cancelDeleteUser();
                        // Full page refresh to ensure API is called again and table is updated
                        window.location.reload();
                    },
                    error: (error) => {
                        console.error('Error deleting user', error);
                        // Extract error message from response
                        const errorMessage = error.error?.message || error.error?.error?.message || 'Failed to delete user. The user may have associated data (events, signups) that need to be deleted first.';
                        this.error = errorMessage;
                        this.isDeletingUser = false;
                    }
                });
            },
            error: (error) => {
                console.error('Error verifying admin password', error);
                this.error = 'Failed to verify admin password. Please try again.';
                this.isDeletingUser = false;
            }
        });
    }

    isCurrentUser(user: User): boolean {
        return this.currentUser !== null && user.userId === this.currentUser.userId;
    }

    openEditRoleModal(user: User): void {
        this.editingUser = user;
        this.newRole = (user.role as 'volunteer' | 'organizer' | 'admin') || 'volunteer';
        this.selectedOrganizationId = user.organizationId || null;
        this.adminPassword = '';
        this.showOnlyOrganizerWarning = false;
        this.showAdminRoleWarning = false;
        this.showEditRoleModal = true;

        // Check warnings after modal opens
        setTimeout(() => {
            this.checkOnlyOrganizerWarning();
            this.checkAdminRoleWarning();
        }, 0);
    }

    closeEditRoleModal(): void {
        this.showEditRoleModal = false;
        this.editingUser = null;
        this.newRole = 'volunteer';
        this.selectedOrganizationId = null;
        this.adminPassword = '';
        this.showOnlyOrganizerWarning = false;
        this.showAdminRoleWarning = false;
    }

    checkOnlyOrganizerWarning(): void {
        if (!this.editingUser || this.newRole !== 'volunteer' || !this.editingUser.organizationId) {
            this.showOnlyOrganizerWarning = false;
            return;
        }

        // Check if this user is the only organizer for their organization
        const organizersForOrg = this.users.filter(u =>
            u.role === 'organizer' &&
            u.organizationId === this.editingUser!.organizationId &&
            u.userId !== this.editingUser!.userId
        );

        this.showOnlyOrganizerWarning = organizersForOrg.length === 0;
    }

    checkAdminRoleWarning(): void {
        this.showAdminRoleWarning = this.newRole === 'admin';
    }

    onRoleChange(): void {
        this.checkOnlyOrganizerWarning();
        this.checkAdminRoleWarning();

        // Clear organization selection if not making them an organizer
        if (this.newRole !== 'organizer') {
            this.selectedOrganizationId = null;
        }
    }

    onOrganizationChange(): void {
        this.checkOnlyOrganizerWarning();
    }

    updateUserRole(): void {
        if (!this.editingUser || !this.editingUser.userId || !this.adminPassword.trim()) {
            this.error = 'Please enter your admin password to proceed.';
            return;
        }

        // Validate organization selection for organizers
        if (this.newRole === 'organizer' && !this.selectedOrganizationId) {
            this.error = 'Please select an organization for the organizer role.';
            return;
        }

        this.isUpdatingRole = true;
        this.error = '';

        // First verify admin password
        this.volunteerService.verifyAdminPassword(this.adminPassword).subscribe({
            next: (result) => {
                if (!result.valid) {
                    this.error = 'Invalid admin password. Please try again.';
                    this.isUpdatingRole = false;
                    return;
                }

                // Password verified, proceed with role update
                // Determine organizationId value
                let organizationIdValue: number | null | undefined;
                if (this.newRole === 'organizer' && this.selectedOrganizationId) {
                    organizationIdValue = this.selectedOrganizationId;
                } else {
                    // Clear organization when making them a volunteer or admin
                    organizationIdValue = null;
                }

                // Use updateUserRole with full user object to preserve all required fields
                this.volunteerService.updateUserRole(
                    this.editingUser!.userId!,
                    this.editingUser!,
                    this.newRole,
                    organizationIdValue,
                    this.adminPassword
                ).subscribe({
                    next: () => {
                        // Update local user object with the new role and organization
                        const userIndex = this.users.findIndex(u => u.userId === this.editingUser!.userId);
                        if (userIndex !== -1) {
                            // Determine the organizationId value based on the new role
                            let updatedOrganizationId: number | undefined;
                            if (this.newRole === 'organizer' && this.selectedOrganizationId) {
                                updatedOrganizationId = this.selectedOrganizationId;
                            } else if (this.newRole !== 'organizer') {
                                // Clear organization for volunteers and admins
                                updatedOrganizationId = undefined;
                            } else {
                                // Keep existing organizationId if role is organizer but no new org selected
                                updatedOrganizationId = this.users[userIndex].organizationId;
                            }

                            this.users[userIndex] = {
                                ...this.users[userIndex],
                                role: this.newRole,
                                organizationId: updatedOrganizationId
                            };
                        }

                        this.success = `User role updated successfully to ${this.newRole}`;
                        this.closeEditRoleModal();
                        this.isUpdatingRole = false;
                        // Full page refresh to ensure API is called again and table is updated
                        window.location.reload();
                    },
                    error: (error) => {
                        console.error('Error updating user role', error);
                        // Extract error message from response
                        const errorMessage = error.error?.message || error.error?.error?.message || 'Failed to update user role. Please try again.';
                        this.error = errorMessage;
                        this.isUpdatingRole = false;
                    }
                });
            },
            error: (error) => {
                console.error('Error verifying admin password', error);
                this.error = 'Failed to verify admin password. Please try again.';
                this.isUpdatingRole = false;
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
                // Sort events by date/time with next event first
                this.events = this.sortEventsByDateTime(events);
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

    /**
     * Sorts events by date and time, with the next upcoming event first.
     * Past events are sorted by most recent first.
     */
    sortEventsByDateTime(events: Event[]): Event[] {
        const now = new Date();
        const sorted = [...events];
        
        sorted.sort((a, b) => {
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
        
        return sorted;
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
        // Sort events (date column uses proper date/time sorting with upcoming first)
        this.filteredEvents = this.sortEvents(result);
        this.eventCurrentPage = 1;
        this.updateEventPagination();
    }

    sortEvents(events: Event[]): Event[] {
        const sorted = [...events];
        sorted.sort((a, b) => {
            // Handle date sorting separately with proper date/time comparison
            if (this.eventSortColumn === 'date') {
                const aDateTime = this.getEventDateTime(a);
                const bDateTime = this.getEventDateTime(b);
                const now = new Date();
                const aIsPast = aDateTime < now;
                const bIsPast = bDateTime < now;
                
                // Upcoming events come before past events
                if (aIsPast !== bIsPast) {
                    return aIsPast ? 1 : -1;
                }
                
                // If both are upcoming, sort ascending (next event first)
                // If both are past, sort descending (most recent first)
                if (!aIsPast) {
                    return this.eventSortDirection === 'asc' 
                        ? aDateTime.getTime() - bDateTime.getTime()
                        : bDateTime.getTime() - aDateTime.getTime();
                } else {
                    return this.eventSortDirection === 'asc'
                        ? bDateTime.getTime() - aDateTime.getTime()
                        : aDateTime.getTime() - bDateTime.getTime();
                }
            }
            
            // For other columns, use string/value comparison
            let aValue = '';
            let bValue = '';
            switch (this.eventSortColumn) {
                case 'title':
                    aValue = a.title?.toLowerCase() || '';
                    bValue = b.title?.toLowerCase() || '';
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

    // SUPPORT MESSAGES MANAGEMENT

    /**
     * Loads all support messages from the API.
     */
    loadSupportMessages(): void {
        this.volunteerService.getSupportMessages().subscribe({
            next: (messages) => {
                this.supportMessages = messages;
                this.applySupportMessageFilters();
                this.completeRequest();
            },
            error: (error) => {
                console.error('Error loading support messages', error);
                this.error = 'Failed to load support messages';
                this.completeRequest();
            }
        });
    }

    /**
     * Applies search and status filters to the support messages list.
     */
    applySupportMessageFilters(): void {
        let result = [...this.supportMessages];
        const term = this.supportMessageSearchTerm.trim().toLowerCase();
        if (term) {
            result = result.filter(message =>
                message.subject?.toLowerCase().includes(term) ||
                message.name?.toLowerCase().includes(term) ||
                message.email?.toLowerCase().includes(term) ||
                message.message?.toLowerCase().includes(term)
            );
        }
        if (this.supportMessageStatusFilter !== 'all') {
            const isResolved = this.supportMessageStatusFilter === 'resolved';
            result = result.filter(message => {
                const resolved = message.isResolved === 1 || message.isResolved === true;
                return isResolved ? resolved : !resolved;
            });
        }
        this.filteredSupportMessages = this.sortSupportMessages(result);
        this.supportMessageCurrentPage = 1;
        this.updateSupportMessagePagination();
    }

    /**
     * Gets the count of unresolved support messages.
     */
    get unresolvedSupportMessagesCount(): number {
        return this.supportMessages.filter(message => {
            return !(message.isResolved === 1 || message.isResolved === true);
        }).length;
    }

    /**
     * Sorts support messages by the current sort column and direction.
     * 
     * @param messages - The messages array to sort
     * @returns The sorted messages array
     */
    sortSupportMessages(messages: any[]): any[] {
        const sorted = [...messages];
        sorted.sort((a, b) => {
            let aValue = '';
            let bValue = '';
            switch (this.supportMessageSortColumn) {
                case 'date':
                    aValue = a.createdAt || a.submittedAt || '';
                    bValue = b.createdAt || b.submittedAt || '';
                    break;
                case 'subject':
                    aValue = a.subject?.toLowerCase() || '';
                    bValue = b.subject?.toLowerCase() || '';
                    break;
                case 'name':
                    aValue = a.name?.toLowerCase() || '';
                    bValue = b.name?.toLowerCase() || '';
                    break;
                case 'status':
                    const aResolved = a.isResolved === 1 || a.isResolved === true;
                    const bResolved = b.isResolved === 1 || b.isResolved === true;
                    aValue = aResolved ? 'resolved' : 'unresolved';
                    bValue = bResolved ? 'resolved' : 'unresolved';
                    break;
            }
            if (aValue < bValue) return this.supportMessageSortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.supportMessageSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }

    /**
     * Sets the sort column and direction for support messages.
     * 
     * @param column - The column to sort by
     */
    setSupportMessageSort(column: 'date' | 'subject' | 'name' | 'status'): void {
        if (this.supportMessageSortColumn === column) {
            this.supportMessageSortDirection = this.supportMessageSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.supportMessageSortColumn = column;
            this.supportMessageSortDirection = 'desc';
        }
        this.filteredSupportMessages = this.sortSupportMessages(this.filteredSupportMessages);
        this.updateSupportMessagePagination();
    }

    /**
     * Gets the sort icon class for a support message column.
     * 
     * @param column - The column to get the icon for
     * @returns The icon class name
     */
    getSupportMessageSortIcon(column: 'date' | 'subject' | 'name' | 'status'): string {
        if (this.supportMessageSortColumn !== column) return 'bi-arrow-down-up';
        return this.supportMessageSortDirection === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
    }

    /**
     * Updates the paginated support messages based on current page and page size.
     */
    updateSupportMessagePagination(): void {
        const start = (this.supportMessageCurrentPage - 1) * this.supportMessagePageSize;
        this.paginatedSupportMessages = this.filteredSupportMessages.slice(start, start + this.supportMessagePageSize);
    }

    /**
     * Changes the page size for support messages pagination.
     * 
     * @param size - The new page size
     */
    changeSupportMessagePageSize(size: string | number): void {
        this.supportMessagePageSize = Number(size);
        this.supportMessageCurrentPage = 1;
        this.updateSupportMessagePagination();
    }

    /**
     * Navigates to a specific page of support messages.
     * 
     * @param page - The page number to navigate to
     */
    goToSupportMessagePage(page: number): void {
        if (page < 1 || page > this.supportMessageTotalPages) return;
        this.supportMessageCurrentPage = page;
        this.updateSupportMessagePagination();
    }

    /**
     * Gets the total number of pages for support messages.
     */
    get supportMessageTotalPages(): number {
        return this.filteredSupportMessages.length === 0 ? 1 : Math.ceil(this.filteredSupportMessages.length / this.supportMessagePageSize);
    }

    /**
     * Gets an array of page numbers for support messages pagination.
     */
    get supportMessagePageNumbers(): number[] {
        return Array.from({ length: this.supportMessageTotalPages }, (_, index) => index + 1);
    }

    /**
     * Formats a date string for display.
     * 
     * @param dateString - The date string to format
     * @returns Formatted date string
     */
    formatSupportMessageDate(dateString: string): string {
        if (!dateString) return '—';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return dateString;
        }
    }

    /**
     * Formats a date for MySQL DATETIME format (YYYY-MM-DD HH:MM:SS).
     * 
     * @param date - The date to format (defaults to current date)
     * @returns Formatted date string in MySQL format
     */
    formatDateForMySQL(date: Date = new Date()): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * Marks a support message as resolved.
     * 
     * @param message - The support message to mark as resolved
     */
    markSupportMessageResolved(message: any): void {
        if (!message || !message.messageId) return;

        const updatedMessage = {
            ...message,
            isResolved: 1,
            respondedBy: this.currentUser?.userId || null,
            respondedAt: this.formatDateForMySQL()
        };

        this.volunteerService.updateSupportMessage(message.messageId, updatedMessage).subscribe({
            next: () => {
                this.success = 'Support message marked as resolved';
                this.loadSupportMessages();
            },
            error: (error) => {
                console.error('Error marking support message as resolved', error);
                this.error = 'Failed to mark message as resolved. Please try again.';
            }
        });
    }

    /**
     * Shows the respond modal for a support message.
     * 
     * @param message - The support message to respond to
     */
    showRespondModal(message: any): void {
        this.selectedSupportMessage = message;
        this.responseMessage = message.responseMessage || '';
        this.showRespondSupportMessageModal = true;
    }

    /**
     * Cancels the respond modal.
     */
    cancelRespondSupportMessage(): void {
        this.selectedSupportMessage = null;
        this.responseMessage = '';
        this.showRespondSupportMessageModal = false;
    }

    /**
     * Submits a response to a support message.
     */
    respondToSupportMessage(): void {
        if (!this.selectedSupportMessage || !this.selectedSupportMessage.messageId) return;

        const responseValidation = this.inputValidation.validateTextField(
            this.responseMessage,
            65535,
            'Response message'
        );
        if (!responseValidation.isValid) {
            this.error = responseValidation.error || 'Invalid response message';
            return;
        }

        const sanitizedResponse = responseValidation.sanitized;

        const updatedMessage = {
            ...this.selectedSupportMessage,
            isResolved: 1,
            responseMessage: sanitizedResponse,
            respondedBy: this.currentUser?.userId || null,
            respondedAt: this.formatDateForMySQL()
        };

        this.volunteerService.updateSupportMessage(this.selectedSupportMessage.messageId, updatedMessage).subscribe({
            next: () => {
                this.success = 'Response sent successfully';
                this.showRespondSupportMessageModal = false;
                this.responseMessage = '';
                this.selectedSupportMessage = null;
                this.loadSupportMessages();
            },
            error: (error) => {
                console.error('Error responding to support message', error);
                this.error = 'Failed to send response. Please try again.';
            }
        });
    }

    /**
     * Confirms deletion of a support message.
     * 
     * @param message - The support message to delete
     */
    confirmDeleteSupportMessage(message: any): void {
        this.selectedSupportMessage = message;
        this.showDeleteSupportMessageConfirmation = true;
    }

    /**
     * Cancels the delete confirmation.
     */
    cancelDeleteSupportMessage(): void {
        this.selectedSupportMessage = null;
        this.showDeleteSupportMessageConfirmation = false;
    }

    /**
     * Deletes a support message.
     */
    deleteSupportMessage(): void {
        if (!this.selectedSupportMessage || !this.selectedSupportMessage.messageId) return;

        this.volunteerService.deleteSupportMessage(this.selectedSupportMessage.messageId).subscribe({
            next: () => {
                this.success = 'Support message deleted successfully';
                this.supportMessages = this.supportMessages.filter(m => m.messageId !== this.selectedSupportMessage!.messageId);
                this.applySupportMessageFilters();
                this.showDeleteSupportMessageConfirmation = false;
                this.selectedSupportMessage = null;
            },
            error: (error) => {
                this.error = 'Failed to delete support message. Please try again.';
            }
        });
    }

    // AUDIT LOG MANAGEMENT

    /**
     * Loads audit logs from the API with pagination.
     * Called when the audit log tab is selected or filters change.
     */
    loadAuditLogs(): void {
        if (this.activeTab !== 'audit') {
            return;
        }

        this.loadingAuditLogs = true;
        const offset = (this.auditLogCurrentPage - 1) * this.auditLogPageSize;

        this.volunteerService.getAuditLogs(this.auditLogPageSize, offset).subscribe({
            next: (response: AuditLogResponse) => {
                this.auditLogs = response.logs;
                this.auditLogPagination = response.pagination;
                this.applyAuditLogFilters();
                this.loadingAuditLogs = false;
            },
            error: (error) => {
                this.error = 'Failed to load audit logs';
                this.loadingAuditLogs = false;
            }
        });
    }

    /**
     * Applies search and filter criteria to the audit logs list.
     */
    applyAuditLogFilters(): void {
        let result = [...this.auditLogs];

        // Search filter
        const searchTerm = this.auditLogSearchTerm.trim().toLowerCase();
        if (searchTerm) {
            result = result.filter(log => {
                const actionMatch = log.action?.toLowerCase().includes(searchTerm);
                const entityTypeMatch = log.entityType?.toLowerCase().includes(searchTerm);
                const actorMatch = log.actorUserId?.toString().includes(searchTerm);
                const entityIdMatch = log.entityId?.toString().includes(searchTerm);
                const detailsMatch = JSON.stringify(log.details || {}).toLowerCase().includes(searchTerm);
                return actionMatch || entityTypeMatch || actorMatch || entityIdMatch || detailsMatch;
            });
        }

        // Action filter
        if (this.auditLogActionFilter !== 'all') {
            result = result.filter(log => log.action === this.auditLogActionFilter);
        }

        // Entity type filter
        if (this.auditLogEntityTypeFilter !== 'all') {
            result = result.filter(log => log.entityType === this.auditLogEntityTypeFilter);
        }

        // Actor filter (by user ID)
        if (this.auditLogActorFilter.trim()) {
            const actorId = parseInt(this.auditLogActorFilter.trim());
            if (!isNaN(actorId)) {
                result = result.filter(log => log.actorUserId === actorId);
            }
        }

        // Entity ID filter
        if (this.auditLogEntityIdFilter.trim()) {
            const entityId = parseInt(this.auditLogEntityIdFilter.trim());
            if (!isNaN(entityId)) {
                result = result.filter(log => log.entityId === entityId);
            }
        }

        this.filteredAuditLogs = this.sortAuditLogs(result);
        this.auditLogCurrentPage = 1;
        this.updateAuditLogPagination();
    }

    /**
     * Sorts audit logs by the current sort column and direction.
     * 
     * @param logs - The audit logs array to sort
     * @returns The sorted audit logs array
     */
    sortAuditLogs(logs: AuditLog[]): AuditLog[] {
        const sorted = [...logs];
        sorted.sort((a, b) => {
            let aValue: any = '';
            let bValue: any = '';
            switch (this.auditLogSortColumn) {
                case 'date':
                    aValue = new Date(a.occurredAt).getTime();
                    bValue = new Date(b.occurredAt).getTime();
                    break;
                case 'action':
                    aValue = a.action?.toLowerCase() || '';
                    bValue = b.action?.toLowerCase() || '';
                    break;
                case 'entityType':
                    aValue = a.entityType?.toLowerCase() || '';
                    bValue = b.entityType?.toLowerCase() || '';
                    break;
                case 'actor':
                    aValue = a.actorUserId || 0;
                    bValue = b.actorUserId || 0;
                    break;
            }
            if (aValue < bValue) return this.auditLogSortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.auditLogSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }

    /**
     * Sets the sort column and direction for audit logs.
     * 
     * @param column - The column to sort by
     */
    setAuditLogSort(column: 'date' | 'action' | 'entityType' | 'actor'): void {
        if (this.auditLogSortColumn === column) {
            this.auditLogSortDirection = this.auditLogSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.auditLogSortColumn = column;
            this.auditLogSortDirection = 'desc';
        }
        this.filteredAuditLogs = this.sortAuditLogs(this.filteredAuditLogs);
        this.updateAuditLogPagination();
    }

    /**
     * Gets the sort icon class for an audit log column.
     * 
     * @param column - The column to get the icon for
     * @returns The icon class name
     */
    getAuditLogSortIcon(column: 'date' | 'action' | 'entityType' | 'actor'): string {
        if (this.auditLogSortColumn !== column) return 'bi-arrow-down-up';
        return this.auditLogSortDirection === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
    }

    /**
     * Updates the paginated audit logs based on current page and page size.
     */
    updateAuditLogPagination(): void {
        const start = (this.auditLogCurrentPage - 1) * this.auditLogPageSize;
        this.paginatedAuditLogs = this.filteredAuditLogs.slice(start, start + this.auditLogPageSize);
    }

    /**
     * Changes the page size for audit log pagination.
     * 
     * @param size - The new page size
     */
    changeAuditLogPageSize(size: string | number): void {
        this.auditLogPageSize = Number(size);
        this.auditLogCurrentPage = 1;
        this.loadAuditLogs();
    }

    /**
     * Navigates to a specific page of audit logs.
     * 
     * @param page - The page number to navigate to
     */
    goToAuditLogPage(page: number): void {
        if (page < 1 || page > this.auditLogTotalPages) return;
        this.auditLogCurrentPage = page;
        this.loadAuditLogs();
    }

    /**
     * Gets the total number of pages for audit logs.
     */
    get auditLogTotalPages(): number {
        if (this.auditLogPagination) {
            return Math.ceil(this.auditLogPagination.total / this.auditLogPageSize);
        }
        return this.filteredAuditLogs.length === 0 ? 1 : Math.ceil(this.filteredAuditLogs.length / this.auditLogPageSize);
    }

    /**
     * Gets an array of page numbers for audit log pagination.
     */
    get auditLogPageNumbers(): number[] {
        const totalPages = this.auditLogTotalPages;
        const maxPages = 10;
        const currentPage = this.auditLogCurrentPage;

        if (totalPages <= maxPages) {
            return Array.from({ length: totalPages }, (_, index) => index + 1);
        }

        let start = Math.max(1, currentPage - Math.floor(maxPages / 2));
        let end = Math.min(totalPages, start + maxPages - 1);

        if (end - start < maxPages - 1) {
            start = Math.max(1, end - maxPages + 1);
        }

        return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }

    /**
     * Formats a date string for display in audit logs.
     * 
     * @param dateString - The date string to format
     * @returns Formatted date string
     */
    formatAuditLogDate(dateString: string): string {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch {
            return dateString;
        }
    }

    /**
     * Gets the display name for an actor user ID.
     * 
     * @param actorUserId - The actor user ID
     * @returns The user's full name or "System" if null
     */
    getActorName(actorUserId: number | null): string {
        if (actorUserId === null) return 'System';
        const user = this.users.find(u => u.userId === actorUserId);
        return user ? `${user.firstName} ${user.lastName}` : `User #${actorUserId}`;
    }

    /**
     * Gets a badge class for an action type.
     * 
     * @param action - The action type
     * @returns CSS class for the badge
     */
    getActionBadgeClass(action: string): string {
        switch (action?.toLowerCase()) {
            case 'create':
                return 'badge bg-success';
            case 'update':
                return 'badge bg-info text-dark';
            case 'delete':
                return 'badge bg-danger';
            case 'login':
                return 'badge bg-primary';
            case 'approve':
                return 'badge bg-success';
            case 'reject':
                return 'badge bg-warning text-dark';
            case 'unauthorized_access':
                return 'badge bg-danger';
            default:
                return 'badge bg-secondary';
        }
    }

    /**
     * Shows the audit log details modal.
     * 
     * @param log - The audit log to display
     */
    showAuditLogDetails(log: AuditLog): void {
        this.selectedAuditLog = log;
        this.showAuditLogDetailsModal = true;
    }

    /**
     * Closes the audit log details modal.
     */
    closeAuditLogDetails(): void {
        this.selectedAuditLog = null;
        this.showAuditLogDetailsModal = false;
    }

    /**
     * Formats JSON details for display.
     * 
     * @param details - The details object to format
     * @returns Formatted JSON string
     */
    formatAuditLogDetails(details: any): string {
        if (!details) return 'No details';
        try {
            return JSON.stringify(details, null, 2);
        } catch {
            return String(details);
        }
    }

    /**
     * Handles tab change and loads data when needed.
     * 
     * @param tab - The tab name to switch to
     */
    switchTab(tab: string): void {
        this.activeTab = tab;
        if (tab === 'tags' && this.tags.length === 0) {
            this.loadTags();
        } else if (tab === 'audit' && this.auditLogs.length === 0) {
            this.loadAuditLogs();
        } else if (tab !== 'audit') {
            // Update pagination for filtered results when switching away
            this.updateAuditLogPagination();
        }
    }

    /**
     * Loads admin metrics from the API.
     */
    loadAdminMetrics(): void {
        this.loadingAdminMetrics = true;
        this.adminMetricsError = '';

        this.volunteerService.getAdminMetrics().subscribe({
            next: (metrics) => {
                // Log raw API response for debugging
                console.log('Admin Metrics received (raw):', metrics);

                // Map API property names to frontend expected names
                // API returns: totalVolunteers, totalOrganizers, totalAdmins, totalOrganizations, pendingOrganizations, totalEvents, totalCompletedEvents
                // Frontend expects: userCounts.volunteers, userCounts.organizers, userCounts.admins, organizationCounts.total, organizationCounts.pending, eventCounts.total, eventCounts.completed
                if (metrics) {
                    const mappedMetrics: any = {
                        userCounts: {
                            volunteers: (metrics as any).totalVolunteers ?? metrics.userCounts?.volunteers ?? 0,
                            organizers: (metrics as any).totalOrganizers ?? metrics.userCounts?.organizers ?? 0,
                            admins: (metrics as any).totalAdmins ?? metrics.userCounts?.admins ?? 0
                        },
                        organizationCounts: {
                            total: (metrics as any).totalOrganizations ?? metrics.organizationCounts?.total ?? 0,
                            pending: (metrics as any).pendingOrganizations ?? metrics.organizationCounts?.pending ?? 0
                        },
                        eventCounts: {
                            total: (metrics as any).totalEvents ?? metrics.eventCounts?.total ?? 0,
                            completed: (metrics as any).totalCompletedEvents ?? metrics.eventCounts?.completed ?? 0
                        },
                        totalVolunteerHours: metrics.totalVolunteerHours ?? 0,
                        newUsersLast30Days: metrics.newUsersLast30Days ?? 0,
                        newOrganizationsLast30Days: metrics.newOrganizationsLast30Days ?? 0,
                        activeUsersLast7Days: (metrics as any).activeUsersLast7Days ?? metrics.activeUsersLast7Days ?? 0,
                        activeUsersLast30Days: (metrics as any).activeUsersLast30Days ?? metrics.activeUsersLast30Days ?? 0,
                        activeUsersLast90Days: (metrics as any).activeUsersLast90Days ?? metrics.activeUsersLast90Days ?? 0,
                        activeUsersLast365Days: (metrics as any).activeUsersLast365Days ?? metrics.activeUsersLast365Days ?? 0,
                        usageByMonth: (metrics.usageByMonth ?? []).map((m: any) => ({
                            month: m.month || m.yearMonth,
                            yearMonth: m.yearMonth || m.month,
                            newUsers: m.newUsers ?? m.new_users ?? 0,
                            newOrganizations: m.newOrganizations ?? m.new_organizations ?? 0,
                            newEvents: m.newEvents ?? m.eventsCreated ?? m.events_created ?? 0,
                            volunteerHours: m.volunteerHours ?? m.volunteer_hours ?? 0
                        })).sort((a, b) => {
                            // Sort by month/year to ensure chronological order
                            const monthA = a.month || a.yearMonth || '';
                            const monthB = b.month || b.yearMonth || '';
                            return monthA.localeCompare(monthB);
                        })
                    };
                    console.log('Admin Metrics mapped:', mappedMetrics);
                    this.adminMetrics = mappedMetrics;
                } else {
                    this.adminMetrics = metrics;
                }
                this.loadingAdminMetrics = false;
                this.completeRequest();
            },
            error: (error) => {
                console.error('Error loading admin metrics:', error);
                this.adminMetricsError = 'Failed to load metrics. Please try again later.';
                this.loadingAdminMetrics = false;
                this.completeRequest();
            }
        });
    }

    /**
     * Gets chart data for user counts by role (pie chart).
     * 
     * @returns Chart data configuration
     */
    getUserCountsChartData(): ChartData<'pie'> {
        if (!this.adminMetrics) {
            return { labels: [], datasets: [] };
        }

        return {
            labels: ['Volunteers', 'Organizers', 'Admins'],
            datasets: [{
                data: [
                    this.adminMetrics.userCounts?.volunteers ?? 0,
                    this.adminMetrics.userCounts?.organizers ?? 0,
                    this.adminMetrics.userCounts?.admins ?? 0
                ],
                backgroundColor: ['#28a745', '#17a2b8', '#6c757d'],
                borderColor: ['#1e7e34', '#138496', '#545b62'],
                borderWidth: 2
            }]
        };
    }

    /**
     * Gets the filtered months based on the selected date range (admin).
     * 
     * @param months - Array of month objects to filter
     * @returns Filtered array of months
     */
    private getFilteredAdminMonths<T extends { month?: string; yearMonth?: string }>(months: T[]): T[] {
        if (!months || months.length === 0) {
            return [];
        }

        let startDate: Date | null = null;
        let endDate: Date | null = null;

        // Calculate date range based on preset
        const now = new Date();
        switch (this.adminDateRangePreset) {
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
                if (this.adminCustomStartMonth) {
                    const [startYear, startMonth] = this.adminCustomStartMonth.split('-').map(Number);
                    startDate = new Date(startYear, startMonth - 1, 1);
                }
                if (this.adminCustomEndMonth) {
                    const [endYear, endMonth] = this.adminCustomEndMonth.split('-').map(Number);
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
     * Called when chart type or metric selection changes (admin).
     * This prevents unnecessary method calls during change detection.
     */
    onAdminChartTypeChange(): void {
        // Chart data will be recalculated when the template re-renders
        // This method exists to prevent the template from calling chart methods on every change detection
    }

    /**
     * Gets chart data for monthly usage trends (bar/line chart).
     * 
     * @returns Chart data configuration
     */
    getMonthlyUsageChartData(): ChartData<'bar' | 'line'> {
        if (!this.adminMetrics || !this.adminMetrics.usageByMonth || this.adminMetrics.usageByMonth.length === 0) {
            return { labels: [], datasets: [] };
        }

        // Filter out any entries with missing month data
        // API returns: yearMonth, but frontend expects: month
        let validMonths = this.adminMetrics.usageByMonth.filter(m => {
            if (!m) return false;
            const monthValue = m.month || (m as any).yearMonth;
            return !!monthValue;
        });

        // Apply date range filter
        validMonths = this.getFilteredAdminMonths(validMonths);

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

        let datasets: any[] = [];

        if (this.selectedAdminMetricChart === 'users') {
            datasets = [{
                label: 'New Users',
                data: validMonths.map(m => m.newUsers ?? (m as any).new_users ?? 0),
                backgroundColor: 'rgba(40, 167, 69, 0.6)',
                borderColor: '#28a745',
                borderWidth: 2
            }];
        } else if (this.selectedAdminMetricChart === 'orgs') {
            datasets = [{
                label: 'New Organizations',
                data: validMonths.map(m => m.newOrganizations ?? (m as any).new_organizations ?? 0),
                backgroundColor: 'rgba(23, 162, 184, 0.6)',
                borderColor: '#17a2b8',
                borderWidth: 2
            }];
        } else if (this.selectedAdminMetricChart === 'events') {
            datasets = [{
                label: 'New Events',
                data: validMonths.map(m => m.newEvents ?? (m as any).eventsCreated ?? (m as any).events_created ?? 0),
                backgroundColor: 'rgba(31, 125, 96, 0.6)',
                borderColor: '#1f7d60',
                borderWidth: 2
            }];
        } else if (this.selectedAdminMetricChart === 'hours') {
            datasets = [{
                label: 'Volunteer Hours',
                data: validMonths.map(m => m.volunteerHours ?? (m as any).volunteer_hours ?? 0),
                backgroundColor: 'rgba(255, 193, 7, 0.6)',
                borderColor: '#ffc107',
                borderWidth: 2
            }];
        }

        return {
            labels: labels,
            datasets: datasets
        };
    }

    /**
     * Gets the active user count for a specific timeframe.
     * 
     * @param days - Number of days (7, 30, 90, or 365)
     * @returns Active user count for the timeframe
     */
    getActiveUserCount(days: number): number {
        if (!this.adminMetrics) return 0;

        switch (days) {
            case 7:
                return this.adminMetrics.activeUsersLast7Days ?? 0;
            case 30:
                return this.adminMetrics.activeUsersLast30Days ?? 0;
            case 90:
                return this.adminMetrics.activeUsersLast90Days ?? 0;
            case 365:
                return this.adminMetrics.activeUsersLast365Days ?? 0;
            default:
                return 0;
        }
    }

    /**
     * Calculates the percentage of active users for a specific timeframe.
     * 
     * @param days - Number of days (7, 30, 90, or 365)
     * @returns Percentage of active users
     */
    getActiveUserPercentage(days: number): number {
        if (!this.adminMetrics) return 0;

        const totalUsers = (this.adminMetrics.userCounts?.volunteers ?? 0) +
            (this.adminMetrics.userCounts?.organizers ?? 0) +
            (this.adminMetrics.userCounts?.admins ?? 0);

        if (totalUsers === 0) return 0;

        const activeCount = this.getActiveUserCount(days);
        return (activeCount / totalUsers) * 100;
    }

    /**
     * Gets chart data for active users over different timeframes (bar/line chart).
     * 
     * @returns Chart data configuration
     */
    getActiveUsersChartData(): ChartData<'bar' | 'line'> {
        if (!this.adminMetrics) {
            return { labels: [], datasets: [] };
        }

        return {
            labels: ['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'Last Year'],
            datasets: [{
                label: 'Active Users',
                data: [
                    this.getActiveUserCount(7),
                    this.getActiveUserCount(30),
                    this.getActiveUserCount(90),
                    this.getActiveUserCount(365)
                ],
                backgroundColor: 'rgba(40, 167, 69, 0.6)',
                borderColor: '#28a745',
                borderWidth: 2
            }]
        };
    }

    /**
     * Gets chart options for pie charts (admin).
     * 
     * @returns Chart options
     */
    getAdminPieChartOptions(): ChartConfiguration<'pie'>['options'] {
        return {
            responsive: true,
            maintainAspectRatio: false,
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
     * Gets chart options for bar/line charts (admin).
     * 
     * @returns Chart options
     */
    getAdminBarLineChartOptions(): ChartConfiguration<'bar' | 'line'>['options'] {
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
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

    // ========== Metrics Export Methods ==========

    /**
     * Downloads admin metrics as a PDF report.
     * Includes summary statistics, data tables, and chart images.
     */
    downloadAdminMetricsAsPDF(): void {
        if (!this.adminMetrics) {
            return;
        }

        // Wait a moment for charts to render, then generate PDF
        setTimeout(() => {
            this.generateAdminPDFWithCharts();
        }, 500);
    }

    /**
     * Internal method to generate the PDF with charts.
     * Called after ensuring charts are visible and rendered.
     */
    private generateAdminPDFWithCharts(): void {
        if (!this.adminMetrics) {
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
            doc.text('Admin Metrics Report', pageWidth / 2, 20, { align: 'center' });

            // Subtitle
            doc.setFontSize(16);
            doc.setFont('helvetica', 'normal');
            doc.text('System-Wide Statistics', pageWidth / 2, 30, { align: 'center' });

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
                ['Total Users', (this.adminMetrics.userCounts?.volunteers ?? this.adminMetrics.totalVolunteers ?? 0) +
                    (this.adminMetrics.userCounts?.organizers ?? this.adminMetrics.totalOrganizers ?? 0) +
                    (this.adminMetrics.userCounts?.admins ?? this.adminMetrics.totalAdmins ?? 0)],
                ['Total Volunteers', this.adminMetrics.userCounts?.volunteers ?? this.adminMetrics.totalVolunteers ?? 0],
                ['Total Organizers', this.adminMetrics.userCounts?.organizers ?? this.adminMetrics.totalOrganizers ?? 0],
                ['Total Admins', this.adminMetrics.userCounts?.admins ?? this.adminMetrics.totalAdmins ?? 0],
                ['Total Organizations', this.adminMetrics.organizationCounts?.total ?? this.adminMetrics.totalOrganizations ?? 0],
                ['Pending Organizations', this.adminMetrics.organizationCounts?.pending ?? this.adminMetrics.pendingOrganizations ?? 0],
                ['Total Events', this.adminMetrics.eventCounts?.total ?? this.adminMetrics.totalEvents ?? 0],
                ['Completed Events', this.adminMetrics.eventCounts?.completed ?? this.adminMetrics.totalCompletedEvents ?? 0],
                ['Total Volunteer Hours', this.adminMetrics.totalVolunteerHours],
                ['New Users (Last 30 Days)', this.adminMetrics.newUsersLast30Days],
                ['New Organizations (Last 30 Days)', this.adminMetrics.newOrganizationsLast30Days]
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

                doc.text(row[0].toString(), 25, tableY);
                doc.text(row[1].toString(), pageWidth - 25, tableY, { align: 'right' });

                if (index < summaryData.length - 1) {
                    doc.line(20, tableY + 2, pageWidth - 20, tableY + 2);
                }

                tableY += 7;
            });

            yPosition = tableY + 15;

            // Active Users Section
            checkPageBreak(40);
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('Active Users', 20, yPosition);
            yPosition += 10;

            const activeUsersData = [
                ['Timeframe', 'Active Users', 'Percentage'],
                ['Last 7 Days', this.getActiveUserCount(7), `${this.getActiveUserPercentage(7).toFixed(1)}%`],
                ['Last 30 Days', this.getActiveUserCount(30), `${this.getActiveUserPercentage(30).toFixed(1)}%`],
                ['Last 90 Days', this.getActiveUserCount(90), `${this.getActiveUserPercentage(90).toFixed(1)}%`],
                ['Last Year', this.getActiveUserCount(365), `${this.getActiveUserPercentage(365).toFixed(1)}%`]
            ];

            // Draw active users table
            doc.setFillColor(245, 247, 250);
            const activeUsersTableHeight = activeUsersData.length * 6 + 5;
            doc.rect(20, yPosition - 5, pageWidth - 40, activeUsersTableHeight, 'F');

            let activeUsersTableY = yPosition;
            activeUsersData.forEach((row, index) => {
                if (index === 0) {
                    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                    doc.rect(20, activeUsersTableY - 5, pageWidth - 40, 6, 'F');
                    doc.setTextColor(255, 255, 255);
                    doc.setFont('helvetica', 'bold');
                } else {
                    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
                    doc.setFont('helvetica', 'normal');
                }

                doc.text(row[0].toString(), 25, activeUsersTableY);
                doc.text(row[1].toString(), (pageWidth - 40) / 2 + 20, activeUsersTableY, { align: 'center' });
                doc.text(row[2].toString(), pageWidth - 25, activeUsersTableY, { align: 'right' });

                if (index < activeUsersData.length - 1) {
                    doc.line(20, activeUsersTableY + 1, pageWidth - 20, activeUsersTableY + 1);
                }

                activeUsersTableY += 6;
            });

            yPosition = activeUsersTableY + 15;

            // Monthly Usage Section
            if (this.adminMetrics.usageByMonth && this.adminMetrics.usageByMonth.length > 0) {
                checkPageBreak(60);

                doc.setFontSize(18);
                doc.setFont('helvetica', 'bold');
                doc.text('Monthly Usage History', 20, yPosition);
                yPosition += 10;

                const filteredMonths = this.getFilteredAdminMonths(this.adminMetrics.usageByMonth);
                const monthlyData = [['Month', 'New Users', 'New Orgs', 'New Events', 'Volunteer Hours']];
                filteredMonths.forEach(month => {
                    const monthValue = month.month || (month as any).yearMonth;
                    if (monthValue) {
                        const [year, monthNum] = monthValue.split('-');
                        const date = new Date(parseInt(year), parseInt(monthNum) - 1);
                        const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                        monthlyData.push([
                            monthName,
                            (month.newUsers ?? (month as any).new_users ?? 0).toString(),
                            (month.newOrganizations ?? (month as any).new_organizations ?? 0).toString(),
                            (month.newEvents ?? (month as any).eventsCreated ?? (month as any).events_created ?? 0).toString(),
                            (month.volunteerHours ?? (month as any).volunteer_hours ?? 0).toString()
                        ]);
                    }
                });

                // Draw monthly table with page break handling
                let monthlyTableY = yPosition;
                let isFirstRow = true;

                monthlyData.forEach((row, index) => {
                    // Check if we need a new page (leave room for at least 2 rows: header + 1 data row)
                    if (monthlyTableY + 12 > pageHeight - 20) {
                        doc.addPage();
                        monthlyTableY = 20;
                        isFirstRow = true; // Redraw header on new page
                    }

                    if (index === 0 || isFirstRow) {
                        // Header row - draw background
                        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                        doc.rect(20, monthlyTableY - 5, pageWidth - 40, 6, 'F');
                        doc.setTextColor(255, 255, 255);
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(9);
                        isFirstRow = false;
                    } else {
                        // Data row - draw background for this row only
                        doc.setFillColor(245, 247, 250);
                        doc.rect(20, monthlyTableY - 5, pageWidth - 40, 6, 'F');
                        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(8);
                    }

                    doc.text(row[0].toString(), 25, monthlyTableY);
                    doc.text(row[1].toString(), (pageWidth - 40) / 4 + 20, monthlyTableY, { align: 'center' });
                    doc.text(row[2].toString(), (pageWidth - 40) / 2 + 20, monthlyTableY, { align: 'center' });
                    doc.text(row[3].toString(), (pageWidth - 40) * 3 / 4 + 20, monthlyTableY, { align: 'center' });
                    doc.text(row[4].toString(), pageWidth - 25, monthlyTableY, { align: 'right' });

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
                // 1. User Counts Pie Chart
                const pieChartCanvas = document.querySelector('.admin-metrics canvas[data-chart-type="pie"]') as HTMLCanvasElement;
                if (pieChartCanvas) {
                    try {
                        const pieChartImage = pieChartCanvas.toDataURL('image/png');
                        checkPageBreak(60);
                        doc.setFontSize(14);
                        doc.setFont('helvetica', 'bold');
                        doc.text('Users by Role', 20, yPosition);
                        yPosition += 8;

                        // Pie charts should be square (1:1 aspect ratio)
                        const imgWidth = pageWidth - 40;
                        const imgHeight = imgWidth;
                        doc.addImage(pieChartImage, 'PNG', 20, yPosition, imgWidth, imgHeight);
                        yPosition += imgHeight + 10;
                    } catch (error) {
                        console.error('Error capturing pie chart:', error);
                    }
                }

                // 2. Monthly Usage Chart (bar or line)
                const barCharts = document.querySelectorAll('.admin-metrics canvas[type="bar"]');
                const lineCharts = document.querySelectorAll('.admin-metrics canvas[type="line"]');
                const monthlyChart = (barCharts.length > 0 ? barCharts[0] : (lineCharts.length > 0 ? lineCharts[0] : null)) as HTMLCanvasElement;

                if (monthlyChart) {
                    try {
                        const monthlyChartImage = monthlyChart.toDataURL('image/png');
                        checkPageBreak(60);
                        doc.setFontSize(14);
                        doc.setFont('helvetica', 'bold');
                        let chartTitle = 'Monthly Usage';
                        if (this.selectedAdminMetricChart === 'users') {
                            chartTitle = 'Monthly New Users';
                        } else if (this.selectedAdminMetricChart === 'orgs') {
                            chartTitle = 'Monthly New Organizations';
                        } else if (this.selectedAdminMetricChart === 'events') {
                            chartTitle = 'Monthly New Events';
                        } else if (this.selectedAdminMetricChart === 'hours') {
                            chartTitle = 'Monthly Volunteer Hours';
                        } else if (this.selectedAdminMetricChart === 'activeUsers') {
                            chartTitle = 'Active Users by Timeframe';
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
                const fileName = `admin-metrics-${new Date().toISOString().split('T')[0]}.pdf`;
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
                const fileName = `admin-metrics-${new Date().toISOString().split('T')[0]}.pdf`;
                doc.save(fileName);
            });
        } catch (error) {
            console.error('Error generating PDF:', error);
            this.error = 'Failed to generate PDF report. Please try again.';
        }
    }

    /**
     * Downloads admin metrics as an Excel file.
     * Includes all data in spreadsheet format with multiple sheets.
     */
    downloadAdminMetricsAsExcel(): void {
        if (!this.adminMetrics) {
            return;
        }

        try {
            const workbook = XLSX.utils.book_new();

            // Summary Statistics Sheet
            const summaryData = [
                ['Admin Metrics Report'],
                [`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`],
                [],
                ['Metric', 'Value'],
                ['Total Users', (this.adminMetrics.userCounts?.volunteers ?? this.adminMetrics.totalVolunteers ?? 0) +
                    (this.adminMetrics.userCounts?.organizers ?? this.adminMetrics.totalOrganizers ?? 0) +
                    (this.adminMetrics.userCounts?.admins ?? this.adminMetrics.totalAdmins ?? 0)],
                ['Total Volunteers', this.adminMetrics.userCounts?.volunteers ?? this.adminMetrics.totalVolunteers ?? 0],
                ['Total Organizers', this.adminMetrics.userCounts?.organizers ?? this.adminMetrics.totalOrganizers ?? 0],
                ['Total Admins', this.adminMetrics.userCounts?.admins ?? this.adminMetrics.totalAdmins ?? 0],
                ['Total Organizations', this.adminMetrics.organizationCounts?.total ?? this.adminMetrics.totalOrganizations ?? 0],
                ['Pending Organizations', this.adminMetrics.organizationCounts?.pending ?? this.adminMetrics.pendingOrganizations ?? 0],
                ['Total Events', this.adminMetrics.eventCounts?.total ?? this.adminMetrics.totalEvents ?? 0],
                ['Completed Events', this.adminMetrics.eventCounts?.completed ?? this.adminMetrics.totalCompletedEvents ?? 0],
                ['Total Volunteer Hours', this.adminMetrics.totalVolunteerHours],
                ['New Users (Last 30 Days)', this.adminMetrics.newUsersLast30Days],
                ['New Organizations (Last 30 Days)', this.adminMetrics.newOrganizationsLast30Days]
            ];
            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

            // Active Users Sheet
            const activeUsersData = [
                ['Timeframe', 'Active Users', 'Percentage'],
                ['Last 7 Days', this.getActiveUserCount(7), this.getActiveUserPercentage(7)],
                ['Last 30 Days', this.getActiveUserCount(30), this.getActiveUserPercentage(30)],
                ['Last 90 Days', this.getActiveUserCount(90), this.getActiveUserPercentage(90)],
                ['Last Year', this.getActiveUserCount(365), this.getActiveUserPercentage(365)]
            ];
            const activeUsersSheet = XLSX.utils.aoa_to_sheet(activeUsersData);
            XLSX.utils.book_append_sheet(workbook, activeUsersSheet, 'Active Users');

            // Monthly Usage Sheet
            if (this.adminMetrics.usageByMonth && this.adminMetrics.usageByMonth.length > 0) {
                const filteredMonths = this.getFilteredAdminMonths(this.adminMetrics.usageByMonth);
                const monthlyData: (string | number)[][] = [['Month', 'New Users', 'New Organizations', 'New Events', 'Volunteer Hours']];
                filteredMonths.forEach(month => {
                    const monthValue = month.month || (month as any).yearMonth;
                    if (monthValue) {
                        const [year, monthNum] = monthValue.split('-');
                        const date = new Date(parseInt(year), parseInt(monthNum) - 1);
                        const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                        monthlyData.push([
                            monthName,
                            month.newUsers ?? (month as any).new_users ?? 0,
                            month.newOrganizations ?? (month as any).new_organizations ?? 0,
                            month.newEvents ?? (month as any).eventsCreated ?? (month as any).events_created ?? 0,
                            month.volunteerHours ?? (month as any).volunteer_hours ?? 0
                        ]);
                    }
                });
                const monthlySheet = XLSX.utils.aoa_to_sheet(monthlyData);
                XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Monthly History');
            }

            // Save the Excel file
            const fileName = `admin-metrics-${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, fileName);
        } catch (error) {
            console.error('Error generating Excel file:', error);
            this.error = 'Failed to generate Excel file. Please try again.';
        }
    }

    // Tag Management Methods

    /**
     * Loads all tags from the API.
     */
    loadTags(): void {
        this.volunteerService.getAllTags().subscribe({
            next: (tags) => {
                this.tags = tags;
                this.applyTagFilters();
            },
            error: (error) => {
                this.error = 'Failed to load tags';
                console.error('Error loading tags:', error);
            }
        });
    }

    /**
     * Applies search filters to the tags list.
     */
    applyTagFilters(): void {
        let result = [...this.tags];
        const term = this.tagSearchTerm.trim().toLowerCase();
        if (term) {
            result = result.filter(tag =>
                tag.name.toLowerCase().includes(term) ||
                tag.tagId.toString().includes(term)
            );
        }
        this.filteredTags = this.sortTags(result);
        this.tagCurrentPage = 1;
        this.updateTagPagination();
    }

    /**
     * Sorts tags by the current sort column and direction.
     */
    sortTags(tags: Tag[]): Tag[] {
        const sorted = [...tags];
        sorted.sort((a, b) => {
            let aValue = '';
            let bValue = '';
            switch (this.tagSortColumn) {
                case 'name':
                    aValue = a.name.toLowerCase();
                    bValue = b.name.toLowerCase();
                    break;
                case 'id':
                    aValue = a.tagId.toString();
                    bValue = b.tagId.toString();
                    break;
            }
            if (aValue < bValue) return this.tagSortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.tagSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }

    setTagSort(column: 'name' | 'id'): void {
        if (this.tagSortColumn === column) {
            this.tagSortDirection = this.tagSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.tagSortColumn = column;
            this.tagSortDirection = 'asc';
        }
        this.filteredTags = this.sortTags(this.filteredTags);
        this.updateTagPagination();
    }

    getTagSortIcon(column: 'name' | 'id'): string {
        if (this.tagSortColumn !== column) return 'bi-arrow-down-up';
        return this.tagSortDirection === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
    }

    updateTagPagination(): void {
        const start = (this.tagCurrentPage - 1) * this.tagPageSize;
        this.paginatedTags = this.filteredTags.slice(start, start + this.tagPageSize);
    }

    get totalTagPages(): number {
        return Math.ceil(this.filteredTags.length / this.tagPageSize);
    }

    goToTagPage(page: number): void {
        if (page >= 1 && page <= this.totalTagPages) {
            this.tagCurrentPage = page;
            this.updateTagPagination();
        }
    }

    /**
     * Opens the create tag modal.
     */
    openCreateTagModal(): void {
        this.newTagName = '';
        this.showEditTagModal = true;
        this.editingTag = null;
    }

    /**
     * Opens the edit tag modal.
     */
    openEditTagModal(tag: Tag): void {
        this.editingTag = { ...tag };
        this.newTagName = tag.name;
        this.showEditTagModal = true;
    }

    /**
     * Closes the edit tag modal.
     */
    closeEditTagModal(): void {
        this.showEditTagModal = false;
        this.editingTag = null;
        this.newTagName = '';
    }

    /**
     * Creates a new tag.
     */
    createTag(): void {
        if (!this.newTagName.trim()) {
            this.error = 'Tag name is required';
            return;
        }

        const trimmedName = this.newTagName.trim();
        if (trimmedName.length < 1 || trimmedName.length > 50) {
            this.error = 'Tag name must be between 1 and 50 characters';
            return;
        }

        this.isCreatingTag = true;
        this.error = '';
        this.success = '';

        this.volunteerService.createTag(trimmedName).subscribe({
            next: () => {
                this.success = 'Tag created successfully';
                this.closeEditTagModal();
                this.loadTags();
                this.isCreatingTag = false;
            },
            error: (error) => {
                this.isCreatingTag = false;
                if (error.error?.message) {
                    this.error = error.error.message;
                } else if (error.error?.errors?.name) {
                    this.error = error.error.errors.name[0];
                } else {
                    this.error = 'Failed to create tag. Please try again.';
                }
                console.error('Error creating tag:', error);
            }
        });
    }

    /**
     * Updates an existing tag.
     */
    updateTag(): void {
        if (!this.editingTag || !this.newTagName.trim()) {
            this.error = 'Tag name is required';
            return;
        }

        const trimmedName = this.newTagName.trim();
        if (trimmedName.length < 1 || trimmedName.length > 50) {
            this.error = 'Tag name must be between 1 and 50 characters';
            return;
        }

        this.isUpdatingTag = true;
        this.error = '';
        this.success = '';

        this.volunteerService.updateTag(this.editingTag.tagId, trimmedName).subscribe({
            next: () => {
                this.success = 'Tag updated successfully';
                this.closeEditTagModal();
                this.loadTags();
                this.isUpdatingTag = false;
            },
            error: (error) => {
                this.isUpdatingTag = false;
                if (error.error?.message) {
                    this.error = error.error.message;
                } else if (error.error?.errors?.name) {
                    this.error = error.error.errors.name[0];
                } else if (error.status === 404) {
                    this.error = 'Tag not found';
                } else {
                    this.error = 'Failed to update tag. Please try again.';
                }
                console.error('Error updating tag:', error);
            }
        });
    }

    /**
     * Confirms deletion of a tag.
     */
    confirmDeleteTag(tag: Tag): void {
        this.selectedTag = tag;
        this.showDeleteTagConfirmation = true;
    }

    /**
     * Cancels tag deletion.
     */
    cancelDeleteTag(): void {
        this.selectedTag = null;
        this.showDeleteTagConfirmation = false;
    }

    /**
     * Deletes a tag.
     */
    deleteTag(): void {
        if (!this.selectedTag) {
            return;
        }

        this.isDeletingTag = true;
        this.error = '';
        this.success = '';

        this.volunteerService.deleteTag(this.selectedTag.tagId).subscribe({
            next: () => {
                this.success = 'Tag deleted successfully';
                this.cancelDeleteTag();
                this.loadTags();
                this.isDeletingTag = false;
            },
            error: (error) => {
                this.isDeletingTag = false;
                if (error.status === 404) {
                    this.error = 'Tag not found';
                } else if (error.status === 403) {
                    this.error = 'You do not have permission to delete tags';
                } else {
                    this.error = 'Failed to delete tag. Please try again.';
                }
                console.error('Error deleting tag:', error);
            }
        });
    }

    /**
     * Manually triggers the two-step email notification process.
     * Step 1: Generates reminder notifications for upcoming events
     * Step 2: Processes and sends pending email notifications
     * Admin-only action.
     */
    processPendingEmails(): void {
        if (this.isProcessingEmails) {
            return; // Prevent duplicate requests
        }

        this.isProcessingEmails = true;
        this.error = '';
        this.success = '';

        // Step 1: Generate reminder notifications
        this.volunteerService.generateReminderNotifications().subscribe({
            next: (generateResponse) => {
                console.log('Reminder notifications generated:', generateResponse);
                
                // Step 2: Process and send pending email notifications
                this.volunteerService.processPendingEmailNotifications().subscribe({
                    next: (processResponse) => {
                        this.isProcessingEmails = false;
                        const { sent, failed, total } = processResponse;
                        
                        if (total === 0) {
                            this.success = 'Reminders generated. No pending email notifications to send.';
                        } else if (failed === 0) {
                            this.success = `Successfully processed ${total} email notification${total === 1 ? '' : 's'}: ${sent} sent.`;
                        } else {
                            this.success = `Processed ${total} email notification${total === 1 ? '' : 's'}: ${sent} sent, ${failed} failed.`;
                        }
                    },
                    error: (error) => {
                        this.isProcessingEmails = false;
                        
                        if (error.status === 403) {
                            this.error = 'Only administrators can process pending notifications.';
                        } else if (error.status === 500) {
                            this.error = 'Reminders generated, but there was an error sending email notifications. Please try again.';
                        } else {
                            this.error = error.error?.message || 'Reminders generated, but failed to send email notifications. Please try again.';
                        }
                        
                        console.error('Error processing pending emails:', error);
                    }
                });
            },
            error: (error) => {
                this.isProcessingEmails = false;
                
                if (error.status === 403) {
                    this.error = 'Only administrators can generate reminder notifications.';
                } else if (error.status === 500) {
                    this.error = 'There was an error generating reminder notifications. Please try again.';
                } else {
                    this.error = error.error?.message || 'Failed to generate reminder notifications. Please try again.';
                }
                
                console.error('Error generating reminder notifications:', error);
            }
        });
    }
} 