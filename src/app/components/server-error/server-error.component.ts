import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Title } from '@angular/platform-browser';

@Component({
    selector: 'app-server-error',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './server-error.component.html',
    styleUrls: ['./server-error.component.css']
})
export class ServerErrorComponent implements OnInit {
    constructor(
        @Inject(PLATFORM_ID) private platformId: Object,
        private titleService: Title
    ) { }

    /**
     * Initializes the component and sets the page title.
     */
    ngOnInit(): void {
        if (isPlatformBrowser(this.platformId)) {
            this.titleService.setTitle('500 - Server Error | VolunteerSync');
        }
    }
} 