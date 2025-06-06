const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const Address = require("../../models/addressSchema");
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const env = require("dotenv").config();
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Wishlist = require("../../models/wishlistSchema");
const { success } = require("./checkoutController");
const saltRounds = 10;
const { getProductOffers } = require('./offerController'); 

const loadCart = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || !user._id) {
      return res.redirect('/login');
    }

    const userData = await User.findById(user);

    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;

    let cart = await Cart.findOne({ userId: user._id })
      .populate({
        path: 'items.productId',
        select: 'productName productImage salePrice originalPrice brand quantity category',
        populate: {
          path: 'brand category',
          select: 'name'
        }
      });

    if (cart) {
      cart.items = cart.items.filter(item => item.productId && item.productId.salePrice !== undefined);
      await cart.save();
    }

    const cartItems = cart ? cart.items : [];
    let subtotal = 0; 
    let offerDiscount = 0; 

    // Process cart items to include offer details
    const processedItems = await Promise.all(
      cartItems.map(async (item) => {
        if (!item.productId) return null;

        
        const { bestOffer } = await getProductOffers(
          item.productId._id,
          item.productId.category ? item.productId.category._id : null,
          item.productId.brand ? item.productId.brand._id : null
        );

        let price = item.productId.salePrice;
        let offer = null;

        if (bestOffer && bestOffer.discountType === 'percentage') {
          const discount = bestOffer.offerAmount / 100; 
          const originalPrice = item.productId.salePrice;
          price = originalPrice * (1 - discount);
          offer = {
            name: bestOffer.offerName,
            percentage: bestOffer.offerAmount
          };
          offerDiscount += (originalPrice - price) * item.stock; 
        }

        // Calculate subtotal using original sale price
        subtotal += item.productId.salePrice * item.stock;

        return {
          ...item.toObject(),
          price, // Discounted price
          originalPrice: item.productId.salePrice, // Original sale price
          offer // Offer details
        };
      })
    ).then(items => items.filter(item => item));

    const totalItems = cartItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedItems = processedItems.slice(skip, skip + limit);

    const getDeliveryDate = (days) => {
      const today = new Date();
      const deliveryDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
      return deliveryDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    };

    let coupon = 0;
    if (req.session.couponApplied) {
      coupon = req.session.couponApplied.offerAmount;
    }

    const total  = subtotal - offerDiscount - coupon;

    res.render('cart', {
      cartItems: paginatedItems,
      getDeliveryDate,
      totalPages,
      currentPage: page,
      totalItems,
      user: userData,
      subtotal,
      offerDiscount,
      coupon,
      total,
      currentPage: "cart"
    });
  } catch (error) {
    console.error('Error loading cart:', error);
    res.redirect('/pageNotFound');
  }
};

const addToCart = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || !user._id) {
      return res.status(401).json({ success: false, message: 'Please log in' });
    }

    const { productId, quantity = 1, fromWishlist } = req.body;
    const parsedQuantity = parseInt(quantity);

    // Validate product exists and stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    if (product.quantity < parsedQuantity) {
      return res.status(400).json({ success: false, message: 'Insufficient stock' });
    }

    // Add to cart
    let cart = await Cart.findOne({ userId: user._id });
    if (!cart) {
      cart = new Cart({ userId: user._id, items: [] });
    }

    const existingItem = cart.items.find(item => item.productId.toString() === productId);
    if (existingItem) {
      existingItem.stock += parsedQuantity;
      existingItem.totalPrice = existingItem.price * existingItem.stock;
    } else {
      cart.items.push({
        productId: productId,
        stock: parsedQuantity,
        price: product.salePrice,
        totalPrice: product.salePrice * parsedQuantity,
        status: 'placed',
        cancellationReason: 'none'
      });
    }

    await cart.save();

    // If added from wishlist, remove from wishlist
    if (fromWishlist) {
      const wishlist = await Wishlist.findOne({ userId: user._id });
      if (wishlist) {
        wishlist.products = wishlist.products.filter(item => item.productId.toString() !== productId);
        await wishlist.save();
      }
    }

    res.json({ success: true, message: 'Product added to cart' });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).redirect("/pageNotFound");
  }
};

