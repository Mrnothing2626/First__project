// =============================================================================
// middleware/verifyToken.js — JWT Bearer Token Verification Middleware
// =============================================================================
// WHAT IS THIS FILE?
//   This is an Express middleware function. Middleware sits between the
//   incoming HTTP request and your route handler, like a security checkpoint
//   at an airport gate. Every protected route will call this function FIRST.
//   If the token is valid → the request is allowed through (next() is called).
//   If the token is invalid → the request is STOPPED here with a 401 error.
//
// HOW JWT WORKS (mental model for C programmers):
//   A JWT (JSON Web Token) has 3 parts separated by dots:
//     header.payload.signature
//   - header:    metadata about the token (algorithm used, type)
//   - payload:   the actual data (user id, role, expiry time)
//   - signature: a cryptographic hash of header+payload using a SECRET key
//
//   When we verify, we re-compute the signature from the received header+payload
//   using OUR secret key. If it matches the signature in the token, the token is
//   authentic and untampered. If someone changed the payload (e.g., changed
//   role to "Admin"), the signature won't match → token is REJECTED.
//   It's like a tamper-evident seal on a C struct that was serialized to disk.
// =============================================================================


// --- IMPORTS -----------------------------------------------------------------

// 'jsonwebtoken' is the library that handles all JWT operations for us.
// jwt.sign()   → creates a new token (used at login, not here)
// jwt.verify() → decodes AND validates a token (used here)
// jwt.decode() → only decodes, does NOT validate (DO NOT use for auth)
const jwt = require('jsonwebtoken');


