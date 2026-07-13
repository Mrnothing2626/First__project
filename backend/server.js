// =============================================================================
// server.js — Tokenized, Privacy-Preserving Logistics Backend
// =============================================================================
// Think of this file like a C program's main.c — it wires everything together:
//   1. Import libraries (like #include in C)
//   2. Define our "struct" for the database (the Mongoose Schema)
//   3. Write middleware (like a filter function that runs before every route)
//   4. Define route handlers (like functions that respond to specific HTTP calls)
//   5. Start the server (like the main() entry point)
// =============================================================================

// 'dotenv' MUST be the very first statement so that ALL process.env.* reads
// below — including MONGODB_URI, PORT, JWT_SECRET — are already populated
// before any other module or expression is evaluated.
require('dotenv').config();


// --- 1. IMPORTS (equivalent to #include in C) --------------------------------

// 'express' is a web framework. It handles HTTP requests and routing for us.
const express = require('express');

// 'cors' enables Cross-Origin Resource Sharing so the React frontend (served
// from a different origin) can make requests to this API without being blocked
// by the browser's Same-Origin Policy.
const cors = require('cors');

// 'mongoose' is an ODM (Object-Document Mapper) for MongoDB.
const mongoose = require('mongoose');

// 'path' is a built-in Node.js module for resolving filesystem paths in a
// cross-platform way (handles Windows backslashes vs Unix forward slashes).
const path = require('path');

// JWT verification middleware — validates Bearer tokens on protected routes.
// Defined in middleware/verifyToken.js (created in the previous step).
const verifyToken = require('./middleware/verifyToken');

// Package creation (and future package routes) are mounted from this router.
// Using Express Router keeps server.js clean and each feature in its own file.
const packageRoutes = require('./routes/packageRoutes');

// Authentication routes (login → JWT issuance) are mounted from this router.
const authRoutes    = require('./routes/authRoutes');


// --- 2. APP INITIALIZATION ---------------------------------------------------

// express() returns an application object. This is our server instance.
// In C terms: think of it as a struct holding all routes, middleware, and config.
const app = express();

// Tell Express to automatically parse incoming request bodies as JSON.
// Without this, req.body would be undefined when a client sends JSON data.
// It's like setting up an input parser at the start of main().
app.use(express.json());

// Allow all cross-origin requests. In production, replace '*' with the
// exact frontend URL (e.g., 'https://my-app.vercel.app') to tighten security.
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
  credentials: true
}));

// Serve the static frontend client (HTML, CSS, JS) from the parallel
// frontend folder. Express will look for files relative to this path first
// before passing requests to the API route handlers below.
app.use(express.static(path.join(__dirname, '../frontend')));

// The port our server will listen on.
// process.env.PORT reads from the .env file. If it's not set, default to 3000.
// The || (OR) operator works just like in C: if the left side is falsy, use right.
const PORT = process.env.PORT || 3000;

// The MongoDB connection URI — loaded exclusively from the MONGODB_URI key in
// .env (which holds the Atlas cloud connection string).
// We intentionally provide NO localhost fallback: if the env var is missing,
// we want a clear startup failure rather than a silent connect-to-wrong-DB bug.
const MONGO_URI = process.env.MONGODB_URI;

let mongoServer = null;

// --- 3. DATABASE CONNECTION --------------------------------------------------

