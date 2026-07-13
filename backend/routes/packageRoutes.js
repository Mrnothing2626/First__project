// =============================================================================
// routes/packageRoutes.js — Package Creation Route
// =============================================================================
// This file defines the POST /api/package/create route.
// It handles the full lifecycle of creating a new package:
//   1. JWT authentication (via verifyToken middleware)
//   2. Admin-only RBAC check
//   3. Input validation
//   4. Cryptographically secure, collision-free tracking token generation
//   5. QR code generation (Base64 Data URL)
//   6. MongoDB persistence
//   7. Structured JSON response
// =============================================================================


// --- IMPORTS -----------------------------------------------------------------

// Express Router: Instead of attaching routes directly to the 'app' object
// (as in server.js), we create a mini sub-application called a Router.
// This lets us define routes in separate files and mount them in server.js.
// In C terms: this is like splitting functions into separate .c files and
// linking them at compile time. The Router is the .c file; server.js is the linker.
const express = require('express');
const router  = express.Router();

// 'crypto' is a BUILT-IN Node.js module — no npm install needed.
// It provides cryptographically secure random number generation.
// This is the key difference from Math.random():
//   Math.random()    → pseudorandom (predictable, seeded by time — NOT safe for tokens)
//   crypto.randomBytes() → uses OS-level entropy (hardware events, truly unpredictable)
// In C, the equivalent would be reading /dev/urandom on Linux.
const crypto = require('crypto');

// 'qrcode' is the npm package we installed. It can generate QR codes as:
//   - PNG files saved to disk
//   - SVG strings
//   - Base64 Data URLs (what we use here — can be embedded directly in HTML/CSS)
const QRCode = require('qrcode');

// Our JWT verification middleware from the previous step.
// The path '../middleware/verifyToken' means: go one directory UP from
// 'routes/', then into 'middleware/', then load 'verifyToken.js'.
const verifyToken = require('../middleware/verifyToken');

// The Package Mongoose Model from server.js — we need it to query and save
// documents to the 'packages' MongoDB collection.
// We require it from server.js where it is defined and exported.
const Package = require('../models/Package');


// =============================================================================
// HELPER: generateUniqueTrackingToken()
// =============================================================================
// This async helper generates a cryptographically random tracking token
// and guarantees it doesn't already exist in the database.
//
// WHY ASYNC? Because checking the database for collisions is an I/O operation.
// We use 'await' inside, so the function must be declared 'async'.
//
// WHY A LOOP? Token collision (generating the same token twice) is astronomically
// unlikely with 8 random alphanumeric chars (36^8 = ~2.8 trillion combinations),
// but we still check defensively. This pattern is called "generate and retry"
// and is common in distributed systems for ID generation.

