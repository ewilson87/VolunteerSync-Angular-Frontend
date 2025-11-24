import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { VolunteerService } from '../../services/volunteer-service.service';
import { User } from '../../models/user.model';
import { Organization } from '../../models/organization.model';
import { InputValidationService } from '../../services/input-validation.service';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './register.component.html',
    styleUrl: './register.component.css'
})
export class RegisterComponent implements OnInit {
    // Use a separate object for the form to not mix with the final user object
    formData = {
        firstName: '',
        lastName: '',
        email: '',
        password: '', // Use proper name for input
        confirmPassword: '',
        role: 'volunteer',
        organizationId: 0 // Added to store organizationId for organizers
    };

    selectedRole: 'volunteer' | 'organizer' | null = null;

    // Organization data for organizers
    orgData: Organization = {
        name: '',
        description: '',
        contactEmail: '',
        contactPhone: '',
        website: ''
    };

    successMessage: string = '';
    errorMessage: string = '';
    returnUrl: string = '';
    isSubmitting: boolean = false;

    constructor(
        private volunteerService: VolunteerService,
        private router: Router,
        private route: ActivatedRoute,
        private inputValidation: InputValidationService
    ) {
        this.route.queryParams.subscribe(params => {
            this.returnUrl = params['returnUrl'] || '/';

            const roleParam = params['role'];
            if (roleParam === 'volunteer' || roleParam === 'organizer') {
                this.selectRole(roleParam);
            }
        });
    }

