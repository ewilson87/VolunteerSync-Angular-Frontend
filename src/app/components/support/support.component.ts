import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { VolunteerService } from '../../services/volunteer-service.service';
import { AuthService } from '../../services/auth.service';
import { InputValidationService } from '../../services/input-validation.service';

interface ContactForm {
  name: string;
  email: string;
  subject: string;
  message: string;
}

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './support.component.html',
  styleUrls: ['./support.component.css']
})
export class SupportComponent {
  submitted = false;
  lastSubmittedEmail = '';
  errorMessage = '';
  isSubmitting = false;

  contactForm: ContactForm = {
    name: '',
    email: '',
    subject: '',
    message: ''
  };

  constructor(
    private volunteerService: VolunteerService,
    private authService: AuthService,
    private inputValidation: InputValidationService
  ) { }

  /**
   * Handles support form submission.
   * Validates and sanitizes all input fields, then submits the support message to the API.
   */
  onSubmit(): void {
    this.errorMessage = '';
    this.isSubmitting = true;

    const nameValidation = this.inputValidation.validateName(this.contactForm.name, 'Name');
    if (!nameValidation.isValid) {
      this.errorMessage = nameValidation.error || 'Invalid name';
      this.isSubmitting = false;
      return;
    }
    const sanitizedName = nameValidation.sanitized;

    const emailValidation = this.inputValidation.validateEmail(this.contactForm.email);
    if (!emailValidation.isValid) {
      this.errorMessage = emailValidation.error || 'Invalid email';
      this.isSubmitting = false;
      return;
    }
    const sanitizedEmail = emailValidation.sanitized;

    const subjectValidation = this.inputValidation.validateTextField(
      this.contactForm.subject,
      this.inputValidation.MAX_LENGTHS.subject,
      'Subject'
    );
    if (!subjectValidation.isValid) {
      this.errorMessage = subjectValidation.error || 'Invalid subject';
      this.isSubmitting = false;
      return;
    }
    const sanitizedSubject = subjectValidation.sanitized;

    const messageValidation = this.inputValidation.validateTextField(
      this.contactForm.message,
      this.inputValidation.MAX_LENGTHS.message,
      'Message'
    );
    if (!messageValidation.isValid) {
      this.errorMessage = messageValidation.error || 'Invalid message';
      this.isSubmitting = false;
      return;
    }
    const sanitizedMessage = messageValidation.sanitized;

    const currentUser = this.authService.currentUserValue;
    const userId = currentUser?.userId || null;

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

    this.volunteerService.createSupportMessage(supportMessage).subscribe({
      next: (response) => {
        this.submitted = true;
        this.lastSubmittedEmail = sanitizedEmail;
        this.isSubmitting = false;

        this.contactForm = {
          name: '',
          email: '',
          subject: '',
          message: ''
        };
      },
      error: (error) => {
        this.errorMessage = 'Failed to send message. Please try again later.';
        this.isSubmitting = false;
      }
    });
  }
}
