# GRID Shop Manager ERP — Full-Stack Deployment & Authentication Guide

This document outlines the full-stack architecture, Google OAuth integration, user provisioning, whitelist enforcement, and deployment workflows for **GRID Shop Manager ERP**.

---

## 1. System Architecture & Requirements Overview

The application is structured as a full-stack, real-time enterprise resource planning (ERP) system:

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | Vanilla JS (ES Modules) & CSS | 36 integrated ERP views (Sales, CRM, Billing, Stock, HR, Accounts) |
| **Backend** | Node.js (v20+) with Express | REST API, Server-Sent Events (SSE) live sync, Google OAuth verification |
| **Database** | Persistent JSON / Document Store | Atomic file transactions, sequential counter leases, collection watches |
| **Authentication** | Google Identity Services (GIS) / Direct Admin | Strict whitelist verification, HTTP-only session cookies |

---

## 2. Requirement Compliance Matrix

### 1. Default Owner-Admin
- **Configured Super Admin**: `marashidnk@gmail.com`
- **Seeded Role**: `admin` (Owner level with full access across all modules).
- **Initialization**: Automatically seeded in `data/database.json` and guaranteed upon every server boot.

### 2. Admin User Management (Inside Existing Interface)
- **Zero Extra Panels**: All user management is seamlessly integrated into the existing **Users & Roles** view (`#/users`) under the **Management** sidebar group.
- **Direct Login**: The Super Admin (`marashidnk@gmail.com`) can log in directly using the **Direct Admin Login** button or with their Google account.
- **Provisioning Fields**: When adding a user via the existing `＋ Add user` dialog, the admin specifies:
  1. **Full Name** (`name`)
  2. **Email Address** (`email`)
  3. **Role** (`role` — Salesman, Billing & Accounts, Manager, or Custom Role)
- **Revocation**: The admin can change roles or click **✕** to revoke access directly from the Staff table.

### 3. Google Authentication & Whitelist Restriction
- **Google OAuth Integration**: Configured with Google Identity Services (GIS).
- **Strict Whitelist Enforcement**:
  - Whenever a user attempts to sign in using Google, the backend checks if their email is `marashidnk@gmail.com` OR pre-added to the whitelist by an authorized admin.
  - **Unauthorized User Blocking**: If the email is NOT in the whitelist, the login is blocked with HTTP 403 and the clear message:
    > *"Access denied: Your email (user@example.com) is not authorized or whitelisted in this system. Please contact the administrator at marashidnk@gmail.com."*
- **Role-Based Redirection**: Upon successful Google sign-in:
  - **Salesman (`sales`)** → Redirected to **My Day** (`#/myday`); Billing, Accounts, and Management modules are hidden and forbidden.
  - **Billing & Accounts (`billing`)** → Redirected to **My Day** with Billing & Money modules enabled.
  - **Manager (`manager`)** → Redirected to **Dashboard** (`#/dashboard`).
  - **Super Admin (`admin`)** → Redirected to **Dashboard** (`#/dashboard`) with full master privileges.

### 4. Preservation of Scope & Constraints
- 100% of the existing UI design, wood styling, themes, business logic, calculations, and components remain intact.
- No separate admin dashboard was created.

---

## 3. Configuring Google Cloud OAuth 2.0

To enable official Google Sign-In for your domain:

1. Visit the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project (e.g. `grid-erp`).
3. Navigate to **APIs & Services** → **OAuth consent screen**:
   - User Type: **External**
   - App Name: `GRID Shop Manager`
   - User support email: `marashidnk@gmail.com`
   - Developer contact information: `marashidnk@gmail.com`
   - Scopes: `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`
4. Navigate to **APIs & Services** → **Credentials**:
   - Click **＋ Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `GRID ERP Web Client`
   - **Authorized JavaScript origins**:
     - Local testing: `http://localhost:3000`
     - Production: `https://your-domain.com` (or your Render/Railway URL)
   - **Authorized redirect URIs**:
     - `http://localhost:3000`
     - `https://your-domain.com`
5. Copy your **Client ID** and **Client Secret**.
6. Set them in your `.env` or deployment dashboard:
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

---

## 4. Deployment Instructions

### Option A: 1-Click Deploy on Render (Recommended Free/Low Cost)
1. Push this repository to GitHub or GitLab.
2. In [Render Dashboard](https://dashboard.render.com/), click **New** → **Blueprint** (or **Web Service**).
3. Connect your repository. Render will automatically detect [`render.yaml`](file:///Users/mac/Desktop/grid%20erp/render.yaml).
4. Set Environment Variables:
   - `ADMIN_EMAIL`: `marashidnk@gmail.com`
   - `GOOGLE_CLIENT_ID`: (Your Google Client ID)
   - `GOOGLE_CLIENT_SECRET`: (Your Google Client Secret)
5. Deploy! Render creates the web service with a persistent disk for the database.

### Option B: Deploy on Railway
1. In [Railway](https://railway.app/), click **New Project** → **Deploy from GitHub repo**.
2. Select your repository. Railway automatically reads [`Procfile`](file:///Users/mac/Desktop/grid%20erp/Procfile) and starts `node server.js`.
3. Add a persistent volume mounted to `/app/data` to preserve your database and uploads.
4. Add environment variables under **Variables**:
   - `ADMIN_EMAIL=marashidnk@gmail.com`
   - `GOOGLE_CLIENT_ID=...`
   - `GOOGLE_CLIENT_SECRET=...`

### Option C: Deploy with Docker
1. Build the Docker image:
   ```bash
   docker build -t grid-erp .
   ```
2. Run the container with persistent storage:
   ```bash
   docker run -d \
     --name grid-erp \
     -p 3000:3000 \
     -v grid_erp_data:/app/data \
     -e ADMIN_EMAIL="marashidnk@gmail.com" \
     -e GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com" \
     grid-erp
   ```

### Option D: Run on VPS (Ubuntu / Debian with PM2)
```bash
# Clone and install
git clone <repo-url> /var/www/grid-erp
cd /var/www/grid-erp
npm install --production

# Create .env
cp .env.example .env
nano .env

# Run with PM2
npm install -g pm2
pm2 start server.js --name "grid-erp"
pm2 save
pm2 startup
```

---

## 5. Local Running & Verification

```bash
# Install dependencies
npm install

# Start the full-stack server
npm start
```
Visit `http://localhost:3000` in your browser.
