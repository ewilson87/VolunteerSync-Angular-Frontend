export interface Attendance {
    attendanceId?: number;
    signupId: number;
    markedBy?: number;
    markedAt?: string;
    hours?: number | null;
    status: 'completed' | 'no_show' | 'excused';
}

export interface Signup {
    signupId?: number;
    userId: number;
    eventId: number;
    signupDate?: string;
    status?: string;
    attendance?: Attendance | null;
} 