const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");
const Brand = require("../../models/brandSchema");
const Offer = require("../../models/offerSchema");
const { getProductOffers } = require('../user/offerController');

const productController = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const productId = req.query.id;

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

    if (!product || !product.category || !product.brand) {
      return res.status(404).render("404"); 
    }

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

    const allOffers = await Offer.find({
      isList: true,
      validFrom: { $lte: new Date() }, 
      validUpto: { $gte: new Date() }, 
      $or: [
        { offerType: 'Product', applicableTo: productId },
        { offerType: 'Category', applicableTo: product.category._id },
        { offerType: 'Brand', applicableTo: product.brand._id },
      ],
    }).lean();

    let bestOffer = null;
    let discountAmount = 0;
    let discountedPrice = product.salePrice;

    if (allOffers.length > 0) {
      bestOffer = allOffers.reduce((best, offer) => {
        const currentDiscount = (product.salePrice * offer.offerAmount) / 100; 
        if (!best || currentDiscount > best.discount) {
          return { ...offer, discount: currentDiscount };
        }
        return best;
      }, null);

      if (bestOffer) {
        discountAmount = bestOffer.discount;
        discountedPrice = product.salePrice - discountAmount;
      }

      allOffers.forEach(offer => {
        offer.discountType = offer.discountType || 'percentage'; 
        offer.discountAmount = offer.offerAmount; 
      });

      if (bestOffer) {
        bestOffer.discountType = bestOffer.discountType || 'percentage';
        bestOffer.discountAmount = bestOffer.offerAmount;
      }
    }

    const productWithOffer = {
      ...product,
      salePrice: discountedPrice,
      productOffer: bestOffer ? bestOffer.offerAmount : 0,
    };

    res.render("product-details", {
      user: userData,
      product: productWithOffer,
      relatedProducts: relatedProducts.filter(p => p.brand),
      bestOffer, 
      allOffers, 
      discountAmount, 
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