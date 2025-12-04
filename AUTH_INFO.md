# Authentication System

## Login Credentials

**Default Username:** `admin`  
**Default Password:** `safeguard2024`

You can change these by setting environment variables in Railway:
- `AUTH_USERNAME` - Set your preferred username
- `AUTH_PASSWORD` - Set your preferred password
- `SESSION_SECRET` - Set a secure random string for session encryption

## Features

✅ Login page at `/login.html`
✅ Session-based authentication (24-hour sessions)
✅ All API endpoints protected (deals, portfolios, PDF generation)
✅ Logout buttons on all pages
✅ Navigation between Deal Sheets and Portfolio Reviews
✅ Automatic redirect to login if not authenticated

## Navigation

- **Deal Sheets** → Portfolio Reviews (link in toolbar)
- **Portfolio Reviews** → Deal Sheets (link in header)
- **Logout** → Available on all pages

## How It Works

1. User visits any page (e.g., `/` or `/portfolio.html`)
2. Auth check script runs and verifies session
3. If not authenticated → redirects to `/login.html`
4. After successful login → redirects to home page
5. Session persists for 24 hours
6. Logout destroys session and returns to login page

## Testing Locally

Username: `admin`  
Password: `safeguard2024`

Visit: http://localhost:5050

## Testing on Production

Visit: https://safeguard-deal-sheet-production.up.railway.app

Login with the same credentials (unless you've set custom environment variables in Railway).
