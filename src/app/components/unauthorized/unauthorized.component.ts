import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-unauthorized',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './unauthorized.component.html',
    styleUrl: './unauthorized.component.css'
})
export class UnauthorizedComponent implements OnInit, OnDestroy {
    message = 'You’ll need to sign in to access this area of VolunteerSync.';
    returnUrl = '/';

    private subscription?: Subscription;

    constructor(private route: ActivatedRoute) { }

    /**
     * Initializes the component and reads message and returnUrl from query parameters.
     */
    ngOnInit(): void {
        this.subscription = this.route.queryParams.subscribe(params => {
            if (params['message']) {
                this.message = params['message'];
            }

            if (params['returnUrl']) {
                this.returnUrl = params['returnUrl'];
            }
        });
    }

    /**
     * Cleans up subscriptions when the component is destroyed.
     */
    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
    }
}
