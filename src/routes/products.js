const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const fs = require('fs');
const path = require('path');

// PUBLIC: GET /api/products - List active products
router.get('/', async (req, res) => {
  try {
    const { category, featured, search, sort = '-createdAt', page = 1, limit = 20 } = req.query;
    const filter = { active: true };
    if (category) filter.category = category;
    if (featured) filter.featured = featured === 'true';
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
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
router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.distinct('category', { active: true });
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUBLIC: GET /api/products/by-slug/:slug
router.get('/by-slug/:slug', async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, active: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: GET /api/products/admin/all (includes inactive) — MUST be before /:id
router.get('/admin/all', protect, async (req, res) => {
  try {
    const { search, category, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } }
    ];

    const products = await Product.find(filter)
      .sort('-createdAt')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Product.countDocuments(filter);
    res.json({ success: true, total, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUBLIC: GET /api/products/:id — MUST be after all named routes
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, active: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: POST /api/products
router.post('/', protect, upload.any(), async (req, res) => {
  try {
    const data = { ...req.body };

    // Separate general images and per-color images from uploaded files
    const generalImages = [];
    const colorImageMap = {}; // { "Black": [path, ...], "White": [...] }
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => {
        if (f.fieldname === 'images') {
          generalImages.push(`/uploads/products/${f.filename}`);
        } else if (f.fieldname.startsWith('colorImg_')) {
          // fieldname: colorImg_{ColorName}
          const color = decodeURIComponent(f.fieldname.slice('colorImg_'.length));
          if (!colorImageMap[color]) colorImageMap[color] = [];
          colorImageMap[color].push(`/uploads/products/${f.filename}`);
        }
      });
    }
    if (generalImages.length > 0) data.images = generalImages;

    // Build colorImages array
    const colorImages = Object.entries(colorImageMap).map(([color, images]) => ({ color, images }));
    if (colorImages.length > 0) data.colorImages = colorImages;

    if (data.variants && typeof data.variants === 'string') {
      data.variants = JSON.parse(data.variants);
    }
    data.price = parseFloat(data.price);
    data.featured = data.featured === 'true' || data.featured === true;
    data.active   = data.active   !== 'false' && data.active   !== false;

    // Validate category
    if (data.category) {
      const cat = await Category.findOne({ slug: data.category });
      if (!cat) return res.status(400).json({ success: false, message: `Category "${data.category}" does not exist.` });
    }

    const product = await Product.create(data);
    res.status(201).json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: PUT /api/products/:id
router.put('/:id', protect, upload.any(), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    const data = { ...req.body };

    // Parse deletion lists sent from the admin frontend
    let deleteGeneralImages = [];
    let deleteColorImages = {};
    if (data.deleteGeneralImages) {
      try { deleteGeneralImages = JSON.parse(data.deleteGeneralImages); } catch {}
      delete data.deleteGeneralImages;
    }
    if (data.deleteColorImages) {
      try { deleteColorImages = JSON.parse(data.deleteColorImages); } catch {}
      delete data.deleteColorImages;
    }

    // Separate general images and per-color images from newly uploaded files
    const newGeneralImages = [];
    const colorImageMap = {};
    if (req.files && req.files.length > 0) {
      req.files.forEach(f => {
        if (f.fieldname === 'images') {
          newGeneralImages.push(`/uploads/products/${f.filename}`);
        } else if (f.fieldname.startsWith('colorImg_')) {
          const color = decodeURIComponent(f.fieldname.slice('colorImg_'.length));
          if (!colorImageMap[color]) colorImageMap[color] = [];
          colorImageMap[color].push(`/uploads/products/${f.filename}`);
        }
      });
    }

    // --- General images: start from existing, remove deleted, add new uploads ---
    let generalImages = [...(product.images || [])];
    if (deleteGeneralImages.length > 0) {
      generalImages = generalImages.filter(img => {
        if (deleteGeneralImages.includes(img)) {
          // Delete file from disk
          const fullPath = path.join(__dirname, '../../', img.replace(/^\/uploads\//, 'uploads/'));
          try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}
          return false;
        }
        return true;
      });
    }
    generalImages = [...generalImages, ...newGeneralImages];
    data.images = generalImages;

    // --- Color images: start from existing, remove deleted, add new uploads ---
    const existingColorMap = {};
    (product.colorImages || []).forEach(ci => { existingColorMap[ci.color] = [...(ci.images || [])]; });

    // Remove individually deleted color images
    Object.entries(deleteColorImages).forEach(([color, urlsToDelete]) => {
      if (existingColorMap[color]) {
        existingColorMap[color] = existingColorMap[color].filter(img => {
          if (urlsToDelete.includes(img)) {
            const fullPath = path.join(__dirname, '../../', img.replace(/^\/uploads\//, 'uploads/'));
            try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}
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

    data.colorImages = Object.entries(existingColorMap).map(([color, images]) => ({ color, images }));

    if (data.variants && typeof data.variants === 'string') data.variants = JSON.parse(data.variants);
    if (data.price) data.price = parseFloat(data.price);
    if (data.featured !== undefined) data.featured = data.featured === 'true' || data.featured === true;
    if (data.active  !== undefined) data.active   = data.active   !== 'false' && data.active   !== false;

    Object.assign(product, data);
    await product.save();
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ADMIN: DELETE /api/products/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

    // Delete general images from disk
    if (product.images) {
      product.images.forEach(imgPath => {
        const fullPath = path.join(__dirname, '../../', imgPath);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      });
    }
    // Delete per-color images from disk
    if (product.colorImages) {
      product.colorImages.forEach(ci => {
        (ci.images || []).forEach(imgPath => {
          const fullPath = path.join(__dirname, '../../', imgPath);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        });
      });
    }

    await product.deleteOne();
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