const generateUniqueTrackingToken = async () => {

  // Define the character set for our token: A-Z and 0-9 = 36 characters.
  // We exclude lowercase to match the spec (PKG_8XH3KD92 style).
  // No special characters to avoid URL encoding issues if used as query params.
  const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  // TOKEN_LENGTH = 8 means we produce 8 random characters after the "PKG_" prefix.
  // Total token looks like: "PKG_" + "8XH3KD92" = "PKG_8XH3KD92" (12 chars total)
  const TOKEN_LENGTH = 8;

  // MAX_ATTEMPTS caps the retry loop. In practice, collisions are near-impossible,
  // but this prevents an infinite loop in a catastrophic edge case (e.g., if the
  // DB has billions of records and the token space is exhausted).
  const MAX_ATTEMPTS = 10;

  // Loop up to MAX_ATTEMPTS times. This is a 'for' loop in JS, identical syntax to C.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {

    // -----------------------------------------------------------------------
    // STEP 1: Generate cryptographically secure raw random bytes
    // -----------------------------------------------------------------------
    // crypto.randomBytes(n) asks the operating system for 'n' bytes of
    // cryptographically secure random data (sourced from hardware entropy).
    //
    // We request TOKEN_LENGTH bytes (8 bytes = 64 bits of entropy).
    // Each byte is a number from 0 to 255.
    //
    // Example output (as an array of numbers): [214, 57, 189, 9, 43, 201, 78, 132]
    const randomBytes = crypto.randomBytes(TOKEN_LENGTH);

    // -----------------------------------------------------------------------
    // STEP 2: Map each raw byte to a character in our CHARSET
    // -----------------------------------------------------------------------
    // We cannot use the raw bytes directly as characters because values 0-255
    // map to non-printable characters and symbols, not A-Z/0-9.
    //
    // SOLUTION: Use the modulo (%) operator to "wrap" each byte into the
    // valid range of our CHARSET indices (0 to 35):
    //   byte % 36 maps any number 0-255 to 0-35
    //
    // IMPORTANT CAVEAT — Modulo Bias:
    //   256 / 36 = 7.11..., meaning values 0-35 appear slightly MORE often
    //   than they should. For a tracking token (not a cryptographic key),
    //   this negligible bias is perfectly acceptable.
    //   For a PIN or encryption key, you'd use rejection sampling instead.
    //
    // Array.from(randomBytes) converts the Buffer (Node.js byte array) into
    // a regular JavaScript array so we can use .map() on it.
    //
    // .map(byte => CHARSET[byte % CHARSET.length]) transforms each number:
    //   byte = 214 → 214 % 36 = 214 - (5*36) = 214 - 180 = 34 → CHARSET[34] = 'Y'
    //   byte = 57  → 57  % 36 = 57  - (1*36) = 57  - 36  = 21 → CHARSET[21] = 'V'
    //   ...and so on for all 8 bytes
    //
    // .join('') concatenates the 8-element character array into a single string.
    const tokenSuffix = Array.from(randomBytes)
      .map(byte => CHARSET[byte % CHARSET.length])
      .join('');

    // Prefix the raw suffix with "PKG_" to form the final tracking token.
    // Template literal syntax: backticks allow embedded expressions with ${}
    // Equivalent to: "PKG_" + tokenSuffix in traditional string concatenation.
    const trackingToken = `PKG_${tokenSuffix}`;

    // Log the generation attempt for audit/debug purposes during development.
    console.log(`[TOKEN] Attempt ${attempt}: Generated candidate token → ${trackingToken}`);

    // -----------------------------------------------------------------------
    // STEP 3: Check for collision in the database
    // -----------------------------------------------------------------------
    // Package.findOne() queries MongoDB for a document with this exact token.
    // It returns the document if found, or null if not found.
    // 'await' pauses until MongoDB responds (non-blocking I/O).
    //
    // We only select the trackingToken field (projection) — we don't need
    // the full document, just to know if it exists. This is faster.
    const existingPackage = await Package.findOne(
      { trackingToken },            // Shorthand for { trackingToken: trackingToken }
      { trackingToken: 1, _id: 0 }  // Projection: only fetch the token field
    );

    // If existingPackage is null, no collision — this token is unique.
    // Return it immediately and exit the loop.
    if (!existingPackage) {
      console.log(`[TOKEN] ✅ Token is unique. Proceeding with: ${trackingToken}`);
      return trackingToken; // Exit the function — we're done
    }

    // If we reach here, a collision occurred (existingPackage is not null).
    // Log the collision and the loop will try again.
    console.warn(`[TOKEN] ⚠️  Collision detected for ${trackingToken}. Retrying... (attempt ${attempt}/${MAX_ATTEMPTS})`);

  } // end of for loop

  // If all MAX_ATTEMPTS failed (statistically near-impossible), throw an error.
  // The calling route handler will catch this in its try/catch block.
  throw new Error(`Failed to generate a unique tracking token after ${MAX_ATTEMPTS} attempts.`);
};


// =============================================================================
// HELPER: generateQRCode(text)
// =============================================================================
// Converts any string into a QR code encoded as a Base64 Data URL.
//
// A Data URL has this format:
//   data:[mediatype];base64,[base64EncodedData]
// Example:
//   data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...
//
// This string can be set directly as the 'src' attribute of an <img> tag:
//   <img src="data:image/png;base64,iVBORw0..." />
// No file upload or separate HTTP request needed — the image IS the string.
//
// QRCode.toDataURL() is ASYNCHRONOUS (it performs pixel-rendering work),
// so this helper must be 'async' and the caller must 'await' it.

