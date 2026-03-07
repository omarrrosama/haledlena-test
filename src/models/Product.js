const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  size: { type: String, required: true },
  color: { type: String, required: true },
  colorHex: { type: String, default: "#000000" },
  stock: { type: Number, default: 0, min: 0 },
  sku: { type: String },
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  nameAr: { type: String, trim: true },
  slug: { type: String, trim: true, lowercase: true },
  description: { type: String, trim: true },
  descriptionAr: { type: String, trim: true },
  price: { type: Number, required: true, min: 0 },
  category: {
    type: String,
    required: true,
    trim: true,
    // No static enum — category values are validated against the Category collection at the route level
  },
  images: [{ type: String }], // file paths stored under /uploads/products/
  variants: [variantSchema],
  featured: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Virtual: total stock derived from variants (no redundant field)
productSchema.virtual("totalStock").get(function () {
  return this.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
});

// Virtual: unique sizes derived from variants
productSchema.virtual("sizes").get(function () {
  return [...new Set(this.variants.map((v) => v.size))];
});

// Virtual: unique colors derived from variants
productSchema.virtual("colors").get(function () {
  return [...new Set(this.variants.map((v) => v.color))];
});

// Include virtuals when converting to JSON / plain object
productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

// Keep updatedAt current on every save; auto-generate slug from name if not set
productSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  }
  next();
});

module.exports = mongoose.model("Product", productSchema);
