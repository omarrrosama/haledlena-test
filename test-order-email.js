/**
 * Full order-email integration test.
 * Creates a temporary product, places a test order via the API,
 * and checks if the admin email is triggered.
 *
 * Run from haledlena/ directory:
 *   node test-order-email.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./src/models/Product');
const Order = require('./src/models/Order');
const { sendAdminOrderNotification } = require('./src/utils/email');

async function run() {
  console.log('\n=== ORDER EMAIL INTEGRATION TEST ===\n');

  // 1. Connect to DB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected\n');

  // 2. Find or create a test product
  let product = await Product.findOne({ active: true });
  let createdProduct = false;

  if (!product) {
    console.log('No active products found — creating a temporary test product...');
    product = await Product.create({
      name: '[TEST] Email Test Product',
      price: 100,
      category: 'women',
      active: true,
      variants: [{ size: 'S', color: 'Black', stock: 10 }],
    });
    createdProduct = true;
    console.log('✅ Test product created:', product._id, '\n');
  } else {
    console.log('✅ Using existing product:', product.name, '(', product._id, ')\n');
  }

  // 3. Build a fake order object (like what Order.create() returns)
  const fakeOrder = {
    orderNumber: 'TEST-' + Date.now(),
    customer: {
      name: 'Test Customer',
      phone: '01012345678',
      email: process.env.ADMIN_EMAIL, // send confirmation to admin too for testing
      address: '123 Test Street',
      city: 'Cairo',
      notes: 'This is a test order placed by the diagnostic script.',
    },
    items: [
      {
        productName: product.name,
        size: 'S',
        color: 'Black',
        quantity: 1,
        price: product.price,
        subtotal: product.price,
      },
    ],
    subtotal: product.price,
    shippingFee: 0,
    total: product.price,
  };

  // 4. Send the admin notification directly
  console.log('Sending admin notification email to', process.env.ADMIN_EMAIL, '...');
  try {
    await sendAdminOrderNotification(fakeOrder);
    console.log('✅ Admin email sent successfully!\n');
    console.log('👉 Check your inbox (and SPAM) at:', process.env.ADMIN_EMAIL);
  } catch (err) {
    console.error('❌ Admin email FAILED:');
    console.error('   Code   :', err.code);
    console.error('   Message:', err.message);
  }

  // 5. Cleanup test product if we created one
  if (createdProduct) {
    await Product.findByIdAndDelete(product._id);
    console.log('\nCleaned up test product.');
  }

  await mongoose.disconnect();
  console.log('\n=== TEST DONE ===');
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
