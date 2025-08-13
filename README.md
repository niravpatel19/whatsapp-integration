# WhatsApp Integration Service

A multi-tenant WhatsApp Integration service built with WPPConnect that provides both Admin UI and Developer APIs for managing WhatsApp sessions and sending messages programmatically.

## Features

- **Multi-tenant Architecture**: Complete data isolation between users
- **WhatsApp Session Management**: Create, manage, and monitor WhatsApp device sessions
- **Real-time QR Code**: Auto-refreshing QR codes for device pairing
- **Message Sending**: Support for text, media, location, and other message types
- **Real-time Updates**: Socket.IO integration for live status updates
- **Webhook Support**: Configurable webhooks with HMAC signatures
- **API Key Management**: Secure API keys with rate limiting
- **Two-Factor Authentication**: Optional TOTP-based 2FA
- **Comprehensive Logging**: Audit trails and compliance features
- **Admin Dashboard**: Complete web interface for session management

## Tech Stack

### Backend
- Node.js + TypeScript + Express.js
- MongoDB with Mongoose ODM
- Redis for caching and rate limiting
- Socket.IO for real-time communication
- WPPConnect for WhatsApp integration
- JWT authentication with bcrypt
- Zod for validation
- Winston for logging

### Frontend
- React 18 + TypeScript + Vite
- Tailwind CSS + Ant Design
- Zustand for state management
- Axios for HTTP client
- Socket.IO client for real-time updates
- React Router for navigation

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB 6+
- Redis 7+
- Docker & Docker Compose (optional)

### Automated Setup

**Windows:**
```cmd
scripts\setup.bat
```

**Linux/macOS:**
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### Manual Setup

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd whatsapp-integration
npm install
```

2. **Set up environment variables:**
```bash
# Copy environment templates
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Edit the .env files with your configuration
```

3. **Install dependencies:**
```bash
# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

4. **Start with Docker (recommended):**
```bash
npm run docker:dev
```

5. **Or start manually:**
```bash
# Start MongoDB and Redis
# Then run:
npm run dev
```

### Access Points
- **Admin UI**: http://localhost:3000
- **API Documentation**: http://localhost:3001/api/docs
- **Health Check**: http://localhost:3001/health

## API Documentation

The API documentation is available at `/api/docs` when the server is running. It includes:
- Interactive Swagger UI
- Complete endpoint documentation
- Authentication examples
- Webhook payload formats

## Project Structure

```
whatsapp-integration/
├── backend/                 # Node.js backend
│   ├── src/
│   │   ├── controllers/     # Route handlers
│   │   ├── services/        # Business logic
│   │   ├── models/          # Database models
│   │   ├── middleware/      # Express middleware
│   │   ├── routes/          # API routes
│   │   ├── wpp/             # WPPConnect integration
│   │   ├── socket/          # Socket.IO handlers
│   │   └── utils/           # Utilities
│   ├── tests/               # Backend tests
│   └── package.json
├── frontend/                # React frontend
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API integration
│   │   ├── hooks/           # Custom hooks
│   │   ├── stores/          # State management
│   │   └── utils/           # Utilities
│   ├── tests/               # Frontend tests
│   └── package.json
├── docker/                  # Docker configurations
├── docs/                    # Documentation
└── docker-compose.yml       # Development environment
```

## Security Features

- JWT-based authentication with refresh tokens
- API key authentication with rate limiting
- Two-factor authentication (TOTP)
- Request validation and sanitization
- CORS and security headers
- Audit logging and compliance
- Multi-tenant data isolation

## Compliance & Legal

⚠️ **Important**: This service uses WPPConnect which reverse-engineers WhatsApp Web. Please ensure:
- Compliance with WhatsApp Terms of Service
- Proper user consent and legal disclaimers
- Understanding of potential device ban risks
- Implementation of appropriate rate limiting

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- Check the documentation at `/api/docs`
- Review the troubleshooting guide
- Open an issue on GitHub