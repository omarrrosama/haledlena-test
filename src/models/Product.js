const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  size: { type: String, required: true },
  color: { type: String, required: true },
  colorHex: { type: String, default: "#000000" },
  stock: { type: Number, default: 0, min: 0 },
  sku: { type: String },
});

const colorImageSchema = new mongoose.Schema({
  color: { type: String, required: true },     // e.g. "Black"
  images: [{ type: String }],                   // file paths for this color
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  nameAr: { type: String, trim: true },
  slug: { type: String, trim: true, lowercase: true, unique: true },
  description: { type: String, trim: true },
  descriptionAr: { type: String, trim: true },
  productCare: { type: String, trim: true },
  price: { type: Number, required: true, min: 0 },
  category: {
    type: String,
    required: true,
    trim: true,
  },
  categories: {
    type: [String],
    validate: [
      {
        validator: function (arr) {
          if (arr === undefined || arr === null) return true;
          if (!Array.isArray(arr)) return false;
          if (arr.length > 2) return false;
          return arr.every((v) => typeof v === "string" && v.trim().length > 0);
        },
        message: "Categories must be an array of up to 2 category slugs.",
      },
    ],
  },
  productType: { type: String, trim: true }, // e.g. "pantalons", "tops", "jackets"
  images: [{ type: String }],         // fallback / general images
  coverImage: { type: String, trim: true },
  colorImages: [colorImageSchema],    // per-color image sets
  variants: [variantSchema],
  featured: { type: Boolean, default: false },
  homePosition: { type: Number, min: 1, max: 5 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

productSchema.index({ homePosition: 1 }, { unique: true, sparse: true });


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

productSchema.pre("validate", function (next) {
  if (Array.isArray(this.categories)) {
    const normalized = this.categories
      .map((c) => String(c || "").trim())
      .filter(Boolean);
    this.categories = Array.from(new Set(normalized)).slice(0, 2);
  }

  if (
    (!Array.isArray(this.categories) || this.categories.length === 0) &&
    this.category
  ) {
    this.categories = [String(this.category).trim()].filter(Boolean);
  }

  if ((!this.category || !String(this.category).trim()) && this.categories?.[0]) {
    this.category = String(this.categories[0]).trim();
  }

  next();
});

// Keep updatedAt current on every save; auto-generate slug from name if not set, and ensure uniqueness
productSchema.pre("save", async function (next) {
  this.updatedAt = Date.now();
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  }

  // Ensure unique slug
  if (this.isModified("slug") || this.isNew) {
    let baseSlug = this.slug || "product";
    let currentSlug = baseSlug;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      const existing = await mongoose.models.Product.findOne({ slug: currentSlug, _id: { $ne: this._id } });
      if (existing) {
        currentSlug = `${baseSlug}-${counter}`;
        counter++;
      } else {
        isUnique = true;
      }
    }
    this.slug = currentSlug;
  }
  
  next();
});

module.exports = mongoose.model("Product", productSchema);
