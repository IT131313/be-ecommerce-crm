# Authentication Backend

A Node.js Express backend with MySQL for user authentication system.

## Features

- User registration with email and username
- User login with email/username and password
- Password reset functionality with PIN code
- JWT-based authentication
- MySQL database for data persistence
- Google OAuth integration (configured separately)

## Prerequisites

- Node.js (v14 or higher)
- MySQL Server
- npm or yarn

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create .env file in the root directory and add your configuration:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=auth_db
JWT_SECRET=your_jwt_secret_key
GOOGLE_CLIENT_ID=your_google_client_id
PORT=8000
```

3. Initialize the database:
```bash
npm run init-db
```

## Running the Server

Development mode with auto-reload:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### Authentication

- POST `/api/auth/register`
  - Register a new user
  - Body: `{ email, username, password, confirmPassword }`

- POST `/api/auth/login`
  - Login with email/username and password
  - Body: `{ emailOrUsername, password }`

- POST `/api/auth/forgot-password`
  - Request password reset PIN
  - Body: `{ email }`

- POST `/api/auth/reset-password`
  - Reset password using PIN
  - Body: `{ email, pin, newPassword, confirmNewPassword }`

## Security

- Passwords are hashed using bcrypt
- JWT tokens for authentication
- CORS enabled
- Input validation and sanitization
- Rate limiting (to be implemented)
