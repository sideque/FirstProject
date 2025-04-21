const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");

const productController = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const productId = req.query.id;

        // Fetch the main product
        const product = await Product.findById(productId).populate('category').lean();

        if (!product) {
            return res.status(404).send("Product not found");
        }

        // Fetch related products (e.g., same category, excluding current product)
        const relatedProducts = await Product.find({
            category: product.category._id, // Match by category ID
            _id: { $ne: productId } // Exclude the current product
        })
            .limit(4) // Limit to 4 related products
            .lean();

        // Render the template with userData, product, and relatedProducts
        res.render("product-details", {
            user:userData,
            product,
            relatedProducts: relatedProducts || [] 
        });
    } catch (error) {
        console.error("Error in productController:", error);
        res.status(500).send("Server Error");
    }
};

const checkQuantity = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
      const { productId, quantity } = req.body;
  
      // Validate input
      if (!productId || !quantity || isNaN(quantity)) {
        return res.status(400).json({ valid: false, message: 'Invalid product ID or quantity' });
      }
  
      // Find product
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ valid: false, message: 'Product not found' });
      }
  
      // Check product availability
      if (product.quantity <= 0 || product.status === 'out of stock' || product.isBlocked) {
        return res.status(400).json({ valid: false, message: 'Product is out of stock' });
      }
  
      // Validate quantity
      if (quantity < 1 || quantity > Math.min(product.quantity, 5)) {
        return res.status(400).json({ valid: false, message: `Quantity must be between 1 and ${Math.min(product.quantity, 5)}` });
      }
  
      // Quantity is valid
      return res.json({ valid: true });
    } catch (error) {
      console.error('Error checking quantity:', error);
      return res.status(500).json({ valid: false, message: 'Internal server error' });
    }
  };




module.exports = {
    productController,
    checkQuantity
};