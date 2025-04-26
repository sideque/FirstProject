const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const Address = require("../../models/addressSchema");
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const env = require("dotenv").config();
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const { success } = require("./checkoutController");
const saltRounds = 10;

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

    let cart = await Cart.findOne({ userId: user._id }).populate({
      path: 'items.productId',
      select: 'productName productImage salePrice originalPrice brand quantity'
    });

    if (cart) {
      cart.items = cart.items.filter(item => item.productId && item.productId.salePrice !== undefined);
      await cart.save();
    }

    const cartItems = cart ? cart.items : [];
    const totalItems = cartItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedItems = cartItems.slice(skip, skip + limit);

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

    res.render('cart', {
      cartItems: paginatedItems,
      getDeliveryDate,
      totalPages,
      currentPage: page,
      totalItems,
      user: userData,
      coupon
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

    const productId = req.params.id;
    const quantity = req.body.quantity ? parseInt(req.body.quantity) : 1;

    let cart = await Cart.findOne({ userId: user._id });
    if (!cart) {
      cart = new Cart({ userId: user._id, items: [] });
    }

    const existingItem = cart.items.find(item => item.productId.toString() === productId);
    if (existingItem) {
      existingItem.stock += quantity;
      existingItem.totalPrice = existingItem.price * existingItem.stock;
    } else {
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      cart.items.push({
        productId: productId,
        stock: quantity,
        price: product.salePrice,
        totalPrice: product.salePrice * quantity,
        status: 'placed',
        cancellationReason: 'none'
      });
    }

    await cart.save();
    res.redirect(`/cart?success=true`);
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.redirect('/pageNotFound');
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
      // the change is stock to quantity
    if (quantity > item.productId.quantity) {
      return res.status(400).json({
        success: false,                         //also this changed stock to quatity
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
    const total = cart.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    res.json({ success: true, total });
  } catch (error) {
    console.error('Error in updateCartItem:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const removeCartItem = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || !user._id) {
      return res.status(401).json({ success: false, message: 'Please log in' });
    }
    const { productId } = req.body;
    console.log('Removing item with productId:', productId);
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
    res.status(500).json({ success: false, message: 'Server error' });
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

    // Calculate cart total
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
      offerAmount: coupon.offerAmount, // this change ot couponCode to offerAmount
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
      console.log('No coupon applied to cancel for user:', req.session.user);
      return res.status(400).json({ success: false, message: 'No coupon applied to cancel.' });
    }

    console.log('Cancelling coupon:', req.session.couponApplied);
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
      console.log('No coupon applied for user:', req.session.user);
      return res.json({ success: false, message: 'No coupon applied.' });
    }

    const coupon = await Coupon.findById(couponApplied.couponId);
    if (!coupon || !coupon.isList || new Date() > coupon.validUpto || new Date() < coupon.validFrom) {
      console.log('Invalid or expired coupon, clearing session:', couponApplied);
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

module.exports = {
  loadCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  couponApply,
  couponCancel,
  getAvailableCoupons,
  checkAppliedCoupon
};