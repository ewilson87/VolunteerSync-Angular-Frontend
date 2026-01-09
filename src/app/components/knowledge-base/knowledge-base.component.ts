import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface FAQCategory {
  title: string;
  icon: string;
  faqs: FAQ[];
}

interface FAQ {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-knowledge-base',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './knowledge-base.component.html',
  styleUrls: ['./knowledge-base.component.css']
})
export class KnowledgeBaseComponent {
  searchQuery: string = '';
  selectedCategory: string | null = null;

  categories: FAQCategory[] = [
    {
      title: 'Getting Started',
      icon: 'bi-rocket-takeoff',
      faqs: [
        {
          question: 'How do I create an account?',
          answer: 'Click the "Register" button in the top navigation. You\'ll need to provide your name, email address, and create a password. Choose your role (Volunteer or Organizer) during registration. Organizers will need to provide organization details and wait for admin approval before posting events.'
        },
        {
          question: 'What\'s the difference between a Volunteer and an Organizer account?',
          answer: 'Volunteers can search for events, sign up to participate, track their volunteer hours, and download certificates. Organizers can create and manage events, approve volunteer registrations, confirm attendance, and generate certificates for volunteers. Both roles can view their own dashboards with relevant metrics and history.'
        },
        {
          question: 'How long does organizer approval take?',
          answer: 'Organizer accounts require admin approval before you can create events. Approval typically takes 1-2 business days. You\'ll receive an email notification once your organization has been approved. Until then, you can still browse events and volunteer, but you won\'t be able to create new events.'
        },
        {
          question: 'Can I change my role after creating an account?',
          answer: 'Your role is set during registration and cannot be changed through the user interface. If you need to switch roles (for example, if you want to become an organizer), you\'ll need to contact support or create a separate account with the desired role.'
        }
      ]
    },
    {
      title: 'For Volunteers',
      icon: 'bi-hand-thumbs-up',
      faqs: [
        {
          question: 'How do I find volunteer opportunities?',
          answer: 'Use the "Events" page to browse available volunteer opportunities. You can filter events by date, location, organizer, or search by keywords. Click on any event to see detailed information including date, time, location, description, and required skills.'
        },
        {
          question: 'How do I sign up for an event?',
          answer: 'Navigate to the event details page and click the "Register" button. You\'ll see a confirmation message once you\'re successfully registered. You can view all your registered events in your profile under "My Event Registrations".'
        },
        {
          question: 'Can I cancel my registration?',
          answer: 'Yes, you can cancel your registration from the event details page or from your profile. However, if the event is less than 24 hours away, you may want to contact the organizer directly to let them know.'
        },
        {
          question: 'How are my volunteer hours tracked?',
          answer: 'After an event, the organizer confirms your attendance. Once confirmed, the hours you volunteered are automatically added to your profile. You can view your total hours and history in your profile under "My Volunteer Metrics".'
        },
        {
          question: 'What are certificates and how do I get them?',
          answer: 'Certificates are PDF documents that verify your volunteer service. They\'re automatically generated after an organizer confirms your attendance at an event. Each certificate includes event details, hours volunteered, a timestamp, and a unique verification ID. You can download certificates from your profile under "My Certificates".'
        },
        {
          question: 'How can others verify my certificates?',
          answer: 'Each certificate has a unique verification ID. Share this ID with schools, employers, or scholarship programs, and they can verify it using the public verification page at /verify. They\'ll see the event details, hours, and confirmation that the certificate is authentic.'
        },
        {
          question: 'Can I export my volunteer history?',
          answer: 'Yes! In your profile, you can download your volunteer metrics as a PDF or Excel file. This includes your total hours, event history, and charts showing your volunteering activity over time.'
        }
      ]
    },
    {
      title: 'For Organizers',
      icon: 'bi-people',
      faqs: [
        {
          question: 'How do I create a new event?',
          answer: 'Once your organization is approved, go to your Organizer Dashboard and click "Create Event". Fill in the event details including title, description, date, time, location, capacity, and any required skills. After submitting, your event will be visible to volunteers once it\'s approved by an admin.'
        },
        {
          question: 'How do I manage event registrations?',
          answer: 'In your Organizer Dashboard, navigate to "Manage Events" to see all your events. Click on an event to view registered volunteers. You can see who has signed up, their contact information, and manage the registration list.'
        },
        {
          question: 'How do I confirm volunteer attendance?',
          answer: 'After an event, go to the event management page and find the "Confirm Attendance" section. Select the volunteers who attended and mark them as present. This will automatically generate certificates for those volunteers and add the hours to their profiles.'
        },
        {
          question: 'Can I edit or cancel an event?',
          answer: 'You can edit event details from the event management page. If you need to cancel an event, you should update the event status and consider notifying registered volunteers through the support system or by contacting them directly.'
        },
        {
          question: 'What happens if an event reaches capacity?',
          answer: 'Once an event reaches its capacity limit, volunteers will no longer be able to register. You can see the current registration count and capacity in your event management dashboard. If you need to increase capacity, you can edit the event details.'
        },
        {
          question: 'How do I view my organization\'s metrics?',
          answer: 'Your Organizer Dashboard includes a metrics section showing event statistics, volunteer participation, total hours tracked, and more. You can filter metrics by date range and download reports as PDF or Excel files.'
        }
      ]
    },
    {
      title: 'Certificates & Verification',
      icon: 'bi-shield-check',
      faqs: [
        {
          question: 'What information is included on a certificate?',
          answer: 'Each certificate includes the volunteer\'s name, event title, organization name, date of the event, hours volunteered, a timestamp of when the certificate was issued, and a unique verification ID that can be used to verify authenticity.'
        },
        {
          question: 'How do I verify a certificate?',
          answer: 'Go to the verification page (/verify) and enter the certificate verification ID. The system will display the certificate details and confirm its authenticity. This verification is public and doesn\'t require an account.'
        },
        {
          question: 'Are certificates secure and tamper-proof?',
          answer: 'Yes. Each certificate has a unique verification ID that\'s stored in our secure database. The verification system checks this ID against our records to confirm authenticity. Any tampering with the certificate would invalidate the verification.'
        },
        {
          question: 'Can I re-download a certificate?',
          answer: 'Yes, you can download your certificates at any time from your profile under "My Certificates". All certificates remain available in your account history.'
        },
        {
          question: 'What if I lose my certificate verification ID?',
          answer: 'You can find the verification ID on the certificate PDF itself, or by viewing the certificate details in your profile. If you\'ve lost access to your account, contact support with your email address and we can help you recover your certificate information.'
        }
      ]
    },
    {
      title: 'Account & Profile',
      icon: 'bi-person-circle',
      faqs: [
        {
          question: 'How do I update my profile information?',
          answer: 'Go to your profile page and click "Edit Profile". You can update your name, email, phone number, address, and other personal information. Some fields may require verification before changes take effect.'
        },
        {
          question: 'How do I change my password?',
          answer: 'In your profile, go to the "Account Settings" section and click "Change Password". You\'ll need to enter your current password and create a new one. Make sure your new password meets the security requirements.'
        },
        {
          question: 'What if I forget my password?',
          answer: 'On the login page, click "Forgot Password" and enter your email address. You\'ll receive an email with instructions to reset your password. If you don\'t receive the email, check your spam folder or contact support.'
        },
        {
          question: 'Can I delete my account?',
          answer: 'Yes, you can delete your account from your profile settings. This action is permanent and will remove all your data including event registrations, certificates, and volunteer history. Make sure to download any certificates or data you want to keep before deleting your account.'
        },
        {
          question: 'How do I view my support messages?',
          answer: 'In your profile, go to "My Support Messages" to see all messages you\'ve sent to support and any responses you\'ve received. You can also send new support messages from the Support page.'
        }
      ]
    },
    {
      title: 'Troubleshooting',
      icon: 'bi-tools',
      faqs: [
        {
          question: 'I\'m not receiving email notifications. What should I do?',
          answer: 'First, check your spam or junk folder. If emails aren\'t there, verify that your email address is correct in your profile settings. You can also check your email service\'s filtering settings. If the problem persists, contact support.'
        },
        {
          question: 'The page isn\'t loading or I\'m seeing errors. What can I do?',
          answer: 'Try refreshing the page or clearing your browser cache. Make sure you\'re using a modern, up-to-date browser. If you\'re still experiencing issues, try logging out and logging back in. If problems continue, contact support with details about what you were trying to do when the error occurred.'
        },
        {
          question: 'I can\'t log in to my account.',
          answer: 'Make sure you\'re using the correct email address and password. If you\'ve forgotten your password, use the "Forgot Password" link on the login page. If you\'re still having trouble, contact support and we can help you regain access to your account.'
        },
        {
          question: 'My volunteer hours aren\'t showing up.',
          answer: 'Hours only appear after the event organizer confirms your attendance. If it\'s been more than a few days after the event and your hours still aren\'t showing, contact the event organizer or support for assistance.'
        },
        {
          question: 'I registered for an event but don\'t see it in my profile.',
          answer: 'Check your "My Event Registrations" section in your profile. Make sure you\'re looking at the correct date range. If the event still doesn\'t appear, try refreshing the page or contact support with the event name and date.'
        },
        {
          question: 'How do I contact support?',
          answer: 'You can contact support by filling out the form on the Support page, sending an email to support@volunteersync.org, or calling (123) 456-7890 during business hours (Mon–Fri, 9am–5pm MST). You can also view your support message history in your profile.'
        }
      ]
    }
  ];

  get filteredCategories(): FAQCategory[] {
    if (!this.searchQuery.trim() && !this.selectedCategory) {
      return this.categories;
    }

    return this.categories.map(category => {
      const filteredFAQs = category.faqs.filter(faq => {
        const matchesSearch = !this.searchQuery.trim() || 
          faq.question.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
          faq.answer.toLowerCase().includes(this.searchQuery.toLowerCase());
        
        const matchesCategory = !this.selectedCategory || category.title === this.selectedCategory;
        
        return matchesSearch && matchesCategory;
      });

      return {
        ...category,
        faqs: filteredFAQs
      };
    }).filter(category => category.faqs.length > 0);
  }

  get allFAQs(): FAQ[] {
    return this.categories.flatMap(category => category.faqs);
  }

  get totalResultsCount(): number {
    return this.filteredCategories.reduce((sum, cat) => sum + cat.faqs.length, 0);
  }

  selectCategory(category: string | null): void {
    this.selectedCategory = this.selectedCategory === category ? null : category;
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = null;
  }
}

