// =============================================================================
// backend/seed.js — Production-Ready Agent Seed Script
// =============================================================================
// Usage:  node seed.js         (run from the backend/ directory)
// Effect: Wipes ALL existing Agent records, then provisions the single
//         presentation identity for Paras Jadhav.
//
// Why bcrypt?
//   bcryptjs is already installed (package.json). If the login route ever
//   uses bcrypt.compare() to verify passwords, a plain-text seed would
//   silently break auth. Hashing here keeps the contract consistent.
// =============================================================================

'use strict';

// dotenv MUST be the very first statement so that process.env.MONGODB_URI
// is populated before mongoose.connect() is called below.
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ---------------------------------------------------------------------------
// INLINE AGENT SCHEMA
// Self-contained here so seed.js can run independently of server.js.
// Field contract must stay in sync with any authRoutes.js that signs JWTs.
// ---------------------------------------------------------------------------
const AgentSchema = new mongoose.Schema(
  {
    agentId: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },    // stored as bcrypt hash
    name: { type: String, required: true, trim: true },
    role: { type: String, default: 'Delivery_Agent' }, // JWT role claim
  },
  { timestamps: true }
);

// Idempotent model registration — safe to call multiple times.
const Agent = mongoose.models.Agent || mongoose.model('Agent', AgentSchema);


// ---------------------------------------------------------------------------
// SEED ROSTER
// Add more agents here without touching any other part of the script.
// ---------------------------------------------------------------------------
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

// Work factor for bcrypt — 12 rounds is the industry-standard minimum.
// Higher = slower brute-force attacks; negligible cost for a one-time seed.
const SALT_ROUNDS = 12;


// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function seedDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('❌ [SEED] MONGODB_URI is not set in .env — aborting.');
    process.exit(1);
  }

  console.log('🌐 [SEED] Connecting to MongoDB Atlas…');

  try {
    await mongoose.connect(uri);
    console.log('✅ [SEED] Connected successfully.\n');

    // --- Wipe existing collection cleanly ---
    const { deletedCount } = await Agent.deleteMany({});
    console.log(`🗑️  [SEED] Cleared ${deletedCount} existing agent record(s).`);

    // --- Hash passwords and insert fresh records ---
    for (const agentData of SEED_AGENTS) {
      const hashedPassword = await bcrypt.hash(agentData.password, SALT_ROUNDS);

      const agent = await Agent.create({
        agentId: agentData.agentId,
        password: hashedPassword,
        name: agentData.name,
        role: agentData.role,
      });

      console.log(`\n✅ [SEED] Agent provisioned:`);
      console.log(`   ├── Agent ID  : ${agent.agentId}`);
      console.log(`   ├── Name      : ${agent.name}`);
      console.log(`   ├── Role      : ${agent.role}`);
      console.log(`   ├── Password  : ${agentData.password}  (bcrypt-hashed, ${SALT_ROUNDS} rounds)`);
      console.log(`   └── MongoDB ID: ${agent._id}`);
    }

    console.log('\n🎉 [SEED] Database seeding complete. Ready for presentation.\n');
    process.exit(0);

  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key — deleteMany() should have prevented this, but guard it anyway.
      console.error('❌ [SEED] Duplicate key — an agent with this agentId already exists.');
      console.error('   Conflicting key:', err.keyValue);
    } else {
      console.error('❌ [SEED] Fatal error during seeding:', err.message);
    }
    process.exit(1);
  }
}

seedDatabase();