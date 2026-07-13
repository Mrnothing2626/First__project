# 📦 hack_deliveryproject

> **Privacy-Preserving Logistics Backend** — A tokenized delivery tracking system built for the IIT Madras BS Hackathon.

---

## 🚀 Overview

This project is a **secure, privacy-first logistics backend** that protects customer PII (Personally Identifiable Information) through **tokenization** and enforces strict access control via **Role-Based Access Control (RBAC)** and **JWT authentication**.

Delivery agents never see a customer's real name, phone number, or address — they only interact with anonymized tokens, making the system compliant with modern data-privacy principles.

---

## ✨ Features

- 🔐 **PII Tokenization** — Customer sensitive data (name, phone, location) is stored separately from the tracking token
- 🪪 **JWT Authentication** — Stateless, secure authentication for all protected routes
- 🛡️ **RBAC Middleware** — Role-based access control (Admin, Warehouse, Delivery Agent, etc.)
- 📍 **Package Lifecycle Tracking** — Full status tracking from `Order Placed` → `Delivered`
- 🔑 **OTP Delivery Confirmation** — One-time password secret stored per package for secure handoff
- 📱 **QR Code Support** — QR code generation for package tracking
- 🗄️ **MongoDB with Mongoose** — Schema-validated, document-based storage

---

## 🏗️ Project Structure

```
hack_deliveryproject/
├── server.js               # Main entry point — app init, DB connection, routes
├── models/
│   └── Package.js          # Mongoose schema for Package documents
├── routes/
│   └── packageRoutes.js    # All package-related API endpoints
├── middleware/
│   └── verifyToken.js      # JWT verification & RBAC middleware
├── .env                    # Environment variables (not committed)
└── package.json
```

---

## 🛠️ Tech Stack

| Layer        | Technology         |
|--------------|--------------------|
| Runtime      | Node.js            |
| Framework    | Express.js         |
| Database     | MongoDB + Mongoose |
| Auth         | JWT (jsonwebtoken) |
| Password     | bcryptjs           |
| QR Codes     | qrcode             |
| Config       | dotenv             |
| Dev Server   | nodemon            |

---

## ⚙️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v16+
- [MongoDB](https://www.mongodb.com/) (local or Atlas)

### Installation

```bash
# Clone the repository
git clone https://github.com/AbradolfLincler-c137/hack_deliveryproject.git
cd hack_deliveryproject

# Install dependencies
npm install
```

### Environment Setup

Create a `.env` file in the root directory:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/logistics_db
JWT_SECRET=your_super_secret_key
```

### Run the Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

The server will start at `http://localhost:3000`.

---

## 📦 Package Status Flow

```
Order Placed → In Warehouse → Out for Delivery → Arrived at Sector → Delivered
```

---

## 🔒 Privacy Design

- **Tracking tokens** are public-facing identifiers — they contain **zero PII**
- **PII data** (`customerName`, `phone`, `macroLocation`, `microLocation`) is stored in a protected sub-document
- **Delivery agents** only receive tokenized data; PII is only accessible to authorized admin roles
- **OTP confirmation** ensures package handoff is verified

---

## 👥 Team

Built for the **IIT Madras BS Hackathon** 🎓

---

## 📄 License

MIT License — feel free to use and modify.