const updateCartItem = async (req, res) => {
  try {
      const user = req.session.user;
      if (!user || !user._id) {
          return res.status(401).json({ success: false, message: 'Please log in' });
      }

      const { productId, quantity } = req.body;

      const cart = await Cart.findOne({ userId: user._id }).populate('items.productId');
      if (!cart) {
          return res.status(404).json({ success: false, message: 'Cart not found' });
      }

      const item = cart.items.find(item => item.productId._id.toString() === productId);
      if (!item) {
          return res.status(404).json({ success: false, message: 'Item not found' });
      }

      if (quantity > item.productId.quantity) {
          return res.status(400).json({
              success: false,
              message: `Cannot increase. Only ${item.productId.quantity} items in stock.`,
          });
      }

      if (quantity <= 0) {
          cart.items = cart.items.filter(item => item.productId._id.toString() !== productId);
      } else {
          item.stock = parseInt(quantity);
          item.totalPrice = item.productId.salePrice * item.stock;
      }

      await cart.save();

      // Recalculate subtotal, offerDiscount, and total
      let subtotal = cart.items.reduce((sum, item) => sum + (item.productId.salePrice * item.stock), 0);
      let offerDiscount = 0;
      for (const item of cart.items) {
          const { bestOffer } = await getProductOffers(
              item.productId._id,
              item.productId.category ? item.productId.category._id : null,
              item.productId.brand ? item.productId.brand._id : null
          );
          if (bestOffer && bestOffer.discountType === 'percentage') {
              const discount = bestOffer.offerAmount / 100;
              const originalPrice = item.productId.salePrice;
              const price = originalPrice * (1 - discount);
              offerDiscount += (originalPrice - price) * item.stock;
          }
      }
      let coupon = req.session.couponApplied ? req.session.couponApplied.offerAmount : 0;
      const total = subtotal - offerDiscount - coupon;

      res.json({ success: true, subtotal, offerDiscount, coupon, total });
  } catch (error) {
      console.error('Error in updateCartItem:', error);
      res.status(500).redirect("/pageNotFound");
  }
};

const removeCartItem = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || !user._id) {
      return res.status(401).json({ success: false, message: 'Please log in' });
    }
    const { productId } = req.body;
    const cart = await Cart.findOne({ userId: user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }
    const itemExists = cart.items.some(item => item.productId.toString() === productId);
    if (!itemExists) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }
    cart.items = cart.items.filter(item => item.productId.toString() !== productId);
    await cart.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Error in removeCartItem:', error);
    res.status(500).redirect("/pageNotFound");
  }
};

