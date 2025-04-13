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
            userData,
            product,
            relatedProducts: relatedProducts || [] // Fallback to empty array
        });
    } catch (error) {
        console.error("Error in productController:", error);
        res.status(500).send("Server Error");
    }
};

module.exports = {
    productController
};