const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/.env' });

async function fixSlugs() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Product = require('./src/models/Product');
  
  const products = await Product.find({});
  console.log(`Found ${products.length} products. Fixing slugs...`);
  
  for (const p of products) {
      // Re-trigger the random slug uniqueness hook by setting the slug to what it originally would be.
      p.slug = p.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      
      await p.save();
      console.log(`Saved product ${p.name} with unique slug: ${p.slug}`);
  }
  
  console.log('Done!');
  process.exit(0);
}

fixSlugs().catch(console.error);