(async () => {
  try {
    let connectionUri = MONGO_URI;

    if (!connectionUri) {
      console.log('[DB] ℹ️ MONGODB_URI is not set. Launching an in-memory MongoDB database...');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      mongoServer = await MongoMemoryServer.create();
      connectionUri = mongoServer.getUri();
      // Set the environment variable so other files can access it if needed
      process.env.MONGODB_URI = connectionUri;
    }

    await mongoose.connect(connectionUri);
    console.log('[DB] ✅ Successfully connected to MongoDB at:', connectionUri);

    // Auto-seed default agents and packages if DB is empty
    const bcrypt = require('bcryptjs');
    const AgentSchema = new mongoose.Schema(
      {
        agentId:  { type: String, required: true, unique: true, trim: true },
        password: { type: String, required: true },
        name:     { type: String, required: true, trim: true },
        role:     { type: String, default: 'Delivery_Agent' },
      },
      { timestamps: true }
    );
    const Agent = mongoose.models.Agent || mongoose.model('Agent', AgentSchema);
    const agentCount = await Agent.countDocuments();
    if (agentCount === 0) {
      const SALT_ROUNDS = 12;
      const SEED_AGENTS = [
        {
          agentId:  'AGENT1',
          password: 'password123',
          name:     'XYZ',
          role:     'Delivery_Agent',
        },
        {
          agentId:  'ADMIN1',
          password: 'admin123',
          name:     'Admin User',
          role:     'Admin',
        },
      ];
      for (const agentData of SEED_AGENTS) {
        const hashedPassword = await bcrypt.hash(agentData.password, SALT_ROUNDS);
        await Agent.create({
          agentId: agentData.agentId,
          password: hashedPassword,
          name: agentData.name,
          role: agentData.role,
        });
      }
      console.log('[DB] 🎉 Automatically seeded default users: ADMIN1 (admin123) and AGENT1 (password123)');
    }

    const Package = require('./models/Package');
    const pkgCount = await Package.countDocuments();
    if (pkgCount === 0) {
      await Package.create({
        trackingToken: 'PKG_DEMO1234',
        piiData: {
          customerName: 'Riya Sharma',
          phone: '+91-9876543210',
          macroLocation: 'Sector 14, Gurugram, Haryana',
          microLocation: 'Flat 4B, Sunrise Apartments, MG Road',
        },
        status: 'Out for Delivery',
      });
      console.log('[DB] 🎉 Automatically seeded demo package PKG_DEMO1234.');
    }

    // Only start listening for HTTP requests AFTER the DB is ready.
    app.listen(PORT, () => {
      console.log(`\n[SERVER] 🚀 Server ready!`);
      console.log(`   ├── 🧑‍💼 Delivery Agent Portal : http://localhost:${PORT}/agent`);
      console.log(`   └── 🛡️  Admin Command Centre  : http://localhost:${PORT}/admin\n`);
    });

  } catch (error) {
    console.error('[DB] ❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
})();

// Graceful shutdown helper
const cleanup = async () => {
  if (mongoServer) {
    await mongoose.disconnect();
    await mongoServer.stop();
    console.log('\n[DB] ℹ️ In-memory MongoDB stopped.');
  }
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);


// =============================================================================
// --- 4. MONGOOSE MODEL (imported from models/Package.js) --------------------
// =============================================================================
// The Package schema and model are now defined in models/Package.js.
// We import it here so server.js routes can still use Package.findOne() etc.
// The model file uses mongoose.models.Package || mongoose.model(...) to ensure
// the model is only compiled once, even if required by multiple files.
const Package = require('./models/Package');


// =============================================================================
// --- 5. MIDDLEWARE: Mock Authentication / Role Injector ----------------------
// =============================================================================
// Middleware in Express is a function that runs BEFORE the route handler.
// Think of it like a C function pointer passed into a pipeline:
//   request → [middleware1] → [middleware2] → [route handler] → response
//
// Every middleware function receives THREE arguments:
//   req  — The incoming request object (headers, body, params, etc.)
//   res  — The response object (we use this to send back data)
//   next — A function. Calling next() passes control to the NEXT middleware
//          or route handler. NOT calling next() stops the chain.

const mockAuthMiddleware = (req, res, next) => {
  // Read the 'x-user-role' header from the incoming HTTP request.
  // HTTP headers are key-value pairs sent by the client.
  // req.headers is an object; keys are always lowercase in Node.js HTTP.
  // In a real system, this would be a JWT token decoded and verified here.
  const role = req.headers['x-user-role'];

  // Define the set of roles we accept. Using a Set gives O(1) lookup,
  // similar to using a hash table in C to check membership.
  const validRoles = new Set(['Admin', 'Warehouse', 'Delivery_Agent']);

  // Check if the provided role is in our allowed set.
  if (!role || !validRoles.has(role)) {
    // 403 Forbidden: The client's identity is known, but they lack permission.
    // res.status(403) sets the HTTP status code.
    // .json({...}) serializes a JS object to a JSON string and sends it.
    // We return here to STOP execution — do NOT call next().
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Missing or invalid x-user-role header.',
      validRoles: ['Admin', 'Warehouse', 'Delivery_Agent'],
    });
  }

  // Attach the role to the request object as a custom 'user' property.
  // This is the equivalent of storing the role in a struct field that's
  // passed by reference through all downstream functions.
  // Any route handler downstream can now read req.user.role.
  req.user = { role: role };

  // Call next() to pass control to the next middleware or route handler.
  // If we don't call this, the request hangs and the client waits forever.
  next();
};


