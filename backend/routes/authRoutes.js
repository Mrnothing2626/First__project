// =============================================================================
// routes/authRoutes.js — Agent Authentication (Login)
// =============================================================================
// Mounts at /api/auth in server.js, so the full path is:
//   POST /api/auth/login
//
// Flow:
//   1. Read { email, password } from request body
//      NOTE: the frontend uses the field name 'email' but sends the Agent ID
//            value (e.g., "AGENT1"). We look it up against agentId in MongoDB.
//   2. Find the Agent document by agentId
//   3. Verify the plain-text password against the bcrypt hash in the DB
//   4. Sign a short-lived JWT containing { id, role }
//   5. Return { success: true, token, name } to the client
// =============================================================================

'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// AGENT MODEL
// Re-use the same schema definition used in seed.js so both files stay in
// sync. The mongoose.models guard prevents "OverwriteModelError" if this
// file is required multiple times (e.g., during hot-reload with nodemon).
// ---------------------------------------------------------------------------
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


// =============================================================================
// POST /api/auth/login
// =============================================================================
// Body:    { email: "AGENT1", password: "password123" }
//          ('email' is the field name the frontend uses for the Agent ID input)
// Success: { success: true, token: "<JWT>", name: "Paras Jadhav" }
// Failure: { success: false, message: "<reason>" }
// =============================================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // --- Input validation ---
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Both Agent ID and password are required.',
      });
    }

    // --- Lookup agent by agentId ---
    // The frontend's 'email' field carries the Agent ID string (e.g., "AGENT1").
    // We do a case-insensitive match to be lenient about capitalisation.
    const agent = await Agent.findOne({
      agentId: { $regex: new RegExp(`^${email.trim()}$`, 'i') },
    });

    if (!agent) {
      // Deliberately vague — don't tell the caller whether the ID or
      // the password was wrong (prevents user enumeration attacks).
      console.warn(`[AUTH] ⚠️  Login failed — unknown agentId: "${email}"`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please check your Agent ID and password.',
      });
    }

    // --- Password verification (bcrypt) ---
    const passwordMatch = await bcrypt.compare(password, agent.password);

    if (!passwordMatch) {
      console.warn(`[AUTH] ⚠️  Login failed — wrong password for agentId: "${agent.agentId}"`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please check your Agent ID and password.',
      });
    }

    // --- Sign JWT ---
    // Payload contains the minimum fields verifyToken.js and RBAC logic need.
    // We deliberately do NOT include the password hash in the payload.
    const secret     = process.env.JWT_SECRET;
    const expiresIn  = process.env.JWT_EXPIRES_IN || '24h';

    if (!secret) {
      console.error('[AUTH] ❌ JWT_SECRET is not set — cannot sign token.');
      return res.status(500).json({
        success: false,
        message: 'Server misconfiguration. Contact the system administrator.',
      });
    }

    const token = jwt.sign(
      {
        id:   agent._id.toString(),   // MongoDB ObjectId as string
        role: agent.role,             // e.g., "Delivery_Agent" — used by RBAC
      },
      secret,
      { expiresIn }
    );

    console.log(`[AUTH] ✅ Login success | agentId: ${agent.agentId} | role: ${agent.role}`);

    // Return the token and the agent's display name so the frontend can
    // populate the dashboard greeting without a second API call.
    return res.status(200).json({
      success: true,
      token,
      name: agent.name,
    });

  } catch (err) {
    console.error('[AUTH] ❌ /api/auth/login error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred. Please try again.',
    });
  }
});


module.exports = router;
