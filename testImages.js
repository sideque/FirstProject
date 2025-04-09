const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import Product model
const Product = require('./models/productSchema');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

async function checkProductImages() {
  try {
    // Get all products
    const products = await Product.find({});
    console.log(`Found ${products.length} products`);

    // Check each product's images
    for (const product of products) {
      console.log(`\nProduct: ${product.productName} (${product._id})`);
      
      if (!product.productImage || product.productImage.length === 0) {
        console.log('  No images found for this product');
        continue;
      }
      
      console.log(`  Has ${product.productImage.length} images`);
      
      // Check each image
      for (const image of product.productImage) {
        const imagePath = path.join(process.cwd(), 'uploads', 'product-images', image);
        const exists = fs.existsSync(imagePath);
        console.log(`  Image: ${image}`);
        console.log(`    Path: ${imagePath}`);
        console.log(`    Exists: ${exists ? 'YES' : 'NO'}`);
      }
    }

    // Check if the image directory exists
    const imageDir = path.join(process.cwd(), 'uploads', 'product-images');
    const dirExists = fs.existsSync(imageDir);
    console.log(`\nImage directory: ${imageDir}`);
    console.log(`Directory exists: ${dirExists ? 'YES' : 'NO'}`);
    
    if (dirExists) {
      // List files in the directory
      const files = fs.readdirSync(imageDir);
      console.log(`Files in directory (${files.length}):`);
      files.forEach(file => console.log(`  ${file}`));
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    mongoose.disconnect();
  }
}

checkProductImages(); 