// =============================================================================
// models/Package.js — Mongoose Model (extracted from server.js)
// =============================================================================
// By moving the model to its own file, both server.js and any route file can
// require() it independently without circular dependency issues.
// In C terms: this is the header file (.h) for your Package data struct.
// =============================================================================

const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema(
  {
    trackingToken: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    piiData: {
      customerName:  { type: String, trim: true },
      phone:         { type: String, trim: true },
      macroLocation: { type: String, trim: true },
      microLocation: { type: String, trim: true },
    },
    status: {
      type: String,
      required: true,
      enum: ['Order Placed', 'In Warehouse', 'Out for Delivery', 'Arrived at Sector', 'Delivered'],
      default: 'Order Placed',
    },
    otpSecret: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// mongoose.model() is idempotent when called with the same name —
// if the model already exists in Mongoose's registry (e.g., server.js
// already defined it), this call just returns the cached model.
// This prevents "Cannot overwrite model once compiled" errors.
module.exports = mongoose.models.Package || mongoose.model('Package', packageSchema);
