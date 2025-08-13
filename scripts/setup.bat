@echo off
setlocal enabledelayedexpansion

echo 🚀 Setting up WhatsApp Integration project...

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Please install Node.js 18+ and try again.
    exit /b 1
)

echo [SUCCESS] Node.js is installed

REM Check if Docker is installed (optional)
docker --version >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Docker is not installed. You'll need to set up MongoDB and Redis manually.
    set DOCKER_AVAILABLE=false
) else (
    echo [SUCCESS] Docker is installed
    set DOCKER_AVAILABLE=true
)

REM Create environment files if they don't exist
echo [INFO] Setting up environment files...

if not exist .env (
    copy .env.example .env >nul
    echo [SUCCESS] Created .env file from template
    echo [WARNING] Please update .env with your actual configuration values
) else (
    echo [WARNING] .env file already exists
)

if not exist backend\.env (
    copy backend\.env.example backend\.env >nul
    echo [SUCCESS] Created backend/.env file from template
) else (
    echo [WARNING] backend/.env file already exists
)

if not exist frontend\.env (
    copy frontend\.env.example frontend\.env >nul
    echo [SUCCESS] Created frontend/.env file from template
) else (
    echo [WARNING] frontend/.env file already exists
)

REM Install root dependencies
echo [INFO] Installing root dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install root dependencies
    exit /b 1
)
echo [SUCCESS] Root dependencies installed

REM Install backend dependencies
echo [INFO] Installing backend dependencies...
cd backend
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install backend dependencies
    exit /b 1
)
cd ..
echo [SUCCESS] Backend dependencies installed

REM Install frontend dependencies
echo [INFO] Installing frontend dependencies...
cd frontend
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install frontend dependencies
    exit /b 1
)
cd ..
echo [SUCCESS] Frontend dependencies installed

REM Create necessary directories
echo [INFO] Creating necessary directories...
if not exist backend\logs mkdir backend\logs
if not exist backend\sessions mkdir backend\sessions
if not exist docker\nginx\ssl mkdir docker\nginx\ssl
echo [SUCCESS] Directories created

echo.
echo [SUCCESS] Setup completed successfully!
echo.
echo 📋 Next Steps:
echo.
echo 1. Update environment variables:
echo    - Edit .env with your production settings
echo    - Edit backend/.env with your backend configuration
echo    - Edit frontend/.env with your frontend configuration
echo.

if "!DOCKER_AVAILABLE!"=="true" (
    echo 2. Start the development environment:
    echo    npm run docker:dev
    echo.
    echo    Or start services individually:
    echo    npm run dev
    echo.
) else (
    echo 2. Set up MongoDB and Redis manually, then:
    echo    npm run dev
    echo.
)

echo 3. Access the application:
echo    - Frontend: http://localhost:3000
echo    - Backend API: http://localhost:3001
echo    - API Documentation: http://localhost:3001/api/docs
echo    - Health Check: http://localhost:3001/health
echo.
echo 4. For production deployment:
echo    - Update .env with production values
echo    - Run: npm run docker:prod
echo.
echo [SUCCESS] Happy coding! 🎉

pause