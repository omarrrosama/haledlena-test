const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');
const { sendOrderConfirmation, sendAdminOrderNotification, sendStatusUpdate } = require('../utils/email');
const { exportOrdersToExcel } = require('../utils/excel');

// PUBLIC: POST /api/orders - Place a new order
router.post('/', async (req, res) => {
  try {
    const { customer, items, shippingFee = 0 } = req.body;

    if (!items || items.length === 0)
      return res.status(400).json({ success: false, message: 'Order must have at least one item.' });

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      // If the productId looks like a real MongoDB ObjectId, look it up in the DB
      // Otherwise trust the inline product data sent from the frontend cart
      const isObjectId = /^[a-f\d]{24}$/i.test(item.productId);

      let price, productName, productImage, productDoc;

      if (isObjectId) {
        productDoc = await Product.findById(item.productId);
        if (!productDoc || !productDoc.active)
          return res.status(400).json({ success: false, message: `Product not found: ${item.productId}` });
        price = productDoc.price;
        productName = productDoc.name;
        productImage = productDoc.images?.[0] || '';
      } else {
        // Static frontend product — trust the data sent from the cart
        if (!item.name || !item.price)
          return res.status(400).json({ success: false, message: 'Missing product name or price in order item.' });
        price = parseFloat(item.price);
        productName = item.name;
        productImage = item.image || '';
      }

      const itemSubtotal = price * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        product: isObjectId ? productDoc._id : new (require('mongoose').Types.ObjectId)(),
        productName,
        productImage,
        price,
        quantity: item.quantity,
        size: item.size || '',
        color: item.color || '',
        subtotal: itemSubtotal
      });

      // Deduct stock only when we have a real DB product with matching variant
      if (isObjectId && productDoc && item.size && item.color) {
        const variant = productDoc.variants.find(v => v.size === item.size && v.color === item.color);
        if (variant) {
          if (variant.stock < item.quantity)
            return res.status(400).json({ success: false, message: `Not enough stock for ${productName} (${item.size}/${item.color})` });
          variant.stock -= item.quantity;
          await productDoc.save();
        }
      }
    }

    const total = subtotal + parseFloat(shippingFee);

    const order = await Order.create({
      customer,
      items: orderItems,
      subtotal,
      shippingFee: parseFloat(shippingFee),
      total,
      statusHistory: [{ status: 'pending', note: 'Order placed' }]
    });

    // Send emails (non-blocking — failures are logged but don't break the order)
    Promise.allSettled([
      sendOrderConfirmation(order),
      sendAdminOrderNotification(order)
    ]).then((results) => {
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          const label = i === 0 ? 'Customer confirmation' : 'Admin notification';
          console.error(`[EMAIL] ${label} failed:`, result.reason?.message || result.reason);
        }
      });
    });

    res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      order: { _id: order._id, orderNumber: order.orderNumber, total: order.total }
    });
  } catch (err) {
    console.error('[ORDER]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});


// PUBLIC: GET /api/orders/track/:orderNumber
router.get('/track/:orderNumber', async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber })
      .populate('items.product', 'name images');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: GET /api/orders
router.get('/', protect, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20, from, to } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) filter.$or = [
      { orderNumber: { $regex: search, $options: 'i' } },
      { 'customer.name': { $regex: search, $options: 'i' } },
      { 'customer.phone': { $regex: search, $options: 'i' } }
    ];
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59));
    }

    const orders = await Order.find(filter)
      .sort('-createdAt')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Order.countDocuments(filter);
    res.json({ success: true, total, page: parseInt(page), orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: GET /api/orders/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.product', 'name images');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: PATCH /api/orders/:id/status
router.patch('/:id/status', protect, async (req, res) => {
  try {
    const { status, note } = req.body;
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status.' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    order.status = status;
    order.statusHistory.push({ status, note: note || '' });
    await order.save();

    // Notify customer
    sendStatusUpdate(order).catch(console.error);

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: PATCH /api/orders/:id/notes
router.patch('/:id/notes', protect, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { adminNotes: req.body.notes },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN: GET /api/orders/export/excel
router.get('/export/excel', protect, async (req, res) => {
  try {
    const { status, from, to } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59));
    }

    const orders = await Order.find(filter).sort('-createdAt');
    const workbook = await exportOrdersToExcel(orders);

    const filename = `haledlena-orders-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
