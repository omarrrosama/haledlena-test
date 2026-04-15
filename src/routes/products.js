const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Category = require("../models/Category");
const { protect } = require("../middleware/auth");
const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");

function pickCoverImage({ coverImage, images, colorImages }) {
  if (coverImage && typeof coverImage === "string") return coverImage;
  if (images && images.length > 0) return images[0];
  if (colorImages && colorImages.length > 0) {
    const first = colorImages.find((ci) => (ci.images || []).length > 0);
    if (first && first.images && first.images.length > 0) return first.images[0];
  }
  return "";
}

// PUBLIC: GET /api/products - List active products
router.get("/", async (req, res) => {
  try {
    const {
      category,
      featured,
      search,
      sort = "-createdAt",
      page = 1,
      limit = 20,
    } = req.query;
    const filter = { active: true };
    if (category) filter.category = category;
    if (featured) filter.featured = featured === "true";
    if (search)
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];

    const products = await Product.find(filter)
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Product.countDocuments(filter);
    res.json({ success: true, total, page: parseInt(page), products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUBLIC: GET /api/products/categories
router.get("/categories", async (req, res) => {
  try {
    const categories = await Product.distinct("category", { active: true });
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUBLIC: GET /api/products/by-slug/:slug
router.get("/by-slug/:slug", async (req, res) => {
  try {
    const product = await Product.findOne({
      slug: req.params.slug,
      active: true,
    });
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found." });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUBLIC: GET /api/products/homepage - 5 homepage slots (active products only)
router.get("/homepage", async (req, res) => {
  try {
    const products = await Product.find({
      active: true,
      homePosition: { $in: [1, 2, 3, 4, 5] },
    })
      .sort("homePosition")
      .select("name slug coverImage images colorImages homePosition");

    const items = products.map((p) => ({
      position: p.homePosition,
      productId: p._id,
      name: p.name,
      slug: p.slug,
      image: pickCoverImage({
        coverImage: p.coverImage,
        images: p.images,
        colorImages: p.colorImages,
      }),
    }));

    res.json({
      success: true,
      items,
      configured: items.length === 5,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: GET /api/products/homepage/admin - includes inactive (so admin can prepare)
router.get("/homepage/admin", protect, async (req, res) => {
  try {
    const products = await Product.find({
      homePosition: { $in: [1, 2, 3, 4, 5] },
    })
      .sort("homePosition")
      .select("name slug coverImage images colorImages homePosition active");

    const items = products.map((p) => ({
      position: p.homePosition,
      productId: p._id,
      name: p.name,
      slug: p.slug,
      active: p.active !== false,
      image: pickCoverImage({
        coverImage: p.coverImage,
        images: p.images,
        colorImages: p.colorImages,
      }),
    }));

    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: PUT /api/products/homepage - set exactly 5 products for slots 1..5
router.put("/homepage", protect, async (req, res) => {
  try {
    const slots = Array.isArray(req.body.slots) ? req.body.slots : [];
    if (slots.length !== 5) {
      return res.status(400).json({
        success: false,
        message: "Homepage must have exactly 5 products (slots 1 to 5).",
      });
    }

    const positionSet = new Set();
    const productIdSet = new Set();
    const normalizedSlots = slots.map((s) => ({
      position: parseInt(s.position, 10),
      productId: String(s.productId || "").trim(),
    }));

    for (const s of normalizedSlots) {
      if (![1, 2, 3, 4, 5].includes(s.position)) {
        return res.status(400).json({
          success: false,
          message: "Each homepage slot position must be 1, 2, 3, 4, or 5.",
        });
      }
      if (!s.productId) {
        return res.status(400).json({
          success: false,
          message: "Each homepage slot must have a product.",
        });
      }
      if (positionSet.has(s.position)) {
        return res.status(400).json({
          success: false,
          message: "Homepage slot positions must be unique (no duplicates).",
        });
      }
      if (productIdSet.has(s.productId)) {
        return res.status(400).json({
          success: false,
          message: "Homepage products must be unique (no duplicates).",
        });
      }
      positionSet.add(s.position);
      productIdSet.add(s.productId);
    }

    const productIds = Array.from(productIdSet);
    await Product.updateMany(
      { _id: { $in: productIds } },
      { $unset: { homePosition: 1 } },
    );
    await Product.updateMany(
      { homePosition: { $in: [1, 2, 3, 4, 5] }, _id: { $nin: productIds } },
      { $unset: { homePosition: 1 } },
    );

    const ops = normalizedSlots.map((s) => ({
      updateOne: {
        filter: { _id: s.productId },
        update: { $set: { homePosition: s.position } },
      },
    }));
    await Product.bulkWrite(ops, { ordered: true });

    const products = await Product.find({
      homePosition: { $in: [1, 2, 3, 4, 5] },
    })
      .sort("homePosition")
      .select("name slug coverImage images colorImages homePosition active");

    const items = products.map((p) => ({
      position: p.homePosition,
      productId: p._id,
      name: p.name,
      slug: p.slug,
      active: p.active !== false,
      image: pickCoverImage({
        coverImage: p.coverImage,
        images: p.images,
        colorImages: p.colorImages,
      }),
    }));

    res.json({ success: true, items });
  } catch (err) {
    if (String(err.message || "").includes("E11000")) {
      return res.status(400).json({
        success: false,
        message:
          "Homepage slot conflict. Make sure positions 1–5 are unique and each is assigned to one product.",
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: GET /api/products/admin/all (includes inactive) — MUST be before /:id
router.get("/admin/all", protect, async (req, res) => {
  try {
    const { search, category, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (search)
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];

    const products = await Product.find(filter)
      .sort("-createdAt")
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Product.countDocuments(filter);
    res.json({ success: true, total, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUBLIC: GET /api/products/:id — MUST be after all named routes
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, active: true });
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found." });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: POST /api/products
router.post("/", protect, upload.any(), async (req, res) => {
  try {
    const data = { ...req.body };

    // Separate general images and per-color images from uploaded files
    const generalImages = [];
    const colorImageMap = {}; // { "Black": [path, ...], "White": [...] }
    if (req.files && req.files.length > 0) {
      req.files.forEach((f) => {
        if (f.fieldname === "images") {
          generalImages.push(`/uploads/products/${f.filename}`);
        } else if (f.fieldname.startsWith("colorImg_")) {
          // fieldname: colorImg_{ColorName}
          const color = decodeURIComponent(
            f.fieldname.slice("colorImg_".length),
          );
          if (!colorImageMap[color]) colorImageMap[color] = [];
          colorImageMap[color].push(`/uploads/products/${f.filename}`);
        }
      });
    }
    if (generalImages.length > 0) data.images = generalImages;

    // Build colorImages array
    const colorImages = Object.entries(colorImageMap).map(
      ([color, images]) => ({ color, images }),
    );
    if (colorImages.length > 0) data.colorImages = colorImages;

    const homePosRaw = data.homePosition;
    if (homePosRaw !== undefined) {
      const parsed = parseInt(homePosRaw, 10);
      if (!Number.isNaN(parsed) && parsed !== 0) {
        if (![1, 2, 3, 4, 5].includes(parsed)) {
          return res.status(400).json({
            success: false,
            message: "Homepage position must be 1, 2, 3, 4, 5 (or leave blank).",
          });
        }
        await Product.updateOne(
          { homePosition: parsed },
          { $unset: { homePosition: 1 } },
        );
        data.homePosition = parsed;
      } else {
        delete data.homePosition;
      }
    }

    if (data.variants && typeof data.variants === "string") {
      data.variants = JSON.parse(data.variants);
    }
    data.price = parseFloat(data.price);
    data.featured = data.featured === "true" || data.featured === true;
    data.active = data.active !== "false" && data.active !== false;

    // Validate category
    if (data.category) {
      const cat = await Category.findOne({ slug: data.category });
      if (!cat)
        return res
          .status(400)
          .json({
            success: false,
            message: `Category "${data.category}" does not exist.`,
          });
    }

    const coverImageUploadIndex = parseInt(data.coverImageUploadIndex, 10);
    if (
      !Number.isNaN(coverImageUploadIndex) &&
      generalImages[coverImageUploadIndex]
    ) {
      data.coverImage = generalImages[coverImageUploadIndex];
    } else if (data.coverImage && typeof data.coverImage === "string") {
      if (!generalImages.includes(data.coverImage)) {
        delete data.coverImage;
      }
    }

    if (!data.coverImage) {
      data.coverImage = pickCoverImage({
        coverImage: "",
        images: generalImages,
        colorImages: data.colorImages || [],
      });
    }

    const product = await Product.create(data);
    res.status(201).json({ success: true, product });
  } catch (err) {
    if (String(err.message || "").includes("E11000")) {
      return res.status(400).json({
        success: false,
        message:
          "Homepage position is already used by another product. Choose a different homepage slot (1–5).",
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: PUT /api/products/:id
router.put("/:id", protect, upload.any(), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found." });

    const data = { ...req.body };

    if (data.variants && typeof data.variants === "string")
      data.variants = JSON.parse(data.variants);

    // Parse deletion lists sent from the admin frontend
    let deleteGeneralImages = [];
    let deleteColorImages = {};
    if (data.deleteGeneralImages) {
      try {
        deleteGeneralImages = JSON.parse(data.deleteGeneralImages);
      } catch {}
      delete data.deleteGeneralImages;
    }
    if (data.deleteColorImages) {
      try {
        deleteColorImages = JSON.parse(data.deleteColorImages);
      } catch {}
      delete data.deleteColorImages;
    }

    const buildUniqueHexToColor = (variants) => {
      const map = new Map();
      const ambiguous = new Set();
      (variants || []).forEach((v) => {
        const hex = (v.colorHex || "").trim().toLowerCase();
        const color = (v.color || "").trim();
        if (!hex || !color) return;
        const existing = map.get(hex);
        if (!existing) {
          map.set(hex, color);
          return;
        }
        if (existing !== color) ambiguous.add(hex);
      });
      ambiguous.forEach((hex) => map.delete(hex));
      return map;
    };

    const existingHexToColor = buildUniqueHexToColor(product.variants);
    const incomingHexToColor = buildUniqueHexToColor(data.variants);

    const renameColorMap = {};
    incomingHexToColor.forEach((newColor, hex) => {
      const oldColor = existingHexToColor.get(hex);
      if (oldColor && oldColor !== newColor)
        renameColorMap[oldColor] = newColor;
    });

    if (
      Object.keys(deleteColorImages).length > 0 &&
      Object.keys(renameColorMap).length > 0
    ) {
      const nextDeleteColorImages = {};
      Object.entries(deleteColorImages).forEach(([color, urls]) => {
        const nextColor = renameColorMap[color] || color;
        nextDeleteColorImages[nextColor] = (
          nextDeleteColorImages[nextColor] || []
        ).concat(urls || []);
      });
      deleteColorImages = nextDeleteColorImages;
    }

    // Separate general images and per-color images from newly uploaded files
    const newGeneralImages = [];
    const colorImageMap = {};
    if (req.files && req.files.length > 0) {
      req.files.forEach((f) => {
        if (f.fieldname === "images") {
          newGeneralImages.push(`/uploads/products/${f.filename}`);
        } else if (f.fieldname.startsWith("colorImg_")) {
          const color = decodeURIComponent(
            f.fieldname.slice("colorImg_".length),
          );
          if (!colorImageMap[color]) colorImageMap[color] = [];
          colorImageMap[color].push(`/uploads/products/${f.filename}`);
        }
      });
    }

    // --- General images: start from existing, remove deleted, add new uploads ---
    let generalImages = [...(product.images || [])];
    if (deleteGeneralImages.length > 0) {
      generalImages = generalImages.filter((img) => {
        if (deleteGeneralImages.includes(img)) {
          // Delete file from disk
          const fullPath = path.join(
            __dirname,
            "../../",
            img.replace(/^\/uploads\//, "uploads/"),
          );
          try {
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
          } catch {}
          return false;
        }
        return true;
      });
    }
    generalImages = [...generalImages, ...newGeneralImages];
    data.images = generalImages;

    const homePosRaw = data.homePosition;
    if (homePosRaw !== undefined) {
      const parsed = parseInt(homePosRaw, 10);
      if (!Number.isNaN(parsed) && parsed !== 0) {
        if (![1, 2, 3, 4, 5].includes(parsed)) {
          return res.status(400).json({
            success: false,
            message: "Homepage position must be 1, 2, 3, 4, 5 (or leave blank).",
          });
        }
        await Product.updateOne(
          { homePosition: parsed, _id: { $ne: product._id } },
          { $unset: { homePosition: 1 } },
        );
        data.homePosition = parsed;
      } else {
        data.homePosition = undefined;
      }
    }

    // --- Color images: start from existing, remove deleted, add new uploads ---
    const existingColorMap = {};
    (product.colorImages || []).forEach((ci) => {
      existingColorMap[ci.color] = [...(ci.images || [])];
    });

    if (Object.keys(renameColorMap).length > 0) {
      Object.entries(renameColorMap).forEach(([oldColor, newColor]) => {
        if (!existingColorMap[oldColor]) return;
        if (existingColorMap[newColor]) {
          const seen = new Set(existingColorMap[newColor]);
          existingColorMap[oldColor].forEach((img) => {
            if (!seen.has(img)) {
              existingColorMap[newColor].push(img);
              seen.add(img);
            }
          });
          delete existingColorMap[oldColor];
          return;
        }
        existingColorMap[newColor] = existingColorMap[oldColor];
        delete existingColorMap[oldColor];
      });
    }

    // Remove individually deleted color images
    Object.entries(deleteColorImages).forEach(([color, urlsToDelete]) => {
      if (existingColorMap[color]) {
        existingColorMap[color] = existingColorMap[color].filter((img) => {
          if (urlsToDelete.includes(img)) {
            const fullPath = path.join(
              __dirname,
              "../../",
              img.replace(/^\/uploads\//, "uploads/"),
            );
            try {
              if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            } catch {}
            return false;
          }
          return true;
        });
      }
    });

    // Append newly uploaded color images
    Object.entries(colorImageMap).forEach(([color, imgs]) => {
      existingColorMap[color] = [...(existingColorMap[color] || []), ...imgs];
    });

    const allowedColors = new Set(
      (data.variants || []).map((v) => (v.color || "").trim()).filter(Boolean),
    );
    const colorImagesEntries = Object.entries(existingColorMap).filter(
      ([color]) => {
        if (allowedColors.size === 0) return true;
        return allowedColors.has(color);
      },
    );

    data.colorImages = colorImagesEntries.map(([color, images]) => ({
      color,
      images,
    }));

    const coverImageUploadIndex = parseInt(data.coverImageUploadIndex, 10);
    if (
      !Number.isNaN(coverImageUploadIndex) &&
      newGeneralImages[coverImageUploadIndex]
    ) {
      data.coverImage = newGeneralImages[coverImageUploadIndex];
    } else if (data.coverImage && typeof data.coverImage === "string") {
      if (!generalImages.includes(data.coverImage)) {
        delete data.coverImage;
      }
    } else if (product.coverImage && generalImages.includes(product.coverImage)) {
      data.coverImage = product.coverImage;
    }

    if (!data.coverImage) {
      data.coverImage = pickCoverImage({
        coverImage: "",
        images: generalImages,
        colorImages: data.colorImages || [],
      });
    }

    if (data.price) data.price = parseFloat(data.price);
    if (data.featured !== undefined)
      data.featured = data.featured === "true" || data.featured === true;
    if (data.active !== undefined)
      data.active = data.active !== "false" && data.active !== false;

    Object.assign(product, data);
    await product.save();
    res.json({ success: true, product });
  } catch (err) {
    if (String(err.message || "").includes("E11000")) {
      return res.status(400).json({
        success: false,
        message:
          "Homepage position is already used by another product. Choose a different homepage slot (1–5).",
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: DELETE /api/products/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found." });

    // Delete general images from disk
    if (product.images) {
      product.images.forEach((imgPath) => {
        const fullPath = path.join(__dirname, "../../", imgPath);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      });
    }
    // Delete per-color images from disk
    if (product.colorImages) {
      product.colorImages.forEach((ci) => {
        (ci.images || []).forEach((imgPath) => {
          const fullPath = path.join(__dirname, "../../", imgPath);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        });
      });
    }

    await product.deleteOne();
    res.json({ success: true, message: "Product deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
