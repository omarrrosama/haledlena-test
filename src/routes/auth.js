const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const { protect } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: 'Please provide username and password.' });

    const admin = await Admin.findOne({ $or: [{ username }, { email: username }] });
    if (!admin || !(await admin.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

    res.json({
      success: true,
      token,
      admin: { id: admin._id, username: admin.username, email: admin.email, role: admin.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, admin: req.admin });
});

// POST /api/auth/change-password
router.post('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin._id);
    if (!(await admin.comparePassword(currentPassword)))
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });

    admin.password = newPassword;
    await admin.save();
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/setup - Create first admin (only if no admins exist)
router.post('/setup', async (req, res) => {
  try {
    const count = await Admin.countDocuments();
    if (count > 0)
      return res.status(403).json({ success: false, message: 'Setup already completed.' });

    const { username, email, password } = req.body;
    const admin = await Admin.create({ username, email, password, role: 'superadmin' });

    res.status(201).json({ success: true, message: 'Admin account created successfully.', admin: { id: admin._id, username: admin.username } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
