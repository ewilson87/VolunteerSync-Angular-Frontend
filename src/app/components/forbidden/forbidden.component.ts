import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-forbidden',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './forbidden.component.html',
    styleUrl: './forbidden.component.css'
})
export class ForbiddenComponent implements OnInit, OnDestroy {
    message = 'If you believe you should have access, reach out to an administrator to update your role. Otherwise, head back to your dashboard or explore events you can join today.';

    private subscription?: Subscription;

    constructor(private route: ActivatedRoute) { }

    /**
     * Initializes the component and reads message from query parameters.
     */
    ngOnInit(): void {
        this.subscription = this.route.queryParams.subscribe(params => {
            if (params['message']) {
                this.message = params['message'];
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
