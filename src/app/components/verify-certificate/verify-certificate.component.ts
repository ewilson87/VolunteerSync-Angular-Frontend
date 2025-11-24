import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { VolunteerService } from '../../services/volunteer-service.service';

interface CertificateVerificationResult {
  certificateId: number;
  certificateUid: string;
  signupId: number;
  userId: number;
  eventId: number;
  issuedAt: string;
  signedBy: number;
  // Additional data from joins
  volunteerName?: string;
  volunteerEmail?: string;
  eventName?: string;
  eventDate?: string;
  eventTime?: string;
  hours?: number;
  organizationName?: string;
  attendanceStatus?: string;
}

@Component({
  selector: 'app-verify-certificate',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './verify-certificate.component.html',
  styleUrl: './verify-certificate.component.css'
})
export class VerifyCertificateComponent implements OnInit {
  codePart1: string = '';
  codePart2: string = '';
  isVerifying: boolean = false;
  verificationResult: CertificateVerificationResult | null = null;
  errorMessage: string = '';
  hasSearched: boolean = false;

  constructor(
    private volunteerService: VolunteerService,
    private route: ActivatedRoute
  ) { }

  /**
   * Initializes the component and checks for pre-filled verification code from query parameters.
   * If a code is provided, it will be parsed and auto-verified.
   */
  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const code = params['code'];
      if (code) {
        const match = code.match(/^VS-([A-Z0-9]{4})-([A-Z0-9]{4})$/i);
        if (match) {
          this.codePart1 = match[1].toUpperCase();
          this.codePart2 = match[2].toUpperCase();
          setTimeout(() => {
            this.onVerify();
          }, 500);
        }
      }
    });
  }

  /**
   * Handles input for the first part of the verification code (4 characters).
   * Automatically advances to the second input field when 4 characters are entered.
   * 
   * @param event - The input event from the form field
   */
  onPart1Input(event: any): void {
    let value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length > 4) {
      value = value.substring(0, 4);
    }
    this.codePart1 = value;
    
    if (value.length === 4) {
      const nextInput = event.target.parentElement?.querySelector('.verify-code-input-part2');
      if (nextInput) {
        nextInput.focus();
      }
    }
    
    this.clearError();
  }

  /**
   * Handles input for the second part of the verification code (4 characters).
   * 
   * @param event - The input event from the form field
   */
  onPart2Input(event: any): void {
    let value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length > 4) {
      value = value.substring(0, 4);
    }
    this.codePart2 = value;
    this.clearError();
  }

  /**
   * Clears the error message when the user starts typing.
   */
  clearError(): void {
    if (this.errorMessage && this.hasSearched) {
      this.errorMessage = '';
    }
  }

  /**
   * Validates and verifies the certificate using the entered code.
   * Makes an API call to verify the certificate and displays the results.
   */
  onVerify(): void {
    if (!this.codePart1 || this.codePart1.length !== 4) {
      this.errorMessage = 'Please enter the first 4 characters';
      return;
    }
    
    if (!this.codePart2 || this.codePart2.length !== 4) {
      this.errorMessage = 'Please enter the last 4 characters';
      return;
    }
    
    if (!/^[A-Z0-9]{4}$/.test(this.codePart1) || !/^[A-Z0-9]{4}$/.test(this.codePart2)) {
      this.errorMessage = 'Please enter valid alphanumeric characters';
      return;
    }
    
    const code = `VS-${this.codePart1}-${this.codePart2}`;

    this.isVerifying = true;
    this.errorMessage = '';
    this.verificationResult = null;
    this.hasSearched = true;

    this.volunteerService.verifyCertificate(code).subscribe({
      next: (result) => {
        this.verificationResult = this.mapVerificationResult(result);
        this.isVerifying = false;
      },
      error: (error) => {
        this.isVerifying = false;
        
        if (error.status === 404) {
          this.errorMessage = 'Certificate not found. Please check the verification code and try again.';
        } else if (error.status === 400) {
          this.errorMessage = error.error?.message || 'Invalid verification code.';
        } else {
          this.errorMessage = 'Unable to verify certificate. Please try again later.';
        }
      }
    });
  }

  /**
   * Resets the verification form and clears all entered data.
   */
  reset(): void {
    this.codePart1 = '';
    this.codePart2 = '';
    this.verificationResult = null;
    this.errorMessage = '';
    this.hasSearched = false;
  }

  /**
   * Maps the API response to the expected CertificateVerificationResult structure.
   * Handles different response formats (camelCase, snake_case, nested objects).
   * 
   * The API endpoint should return joined data from certificates, signups, users, 
   * events, organizations, and event_attendance tables.
   * 
   * @param result - The raw API response object
   * @returns Mapped certificate verification result with normalized field names
   */
  mapVerificationResult(result: any): CertificateVerificationResult {
    const mapped: CertificateVerificationResult = {
      certificateId: result.certificateId || result.certificate_id,
      certificateUid: result.certificateUid || result.certificate_uid,
      signupId: result.signupId || result.signup_id,
      userId: result.userId || result.user_id,
      eventId: result.eventId || result.event_id,
      issuedAt: result.issuedAt || result.issued_at,
      signedBy: result.signedBy || result.signed_by,
      // Handle nested user object or flat structure
      volunteerName: result.volunteerName || 
                     result.volunteer_name ||
                     (result.user ? `${result.user.firstName || result.user.first_name || ''} ${result.user.lastName || result.user.last_name || ''}`.trim() : undefined) ||
                     (result.firstName || result.first_name ? `${result.firstName || result.first_name} ${result.lastName || result.last_name}`.trim() : undefined),
      volunteerEmail: result.volunteerEmail || 
                      result.volunteer_email ||
                      result.user?.email ||
                      result.email,
      // Handle nested event object or flat structure
      eventName: result.eventName || 
                 result.event_name ||
                 result.event?.title ||
                 result.event?.name ||
                 result.title,
      eventDate: result.eventDate || 
                 result.event_date ||
                 result.event?.eventDate ||
                 result.event?.event_date,
      eventTime: result.eventTime || 
                 result.event_time ||
                 result.event?.eventTime ||
                 result.event?.event_time,
      // Handle nested organization object or flat structure
      organizationName: result.organizationName || 
                         result.organization_name ||
                         result.organization?.name ||
                         result.event?.organization?.name ||
                         result.event?.organizationName,
      // Handle nested attendance object or flat structure
      hours: result.hours || 
             result.attendance?.hours ||
             result.event_attendance?.hours,
      attendanceStatus: result.attendanceStatus || 
                        result.attendance_status ||
                        result.attendance?.status ||
                        result.event_attendance?.status
    };

    return mapped;
  }

  /**
   * Formats a date string into a human-readable format.
   * 
   * @param dateString - The date string to format
   * @returns Formatted date string (e.g., "November 15, 2025") or "N/A" if invalid
   */
  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  /**
   * Formats a date and optional time string into a human-readable format.
   * 
   * @param dateString - The date string to format
   * @param timeString - Optional time string to include
   * @returns Formatted date and time string (e.g., "November 15, 2025 at 10:00 AM") or "N/A" if invalid
   */
  formatDateTime(dateString: string | undefined, timeString?: string | undefined): string {
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
