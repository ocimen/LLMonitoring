# LLM Brand Monitoring Platform

A comprehensive web application for tracking brand visibility across AI-powered search engines and language models.

## Project Structure

```
llm-brand-monitoring/
├── backend/                 # Node.js/Express API server
│   ├── src/                # Source code
│   ├── package.json        # Backend dependencies
│   ├── tsconfig.json       # TypeScript configuration
│   ├── .eslintrc.json      # ESLint configuration
│   ├── .prettierrc         # Prettier configuration
│   └── Dockerfile.dev      # Development Docker configuration
├── frontend/               # React frontend application
│   ├── src/                # Source code
│   ├── package.json        # Frontend dependencies
│   ├── tsconfig.json       # TypeScript configuration
│   ├── .eslintrc.cjs       # ESLint configuration
│   ├── .prettierrc         # Prettier configuration
│   ├── vite.config.ts      # Vite configuration
│   └── Dockerfile.dev      # Development Docker configuration
├── docker-compose.dev.yml  # Development environment setup
├── package.json            # Root package.json for workspace
└── README.md              # This file
```

## Development Setup

### Prerequisites

- Node.js 18+ and npm 9+
- Docker and Docker Compose

### Quick Start

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

3. **Start development environment with Docker:**
   ```bash
   npm run docker:dev
   ```

   This will start:
   - PostgreSQL database (port 5432)
   - Redis cache (port 6379)
   - Backend API (port 3001)
   - Frontend app (port 3000)

4. **Or start services individually:**
   ```bash
   # Start backend
   npm run dev:backend
   
   # Start frontend
   npm run dev:frontend
   
   # Start both
   npm run dev
   ```

### Available Scripts

- `npm run dev` - Start both frontend and backend
- `npm run build` - Build both applications
- `npm run test` - Run all tests
- `npm run lint` - Lint all code
- `npm run format` - Format all code
- `npm run docker:dev` - Start development environment with Docker

### Services

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Technology Stack

### Backend
- Node.js with Express.js
- TypeScript
- PostgreSQL (primary database + time-series data)
- Redis (caching & sessions)
- Socket.io (real-time communication)
- Bull Queue (job processing)

### Frontend
- React 18 with TypeScript
- Material-UI (components)
- Vite (build tool)
- Chart.js (data visualization)
- React Query (state management)
- Socket.io (real-time updates)

### Development Tools
- ESLint + Prettier (code quality)
- Jest + Vitest (testing)
- Docker (containerization)
- TypeScript (type safety)

## Next Steps

1. Configure your AI API keys in `backend/.env`
2. Set up database migrations
3. Implement authentication system
4. Build core monitoring services
5. Create dashboard components

For detailed implementation guidance, see the spec documents in `.kiro/specs/llm-brand-monitoring/`.