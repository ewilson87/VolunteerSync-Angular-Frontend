import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Title } from '@angular/platform-browser';

@Component({
    selector: 'app-not-found',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './not-found.component.html',
    styleUrls: ['./not-found.component.css']
})
export class NotFoundComponent implements OnInit {
    constructor(
        @Inject(PLATFORM_ID) private platformId: Object,
        private titleService: Title
    ) { }

    /**
     * Initializes the component and sets the page title.
     */
    ngOnInit(): void {
        if (isPlatformBrowser(this.platformId)) {
            this.titleService.setTitle('404 - Page Not Found | VolunteerSync');
        }
    }
} 