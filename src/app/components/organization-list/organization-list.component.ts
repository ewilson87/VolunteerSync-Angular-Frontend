import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { VolunteerService } from '../../services/volunteer-service.service';
import { Organization } from '../../models/organization.model';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';

@Component({
    selector: 'app-organization-list',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './organization-list.component.html',
    styleUrl: './organization-list.component.css'
})
export class OrganizationListComponent implements OnInit {
    private allOrganizations: Organization[] = [];
    filteredOrganizations: Organization[] = [];
    paginatedOrganizations: Organization[] = [];

    loading = true;
    error = '';

    searchTerm = '';
    hasWebsiteOnly = false;
    approvalStatusFilter: 'approved' | 'pending' | 'rejected' | 'all' = 'approved';

    sortColumn: 'name' | 'website' = 'name';
    sortDirection: 'asc' | 'desc' = 'asc';

    pageSizeOptions: number[] = [10, 25, 50, 100];
    pageSize = 10;
    currentPage = 1;

    // Authentication and follow properties
    isLoggedIn: boolean = false;
    currentUser: User | null = null;
    organizationFollowStatus: Map<number, boolean> = new Map();
    togglingFollow: Set<number> = new Set();
    checkingFollow: Set<number> = new Set();

    constructor(
        private volunteerService: VolunteerService,
        private authService: AuthService
    ) { }

    /**
     * Initializes the component and loads organizations.
     */
    ngOnInit(): void {
        // Set up authentication subscriptions
        this.authService.isLoggedIn.subscribe(loggedIn => {
            this.isLoggedIn = loggedIn;
        });

        this.authService.currentUser.subscribe(user => {
            this.currentUser = user;
        });

        this.loadOrganizations();
    }

    /**
     * Calculates the total number of pages based on filtered results and page size.
     */
    get totalPages(): number {
        return this.filteredOrganizations.length === 0 ? 1 : Math.ceil(this.filteredOrganizations.length / this.pageSize);
    }

    /**
     * Generates an array of page numbers for pagination.
     */
    get pageNumbers(): number[] {
        return Array.from({ length: this.totalPages }, (_, index) => index + 1);
    }

    /**
     * Loads all organizations from the API.
     */
    loadOrganizations(): void {
        this.loading = true;
        this.volunteerService.getOrganizations().subscribe({
            next: (organizations) => {
                this.allOrganizations = organizations ?? [];
                this.applyFilters();
                this.loading = false;
                // Check follow status for all organizations if user is logged in
                if (this.isLoggedIn && this.currentUser) {
                    this.checkAllFollowStatuses();
                }
            },
            error: (error) => {
                this.error = 'Failed to load organizations. Please try again later.';
                this.loading = false;
            }
        });
    }

    /**
     * Checks follow status for all organizations.
     */
    checkAllFollowStatuses(): void {
        if (!this.isLoggedIn || !this.currentUser) {
            return;
        }

        this.allOrganizations.forEach(org => {
            if (org.organizationId) {
                this.checkFollowStatus(org.organizationId);
            }
        });
    }

    /**
     * Checks if the current user follows an organization.
     * 
     * @param organizationId - The ID of the organization
     */
    checkFollowStatus(organizationId: number): void {
        if (!this.isLoggedIn || !this.currentUser || !this.currentUser.userId || this.checkingFollow.has(organizationId)) {
            return;
        }

        const userId = this.currentUser.userId;
        this.checkingFollow.add(organizationId);
        this.volunteerService.checkUserFollowsOrganization(userId, organizationId).subscribe({
            next: (status) => {
                this.organizationFollowStatus.set(organizationId, status.isFollowing);
                this.checkingFollow.delete(organizationId);
            },
            error: (error) => {
                // Silently handle 404 errors (endpoint may not be implemented yet)
                if (error.status !== 404) {
                    console.error('Error checking follow status', error);
                }
                this.organizationFollowStatus.set(organizationId, false);
                this.checkingFollow.delete(organizationId);
            }
        });
    }

    /**
     * Checks if a user follows an organization.
     * 
     * @param organizationId - The ID of the organization
     * @returns True if the user follows the organization
     */
    isFollowingOrganization(organizationId: number): boolean {
        return this.organizationFollowStatus.get(organizationId) ?? false;
    }

