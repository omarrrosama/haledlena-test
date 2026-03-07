const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },   // Display name, e.g. "The Amoural"
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true }, // URL slug, e.g. "amoural"
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 }, // display order
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Category", categorySchema);
