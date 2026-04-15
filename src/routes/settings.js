const express = require("express");
const router = express.Router();
const Setting = require("../models/Setting");
const { protect } = require("../middleware/auth");
const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");

// PUBLIC: GET /api/settings/:key
router.get("/:key", async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: req.params.key });
    res.json({ success: true, value: setting ? setting.value : null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: PUT /api/settings/:key
router.put("/:key", protect, upload.any(), async (req, res) => {
  try {
    let value = req.body.value ? JSON.parse(req.body.value) : {};

    // If files are uploaded, store their paths in the value object
    if (req.files && req.files.length > 0) {
      req.files.forEach((f) => {
        value[f.fieldname] = `/uploads/products/${f.filename}`;
      });
    }

    // Merge with existing setting if any
    const existing = await Setting.findOne({ key: req.params.key });
    if (existing && typeof existing.value === "object" && !Array.isArray(existing.value)) {
      // Keep old file paths if not overridden
      value = { ...existing.value, ...value };
    }

    const setting = await Setting.findOneAndUpdate(
      { key: req.params.key },
      { value },
      { new: true, upsert: true }
    );
    res.json({ success: true, setting });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