// =============================================================================
// The verifyToken middleware function
//
// Express middleware signature: (req, res, next) — exactly 3 parameters.
// req  → the incoming request object (we read the Authorization header from it)
// res  → the response object (we use this ONLY if we need to reject the request)
// next → a function: calling next() passes control to the next middleware/route.
//         NOT calling next() means the request stops here permanently.
// =============================================================================
const verifyToken = (req, res, next) => {

  // ---------------------------------------------------------------------------
  // STEP 1: Read the Authorization header
  // ---------------------------------------------------------------------------
  // HTTP headers are key-value pairs sent by the client with every request.
  // The Authorization header is the standard way to send credentials.
  // req.headers is a plain object in Node.js; all header names are LOWERCASE.
  //
  // A correctly formatted Authorization header looks like this:
  //   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyS...
  //                  ^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                  scheme        the actual JWT string
  //
  // The 'Bearer' scheme (RFC 6750) signals: "this token is a bearer credential".
  // Anyone who HOLDS (bears) this token can use it — so we must verify it's legit.
  const authHeader = req.headers['authorization'];
  // authHeader is now either:
  //   "Bearer eyJhbGci..." (if the client sent it correctly)
  //   undefined            (if the client forgot to send it)


  // ---------------------------------------------------------------------------
  // STEP 2: Check that the header exists and is correctly formatted
  // ---------------------------------------------------------------------------
  // We use a GUARD CLAUSE — fail fast at the top rather than deeply nesting logic.
  // In C terms: think of this as checking a pointer for NULL before dereferencing.
  //
  // !authHeader             → header is missing entirely (undefined)
  // !authHeader.startsWith('Bearer ') → header exists but isn't in Bearer format
  //   NOTE: There's a space after 'Bearer' — this is required by the spec.
  //         "Bearer" (scheme) + " " (space) + token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Return immediately — 'return' prevents any code below from running.
    // 401 Unauthorized: The request lacks valid authentication credentials.
    // (Use 401 when credentials are missing/invalid, 403 when they exist but
    //  lack permission for the specific resource.)
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Access denied. No Bearer token provided in Authorization header.',
      hint: 'Set the Authorization header as: "Bearer <your_jwt_token>"',
    });
  }


  // ---------------------------------------------------------------------------
  // STEP 3: Extract the raw token string from the header value
  // ---------------------------------------------------------------------------
  // authHeader is a string like: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  // We need only the part AFTER "Bearer " (7 characters including the space).
  //
  // .split(' ') splits the string by space into an array:
  //   ["Bearer", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."]
  //      [0]                  [1]
  // We take index [1] to get just the token string.
  const token = authHeader.split(' ')[1];
  // token is now the raw JWT string: "eyJhbGci..."

  // Edge case: What if someone sent "Bearer " with nothing after it?
  // e.g., "Bearer " → split gives ["Bearer", ""] → token is ""
  // An empty string is falsy in JavaScript, so we check for it.
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Bearer token is empty. Please provide a valid JWT after "Bearer ".',
    });
  }


  // ---------------------------------------------------------------------------
  // STEP 4: Load the JWT secret from environment variables
  // ---------------------------------------------------------------------------
  // process.env is a global object in Node.js that contains all environment
  // variables — key-value pairs loaded from the OS or from the .env file
  // (via the dotenv package configured in server.js).
  //
  // JWT_SECRET is the PRIVATE KEY used to sign and verify tokens.
  // CRITICAL SECURITY RULE: This must NEVER be hardcoded in source code.
  //   ❌ const secret = "mysecretpassword";  // WRONG: exposed in git history
  //   ✅ const secret = process.env.JWT_SECRET; // CORRECT: loaded from .env
  //
  // In C terms: imagine this is a password stored in a config file that
  // your program reads at startup, not something baked into the binary.
  const secret = process.env.JWT_SECRET;

  // Defensive check: If someone accidentally starts the server without setting
  // JWT_SECRET in .env, we fail loudly at runtime rather than silently accepting
  // all tokens (which would be a catastrophic security hole).
  if (!secret) {
    // This is a SERVER configuration error, not a client error → 500.
    console.error('[SECURITY] ❌ FATAL: JWT_SECRET is not set in environment variables!');
    return res.status(500).json({
      success: false,
      error: 'Server Misconfiguration',
      message: 'JWT secret is not configured. Contact the system administrator.',
    });
  }


  // ---------------------------------------------------------------------------
  // STEP 5: Verify and decode the token using jwt.verify()
  // ---------------------------------------------------------------------------
  // jwt.verify(token, secret) does THREE things simultaneously:
  //
  //   A) DECODE: Base64-decodes the header and payload sections of the JWT.
  //
  //   B) VERIFY SIGNATURE: Re-computes the HMAC-SHA256 signature of
  //      (header + "." + payload) using our 'secret'. Then compares it
  //      byte-for-byte against the signature embedded in the token.
  //      → If they match: the token was created by us and was NOT tampered with.
  //      → If they don't match: someone altered the payload → REJECTED.
  //
  //   C) CHECK EXPIRY: Reads the 'exp' field from the decoded payload.
  //      'exp' is a Unix timestamp (seconds since 1970-01-01 UTC).
  //      If Date.now() > exp → token is expired → REJECTED.
  //      This is automatic — we don't have to write this check ourselves.
  //
  // jwt.verify() has TWO calling patterns:
  //   Pattern A — Callback: jwt.verify(token, secret, (err, decoded) => { ... })
  //   Pattern B — Synchronous (throws on error): const d = jwt.verify(token, secret)
  //
  // We use Pattern A (callback) because it gives us clean error handling
  // without needing a try/catch block. The library calls our function with:
  //   err     → an Error object if verification FAILED (null if it succeeded)
  //   decoded → the decoded payload object if it SUCCEEDED (null if it failed)
  jwt.verify(token, secret, (err, decoded) => {

    // -------------------------------------------------------------------------
    // STEP 6: Handle verification failure cases
    // -------------------------------------------------------------------------
    // If 'err' is not null, jwt.verify() found a problem.
    // The jsonwebtoken library provides specific error types we can check:
    //
    //   jwt.TokenExpiredError  → 'exp' timestamp is in the past
    //   jwt.JsonWebTokenError  → signature mismatch, malformed token, wrong format
    //   jwt.NotBeforeError     → 'nbf' (not before) claim — token used too early
    //
    // Checking error.name lets us give the CLIENT a more informative message.
    if (err) {

      // Log the error server-side for security auditing / debugging.
      // We log it here but do NOT send internal error details to the client
      // (that would help attackers understand our system).
      console.warn(`[AUTH] ⚠️  Token verification failed | Type: ${err.name} | Reason: ${err.message}`);

      // Determine the appropriate error message based on the failure type.
      // This is like a switch/case in C on an enum value.
      let clientMessage;

      if (err.name === 'TokenExpiredError') {
        // The token's 'exp' field is in the past. User needs to log in again.
        // err.expiredAt is a Date object showing when exactly it expired.
        clientMessage = `Token expired at ${err.expiredAt}. Please log in again to get a new token.`;

      } else if (err.name === 'JsonWebTokenError') {
        // Covers many issues: bad signature (tampered payload), malformed
        // base64, wrong number of segments, invalid algorithm, etc.
        // We give a GENERIC message intentionally — don't tell an attacker
        // WHY their forged token failed.
        clientMessage = 'Invalid token. The token is malformed or has been tampered with.';

      } else if (err.name === 'NotBeforeError') {
        // The token has an 'nbf' (not before) claim set in the future.
        // This is used for tokens that are pre-issued but shouldn't work yet.
        clientMessage = 'Token is not yet active. Please try again later.';

      } else {
        // Unknown JWT error — catch-all for any other library errors.
        clientMessage = 'Token verification failed due to an unknown error.';
      }

      // Return the 401 response and STOP the middleware chain.
      // The route handler will NEVER be called for this request.
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: clientMessage,
      });
    }

    // -------------------------------------------------------------------------
    // STEP 7: Token is VALID — attach the decoded payload to the request
    // -------------------------------------------------------------------------
    // If we reach this point, jwt.verify() succeeded. 'decoded' is now a plain
    // JavaScript object containing the payload that was encoded when the token
    // was CREATED (typically at login). It looks like:
    //
    //   {
    //     id:   "64f8a1b2c3d4e5f6a7b8c9d0",  // MongoDB _id of the user
    //     role: "Delivery_Agent",               // User's role in the system
    //     iat:  1718900000,                     // "issued at" (Unix timestamp)
    //     exp:  1718986400,                     // "expires at" (Unix timestamp)
    //   }
    //
    // We attach the ENTIRE decoded payload to req.user.
    // This makes the user's identity available to ALL downstream middleware
    // and route handlers without querying the database again.
    //
    // In C terms: imagine we're writing a validated struct into a
    // shared memory slot (req.user) that all downstream functions can read.
    req.user = decoded;

    // Optional: log successful authentication for audit trails in development.
    // In production, remove or guard this with a DEBUG flag to avoid log spam.
    console.log(`[AUTH] ✅ Token valid | User ID: ${decoded.id} | Role: ${decoded.role}`);

    // -------------------------------------------------------------------------
    // STEP 8: Pass control to the next middleware or route handler
    // -------------------------------------------------------------------------
    // Calling next() with NO arguments signals "everything is fine, continue."
    // Calling next(error) with an error object would skip to Express's error
    // handler — we don't use that pattern here because we handle errors above.
    //
    // After next() is called:
    //   → The route handler runs (e.g., POST /api/package/verify)
    //   → It can access req.user.id and req.user.role freely
    next();

  }); // end of jwt.verify() callback

}; // end of verifyToken function definition


// --- EXPORT ------------------------------------------------------------------
// module.exports makes this function importable in other files.
// In C terms: this is like declaring a function in a .h header file,
// so other .c files can #include it and call it.
//
// Usage in another file:
//   const verifyToken = require('./middleware/verifyToken');
//   app.get('/protected', verifyToken, (req, res) => { ... });
//
// Or apply it globally to ALL routes:
//   app.use(verifyToken);  // every route after this line is protected
module.exports = verifyToken;
