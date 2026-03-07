require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./src/models/Admin');
const Product = require('./src/models/Product');
const Discount = require('./src/models/Discount');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/haledlena');
  console.log('Connected to MongoDB');

  // Create admin
  const existingAdmin = await Admin.findOne({ username: 'admin' });
  if (!existingAdmin) {
    await Admin.create({
      username: 'admin',
      email: 'admin@haledlena.com',
      password: 'Admin@123',
      role: 'superadmin'
    });
    console.log('✅ Admin created: username=admin, password=Admin@123');
  } else {
    console.log('ℹ️  Admin already exists, skipping.');
  }

  // Sample products
  const existing = await Product.countDocuments();
  if (existing === 0) {
    await Product.insertMany([
      {
        name: 'Classic Logo Tee',
        category: 'T-Shirts',
        price: 29.99,
        description: 'Premium cotton t-shirt with embroidered logo.',
        variants: [
          { size: 'S', color: 'Black', stock: 20 },
          { size: 'M', color: 'Black', stock: 30 },
          { size: 'L', color: 'Black', stock: 25 },
          { size: 'S', color: 'White', stock: 15 },
          { size: 'M', color: 'White', stock: 20 },
        ],
        featured: true, active: true
      },
      {
        name: 'Oversized Hoodie',
        category: 'Hoodies',
        price: 59.99,
        salePrice: 49.99,
        onSale: true,
        description: 'Cozy oversized hoodie, perfect for all seasons.',
        variants: [
          { size: 'S', color: 'Grey', stock: 10 },
          { size: 'M', color: 'Grey', stock: 12 },
          { size: 'L', color: 'Black', stock: 8 },
          { size: 'XL', color: 'Black', stock: 5 },
        ],
        featured: true, active: true
      },
      {
        name: 'Slim Fit Chinos',
        category: 'Pants',
        price: 45.00,
        description: 'Versatile slim-fit chino pants.',
        variants: [
          { size: '30', color: 'Khaki', stock: 10 },
          { size: '32', color: 'Khaki', stock: 15 },
          { size: '34', color: 'Navy', stock: 8 },
        ],
        active: true
      }
    ]);
    console.log('✅ Sample products created.');
  }

  // Sample discount code
  const existingDiscount = await Discount.findOne({ code: 'WELCOME10' });
  if (!existingDiscount) {
    await Discount.create({
      code: 'WELCOME10',
      type: 'percentage',
      value: 10,
      description: 'Welcome 10% discount'
    });
    console.log('✅ Discount code WELCOME10 (10% off) created.');
  }

  console.log('\n🎉 Seed complete! You can now login to the admin panel.');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
