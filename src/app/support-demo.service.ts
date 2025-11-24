import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
    providedIn: 'root'
})
export class SupportDemoService {
    constructor(
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    /**
     * Navigate to the 404 demo page
     */
    goTo404Demo(): void {
        if (isPlatformBrowser(this.platformId)) {
            this.router.navigate(['/not-found']);
        }
    }

    /**
     * Navigate to the 500 error demo page
     */
    goTo500Demo(): void {
        if (isPlatformBrowser(this.platformId)) {
            this.router.navigate(['/server-error']);
        }
    }
} 