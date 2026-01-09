import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { VolunteerService } from '../../services/volunteer-service.service';
import { AuthService } from '../../services/auth.service';
import { InputValidationService } from '../../services/input-validation.service';
import jsPDF from 'jspdf';

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

  /**
   * Downloads the Event Playbook as a PDF with templates and checklists
   * for planning successful volunteer events.
   */
  downloadEventPlaybook(): void {
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

      // Helper function to add a section header
      const addSectionHeader = (title: string): void => {
        checkPageBreak(15);
        yPosition += 5;
        doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.roundedRect(20, yPosition - 5, pageWidth - 40, 8, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(title, 24, yPosition + 2);
        yPosition += 10;
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      };

      // Helper function to add a subsection
      const addSubsection = (title: string): void => {
        checkPageBreak(10);
        yPosition += 3;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(title, 24, yPosition);
        yPosition += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      };

      // Helper function to add bullet points
      const addBulletPoint = (text: string, indent: number = 0): void => {
        checkPageBreak(7);
        const xPos = 24 + indent;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('•', xPos, yPosition);
        const lines = doc.splitTextToSize(text, pageWidth - 50 - indent);
        doc.text(lines, xPos + 4, yPosition);
        yPosition += lines.length * 5;
      };

      // Helper function to add a checklist item
      const addChecklistItem = (text: string, indent: number = 0): void => {
        checkPageBreak(7);
        const xPos = 24 + indent;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('☐', xPos, yPosition);
        const lines = doc.splitTextToSize(text, pageWidth - 50 - indent);
        doc.text(lines, xPos + 5, yPosition);
        yPosition += lines.length * 5;
      };

      // Helper function to add regular text
      const addText = (text: string): void => {
        checkPageBreak(7);
        const lines = doc.splitTextToSize(text, pageWidth - 48);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(lines, 24, yPosition);
        yPosition += lines.length * 5 + 2;
      };

      // Generate PDF content function
      const generatePDFContent = (logoLoaded: boolean = false, logoImg?: HTMLImageElement) => {
        // Cover Page
        // Header with background
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 0, pageWidth, 60, 'F');

        // Logo (if loaded)
        if (logoLoaded && logoImg) {
          try {
            const logoWidth = 80;
            const logoHeight = (logoImg.height * logoWidth) / logoImg.width;
            doc.addImage(logoImg, 'PNG', (pageWidth - logoWidth) / 2, 15, logoWidth, logoHeight);
          } catch (e) {
            console.warn('Error adding logo to PDF:', e);
          }
        } else {
          // Text-based header if logo doesn't load
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(20);
          doc.setFont('helvetica', 'bold');
          doc.text('VolunteerSync', pageWidth / 2, 35, { align: 'center' });
        }

        yPosition = logoLoaded && logoImg ? 90 : 75;

        // Title
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.setFontSize(28);
        doc.setFont('helvetica', 'bold');
        doc.text('Event Playbook', pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 8;

        // Subtitle
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('Templates & Checklists for Successful Volunteer Events', pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 15;

        // Introduction
        doc.setFontSize(10);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        addText('This playbook provides essential templates, checklists, and best practices to help you plan, execute, and follow up on successful volunteer events. Use these resources to ensure your events are well-organized, engaging, and impactful.');
        yPosition += 5;

        // Table of Contents
        addSectionHeader('Table of Contents');
        addBulletPoint('Pre-Event Planning Checklist', 0);
        addBulletPoint('Event Day Checklist', 0);
        addBulletPoint('Post-Event Checklist', 0);
        addBulletPoint('Event Planning Template', 0);
        addBulletPoint('Volunteer Communication Template', 0);
        addBulletPoint('Best Practices for Event Success', 0);
        addBulletPoint('Tips for Engaging Volunteers', 0);
        addBulletPoint('Safety & Risk Management', 0);

        // Page 2: Pre-Event Planning
        doc.addPage();
        yPosition = 20;
        addSectionHeader('Pre-Event Planning Checklist');
        addText('Complete these tasks 2-4 weeks before your event:');
        yPosition += 2;

        addChecklistItem('Define event goals and objectives');
        addChecklistItem('Set event date, time, and duration');
        addChecklistItem('Choose and secure event location');
        addChecklistItem('Determine volunteer capacity needed');
        addChecklistItem('Create event in VolunteerSync platform');
        addChecklistItem('Write clear, detailed event description');
        addChecklistItem('List required skills or qualifications');
        addChecklistItem('Set appropriate event capacity');
        addChecklistItem('Plan event activities and schedule');
        addChecklistItem('Identify necessary supplies and materials');
        addChecklistItem('Create supply list and budget');
        addChecklistItem('Secure funding or donations if needed');
        addChecklistItem('Recruit and assign event coordinators');
        addChecklistItem('Plan volunteer orientation/training if needed');
        addChecklistItem('Develop backup plan for weather/emergencies');
        addChecklistItem('Obtain necessary permits or permissions');
        addChecklistItem('Arrange for parking or transportation');
        addChecklistItem('Plan refreshments or meals if applicable');
        addChecklistItem('Prepare name tags or volunteer identification');
        addChecklistItem('Create sign-in/sign-out process');
        addChecklistItem('Set up event communication channels');
        addChecklistItem('Send initial volunteer invitations');

        // Page 3: Event Planning Template
        doc.addPage();
        yPosition = 20;
        addSectionHeader('Event Planning Template');
        addText('Use this template to organize your event details:');
        yPosition += 5;

        addSubsection('Event Information');
        addText('Event Title: _________________________________');
        yPosition += 4;
        addText('Date: ___________  Time: ___________  Duration: ___________');
        yPosition += 4;
        addText('Location: _________________________________');
        yPosition += 4;
        addText('Address: _________________________________');
        yPosition += 4;
        addText('Contact Person: ___________  Phone: ___________');
        yPosition += 5;

        addSubsection('Event Goals');
        addText('Primary Goal: _________________________________');
        yPosition += 4;
        addText('Expected Outcomes: _________________________________');
        yPosition += 4;
        addText('Success Metrics: _________________________________');
        yPosition += 5;

        addSubsection('Volunteer Needs');
        addText('Number of Volunteers Needed: ___________');
        yPosition += 4;
        addText('Required Skills: _________________________________');
        yPosition += 4;
        addText('Age Requirements: ___________');
        yPosition += 4;
        addText('Physical Requirements: _________________________________');
        yPosition += 5;

        addSubsection('Resources & Supplies');
        addText('Materials Needed: _________________________________');
        yPosition += 4;
        addText('Equipment Needed: _________________________________');
        yPosition += 4;
        addText('Budget: $___________');
        yPosition += 4;
        addText('Funding Source: _________________________________');

        // Page 4: Event Day Checklist
        doc.addPage();
        yPosition = 20;
        addSectionHeader('Event Day Checklist');
        addText('Complete these tasks on the day of your event:');
        yPosition += 2;

        addSubsection('Before Volunteers Arrive (1-2 hours early)');
        addChecklistItem('Arrive at event location early');
        addChecklistItem('Set up registration/sign-in area');
        addChecklistItem('Prepare name tags and materials');
        addChecklistItem('Set up workstations or activity areas');
        addChecklistItem('Test any equipment or technology');
        addChecklistItem('Display event schedule and instructions');
        addChecklistItem('Prepare refreshments if applicable');
        addChecklistItem('Set up first aid kit and safety equipment');
        addChecklistItem('Confirm all supplies are present');
        addChecklistItem('Review emergency procedures with team');
        yPosition += 2;

        addSubsection('During the Event');
        addChecklistItem('Welcome volunteers as they arrive');
        addChecklistItem('Check in all volunteers');
        addChecklistItem('Provide orientation or briefing');
        addChecklistItem('Assign tasks and responsibilities');
        addChecklistItem('Monitor volunteer progress');
        addChecklistItem('Address questions and concerns');
        addChecklistItem('Take photos (with permission)');
        addChecklistItem('Ensure safety protocols are followed');
        addChecklistItem('Maintain positive, encouraging atmosphere');
        addChecklistItem('Track volunteer attendance');
        yPosition += 2;

        addSubsection('After the Event');
        addChecklistItem('Thank all volunteers personally');
        addChecklistItem('Collect feedback from volunteers');
        addChecklistItem('Confirm attendance in VolunteerSync');
        addChecklistItem('Clean up event location');
        addChecklistItem('Return or store equipment and supplies');
        addChecklistItem('Document event outcomes');
        addChecklistItem('Send follow-up thank you message');

        // Page 5: Communication Template
        doc.addPage();
        yPosition = 20;
        addSectionHeader('Volunteer Communication Template');
        addText('Use this template when communicating with volunteers:');
        yPosition += 5;

        addSubsection('Initial Invitation');
        addText('Subject: Join Us for [Event Name]!');
        yPosition += 4;
        addText('Dear [Volunteer Name],');
        yPosition += 4;
        addText('We\'re excited to invite you to participate in [Event Name] on [Date] at [Time]. This event will [brief description of impact].');
        yPosition += 4;
        addText('Event Details:');
        addBulletPoint('Date: [Date]');
        addBulletPoint('Time: [Start Time] - [End Time]');
        addBulletPoint('Location: [Address]');
        addBulletPoint('What to Bring: [List items]');
        addBulletPoint('What to Wear: [Dress code]');
        yPosition += 2;
        addText('Please confirm your attendance by [Date]. We look forward to working with you!');
        yPosition += 4;
        addText('[Your Name]');
        addText('[Organization Name]');
        yPosition += 5;

        addSubsection('Reminder (1-2 days before)');
        addText('Subject: Reminder: [Event Name] This [Day]!');
        yPosition += 4;
        addText('Hi [Volunteer Name],');
        yPosition += 4;
        addText('This is a friendly reminder that [Event Name] is coming up this [Day], [Date] at [Time].');
        yPosition += 4;
        addText('We\'ll meet at [Location/Address]. Please arrive 10 minutes early for check-in.');
        yPosition += 4;
        addText('If you have any questions or need to cancel, please contact us at [Contact Info].');
        yPosition += 4;
        addText('See you there!');
        yPosition += 5;

        addSubsection('Thank You (After Event)');
        addText('Subject: Thank You for Volunteering at [Event Name]!');
        yPosition += 4;
        addText('Dear [Volunteer Name],');
        yPosition += 4;
        addText('Thank you so much for volunteering at [Event Name]! Your dedication and hard work made a real difference. Together, we [brief summary of impact].');
        yPosition += 4;
        addText('Your volunteer hours have been recorded in your VolunteerSync profile, and you can download your certificate anytime.');
        yPosition += 4;
        addText('We hope to see you at future events!');
        yPosition += 4;
        addText('With gratitude,');
        addText('[Your Name]');
        addText('[Organization Name]');

        // Page 6: Best Practices
        doc.addPage();
        yPosition = 20;
        addSectionHeader('Best Practices for Event Success');
        yPosition += 2;

        addSubsection('Planning Phase');
        addBulletPoint('Start planning 4-6 weeks in advance for larger events');
        addBulletPoint('Be specific in your event description - volunteers want to know what they\'ll be doing');
        addBulletPoint('Set realistic capacity limits based on space and supervision needs');
        addBulletPoint('Create a detailed timeline for the event day');
        addBulletPoint('Have backup plans for weather, low turnout, or other challenges');
        yPosition += 2;

        addSubsection('Recruitment & Communication');
        addBulletPoint('Post events early to give volunteers time to plan');
        addBulletPoint('Send reminders 1-2 days before the event');
        addBulletPoint('Be clear about expectations, time commitment, and requirements');
        addBulletPoint('Respond promptly to volunteer questions');
        addBulletPoint('Make volunteers feel valued and appreciated');
        yPosition += 2;

        addSubsection('Event Execution');
        addBulletPoint('Arrive early to set up and prepare');
        addBulletPoint('Greet each volunteer warmly and personally');
        addBulletPoint('Provide clear instructions and orientation');
        addBulletPoint('Be available to answer questions throughout');
        addBulletPoint('Maintain a positive, encouraging atmosphere');
        addBulletPoint('Ensure all safety protocols are followed');
        addBulletPoint('Take time to connect with volunteers personally');
        yPosition += 2;

        addSubsection('Follow-Up');
        addBulletPoint('Confirm attendance promptly in VolunteerSync');
        addBulletPoint('Send thank you messages within 24-48 hours');
        addBulletPoint('Request feedback to improve future events');
        addBulletPoint('Share impact stories and outcomes');
        addBulletPoint('Invite volunteers to future opportunities');

        // Page 7: Tips for Engaging Volunteers
        doc.addPage();
        yPosition = 20;
        addSectionHeader('Tips for Engaging Volunteers');
        yPosition += 2;

        addBulletPoint('Make volunteers feel welcome from the moment they arrive');
        addBulletPoint('Clearly explain the impact their work will have');
        addBulletPoint('Match volunteer skills and interests to appropriate tasks');
        addBulletPoint('Provide opportunities for volunteers to connect with each other');
        addBulletPoint('Recognize and appreciate different contribution levels');
        addBulletPoint('Share stories about the difference volunteers make');
        addBulletPoint('Create a sense of community and belonging');
        addBulletPoint('Be flexible and accommodating when possible');
        addBulletPoint('Provide meaningful work that uses volunteers\' time well');
        addBulletPoint('Offer variety in tasks to keep volunteers engaged');
        addBulletPoint('Celebrate milestones and achievements together');
        addBulletPoint('Listen to volunteer feedback and suggestions');
        addBulletPoint('Show genuine appreciation for their time and effort');
        yPosition += 3;

        addSectionHeader('Safety & Risk Management');
        yPosition += 2;

        addSubsection('Pre-Event Safety Planning');
        addChecklistItem('Assess potential hazards at event location');
        addChecklistItem('Develop emergency action plan');
        addChecklistItem('Identify first aid resources and contacts');
        addChecklistItem('Ensure adequate supervision ratios');
        addChecklistItem('Review insurance coverage if needed');
        addChecklistItem('Prepare emergency contact list');
        yPosition += 2;

        addSubsection('Event Day Safety');
        addChecklistItem('Brief volunteers on safety procedures');
        addChecklistItem('Provide necessary safety equipment');
        addChecklistItem('Monitor for potential hazards');
        addChecklistItem('Have first aid kit readily available');
        addChecklistItem('Know location of nearest medical facility');
        addChecklistItem('Document any incidents that occur');
        yPosition += 2;

        addSubsection('Post-Event Safety Review');
        addChecklistItem('Review any safety concerns that arose');
        addChecklistItem('Update safety procedures if needed');
        addChecklistItem('Document lessons learned');
        addChecklistItem('Share improvements with team');

        // Final Page: Resources
        doc.addPage();
        yPosition = 20;
        addSectionHeader('Additional Resources');
        yPosition += 2;

        addText('For more information and support:');
        yPosition += 3;

        addSubsection('VolunteerSync Platform');
        addBulletPoint('Knowledge Base: Browse FAQs and guides');
        addBulletPoint('Support: Contact our support team for assistance');
        addBulletPoint('Organizer Dashboard: Track your events and metrics');
        yPosition += 3;

        addSubsection('Contact Support');
        addText('Email: support@volunteersync.org');
        addText('Phone: (123) 456-7890');
        addText('Hours: Mon-Fri, 9am-5pm MST');
        yPosition += 5;

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('VolunteerSync Event Playbook', pageWidth / 2, pageHeight - 10, { align: 'center' });
        doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, pageWidth / 2, pageHeight - 5, { align: 'center' });

        // Save the PDF
        doc.save('VolunteerSync-Event-Playbook.pdf');
      };

      // Try to load logo, but generate PDF regardless
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = 'assets/VS_Logo_Banner.png';

      logoImg.onload = () => {
        generatePDFContent(true, logoImg);
      };

      logoImg.onerror = () => {
        // If logo fails to load, generate PDF without it
        console.warn('Logo failed to load, generating PDF without logo');
        generatePDFContent(false);
      };

      // Timeout fallback - generate PDF after 2 seconds even if logo hasn't loaded
      setTimeout(() => {
        if (!logoImg.complete) {
          generatePDFContent(false);
        }
      }, 2000);
    } catch (error) {
      console.error('Error generating Event Playbook PDF:', error);
      alert('Failed to generate Event Playbook. Please try again.');
    }
  }
}