    /**
     * Toggles follow status for an organization.
     * 
     * @param organizationId - The ID of the organization
     */
    toggleFollowOrganization(organizationId: number): void {
        if (!this.isLoggedIn || !this.currentUser || !this.currentUser.userId || this.togglingFollow.has(organizationId)) {
            return;
        }

        const userId = this.currentUser.userId;
        this.togglingFollow.add(organizationId);
        const isFollowing = this.isFollowingOrganization(organizationId);

        if (isFollowing) {
            // Unfollow
            this.volunteerService.unfollowOrganization(userId, organizationId).subscribe({
                next: () => {
                    this.organizationFollowStatus.set(organizationId, false);
                    this.togglingFollow.delete(organizationId);
                },
                error: (error) => {
                    // Only log non-404 errors (404 means endpoint not implemented)
                    if (error.status !== 404) {
                        console.error('Error unfollowing organization', error);
                    } else {
                        console.warn('Unfollow organization endpoint not available (404). Backend may need to implement this feature.');
                    }
                    this.togglingFollow.delete(organizationId);
                }
            });
        } else {
            // Follow
            this.volunteerService.followOrganization(userId, organizationId).subscribe({
                next: () => {
                    this.organizationFollowStatus.set(organizationId, true);
                    this.togglingFollow.delete(organizationId);
                },
                error: (error) => {
                    // Only log non-404 errors (404 means endpoint not implemented)
                    if (error.status !== 404) {
                        console.error('Error following organization', error);
                    } else {
                        console.warn('Follow organization endpoint not available (404). Backend may need to implement this feature.');
                    }
                    this.togglingFollow.delete(organizationId);
                }
            });
        }
    }

    /**
     * Applies search, website, and approval status filters to the organizations list.
     */
    applyFilters(): void {
        let result = [...this.allOrganizations];

        if (this.searchTerm.trim()) {
            const search = this.searchTerm.trim().toLowerCase();
            result = result.filter(org =>
                org.name?.toLowerCase().includes(search) ||
                org.description?.toLowerCase().includes(search)
            );
        }

        if (this.hasWebsiteOnly) {
            result = result.filter(org => !!org.website && org.website.trim().length > 0);
        }

        if (this.approvalStatusFilter !== 'all') {
            result = result.filter(org => (org.approvalStatus || '').toLowerCase() === this.approvalStatusFilter);
        }

        this.filteredOrganizations = this.sortOrganizations(result);
        this.currentPage = 1;
        this.updateDisplayedOrganizations();
    }

    /**
     * Clears all filters and resets to show all approved organizations.
     */
    clearFilters(): void {
        this.searchTerm = '';
        this.hasWebsiteOnly = false;
        this.approvalStatusFilter = 'approved';
        this.filteredOrganizations = this.sortOrganizations(this.allOrganizations);
        this.currentPage = 1;
        this.updateDisplayedOrganizations();
    }

    /**
     * Sets the sort column and toggles direction if the same column is clicked.
     * 
     * @param column - The column to sort by
     */
    setSort(column: 'name' | 'website'): void {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        this.filteredOrganizations = this.sortOrganizations(this.filteredOrganizations);
        if (this.currentPage > this.totalPages) {
            this.currentPage = this.totalPages;
        }
        this.updateDisplayedOrganizations();
    }

    /**
     * Gets the sort icon class for a column.
     * 
     * @param column - The column to get the icon for
     * @returns The Bootstrap icon class name
     */
    getSortIcon(column: 'name' | 'website'): string {
        if (this.sortColumn !== column) {
            return 'bi-arrow-down-up';
        }
        return this.sortDirection === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
    }

    /**
     * Changes the page size and resets to the first page.
     * 
     * @param size - The new page size
     */
    changePageSize(size: number): void {
        this.pageSize = size;
        this.currentPage = 1;
        this.updateDisplayedOrganizations();
    }

    /**
     * Navigates to a specific page number.
     * 
     * @param page - The page number to navigate to
     */
    goToPage(page: number): void {
        if (page < 1 || page > this.totalPages) {
            return;
        }
        this.currentPage = page;
        this.updateDisplayedOrganizations();
    }

    /**
     * Navigates to the previous page.
     */
    previousPage(): void {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updateDisplayedOrganizations();
        }
    }

    /**
     * Navigates to the next page.
     */
    nextPage(): void {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.updateDisplayedOrganizations();
        }
    }

    /**
     * TrackBy function for ngFor to optimize rendering.
     * 
     * @param index - The index in the array
     * @param organization - The organization object
     * @returns The organization ID or index
     */
    trackByOrganizationId(index: number, organization: Organization): number | undefined {
        return organization.organizationId ?? index;
    }

    private sortOrganizations(list: Organization[]): Organization[] {
        return [...list].sort((a, b) => {
            let aValue = '';
            let bValue = '';

            switch (this.sortColumn) {
                case 'name':
                    aValue = a.name?.toLowerCase() || '';
                    bValue = b.name?.toLowerCase() || '';
                    break;
                case 'website':
                    aValue = a.website?.toLowerCase() || '';
                    bValue = b.website?.toLowerCase() || '';
                    break;
            }

            if (aValue < bValue) {
                return this.sortDirection === 'asc' ? -1 : 1;
            }
            if (aValue > bValue) {
                return this.sortDirection === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }

    private updateDisplayedOrganizations(): void {
        if (this.filteredOrganizations.length === 0) {
            this.paginatedOrganizations = [];
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
        this.paginatedOrganizations = this.filteredOrganizations.slice(startIndex, startIndex + this.pageSize);
    }
} 