const couponApply = async (req, res) => {
  try {
    const couponCode = req.query.code;
    const userId = req.session.user;

    if (!couponCode) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    const coupon = await Coupon.findOne({ couponCode: couponCode });
    if (!coupon) {
      return res.status(400).json({ success: false, message: 'Invalid coupon code' });
    }

    const currentDate = new Date();
    if (!coupon.isList || currentDate > coupon.validUpto || currentDate < coupon.validFrom) {
      return res.status(400).json({ success: false, message: 'Coupon expired or not active.' });
    }

    const cart = await Cart.findOne({ userId: userId }).populate('items.productId');
    if (!cart) {
      return res.status(400).json({ success: false, message: 'Cart not found' });
    }

    let cartTotal = cart.items.reduce((total, item) => {
      return total + (item.productId.salePrice * item.stock);
    }, 0);

    if (cartTotal < coupon.minCartValue) {
      return res.status(400).json({
        success: false,
        message: `Cart total must be at least ₹${coupon.minCartValue} to use this coupon`,
      });
    }

    const existingCoupon = req.session.couponApplied;
    if (existingCoupon && existingCoupon.couponId.toString() === coupon._id.toString()) {
      return res.json({ success: true, message: 'Coupon already applied.', offerAmount: coupon.offerAmount });
    }

    if (existingCoupon && coupon.offerAmount <= existingCoupon.offerAmount) {
      return res.status(400).json({
        success: false,
        message: 'A better coupon is already applied.'
      });
    }

    req.session.couponApplied = {
      couponId: coupon._id,
      couponCode: coupon.couponCode,
      offerAmount: coupon.offerAmount,
      minValue: coupon.minCartValue
    };

    return res.json({
      success: true,
      message: 'Coupon applied successfully.',
      offerAmount: coupon.offerAmount
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    return res.status(500).json({ success: false, message: 'An error occurred while applying the coupon.' });
  }
};

const couponCancel = async (req, res) => {
  try {
    if (!req.session.couponApplied) {
      return res.status(400).json({ success: false, message: 'No coupon applied to cancel.' });
    }
    req.session.couponApplied = null;

    return res.json({ success: true, message: 'Coupon cancelled successfully.' });
  } catch (error) {
    console.error('Error cancelling coupon:', {
      message: error.message,
      stack: error.stack,
      userId: req.session.user,
    });
    return res.status(500).json({ success: false, message: 'An error occurred while cancelling the coupon.' });
  }
};

const getAvailableCoupons = async (req, res) => {
  try {
    const currentDate = new Date();
    const coupons = await Coupon.find({
      isList: true,
      validFrom: { $lte: currentDate },
      validUpto: { $gte: currentDate }
    });

    return res.json({ success: true, data: coupons });
  } catch (error) {
    console.error('Error fetching available coupons:', error);
    return res.status(500).json({ success: false, message: 'An error occurred while fetching coupons.' });
  }
};

const checkAppliedCoupon = async (req, res) => {
  try {
    const couponApplied = req.session.couponApplied;

    if (!couponApplied) {
      return res.json({ success: false, message: 'No coupon applied.' });
    }

    const coupon = await Coupon.findById(couponApplied.couponId);
    if (!coupon || !coupon.isList || new Date() > coupon.validUpto || new Date() < coupon.validFrom) {
      req.session.couponApplied = null;
      return res.json({ success: false, message: 'Applied coupon is invalid or expired.' });
    }

    return res.json({
      success: true,
      coupon: { couponCode: coupon.couponCode, offerAmount: coupon.offerAmount },
    });
  } catch (error) {
    console.error('Error checking applied coupon:', {
      message: error.message,
      stack: error.stack,
      userId: req.session.user,
    });
    req.session.couponApplied = null;
    return res.status(500).json({
      success: false,
      message: 'An error occurred while checking the applied coupon.',
    });
  }
};

const loadWishlist = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || !user._id) {
      return res.redirect('/login');
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;

    const wishlist = await Wishlist.findOne({ userId: user._id }).populate({
      path: 'products.productId',
      select: 'productName productImage salePrice originalPrice brand quantity',
    });

    const wishlistItems = wishlist && wishlist.products ? wishlist.products : [];
    const totalItems = wishlistItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedItems = wishlistItems.slice(skip, skip + limit);

    const userData = await User.findById(user._id);

    res.render('wishlist', {
      wishlistItems: paginatedItems,
      totalPages,
      currentPage: page,
      totalItems,
      user: userData,
      currentPage: "wishlist",
    });
  } catch (error) {
    console.error('Error loading wishlist:', error);
    res.redirect('/pageNotFound');
  }
};

const addToWishList = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || !user._id) {
      return res.status(401).json({ success: false, message: 'Please log in' });
    }

    const { productId } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let wishlist = await Wishlist.findOne({ userId: user._id });
    if (!wishlist) {
      wishlist = new Wishlist({ userId: user._id, products: [] });
    }

    const existingItem = wishlist.products.find(item => item.productId.toString() === productId);
    if (existingItem) {
      return res.status(400).json({ success: false, message: 'Product already in wishlist' });
    }

    wishlist.products.push({
      productId: productId,
      addedOn: new Date(),
    });

    await wishlist.save();
    res.json({ success: true, message: 'Product added to wishlist' });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).redirect("/pageNotFound")
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || !user._id) {
      return res.status(401).json({ success: false, message: 'Please log in' });
    }

    const { productId } = req.body;

    const wishlist = await Wishlist.findOne({ userId: user._id });
    if (!wishlist) {
      return res.status(404).json({ success: false, message: 'Wishlist not found' });
    }

    const itemExists = wishlist.products.some(item => item.productId.toString() === productId);
    if (!itemExists) {
      return res.status(404).json({ success: false, message: 'Product not found in wishlist' });
    }

    wishlist.products = wishlist.products.filter(item => item.productId.toString() !== productId);
    await wishlist.save();

    res.json({ success: true, message: 'Product removed from wishlist' });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  loadCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  couponApply,
  couponCancel,
  getAvailableCoupons,
  checkAppliedCoupon,
  loadWishlist,
  addToWishList,
  removeFromWishlist
};