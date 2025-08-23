# WhatsApp Integration - Frontend

React-based admin dashboard for WhatsApp Integration platform built with Vite, TypeScript, and Ant Design.

## 🚀 Production Ready

✅ **Status**: Ready for production deployment

- All console.log statements removed
- TypeScript compilation clean
- Bundle optimized
- Professional UI/UX

## 📋 Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build:prod

# Preview production build
npm run preview
```

### Environment Configuration

Copy the production environment example:

```bash
cp env.production.example .env.production
```

Configure the following production variables:

- `VITE_API_BASE_URL` - Backend API URL
- `VITE_SOCKET_URL` - Socket.IO server URL
- `VITE_APP_NAME` - Application name
- `VITE_ENABLE_DEBUG` - Debug mode (false for production)

## 📂 Project Structure

```
src/
├── components/      # Reusable UI components
├── hooks/          # Custom React hooks
├── pages/          # Page components
├── services/       # API services and utilities
├── stores/         # Zustand state management
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

## 🔧 Available Scripts

| Script               | Description                                   |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Start development server with Vite            |
| `npm run build`      | Build for production                          |
| `npm run build:prod` | Build for production with NODE_ENV=production |
| `npm run preview`    | Preview production build                      |
| `npm run start`      | Start production server on port 3000          |
| `npm test`           | Run Vitest tests                              |
| `npm run lint`       | Run ESLint                                    |
| `npm run lint:fix`   | Fix ESLint issues                             |

## 🎨 UI Components

### Pages

- **LoginPage** - User authentication
- **DashboardPage** - Main dashboard with statistics
- **SessionsPage** - WhatsApp session management
- **MessagesPage** - Message sending interface
- **WebhooksPage** - Webhook configuration
- **ProfilePage** - User profile and settings
- **SimpleWhatsAppTest** - Testing interface

### Features

- **Real-time Updates** - Socket.IO integration for live data
- **QR Code Display** - WhatsApp pairing interface
- **Session Management** - Create, delete, and monitor sessions
- **Message Sending** - Support for text, media, and location
- **Responsive Design** - Mobile-friendly interface
- **Dark/Light Theme** - Theme switching support

## 🔐 Authentication

The frontend handles authentication with:

- JWT token management with 30-day expiration
- Automatic token refresh
- Protected routes
- Persistent login state
- Secure logout

Authentication flow:

1. User login → JWT token stored
2. API requests → Token sent in headers
3. Token expiry → Automatic refresh
4. Refresh failure → Redirect to login

## 🌐 API Integration

The frontend communicates with the backend through:

- **REST API** - CRUD operations
- **Socket.IO** - Real-time updates
- **Axios** - HTTP client with interceptors

### API Services

- `authApi` - Authentication endpoints
- `sessionsApi` - Session management
- `messagesApi` - Message operations
- `webhooksApi` - Webhook configuration

## 🎯 State Management

Using Zustand for state management:

- **authStore** - Authentication state
- **sessionStore** - Session data
- **uiStore** - UI preferences

## 🔌 Socket.IO Integration

Real-time features powered by Socket.IO:

- **QR Code Updates** - Live QR code generation
- **Session Status** - Real-time session state changes
- **Message Status** - Message delivery updates
- **Connection Management** - Automatic reconnection

## 🎨 Styling

Built with modern styling tools:

- **Tailwind CSS** - Utility-first CSS framework
- **Ant Design** - Professional UI components
- **WhatsApp Theme** - Brand-consistent colors
- **Responsive Design** - Mobile-first approach

### Color Palette

- Primary: `#25D366` (WhatsApp Green)
- Secondary: `#128C7E` (WhatsApp Teal)
- Success: `#25D366`
- Warning: `#f59e0b`
- Error: `#ef4444`

## 📱 Responsive Design

The interface adapts to different screen sizes:

- **Desktop** - Full feature set with sidebar navigation
- **Tablet** - Optimized layout with collapsible sidebar
- **Mobile** - Stack layout with bottom navigation

## 🚀 Deployment

For production deployment, see:

- **[Deployment Guide](../docs/deployment/DEPLOYMENT.md)** - Complete deployment instructions
- **[Production Checklist](../docs/deployment/PRODUCTION_CHECKLIST.md)** - Pre-deployment checklist
- **[Environment Example](./env.production.example)** - Production environment variables

### Static Deployment

```bash
# Build static files
npm run build:prod

# Deploy to static hosting (Netlify, Vercel, etc.)
# Upload dist/ folder contents
```

### Docker Deployment

```bash
# Build image
docker build -t whatsapp-integration-frontend .

# Run container
docker run -d -p 3000:80 whatsapp-integration-frontend
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:3001;
    }
}
```

## 🔧 Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy environment: `cp .env.example .env.local`
4. Start development: `npm run dev`

### Development Tools

- **Vite** - Fast development server
- **TypeScript** - Type safety
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Vitest** - Unit testing

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run e2e
```

## 🐛 Troubleshooting

### Common Issues

1. **API Connection Failed**
   - Check `VITE_API_BASE_URL` in environment
   - Verify backend server is running
   - Check CORS configuration

2. **Socket.IO Connection Failed**
   - Verify `VITE_SOCKET_URL` matches backend
   - Check firewall rules
   - Ensure WebSocket support

3. **Authentication Issues**
   - Clear browser localStorage
   - Check JWT token expiration
   - Verify backend authentication endpoints

4. **Build Issues**
   - Clear node_modules and reinstall
   - Check TypeScript errors
   - Verify environment variables

For more troubleshooting, see the [Deployment Guide](../docs/deployment/DEPLOYMENT.md#troubleshooting).

## 📊 Performance

### Optimization Features

- **Code Splitting** - Lazy loading of routes
- **Bundle Analysis** - Webpack bundle analyzer
- **Asset Optimization** - Image and font optimization
- **Caching** - Browser caching headers

### Performance Targets

- **First Load** - < 3 seconds
- **Bundle Size** - < 1MB gzipped
- **Lighthouse Score** - > 90

## 📄 License

This project is licensed under the MIT License.

---

**Status**: ✅ Production Ready
**Version**: 1.0.0
**Framework**: React 18+ with Vite
**UI Library**: Ant Design 5+
