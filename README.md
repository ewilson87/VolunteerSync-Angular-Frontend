# VolunteerSync - Angular Frontend

VolunteerSync is a comprehensive web application designed to connect volunteers with meaningful community service opportunities. The platform facilitates event management, volunteer tracking, certificate generation, and organizational coordination.

This repository contains the Angular frontend application for VolunteerSync, built with Angular 19 and modern web technologies.

## 🚀 Features

### For Volunteers
- Browse and search volunteer events by location, date, and tags
- Register for events with a single click
- Track verified service hours and generate certificates
- Follow organizations and tags of interest
- View comprehensive volunteer metrics and history
- Manage profile and preferences

### For Organizers
- Create and manage volunteer events
- Track registrations and attendance
- Mark attendance and generate certificates for volunteers
- View detailed analytics and metrics
- Manage organization information
- Export data and reports (PDF, Excel)

### For Administrators
- Manage users, organizations, and events
- Approve or reject organizations
- Monitor system metrics and audit logs
- Process email notifications
- Manage tags and system-wide settings
- Comprehensive administrative dashboard

### Platform Features
- **Client-side caching system** - Reduces API calls with intelligent caching
- **Role-based access control** - Secure routes and features based on user roles
- **Responsive design** - Works seamlessly on desktop and mobile devices
- **12-hour time format display** - User-friendly time presentation (AM/PM)
- **Real-time updates** - Automatic refresh of cached data
- **Email notifications** - Automated reminders and confirmations

## 🛠️ Tech Stack

- **Framework:** Angular 19.1.0
- **Language:** TypeScript 5.7.2
- **Styling:** Bootstrap 5.3.3, Custom CSS
- **Icons:** Bootstrap Icons 1.11.3
- **Charts:** Chart.js 4.5.1, ng2-charts 8.0.0
- **PDF Generation:** jsPDF 3.0.3
- **Excel Export:** xlsx 0.18.5
- **State Management:** RxJS 7.8.0
- **Server-Side Rendering:** Angular SSR
- **Build Tool:** Angular CLI 19.1.7

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js) or **yarn**
- **Git**

## 🔧 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd VolunteerSyncAngular/VolunteerSyncAngular
```

2. Install dependencies:
```bash
npm install
```

3. Configure the API endpoint (if needed):
   - The application is configured to connect to an API server
   - API endpoint is typically configured in `volunteer-service.service.ts`
   - Default: `https://localhost:5000` (can be modified based on your backend setup)

## 🚀 Development Server

To start the local development server:

```bash
ng serve
# or
npm start
```

Once the server is running, navigate to `https://localhost:4200/` in your browser. The application will automatically reload when you modify source files.

**Note:** The application uses HTTPS in development. If you encounter SSL certificate warnings, you may need to accept the self-signed certificate in your browser.

## 🏗️ Building for Production

To build the project for production:

```bash
ng build
```

The build artifacts will be stored in the `dist/` directory. The production build is optimized for performance and includes:
- Code minification
- Tree shaking
- AOT (Ahead-of-Time) compilation
- Bundle optimization

For SSR (Server-Side Rendering) build:
```bash
ng build --configuration production
```

## 🧪 Testing

### Unit Tests
```bash
ng test
```

### End-to-End Tests
```bash
ng e2e
```

*Note: E2E testing framework needs to be configured separately.*

## 📁 Project Structure

```
src/
├── app/
│   ├── components/          # Angular components
│   │   ├── admin-dashboard/     # Admin management interface
│   │   ├── organizer-dashboard/ # Organizer management interface
│   │   ├── user-profile/        # User profile and metrics
│   │   ├── event-list/          # Event browsing and filtering
│   │   ├── event-detail/        # Individual event details
│   │   ├── create-event/        # Event creation form
│   │   ├── welcome/             # Landing page
│   │   ├── login/               # Authentication
│   │   ├── register/            # User registration
│   │   └── ...                  # Other components
│   ├── services/            # Injectable services
│   │   ├── auth.service.ts          # Authentication & authorization
│   │   ├── volunteer-service.service.ts  # API integration
│   │   ├── cache.service.ts        # Client-side caching
│   │   ├── input-validation.service.ts  # Form validation
│   │   └── ...                      # Other services
│   ├── models/              # TypeScript interfaces/models
│   ├── guards/              # Route guards
│   │   └── auth.guard.ts         # Authentication & role guards
│   ├── interceptors/        # HTTP interceptors
│   │   └── auth.interceptor.ts   # Token injection
│   └── app.routes.ts        # Application routes
├── assets/              # Static assets (images, videos)
└── styles.css           # Global styles
```

