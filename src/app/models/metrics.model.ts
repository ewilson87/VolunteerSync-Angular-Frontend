/**
 * Volunteer metrics summary interface.
 */
export interface VolunteerMetrics {
    totalEventsRegistered: number;
    totalEventsAttended: number;
    totalEventsNoShow: number;
    totalEventsExcused: number;
    totalHoursAttended: number;
    upcomingEventsCount: number;
    canceledByVolunteerCount: number;
    historyByMonth: MonthlyHistory[];
}

/**
 * Monthly history entry for volunteer metrics.
 * Note: API may return yearMonth instead of month
 */
export interface MonthlyHistory {
    month?: string; // YYYY-MM format (may be yearMonth from API)
    yearMonth?: string; // YYYY-MM format (API format)
    eventsAttended?: number; // May be events_attended from API
    events_attended?: number; // API format
    hoursAttended?: number; // May be hours_attended from API
    hours_attended?: number; // API format
}

/**
 * Organizer metrics summary interface.
 */
export interface OrganizerMetrics {
    totalEventsCreated: number;
    activeUpcomingEvents?: number; // May come as totalActiveUpcomingEvents from API
    totalActiveUpcomingEvents?: number; // API format
    totalVolunteersRegistered: number;
    totalVolunteerHoursDelivered: number;
    averageFillRate: number; // percentage
    attendanceRate: number; // percentage
    noShowRate: number; // percentage
    excusedRate: number; // percentage
    eventsByMonth: MonthlyEventMetrics[];
    topEventsByAttendance: TopEventMetrics[];
}

/**
 * Monthly event metrics for organizer.
 * Note: API may return yearMonth/eventsHeld instead of month/eventsCreated
 */
export interface MonthlyEventMetrics {
    month?: string; // YYYY-MM format (may be yearMonth from API)
    yearMonth?: string; // YYYY-MM format (API format)
    eventsCreated?: number; // May be eventsHeld from API
    eventsHeld?: number; // API format
    volunteerHours: number;
}

/**
 * Top event metrics by attendance.
 * API returns: title, registeredCount, attendedCount
 * Frontend expects: eventTitle, volunteersRegistered, volunteersAttended
 */
export interface TopEventMetrics {
    eventId?: number;
    event_id?: number;
    eventTitle?: string; // Mapped from API's 'title'
    event_title?: string;
    title?: string; // API format
    volunteersRegistered?: number; // Mapped from API's 'registeredCount'
    volunteers_registered?: number;
    registeredCount?: number; // API format
    volunteersAttended?: number; // Mapped from API's 'attendedCount'
    volunteers_attended?: number;
    attendedCount?: number; // API format
    fillRate?: number; // percentage
    fill_rate?: number;
    volunteerHours?: number;
    volunteer_hours?: number;
    date?: string; // Event date in YYYY-MM-DD format
}

/**
 * Admin metrics summary interface.
 * Note: API may return totalVolunteers, totalOrganizers, totalAdmins, totalOrganizations, pendingOrganizations, totalEvents, totalCompletedEvents
 * Frontend expects: userCounts.volunteers, userCounts.organizers, userCounts.admins, organizationCounts.total, organizationCounts.pending, eventCounts.total, eventCounts.completed
 */
export interface AdminMetrics {
    userCounts?: {
        volunteers: number;
        organizers: number;
        admins: number;
    };
    totalVolunteers?: number; // API format
    totalOrganizers?: number; // API format
    totalAdmins?: number; // API format
    organizationCounts?: {
        total: number;
        pending: number;
    };
    totalOrganizations?: number; // API format
    pendingOrganizations?: number; // API format
    eventCounts?: {
        total: number;
        completed: number;
    };
    totalEvents?: number; // API format
    totalCompletedEvents?: number; // API format
    totalVolunteerHours: number;
    newUsersLast30Days: number;
    newOrganizationsLast30Days: number;
    activeUsersLast7Days?: number;
    activeUsersLast30Days?: number;
    activeUsersLast90Days?: number;
    activeUsersLast365Days?: number;
    usageByMonth: MonthlyUsageMetrics[];
}

/**
 * Monthly usage metrics for admin.
 */
export interface MonthlyUsageMetrics {
    month: string; // YYYY-MM format
    newUsers: number;
    newOrganizations: number;
    newEvents: number;
    volunteerHours: number;
}