const generateQRCode = async (text) => {
  // QRCode.toDataURL(text, options) encodes 'text' into a PNG image as a
  // Base64 Data URL string.
  //
  // Options we provide:
  //   errorCorrectionLevel: 'H' — Highest error correction (30% of the QR code
  //                               can be damaged/obscured and it will still scan).
  //                               Use 'L' for smaller QR images, 'H' for labels
  //                               that might get dirty or partially torn.
  //   width: 300              — Output image size in pixels (300x300 PNG)
  //   margin: 2               — White border around the QR code (in QR "modules")
  //                             Required by scanner spec — don't set to 0.
  //   color.dark: '#1a1a2e'  — Dark module color (custom dark navy instead of black)
  //   color.light: '#ffffff' — Light module color (white background)
  const dataUrl = await QRCode.toDataURL(text, {
    errorCorrectionLevel: 'H',
    width: 300,
    margin: 2,
    color: {
      dark: '#1a1a2e',   // Deep navy for the QR dots — looks premium on print
      light: '#ffffff',  // White background
    },
  });

  // 'dataUrl' is now a string like:
  //   "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAYAAAB..."
  return dataUrl;
};


// =============================================================================
// ROUTE: POST /api/package/create
// =============================================================================
// Full middleware chain for this route:
//   verifyToken  → validates JWT, attaches req.user = { id, role }
//   routeHandler → Admin RBAC check, validation, token gen, QR gen, DB save
//
// This route is mounted at /api/package in server.js, so the full path is:
//   POST http://localhost:3000/api/package/create
//
// router.post(path, middleware, handler) — registers on the Router,
// not directly on the app object. The Router is like a sub-application.