## 🔑 Key Features & Services

### Caching Service
The application includes a sophisticated client-side caching system:
- **Query-key-based caching** for different data types
- **Stale-while-revalidate pattern** for optimal performance
- **Configurable TTLs** (Time-To-Live) per data type:
  - Tags & Organizations: 5 minutes
  - Events: 2 minutes
  - User data: 5 minutes
  - Metrics: 1 minute
- **Automatic cache invalidation** on mutations (create/update/delete)

### Authentication & Authorization
- JWT-based authentication
- Role-based route guards (Admin, Organizer, Volunteer)
- Automatic token injection via HTTP interceptor
- Session persistence with localStorage

### API Integration
- RESTful API communication
- Error handling and retry logic
- Request/response interceptors
- Comprehensive error messages

## 🎨 Styling

The application uses:
- **Bootstrap 5** for responsive grid and components
- **Bootstrap Icons** for iconography
- **Custom CSS** for application-specific styling
- Mobile-first responsive design

## 🔒 Security Features

- JWT token-based authentication
- Role-based access control (RBAC)
- Secure HTTP interceptors
- Input validation and sanitization
- XSS protection
- CSRF protection (via backend)

## 📝 Recent Major Updates

- **Front-end caching system** - Significant reduction in API calls
- **Event sorting** - Chronological sorting by date/time on dashboards
- **Event length field** - Added mandatory event duration field
- **Two-step email processing** - Improved email notification workflow
- **Role-based navigation** - Enhanced welcome page with role-specific buttons
- **Time format improvements** - 12-hour AM/PM display throughout
- **UI/UX enhancements** - Improved styling and user experience across components

For a complete list of changes, see `CHANGELOG_SINCE_NOV_23.md` (local file, not committed to repository).

## 🌐 API Integration

The frontend communicates with a backend API. Ensure the API server is running and accessible. The default configuration expects the API at:
- Development: `https://localhost:5000`
- Production: Configure as needed

API endpoints used include:
- Authentication (`/auth/login`, `/auth/register`)
- Events (`/events`, `/events/:id`)
- Users (`/users`, `/users/:id`)
- Organizations (`/organizations`)
- Tags (`/tags`)
- Support (`/support`)
- Notifications (`/notifications/*`)
- Metrics (`/api/metrics/*`)

## 🔄 Development Workflow

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** and test locally

3. **Commit your changes:**
   ```bash
   git add .
   git commit -m "Description of changes"
   ```

4. **Push to remote:**
   ```bash
   git push origin feature/your-feature-name
   ```

## 🐛 Troubleshooting

### SSL Certificate Errors
If you encounter SSL certificate warnings in development:
- Accept the self-signed certificate in your browser
- Or configure proper SSL certificates in the `ssl/` directory

### Port Already in Use
If port 4200 is already in use:
```bash
ng serve --port 4201
```

### Cache Issues
Clear browser cache or use incognito/private browsing mode if you encounter stale data.

## 📚 Additional Resources

- [Angular Documentation](https://angular.dev)
- [Angular CLI Overview](https://angular.dev/tools/cli)
- [Bootstrap Documentation](https://getbootstrap.com/docs/5.3)
- [RxJS Documentation](https://rxjs.dev)

## 📄 License

[Add your license information here]

## 👥 Contributors

[Add contributor information here]

## 📧 Support

For support, use the in-app support feature or contact the development team.

---

**Last Updated:** January 2025
**Angular Version:** 19.1.7
**Node Version:** Compatible with Node.js 18+
