# SwiftRoute — Tokenized Privacy-Preserving Logistics Portal

SwiftRoute is a lightweight, privacy-preserving logistics management application built for hackathon presentations. It demonstrates **Role-Based Access Control (RBAC)** and **Context-Sensitive PII Masking** to secure customer data across delivery operations.

---

## 🚀 Key Features

1. **Dual Command Portals**:
   - **🛡️ Admin Command Centre**: Provision packages, generate cryptographically secure tracking tokens, instantly render scannable QR codes, and monitor the live registry.
   - **🧑‍💼 Delivery Agent App**: Scan parcel QR codes using a browser camera feed, fetch context-filtered delivery sectors, and complete secure handovers via One-Time Passwords (OTP).
2. **Context-Sensitive PII Masking**:
   - **Warehouse / Out for Delivery**: Agents see only broad macro locations (e.g. Sector-level address). Exact customer names, micro addresses, and phone numbers are completely masked.
   - **Arrived at Sector**: Once the agent arrives physically in the sector, exact delivery locations and customer names are dynamically revealed, and a secure 4-digit verification OTP is dispatched.
3. **Cryptographic Integrity**:
   - High-entropy tracking tokens generated via system-level entropy (`crypto.randomBytes`).
   - Secure stateless authentication using JSON Web Tokens (JWT).
   - Solid password hashing using `bcryptjs` with 12 salt rounds.

---

## 📁 Repository Structure

```
E:\iitmhackthon\
├── backend\
│   ├── middleware\
│   │   └── verifyToken.js         # JWT validation & role decoding
│   ├── models\
│   │   └── Package.js             # Mongoose MongoDB Package Schema
│   ├── routes\
│   │   ├── authRoutes.js          # Authentication (login & JWT issuance)
│   │   └── packageRoutes.js       # Package creation, list registry, verify OTP
│   ├── .env.example               # Template for backend configuration
│   ├── package.json               # Backend dependencies & script definitions
│   ├── seed.js                    # Database provisioning utility
│   └── server.js                  # Express server & core verification handlers
└── frontend\
    ├── admin.html                 # Admin portal login & panel layout
    ├── admin.js                   # Admin panel operations (Create, List, Print)
    ├── Index.html                 # Delivery agent portal login & dashboard
    ├── app.js                     # Agent actions (Scan QR, Input OTP)
    ├── config.js                  # Central API base URL configuration
    └── style.css                  # Shared premium modern dark UI styles
```

---

## 🛠️ Step-by-Step Setup Guide

### Prerequisites
- [Node.js](https://nodejs.org/) installed (v18+ recommended)
- A running MongoDB Atlas cluster or Local MongoDB instance

---

### Step 1: Configuration

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Make sure your `.env` file exists in the `backend/` directory with `PORT`, `MONGODB_URI`, and `JWT_SECRET` populated.

---

### Step 2: Install Dependencies

Run the following command from the `backend/` directory to fetch express, mongoose, bcrypt, jwt, and qrcode packages:
```bash
npm install
```

---

### Step 3: Seed the Database

Seed the database to clear old test records and provision the two demonstration accounts:
```bash
node seed.js
```
*Successfully seeded logs will confirm details for both profiles.*

---

### Step 4: Run the Application

Start the Express development server:
```bash
npm start
```
*Output will log successful server binding on port 3000 and confirm DB connection.*

---

## 🔑 Demo Access Credentials

| Profile Role | Login ID | Password | Portal URL |
|---|---|---|---|
| **🛡️ Administrator** | `ADMIN1` | `admin123` | [http://localhost:3000/admin](http://localhost:3000/admin) |
| **🧑‍💼 Delivery Agent** | `AGENT1` | `password123` | [http://localhost:3000/agent](http://localhost:3000/agent) |

---

## 🔄 End-to-End Walkthrough Flow

1. **Generate QR Label**:
   - Open the **Admin Command Centre** (`/admin`), log in as `ADMIN1`, fill in customer address details, and click **Generate**.
   - A unique package token and QR code will appear on screen.
2. **Assign to agent**:
   - Under the admin table, the package status will be visible as `Order Placed`.
3. **Delivery Simulation**:
   - Open the **Delivery Agent App** (`/agent`) in another window/device, and log in as `AGENT1`.
   - Initialize the Matrix Scanner camera stream and scan the QR code.
   - Enter/simulate sectors to transition status and reveal masked address information.
4. **OTP Verification**:
   - Retrieve the OTP logged directly in the backend terminal console logs (simulating the customer SMS channel).
   - Enter the 4-digit code in the agent's handover prompt.
   - Handshake confirms and updates the package registry status to `Delivered` instantly!
