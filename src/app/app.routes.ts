import { Routes } from '@angular/router';
import { WelcomeComponent } from './components/welcome/welcome.component';
import { LoginComponent } from './components/login/login.component';
import { EventListComponent } from './components/event-list/event-list.component';
import { EventDetailComponent } from './components/event-detail/event-detail.component';
import { OrganizationListComponent } from './components/organization-list/organization-list.component';
import { RegisterComponent } from './components/register/register.component';
import { CreateEventComponent } from './components/create-event/create-event.component';
import { UserProfileComponent } from './components/user-profile/user-profile.component';
import { OrganizerDashboardComponent } from './components/organizer-dashboard/organizer-dashboard.component';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard.component';
import { EventManagementComponent } from './components/event-management/event-management.component';
import { authGuard, organizerGuard, adminGuard } from './guards/auth.guard';
import { SupportComponent } from './components/support/support.component';
import { KnowledgeBaseComponent } from './components/knowledge-base/knowledge-base.component';
import { ComplianceComponent } from './components/compliance/compliance.component';
import { NotFoundComponent } from './components/not-found/not-found.component';
import { ServerErrorComponent } from './components/server-error/server-error.component';
import { UnauthorizedComponent } from './components/unauthorized/unauthorized.component';
import { ForbiddenComponent } from './components/forbidden/forbidden.component';
import { VerifyCertificateComponent } from './components/verify-certificate/verify-certificate.component';

export const routes: Routes = [
    { path: '', component: WelcomeComponent },
    { path: 'login', component: LoginComponent },
    { path: 'register', component: RegisterComponent },
    { path: 'events', component: EventListComponent },
    { path: 'events/:id', component: EventDetailComponent },
    {
        path: 'create-event',
        component: CreateEventComponent,
        canActivate: [organizerGuard]
    },
    {
        path: 'profile',
        component: UserProfileComponent,
        canActivate: [authGuard]
    },
    { path: 'organizations', component: OrganizationListComponent },
    { path: 'support', component: SupportComponent },
    { path: 'knowledge-base', component: KnowledgeBaseComponent },
    { path: 'compliance', component: ComplianceComponent },
    { path: 'verify', component: VerifyCertificateComponent },

    // Organizer Dashboard Routes
    {
        path: 'organizer',
        component: OrganizerDashboardComponent,
        canActivate: [organizerGuard]
    },
    {
        path: 'organizer/events',
        component: EventManagementComponent,
        canActivate: [organizerGuard]
    },
    {
        path: 'organizer/events/:id/registrations',
        component: EventManagementComponent,
        canActivate: [organizerGuard]
    },

    // Admin Dashboard Routes
    {
        path: 'admin',
        component: AdminDashboardComponent,
        canActivate: [adminGuard]
    },
    {
        path: 'admin/users',
        component: AdminDashboardComponent,
        canActivate: [adminGuard]
    },
    {
        path: 'admin/organizations',
        component: AdminDashboardComponent,
        canActivate: [adminGuard]
    },
    {
        path: 'admin/events',
        component: AdminDashboardComponent,
        canActivate: [adminGuard]
    },

    // Error pages
    { path: 'unauthorized', component: UnauthorizedComponent },
    { path: 'forbidden', component: ForbiddenComponent },
    { path: 'server-error', component: ServerErrorComponent },
    { path: 'not-found', component: NotFoundComponent },

    // 404 - This should be the last route
    { path: '**', redirectTo: 'not-found' }
];