// =============================================================================
// --- 6. HELPER: OTP Generator ------------------------------------------------
// =============================================================================
// A small, pure utility function (no side effects, like a C helper function).
// Generates a random 4-digit numeric string, e.g., "0472" or "9183".

const generateOTP = () => {
  // Math.random() returns a float in [0.0, 1.0).
  // Multiplying by 9000 gives [0, 9000), adding 1000 gives [1000, 10000).
  // Math.floor() truncates the decimal, giving an integer in [1000, 9999].
  // .toString() converts the integer to a string (e.g., 1234 → "1234").
  // This ensures it's always exactly 4 digits.
  return Math.floor(1000 + Math.random() * 9000).toString();
};


// =============================================================================
// --- 7. ROUTE: POST /api/package/verify (The Core RBAC Endpoint) -------------
// =============================================================================
// Flow:
//   Client sends POST with { "trackingToken": "PKG_XXXXXXXX" }
//   → verifyToken middleware runs first (validates Bearer JWT from Authorization header)
//   → This handler runs (queries DB, applies RBAC, returns role-filtered data)
//
// The frontend sends:  Authorization: Bearer <token>
// verifyToken decodes the JWT and attaches req.user = { id, role, iat, exp }
// The role encoded in the JWT at login time drives the RBAC logic below.