// =============================================================================
// ROUTE: GET /api/package/list  (Admin only)
// =============================================================================
// Returns all packages sorted newest-first.
// Used by the admin panel to populate the packages table.
// =============================================================================
router.get('/list', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Admin role required.' });
    }

    const packages = await Package.find({})
      .sort({ createdAt: -1 })
      .select('-otpSecret');  // never expose the OTP secret

    return res.status(200).json({ success: true, data: packages });
  } catch (err) {
    console.error('[ERROR] GET /api/package/list:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});


router.post('/create', verifyToken, async (req, res) => {
  // 'async' is required because we use multiple 'await' calls inside.


  try {

    // -------------------------------------------------------------------------
    // STEP A: Role-Based Access Control (RBAC) — Admin Only
    // -------------------------------------------------------------------------
    // verifyToken already ran and attached req.user = { id, role, iat, exp }.
    // We simply read req.user.role to enforce Admin-only access.
    //
    // DESIGN DECISION: Why not use the mockAuthMiddleware from server.js?
    // verifyToken is the REAL auth middleware (JWT-based). For the create route,
    // we gate on the role decoded FROM the JWT token itself, not from a custom
    // header. This is production-appropriate.
    if (req.user.role !== 'Admin') {
      // 403 Forbidden: The user IS authenticated (valid JWT), but their role
      // doesn't grant access to this specific resource.
      // "You're known, but not allowed here."
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Role '${req.user.role}' is not authorized to create packages. Requires 'Admin'.`,
      });
    }


    // -------------------------------------------------------------------------
    // STEP B: Input Validation
    // -------------------------------------------------------------------------
    // Destructure the four expected PII fields from the request body.
    // Destructuring syntax: const { a, b } = obj; is equivalent to:
    //   const a = obj.a; const b = obj.b;
    // If a field is missing, its value will be 'undefined'.
    const { customerName, phone, macroLocation, microLocation } = req.body;

    // Validate that ALL required fields are present.
    // We collect missing fields into an array for a helpful error message.
    const missingFields = [];
    if (!customerName) missingFields.push('customerName');
    if (!phone)        missingFields.push('phone');
    if (!macroLocation) missingFields.push('macroLocation');
    if (!microLocation) missingFields.push('microLocation');

    // If any fields are missing, reject with 400 and list what's needed.
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request: Missing required fields.',
        missingFields: missingFields,
        example: {
          customerName: 'Riya Sharma',
          phone: '+91-9876543210',
          macroLocation: 'Sector 14, Gurugram, Haryana',
          microLocation: 'Flat 4B, Sunrise Apartments, MG Road',
        },
      });
    }


    // -------------------------------------------------------------------------
    // STEP C: Generate Cryptographically Secure, Unique Tracking Token
    // -------------------------------------------------------------------------
    // Call our helper. 'await' pauses here until the function returns a token
    // (which may involve multiple DB lookups in the extremely unlikely case of
    // collision). If all attempts fail, it throws — caught below in catch block.
    const trackingToken = await generateUniqueTrackingToken();


    // -------------------------------------------------------------------------
    // STEP D: Generate QR Code as Base64 Data URL
    // -------------------------------------------------------------------------
    // We encode the trackingToken string into a QR code image.
    // The QR code, when scanned by a phone, will produce the token string.
    // A delivery agent's app can then send this to the /api/package/verify route.
    //
    // NOTE: We encode ONLY the token, not the full API URL, because:
    //   - The base URL may change (staging vs production)
    //   - The token alone is sufficient for the app to construct the request
    //   - Shorter data = denser (more resilient) QR code
    const qrCodeDataUrl = await generateQRCode(trackingToken);
    // qrCodeDataUrl is now a Base64 PNG string starting with "data:image/png;base64,..."

    console.log(`[QR] ✅ QR code generated for token: ${trackingToken} (${qrCodeDataUrl.length} chars)`);


    // -------------------------------------------------------------------------
    // STEP E: Save the Package Document to MongoDB
    // -------------------------------------------------------------------------
    // Package.create({...}) is a Mongoose shorthand for:
    //   const pkg = new Package({...});  // Instantiate the model
    //   await pkg.save();               // Write to MongoDB
    //
    // Mongoose will:
    //   1. Validate all fields against the Schema (type checks, enum values, required)
    //   2. Auto-generate MongoDB's internal _id (ObjectId)
    //   3. Add createdAt and updatedAt timestamps (because of { timestamps: true })
    //   4. Return the saved document with all these fields populated
    //
    // NOTE: We do NOT store the QR code in the database.
    // Rationale: The QR code is deterministic — it can always be regenerated from
    // the token. Storing it wastes storage and creates a sync problem if we ever
    // change QR parameters. The frontend stores or prints it on receipt.
    const savedPackage = await Package.create({
      trackingToken: trackingToken,   // Our cryptographically generated token

      status: 'Order Placed',         // All new packages start in this state
                                      // (matches the enum in the Schema)

      piiData: {                      // Nested PII object — maps to the piiData
        customerName: customerName,   // sub-document in the Mongoose schema
        phone: phone,
        macroLocation: macroLocation,
        microLocation: microLocation,
      },

      otpSecret: null,                // No OTP yet — generated only at delivery time
    });

    console.log(`[DB] ✅ Package saved | Token: ${savedPackage.trackingToken} | ID: ${savedPackage._id}`);


    // -------------------------------------------------------------------------
    // STEP F: Return Success Response (HTTP 201 Created)
    // -------------------------------------------------------------------------
    // HTTP 201 Created is the correct status for successful resource creation.
    // (200 OK is for reads/updates; 201 is specifically for "new thing was made".)
    //
    // We return:
    //   - The saved package document (excluding sensitive otpSecret)
    //   - The raw Base64 QR Data URL for the frontend to render immediately
    //
    // .toObject() converts the Mongoose document to a plain JS object,
    // removing Mongoose-specific internals (like __v version key, prototype chain).
    const packageData = savedPackage.toObject();

    // Remove otpSecret from the response — it's null here, but we establish
    // the pattern of never leaking this field outside of authorized contexts.
    // The 'delete' operator removes a property from a JS object (like free() in C
    // frees memory, but simpler — it just removes the key from the object).
    delete packageData.otpSecret;

    return res.status(201).json({
      success: true,
      message: 'Package created successfully.',
      data: {
        package: packageData,

        // The QR code Data URL — the frontend can use this directly:
        //   <img src={qrCodeDataUrl} alt="Scan to track package" />
        //   or embed it in a printable shipping label template.
        qrCode: qrCodeDataUrl,

        // Print instructions for the frontend
        printHint: `Scan the QR code to retrieve tracking token: ${trackingToken}`,
      },
    });

  } catch (error) {
    // -------------------------------------------------------------------------
    // Global Error Handler for this Route
    // -------------------------------------------------------------------------
    // Any 'await' that fails or any 'throw' above will land here.
    // Common failure scenarios:
    //   - MongoDB is down: Package.create() throws a connection error
    //   - Schema validation fails: Mongoose throws ValidationError
    //   - Token generation exhausted retries: our helper throws
    //   - QRCode.toDataURL() fails: library throws an error
    console.error('[ERROR] POST /api/package/create failed:', error.message);

    // MongoDB error code 11000 = Duplicate Key (the unique index was violated).
    // This should not happen because generateUniqueTrackingToken() checks first,
    // but could occur in a RACE CONDITION (two concurrent requests generating
    // the same token simultaneously before either checks the DB).
    // We handle it explicitly with a 409 Conflict instead of a generic 500.
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Conflict: A package with this tracking token already exists.',
        message: 'This is an extremely rare race condition. Please retry the request.',
      });
    }

    // Mongoose Validation Error — thrown when a field fails Schema rules.
    // error.name === 'ValidationError' is set by Mongoose automatically.
    if (error.name === 'ValidationError') {
      return res.status(422).json({
        success: false,
        error: 'Validation Error',
        // error.message from Mongoose contains a human-readable description
        // of which field failed and why (e.g., "status: 'Invalid' is not a valid enum value")
        message: error.message,
      });
    }

    // All other errors → 500 Internal Server Error
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      // In production, omit 'details' to avoid leaking internal structure
      details: error.message,
    });
  }
});


// =============================================================================
// ROUTE: POST /api/package/verify-otp
// =============================================================================
// Called by the frontend's OTP form after the agent receives the spoken OTP
// from the customer.
//
// Flow:
//   1. verifyToken middleware validates the JWT → req.user = { id, role }
//   2. Find the package by trackingToken
//   3. Validate that an OTP has actually been issued (otpSecret is not null)
//   4. Compare the submitted OTP against the stored otpSecret (plain string compare)
//   5. On match → mark package as 'Delivered', clear otpSecret, return success
//   6. On mismatch → return 400 with a helpful error
//
// Body:    { trackingToken: "PKG_XXXXXXXX", inputOtp: "4821" }
// Success: { success: true, message: "Handshake verified. Package marked as Delivered." }
// =============================================================================
router.post('/verify-otp', verifyToken, async (req, res) => {
  try {
    const { trackingToken, inputOtp } = req.body;

    // --- Input validation ---
    if (!trackingToken || !inputOtp) {
      return res.status(400).json({
        success: false,
        message: 'Both trackingToken and inputOtp are required.',
      });
    }

    // --- Fetch the package ---
    const packageDoc = await Package.findOne({ trackingToken });

    if (!packageDoc) {
      return res.status(404).json({
        success: false,
        message: `No package found with tracking token: ${trackingToken}`,
      });
    }

    // --- Guard: OTP must have been generated first ---
    if (!packageDoc.otpSecret) {
      return res.status(409).json({
        success: false,
        message: 'No OTP has been issued for this package yet. Please scan the QR code first.',
      });
    }

    // --- Guard: Package must still be in a deliverable state ---
    if (packageDoc.status === 'Delivered') {
      return res.status(409).json({
        success: false,
        message: 'This package has already been marked as Delivered.',
      });
    }

    // --- Compare OTP (constant-time-safe string comparison) ---
    // OTPs are 4-digit numeric strings. Trim whitespace defensively.
    if (inputOtp.trim() !== packageDoc.otpSecret.trim()) {
      console.warn(`[OTP] ⚠️  Wrong OTP for ${trackingToken} — submitted: "${inputOtp}"`);
      return res.status(400).json({
        success: false,
        message: 'Incorrect OTP. Please ask the customer to re-read the code from their SMS.',
      });
    }

    // --- OTP correct → finalise delivery ---
    const updatedPackage = await Package.findOneAndUpdate(
      { trackingToken },
      {
        $set: {
          status:    'Delivered',
          otpSecret: null,          // Clear the secret — it's single-use
        },
      },
      { new: true, runValidators: true }
    );

    console.log(`[OTP] ✅ Delivery confirmed | Token: ${trackingToken} | Agent: ${req.user.id}`);

    return res.status(200).json({
      success: true,
      message: 'Handshake verified. Package marked as Delivered.',
      data: {
        trackingToken: updatedPackage.trackingToken,
        status:        updatedPackage.status,
        deliveredAt:   updatedPackage.updatedAt,
      },
    });

  } catch (err) {
    console.error('[ERROR] POST /api/package/verify-otp failed:', err.message);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred. Please try again.',
    });
  }
});


// --- EXPORT THE ROUTER -------------------------------------------------------
// We export the router object so server.js can mount it with:
//   app.use('/api/package', packageRouter);
// Every route defined in this file will then be prefixed with '/api/package'.
// So router.post('/create', ...) becomes POST /api/package/create.
module.exports = router;

