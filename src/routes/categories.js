const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const { protect } = require('../middleware/auth');

// Seed default categories if none exist
async function seedDefaultCategories() {
  const count = await Category.countDocuments();
  if (count === 0) {
    await Category.insertMany([
      { name: 'Women', slug: 'women', order: 1 },
      { name: 'Men', slug: 'men', order: 2 },
      { name: 'The Amoural', slug: 'amoural', order: 3 },
    ]);
    console.log('✅ Default categories seeded.');
  }
}
seedDefaultCategories().catch(console.error);

// PUBLIC: GET /api/categories — list all active categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ active: true }).sort('order name');
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: GET /api/categories/admin/all — list all categories (incl. inactive)
router.get('/admin/all', protect, async (req, res) => {
  try {
    const categories = await Category.find().sort('order name');
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: POST /api/categories — create a new category
router.post('/', protect, async (req, res) => {
  try {
    const { name, slug, order } = req.body;
    if (!name || !slug) return res.status(400).json({ success: false, message: 'Name and slug are required.' });

    // Validate slug format
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').trim();
    const existing = await Category.findOne({ slug: cleanSlug });
    if (existing) return res.status(400).json({ success: false, message: 'A category with this slug already exists.' });

    const category = await Category.create({ name: name.trim(), slug: cleanSlug, order: order || 0 });
    res.status(201).json({ success: true, category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: DELETE /api/categories/:id — delete a category
router.delete('/:id', protect, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
    await category.deleteOne();
    res.json({ success: true, message: 'Category deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