app.post('/api/package/verify', verifyToken, async (req, res) => {
  try {
    const { trackingToken } = req.body;

    if (!trackingToken) {
      return res.status(400).json({
        success: false,
        error: 'Request body must contain a "trackingToken" field.',
      });
    }

    // Role is now decoded from the JWT payload by verifyToken middleware
    const userRole = req.user.role;


    // =========================================================================
    // --- Step C: ROLE-BASED ACCESS CONTROL (RBAC) Logic ---------------------
    // =========================================================================
    // We use a series of if/else-if blocks to branch logic based on the role.
    // This is the core privacy mechanism of the system.

    // ---- CASE 1: ADMIN — Full Access ----------------------------------------
    if (userRole === 'Admin') {

      // Find ONE document in the 'packages' collection where trackingToken matches.
      // Package.findOne({ field: value }) returns either:
      //   - A document object (if found)
      //   - null (if no document matches)
      // 'await' pauses this function until MongoDB responds.
      const packageDoc = await Package.findOne({ trackingToken: trackingToken });

      // If findOne returned null, no package with that token exists.
      if (!packageDoc) {
        return res.status(404).json({ success: false, error: 'Package not found.' });
      }

      // Admin sees everything. Return the raw Mongoose document.
      // .toObject() converts the Mongoose document to a plain JS object.
      // This is often done to avoid Mongoose-specific prototype methods leaking.
      return res.status(200).json({
        success: true,
        role: userRole,
        data: packageDoc.toObject(),
      });
    }

    // ---- CASE 2: WAREHOUSE — Partial Access (Status + Macro Location Only) --
    else if (userRole === 'Warehouse') {

      // MongoDB PROJECTIONS let us select WHICH fields to return — like
      // SELECT col1, col2 FROM table in SQL, instead of SELECT *.
      //
      // Projection syntax: { fieldName: 1 } means INCLUDE this field.
      //                    { fieldName: 0 } means EXCLUDE this field.
      // You cannot MIX include (1) and exclude (0) in one projection,
      // EXCEPT for the special _id field which can always be excluded.
      //
      // For nested objects like piiData, use dot notation: 'piiData.macroLocation'
      // This returns ONLY piiData.macroLocation, NOT piiData.phone etc.
      const packageDoc = await Package.findOne(
        { trackingToken: trackingToken },   // Filter condition (the WHERE clause)
        {                                    // Projection (the SELECT clause)
          status: 1,                         // Include the 'status' field
          'piiData.macroLocation': 1,        // Include ONLY the macro location from piiData
          _id: 0,                            // Exclude MongoDB's internal _id field
          trackingToken: 1,                  // Include token so the response is identifiable
        }
      );

      if (!packageDoc) {
        return res.status(404).json({ success: false, error: 'Package not found.' });
      }

      // The returned document already has PII masked at the DB query level.
      // piiData.phone, piiData.customerName, piiData.microLocation are never
      // fetched from the database — they don't even travel over the wire.
      return res.status(200).json({
        success: true,
        role: userRole,
        data: packageDoc.toObject(),
      });
    }

    // ---- CASE 3: DELIVERY AGENT — Context-Sensitive Access ------------------
    else if (userRole === 'Delivery_Agent') {

      // For a Delivery Agent, what data they get depends on the PACKAGE STATUS.
      // We need to know the status first, so we fetch the package with
      // just enough data to make the decision.
      //
      // We fetch a few fields to make the role decision. We'll apply
      // fine-grained projection in a moment based on status.
      const packageDoc = await Package.findOne({ trackingToken: trackingToken });

      if (!packageDoc) {
        return res.status(404).json({ success: false, error: 'Package not found.' });
      }

      const currentStatus = packageDoc.status;

      // --- Sub-Case A: Package is "Out for Delivery" → Minimal info only ---
      if (currentStatus === 'Out for Delivery') {

        // The agent is en route to the sector but hasn't arrived yet.
        // They only need to know the broad area (macroLocation).
        // We do NOT reveal the customer's name, phone, or exact address yet.
        return res.status(200).json({
          success: true,
          role: userRole,
          data: {
            trackingToken: packageDoc.trackingToken,
            status: packageDoc.status,
            piiData: {
              macroLocation: packageDoc.piiData.macroLocation,
              // All other piiData fields are intentionally omitted here.
              // They are NOT sent to the client — privacy is preserved.
            },
          },
        });
      }

      // --- Sub-Case B: Package is "Arrived at Sector" → Full delivery info + OTP ---
      else if (currentStatus === 'Arrived at Sector') {

        // The agent is physically at the delivery sector.
        // Now we reveal the customer's name and precise address for last-mile delivery.
        // We also generate a One-Time Password (OTP) for delivery confirmation.

        // --- Generate a fresh 4-digit OTP ---
        const otp = generateOTP();
        // Console log the OTP to the SERVER terminal (visible to dispatch/ops).
        // This simulates what would normally be sent via SMS to the customer.
        console.log(
          `[OTP] 🔐 Generated OTP for package ${packageDoc.trackingToken}: ${otp}`
        );
        console.log(`[OTP]    Agent can confirm delivery when customer provides: ${otp}`);

        // --- Save the OTP to the database ---
        // We UPDATE the document in-place. Two approaches:
        //
        // Option A (used here): Modify the fetched document and call .save()
        //   packageDoc.otpSecret = otp;
        //   await packageDoc.save();
        //
        // Option B: Use Package.findOneAndUpdate() for a single atomic DB call.
        //   (Better for high-concurrency; used below)
        //
        // We use findOneAndUpdate to atomically update the OTP in the DB.
        // { new: true } returns the UPDATED document, not the original.
        // runValidators: true ensures Mongoose schema validations still run.
        const updatedPackage = await Package.findOneAndUpdate(
          { trackingToken: trackingToken },       // Find this document
          { $set: { otpSecret: otp } },           // Set the otpSecret field to the new OTP
          { new: true, runValidators: true }       // Options: return updated doc, run schema validation
        );

        // Return the sensitive delivery data + confirmation that OTP was generated.
        return res.status(200).json({
          success: true,
          role: userRole,
          message: 'OTP generated and logged to server console for dispatch.',
          data: {
            trackingToken: updatedPackage.trackingToken,
            status: updatedPackage.status,
            piiData: {
              customerName: updatedPackage.piiData.customerName,       // Revealed at this stage
              macroLocation: updatedPackage.piiData.macroLocation,     // Still included for context
              microLocation: updatedPackage.piiData.microLocation,     // Exact address revealed now
              // piiData.phone is still withheld — agent doesn't need it
            },
            // We send a confirmation flag, NOT the OTP itself, to the agent's device.
            // The customer tells the agent the OTP verbally (received via SMS).
            otpIssued: true,
          },
        });
      }

      // --- Sub-Case C: Any Other Status (e.g., 'Order Placed', 'Delivered') ---
      else {
        // The Delivery Agent has no legitimate reason to scan packages that
        // aren't actively in the delivery phase. Return minimal info.
        return res.status(200).json({
          success: true,
          role: userRole,
          message: `Package is not in a deliverable state. Current status: ${currentStatus}`,
          data: {
            trackingToken: packageDoc.trackingToken,
            status: currentStatus,
          },
        });
      }
    }

    // ---- CASE 4: Catch-all for any role that slipped through ----------------
    // This should never be reached because mockAuthMiddleware already validates
    // roles. But it's good defensive programming (like a default: in a C switch).
    else {
      return res.status(403).json({
        success: false,
        error: `Role "${userRole}" is not authorized to access this resource.`,
      });
    }

  } catch (error) {
    // --- Global Error Handler for this Route ---
    // If ANY await call above throws an error (e.g., DB is down, network timeout,
    // Mongoose validation error), execution jumps here immediately.
    // In C terms, this is like a goto cleanup: label that handles all error paths.
    console.error('[ERROR] /api/package/verify failed:', error.message);

    // 500 Internal Server Error: Something unexpected went wrong on our end.
    // We do NOT send the raw error.message to the client in production
    // (it might reveal internal structure). Here we keep it for development.
    return res.status(500).json({
      success: false,
      error: 'An internal server error occurred. Please try again.',
      // In production, remove the 'details' field below:
      details: error.message,
    });
  }
});


