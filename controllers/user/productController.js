const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");
const Brand = require("../../models/brandSchema");
const Offer = require("../../models/offerSchema");

const productController = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const productId = req.query.id;

    // Fetch product ONLY if it's not blocked, brand and category are listed and not deleted
    const product = await Product.findOne({
      _id: productId,
      isBlocked: false,
      quantity: { $gt: 0 },
    })
      .populate({
        path: 'category',
        match: { isListed: true, isDeleted: false },
        select: 'name isListed isDeleted',
      })
      .populate({
        path: 'brand',
        match: { isListed: true, isDeleted: false },
        select: 'name isListed isDeleted',
      })
      .lean();

    // Reject if product, category, or brand is missing (meaning they didn’t match)
    if (!product || !product.category || !product.brand) {
      return res.status(404).render("404"); // or send("Product not available")
    }

    // Fetch related products (with proper filters)
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: productId },
      isBlocked: false,
      quantity: { $gt: 0 },
    })
      .limit(4)
      .populate({
        path: 'brand',
        match: { isListed: true, isDeleted: false },
        select: 'name',
      })
      .lean();

    // Fetch offers applicable to this product, its category, or its brand
    const offers = await Offer.find({
      isList: true,
      validFrom: { $lte: new Date() }, // Offer has started
      validUpto: { $gte: new Date() }, // Offer has not expired
      $or: [
        { offerType: 'Product', applicableTo: productId },
        { offerType: 'Category', applicableTo: product.category._id },
        { offerType: 'Brand', applicableTo: product.brand._id },
      ],
    }).lean();

    // Determine the best offer (highest percentage discount)
    let bestOffer = null;
    let discountAmount = 0;

    if (offers.length > 0) {
      // Calculate discount for each offer and find the best one
      bestOffer = offers.reduce((best, offer) => {
        const currentDiscount = (product.salePrice * offer.offerAmount) / 100; // Percentage-based discount

        if (!best || currentDiscount > best.discount) {
          return { ...offer, discount: currentDiscount };
        }
        return best;
      }, null);

      // Set discountAmount for the best offer
      discountAmount = bestOffer.discount;

      // Map offers to match template expectations (discountType, discountAmount)
      offers.forEach(offer => {
        offer.discountType = 'percentage'; // Already set in schema
        offer.discountAmount = offer.offerAmount; // Map offerAmount to discountAmount for template
      });

      // Update bestOffer to match template expectations
      bestOffer.discountType = 'percentage';
      bestOffer.discountAmount = bestOffer.offerAmount;
    }

    res.render("product-details", {
      user: userData,
      product,
      relatedProducts: relatedProducts.filter(p => p.brand),
      bestOffer, // Pass best offer
      offers, // Pass all applicable offers
      discountAmount // Pass calculated discount amount
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