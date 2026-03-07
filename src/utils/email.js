const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10) || 587, // must be a Number, not a string
    secure: false, // TLS via STARTTLS on port 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS   // App Password — no spaces (see .env)
    }
  });
};

// Send order confirmation to customer
const sendOrderConfirmation = async (order) => {
  if (!order.customer.email) return;

  const transporter = createTransporter();
  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.productName}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.size || '-'} / ${item.color || '-'}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.price.toLocaleString()} EGP</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.subtotal.toLocaleString()} EGP</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="text-align:center;margin-bottom:30px;">
        <h1 style="color:#1a1a1a;font-size:28px;margin:0;">HALED&LENA</h1>
        <p style="color:#888;margin:5px 0;">Order Confirmation</p>
      </div>
      
      <div style="background:#f9f9f9;padding:20px;border-radius:8px;margin-bottom:20px;">
        <h2 style="color:#1a1a1a;margin-top:0;">Thank you for your order, ${order.customer.name}!</h2>
        <p style="color:#555;">Your order <strong>#${order.orderNumber}</strong> has been received and is being processed.</p>
      </div>

      <h3 style="color:#1a1a1a;">Order Details</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#1a1a1a;color:#fff;">
            <th style="padding:10px;text-align:left;">Product</th>
            <th style="padding:10px;text-align:left;">Variant</th>
            <th style="padding:10px;text-align:left;">Qty</th>
            <th style="padding:10px;text-align:left;">Price</th>
            <th style="padding:10px;text-align:left;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <div style="text-align:right;margin-top:15px;padding:15px;background:#f9f9f9;border-radius:8px;">
        <p style="margin:5px 0;color:#555;">Subtotal: <strong>${order.subtotal.toLocaleString()} EGP</strong></p>
        <p style="margin:5px 0;color:#555;">Shipping: <strong>${order.shippingFee > 0 ? order.shippingFee.toLocaleString() + ' EGP' : 'Free'}</strong></p>
        <p style="margin:10px 0;font-size:18px;color:#1a1a1a;">Total: <strong>${order.total.toLocaleString()} EGP</strong></p>
        <p style="margin:5px 0;color:#888;font-size:12px;">Payment: Cash on Delivery</p>
      </div>

      <div style="margin-top:20px;padding:15px;border:1px solid #eee;border-radius:8px;">
        <h3 style="margin-top:0;color:#1a1a1a;">Delivery Address</h3>
        <p style="margin:0;color:#555;">${order.customer.name}</p>
        <p style="margin:0;color:#555;">${order.customer.address}</p>
        <p style="margin:0;color:#555;">${order.customer.city}</p>
        <p style="margin:0;color:#555;">📞 ${order.customer.phone}</p>
      </div>

      <p style="text-align:center;color:#888;margin-top:30px;font-size:12px;">
        If you have any questions, please contact us.<br>
        © ${new Date().getFullYear()} Haled&Lena. All rights reserved.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: order.customer.email,
    subject: `Order Confirmed - #${order.orderNumber} | Haled&Lena`,
    html
  });
};

// Send new order notification to admin
const sendAdminOrderNotification = async (order) => {
  const transporter = createTransporter();

  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.productName}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.size || '-'} / ${item.color || '-'}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${item.subtotal.toLocaleString()} EGP</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#e74c3c;">🛍️ New Order Received!</h2>

      <div style="background:#f9f9f9;padding:15px;border-radius:8px;margin-bottom:20px;">
        <p style="margin:4px 0;"><strong>Order #:</strong> ${order.orderNumber}</p>
        <p style="margin:4px 0;"><strong>Customer:</strong> ${order.customer.name}</p>
        <p style="margin:4px 0;"><strong>Phone:</strong> ${order.customer.phone}</p>
        <p style="margin:4px 0;"><strong>Email:</strong> ${order.customer.email || 'N/A'}</p>
        <p style="margin:4px 0;"><strong>Address:</strong> ${order.customer.address}, ${order.customer.city}</p>
        ${order.customer.notes ? `<p style="margin:4px 0;"><strong>Notes:</strong> ${order.customer.notes}</p>` : ''}
      </div>

      <h3 style="color:#1a1a1a;">Items</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#1a1a1a;color:#fff;">
            <th style="padding:8px;text-align:left;">Product</th>
            <th style="padding:8px;text-align:left;">Variant</th>
            <th style="padding:8px;text-align:left;">Qty</th>
            <th style="padding:8px;text-align:left;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <div style="text-align:right;margin-top:15px;padding:15px;background:#f9f9f9;border-radius:8px;">
        <p style="margin:5px 0;">Subtotal: <strong>${order.subtotal.toLocaleString()} EGP</strong></p>
        <p style="margin:5px 0;">Shipping: <strong>${order.shippingFee > 0 ? order.shippingFee.toLocaleString() + ' EGP' : 'Free'}</strong></p>
        <p style="margin:10px 0;font-size:18px;color:#1a1a1a;">Total: <strong>${order.total.toLocaleString()} EGP</strong></p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.ADMIN_EMAIL,
    subject: `🛍️ New Order #${order.orderNumber} — ${order.total.toLocaleString()} EGP`,
    html
  });
};

// Send order status update to customer
const sendStatusUpdate = async (order) => {
  if (!order.customer.email) return;

  const statusMessages = {
    confirmed: 'Your order has been confirmed! We are preparing it for you.',
    processing: 'Your order is being processed and will be shipped soon.',
    shipped: 'Great news! Your order has been shipped and is on its way.',
    delivered: 'Your order has been delivered. Thank you for shopping with us!',
    cancelled: 'Your order has been cancelled. Please contact us if you have any questions.'
  };

  const message = statusMessages[order.status] || `Your order status has been updated to: ${order.status}`;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: order.customer.email,
    subject: `Order Update #${order.orderNumber} | Haled&Lena`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h1 style="color:#1a1a1a;text-align:center;">HALED&LENA</h1>
        <div style="background:#f9f9f9;padding:20px;border-radius:8px;text-align:center;">
          <h2>Order #${order.orderNumber}</h2>
          <p style="font-size:16px;color:#555;">${message}</p>
        </div>
      </div>
    `
  });
};

module.exports = { sendOrderConfirmation, sendAdminOrderNotification, sendStatusUpdate };