// =============================================================================
// --- 8a. AUTH ROUTES MOUNT (Router from routes/authRoutes.js) ---------------
// =============================================================================
// Every route defined in authRoutes.js is prefixed with '/api/auth'.
//
//   router.post('/login', ...)  → POST /api/auth/login
//
app.use('/auth', authRoutes);


// =============================================================================
// --- 8b. PACKAGE ROUTES MOUNT (Router from routes/packageRoutes.js) ---------
// =============================================================================
// Every route defined in packageRoutes.js is prefixed with '/api/package'.
//
//   router.post('/create', ...)     → POST /api/package/create
//   router.post('/verify-otp', ...) → POST /api/package/verify-otp
//
// This must come BEFORE the 404 fallback handler at the bottom.
app.use('package', packageRoutes);


// =============================================================================
// --- 9. UTILITY ROUTE: POST /api/package/seed (Development Helper Only) -----
// =============================================================================
// This route lets you quickly insert a test package into the database
// WITHOUT needing a separate script or MongoDB Compass.
// Remove or guard this behind an Admin check in production!

app.post('/api/package/seed', async (req, res) => {
  try {
    // Create a new Package document with hardcoded test data.
    // Package.create() is equivalent to:
    //   const p = new Package({...}); await p.save();
    // It both constructs and saves the document in one call.
    const testPackage = await Package.create({
      trackingToken: req.body.trackingToken || `PKG_${Date.now()}`,
      piiData: {
        customerName: req.body.customerName || 'Riya Sharma',
        phone: req.body.phone || '+91-9876543210',
        macroLocation: req.body.macroLocation || 'Sector 14, Gurugram, Haryana',
        microLocation: req.body.microLocation || 'Flat 4B, Sunrise Apartments, MG Road',
      },
      status: req.body.status || 'Out for Delivery',
    });

    return res.status(201).json({
      success: true,
      message: 'Test package seeded successfully.',
      data: testPackage.toObject(),
    });

  } catch (error) {
    // Handle duplicate key errors gracefully (e.g., token already exists).
    // MongoDB error code 11000 = duplicate key violation.
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'A package with this trackingToken already exists.',
      });
    }
    console.error('[ERROR] /api/package/seed failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});


// =============================================================================
// --- 10. 404 FALLBACK HANDLER (Must be LAST in the file) --------------------
// =============================================================================
// If a request doesn't match any of our defined routes above, Express will
// fall through to this catch-all middleware.
// The order matters: Express matches routes TOP-TO-BOTTOM, like a chain of
// if/else-if blocks. This MUST be the last app.use() call.

// Wildcard handler: for any request that didn't match an /api/* route above,
// =============================================================================
// --- 10. NAMED PORTAL ROUTES -------------------------------------------------
// =============================================================================
// Clean URLs for both user-facing portals.
//   GET /agent  →  Delivery Agent app  (Index.html)
//   GET /admin  →  Admin Command Centre (admin.html)
// These must come BEFORE the wildcard handler below.

app.get('/agent', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'Index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'admin.html'));
});

// Redirect bare root / to the agent portal by default
app.get('/', (req, res) => {
  res.redirect('/agent');
});

// 404 for any other unmatched GET (static files are handled by express.static above)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl} — route not found.`,
  });
});


// =============================================================================
// END OF FILE
// Note: The server is started inside the async IIFE at the top (Section 3),
// only after the database connection is confirmed. This ensures no requests
// are served before the DB is ready — avoiding race conditions.
// =============================================================================