    /**
     * Initializes the component and scrolls to the top of the page.
     */
    ngOnInit(): void {
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'auto' });
        }
    }

    /**
     * Handles user registration submission.
     * Validates and sanitizes all input fields, then submits the registration.
     */
    onRegister(): void {
        this.errorMessage = '';
        this.successMessage = '';

        if (!this.selectedRole) {
            this.errorMessage = 'Please choose whether you are registering as a volunteer or organizer.';
            return;
        }

        // Validate and sanitize first name
        const firstNameValidation = this.inputValidation.validateName(this.formData.firstName, 'First name');
        if (!firstNameValidation.isValid) {
            this.errorMessage = firstNameValidation.error || 'Invalid first name';
            return;
        }
        this.formData.firstName = firstNameValidation.sanitized;

        // Validate and sanitize last name
        const lastNameValidation = this.inputValidation.validateName(this.formData.lastName, 'Last name');
        if (!lastNameValidation.isValid) {
            this.errorMessage = lastNameValidation.error || 'Invalid last name';
            return;
        }
        this.formData.lastName = lastNameValidation.sanitized;

        // Validate and sanitize email
        const emailValidation = this.inputValidation.validateEmail(this.formData.email);
        if (!emailValidation.isValid) {
            this.errorMessage = emailValidation.error || 'Invalid email';
            return;
        }
        this.formData.email = emailValidation.sanitized;

        // Validate password (only length - complexity is validated by backend)
        const passwordValidation = this.inputValidation.validatePassword(this.formData.password);
        if (!passwordValidation.isValid) {
            this.errorMessage = passwordValidation.error || 'Invalid password';
            return;
        }
        // Use sanitized password (removes control characters but preserves all valid password characters)
        this.formData.password = passwordValidation.sanitized;

        // Also sanitize confirm password for comparison
        const confirmPasswordValidation = this.inputValidation.validatePassword(this.formData.confirmPassword);
        if (!confirmPasswordValidation.isValid) {
            this.errorMessage = 'Confirm password is invalid';
            return;
        }
        this.formData.confirmPassword = confirmPasswordValidation.sanitized;

        if (this.formData.password !== this.formData.confirmPassword) {
            this.errorMessage = 'Passwords do not match';
            return;
        }

        // Additional validation for organizers
        if (this.formData.role === 'organizer') {
            // Validate organization name
            const orgNameValidation = this.inputValidation.validateTextField(
                this.orgData.name,
                this.inputValidation.MAX_LENGTHS.organizationName,
                'Organization name'
            );
            if (!orgNameValidation.isValid) {
                this.errorMessage = orgNameValidation.error || 'Invalid organization name';
                return;
            }
            this.orgData.name = orgNameValidation.sanitized;

            // Validate organization description
            const orgDescValidation = this.inputValidation.validateTextField(
                this.orgData.description,
                this.inputValidation.MAX_LENGTHS.organizationDescription,
                'Organization description'
            );
            if (!orgDescValidation.isValid) {
                this.errorMessage = orgDescValidation.error || 'Invalid organization description';
                return;
            }
            this.orgData.description = orgDescValidation.sanitized;

            // Validate contact email
            const orgEmailValidation = this.inputValidation.validateEmail(this.orgData.contactEmail);
            if (!orgEmailValidation.isValid) {
                this.errorMessage = 'Organization contact email: ' + (orgEmailValidation.error || 'Invalid email');
                return;
            }
            this.orgData.contactEmail = orgEmailValidation.sanitized;

            // Validate contact phone
            const phoneValidation = this.inputValidation.validatePhone(this.orgData.contactPhone);
            if (!phoneValidation.isValid) {
                this.errorMessage = 'Organization contact phone: ' + (phoneValidation.error || 'Invalid phone number');
                return;
            }
            this.orgData.contactPhone = phoneValidation.sanitized;

            // Validate website if provided
            if (this.orgData.website && this.orgData.website.trim()) {
                const websiteValidation = this.inputValidation.validateUrl(this.orgData.website);
                if (!websiteValidation.isValid) {
                    this.errorMessage = 'Organization website: ' + (websiteValidation.error || 'Invalid URL');
                    return;
                }
                this.orgData.website = websiteValidation.sanitized;
            }
        }

        this.isSubmitting = true;
        console.log('Starting registration process...');

        // If user is an organizer, create the organization first
        if (this.formData.role === 'organizer') {
            console.log('Registering an organizer - creating organization first');
            this.createOrganizationThenUser();
        } else {
            console.log('Registering a volunteer - creating user directly');
            this.createUser();
        }
    }

    selectRole(role: 'volunteer' | 'organizer'): void {
        this.selectedRole = role;
        this.formData.role = role;
    }

    /**
     * Creates an organization first, then creates the user account linked to it.
     * Used for organizer registration flow.
     */
    private createOrganizationThenUser(): void {
        this.volunteerService.createOrganization(this.orgData).subscribe({
            next: (orgResponse) => {
                let organizationId: number | undefined;

                if (orgResponse.organizationId) {
                    organizationId = orgResponse.organizationId;
                } else if (orgResponse.insertId) {
                    organizationId = orgResponse.insertId;
                }

                if (organizationId) {
                    this.formData.organizationId = organizationId;
                    this.createUser();
                } else {
                    this.findOrganizationByName();
                }
            },
            error: (error) => {
                this.errorMessage = 'Failed to create organization. Please try again.';
                this.isSubmitting = false;
            }
        });
    }

    /**
     * Looks up an organization by name as a fallback if the organization ID
     * wasn't returned in the creation response.
     */
    private findOrganizationByName(): void {
        this.volunteerService.findOrganizationByName(this.orgData.name).subscribe({
            next: (orgs) => {
                if (orgs && orgs.length > 0) {
                    const foundOrg = orgs[0];

                    if (foundOrg && foundOrg.organizationId) {
                        this.formData.organizationId = foundOrg.organizationId;
                        this.createUser();
                    } else {
                        this.createUser();
                    }
                } else {
                    this.createUser();
                }
            },
            error: (error) => {
                this.createUser();
            }
        });
    }

    /**
     * Creates the user account with the registration data.
     * For organizers, includes the organizationId if available.
     */
    private createUser(): void {
        const userToRegister: any = {
            firstName: this.formData.firstName,
            lastName: this.formData.lastName,
            email: this.formData.email,
            passwordHash: this.formData.password,
            role: this.formData.role
        };

        if (this.formData.role === 'organizer' && this.formData.organizationId > 0) {
            userToRegister.organizationId = this.formData.organizationId;
        }

        this.volunteerService.registerUser(userToRegister).subscribe({
            next: (userResponse) => {

                // If this was an organizer and we just created an organization,
                // but the user doesn't have the organizationId set in the response,
                // we should update the user to ensure the link is established
                if (this.formData.role === 'organizer' &&
                    this.formData.organizationId > 0 &&
                    userResponse &&
                    userResponse.userId &&
                    (!userResponse.organizationId || userResponse.organizationId !== this.formData.organizationId)) {

                    console.log('User needs organizationId update. Using new updateUserOrganization method...');

                    // Use the dedicated method for updating just the organizationId
                    this.volunteerService.updateUserOrganization(
                        userResponse.userId,
                        this.formData.organizationId
                    ).subscribe({
                        next: (updatedResponse) => {
                            console.log('User updated with organizationId:', updatedResponse);
                            this.handleSuccessfulRegistration();
                        },
                        error: (updateError) => {
                            console.error('Failed to update user with organizationId', updateError);
                            // Still consider the registration successful, just log the error
                            this.handleSuccessfulRegistration();
                        }
                    });
                } else {
                    this.handleSuccessfulRegistration();
                }
            },
            error: (error) => {
                console.error('Registration failed', error);
                console.error('Error status:', error.status);
                console.error('Error statusText:', error.statusText);
                console.error('Error message:', error.message);
                console.error('Error error object:', JSON.stringify(error.error, null, 2));
                
                // Try to extract error message from various possible formats
                let errorMsg = 'Registration failed. Please try again.';
                
                if (error?.error) {
                    // Check for message property
                    if (error.error.message) {
                        errorMsg = error.error.message;
                        console.log('Extracted error message from error.error.message:', errorMsg);
                    }
                    // Check if error is a string
                    else if (typeof error.error === 'string') {
                        errorMsg = error.error;
                        console.log('Extracted error message from error.error (string):', errorMsg);
                    }
                    // Check for error property
                    else if (error.error.error) {
                        errorMsg = error.error.error;
                        console.log('Extracted error message from error.error.error:', errorMsg);
                    }
                    // Check for nested error object
                    else if (error.error.error && typeof error.error.error === 'string') {
                        errorMsg = error.error.error;
                        console.log('Extracted error message from nested error.error.error:', errorMsg);
                    }
                    // Log the full error object structure for debugging
                    else {
                        console.log('Could not extract error message. Full error.error structure:', error.error);
                    }
                }
                
                console.log('Final error message to display:', errorMsg);
                this.errorMessage = errorMsg;
                this.isSubmitting = false;
            }
        });
    }

    private handleSuccessfulRegistration(): void {
        this.successMessage = 'Registration successful! You can now log in.';
        this.isSubmitting = false;

        // Redirect to login page after a delay
        setTimeout(() => {
            this.router.navigate(['/login'], { queryParams: { returnUrl: this.returnUrl } });
        }, 2000);
    }
} 