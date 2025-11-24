import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-welcome',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './welcome.component.html',
    styleUrl: './welcome.component.css'
})
export class WelcomeComponent implements OnInit {
    title = 'Welcome to';
    isLoggedIn = false;

    constructor(private authService: AuthService) { }

    /**
     * Initializes the component and subscribes to authentication state changes.
     */
    ngOnInit(): void {
        this.isLoggedIn = this.authService.isLoggedInValue;

        this.authService.isLoggedIn.subscribe(status => {
            this.isLoggedIn = status;
        });
    }
} 