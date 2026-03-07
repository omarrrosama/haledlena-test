const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');

// GET /api/dashboard/stats
router.get('/stats', protect, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // All time counts
    const [totalOrders, totalProducts] = await Promise.all([
      Order.countDocuments(),
      Product.countDocuments({ active: true })
    ]);

    // Revenue (delivered orders)
    const revenueAgg = await Order.aggregate([
      { $match: { status: { $in: ['delivered', 'shipped'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // This month stats
    const thisMonthOrders = await Order.countDocuments({ createdAt: { $gte: startOfMonth } });
    const thisMonthRevenueAgg = await Order.aggregate([
      { $match: { status: { $in: ['delivered', 'shipped'] }, createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const thisMonthRevenue = thisMonthRevenueAgg[0]?.total || 0;

    // Orders by status
    const ordersByStatus = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Recent orders
    const recentOrders = await Order.find()
      .sort('-createdAt')
      .limit(5)
      .select('orderNumber customer.name total status createdAt');

    // Orders over last 7 days (for chart)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));
      const count = await Order.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } });
      last7Days.push({
        date: startOfDay.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }),
        orders: count
      });
    }

    // Low stock products — computed from variants array since totalStock is a virtual
    const lowStock = await Product.aggregate([
      { $match: { active: true } },
      {
        $addFields: {
          computedStock: { $sum: "$variants.stock" }
        }
      },
      { $match: { computedStock: { $lte: 5 } } },
      { $sort: { computedStock: 1 } },
      { $limit: 5 },
      { $project: { name: 1, images: 1, computedStock: 1 } }
    ]);

    res.json({
      success: true,
      stats: {
        totalOrders,
        totalProducts,
        totalRevenue,
        thisMonthOrders,
        thisMonthRevenue,
        ordersByStatus: ordersByStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        recentOrders,
        last7Days,
        lowStock
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
