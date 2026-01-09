import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-compliance',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './compliance.component.html',
  styleUrls: ['./compliance.component.css']
})
export class ComplianceComponent {
  // Track which section is currently expanded (for accordion-style display)
  expandedSection: string | null = null;

  toggleSection(section: string): void {
    this.expandedSection = this.expandedSection === section ? null : section;
  }

  get lastUpdatedDate(): string {
    return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
}

