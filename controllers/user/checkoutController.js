const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const mongoose = require('mongoose');
const { login } = require('./userController');

const loadOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log('Session User ID:', userId);
    if (!userId) {
      return res.redirect('/login');
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Convert userId to ObjectId
    const objectId = new mongoose.Types.ObjectId(userId);

    // Fetch orders
    const orders = await Order.find({ userId: objectId })
      .skip(skip)
      .limit(limit)
      .populate('orderItems.product')
      .sort({ createdOn: -1 });

    // Count total orders
    const totalOrders = await Order.countDocuments({ userId: objectId });
    const totalPages = Math.ceil(totalOrders / limit);

    console.log('Orders Data:', {
      ordersCount: orders.length,
      totalOrders,
      totalPages,
      page,
      limit,
    });

    // Render orders page
    res.render('orders', {
      orders,
      currentPage: page,
      totalPages,
      limit,
    });
  } catch (error) {
    console.error('Error loading orders:', {
      message: error.message,
      stack: error.stack,
    });
    res.redirect('/pageNotFound');
  }
};

const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    console.log('Loading checkout for user:', userId);
    if (!userId) {
      console.log('No user session found, redirecting to login');
      return res.redirect('/login');
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log('User not found for ID:', userId);
      return res.redirect('/login');
    }

    // Fetch addresses
    const addressDoc = await Address.findOne({ userId });
    const addresses = addressDoc ? addressDoc.address : [];
    console.log('Addresses found:', addresses.length);

    // Fetch cart
    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'productName productImage salePrice quantity',
    });

    if (!cart || !cart.items.length) {
      console.log('Cart is empty or not found for user:', userId);
      return res.redirect('/cart?message=Cart is empty');
    }

    // Calculate totals
    let subtotal = 0;
    const cartItems = cart.items
      .map(item => {
        if (!item.productId) {
          console.log('Invalid cart item, missing productId:', item);
          return null;
        }
        subtotal += item.totalPrice;
        return {
          productId: item.productId._id,
          name: item.productId.productName,
          price: item.productId.salePrice,
          image: item.productId.productImage[0],
          quantity: item.stock,
        };
      })
      .filter(item => item);
    console.log('Cart items processed:', cartItems.length, 'Subtotal:', subtotal);

    // Check for applied coupon
    let coupon = 0;
    if (req.session.couponApplied) {
      const couponData = await Coupon.findById(req.session.couponApplied.couponId);
      if (
        couponData &&
        couponData.isList &&
        new Date() <= couponData.validUpto &&
        new Date() >= couponData.validFrom
      ) {
        coupon = couponData.offerAmount;
        console.log('Valid coupon applied:', couponData.couponCode, 'Discount:', coupon);
      } else {
        console.log('Invalid or expired coupon, clearing session:', req.session.couponApplied);
        req.session.couponApplied = null;
      }
    } else {
      console.log('No coupon applied');
    }

    res.render('checkout', {
      user,
      addresses,
      cart: cartItems,
      subtotal,
      shipping: 0,
      discount: 0,
      total: subtotal - coupon,
      coupon,
    });
  } catch (error) {
    console.error('Error loading checkout page:', {
      message: error.message,
      stack: error.stack,
      userId: req.session.user,
    });
    res.redirect('/cart?message=An error occurred, please try again');
  }
};

const placeOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod } = req.body;
    const userId = req.session.user;
    console.log('Placing order for user:', userId, 'Address:', addressId, 'Payment:', paymentMethod);

    const addressDoc = await Address.findOne({ userId });
    const selectedAddress = addressDoc?.address.find(addr => addr._id.toString() === addressId);

    if (!selectedAddress) {
      console.log('Invalid address selected:', addressId);
      return res.json({ success: false, message: 'Invalid address selected' });
    }

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || !cart.items.length) {
      console.log('Cart is empty for user:', userId);
      return res.json({ success: false, message: 'Cart is empty' });
    }

    const orderItems = [];
    let totalPrice = 0;

    for (const item of cart.items) {
      const product = item.productId;
      if (!product || product.quantity < item.stock) {
        console.log('Out of stock item:', product?.productName || 'Unknown');
        return res.json({
          success: false,
          message: `${product?.productName || 'Item'} is out of stock`,
        });
      }

      orderItems.push({
        product: product._id,
        stock: item.stock,
        price: product.salePrice,
      });

      totalPrice += product.salePrice * item.stock;
      product.quantity -= item.stock;
      await product.save();
    }

    // Apply coupon discount if present
    let discount = 0;
    if (req.session.couponApplied) {
      const couponData = await Coupon.findById(req.session.couponApplied.couponId);
      if (
        couponData &&
        couponData.isList &&
        new Date() <= couponData.validUpto &&
        new Date() >= couponData.validFrom
      ) {
        discount = couponData.offerAmount;
        console.log('Applying coupon discount:', discount);
      }
    }

    const order = new Order({
      orderId: `ORD${Date.now()}`,
      userId,
      orderItems,
      totalPrice,
      discount,
      finalAmount: totalPrice - discount,
      address: selectedAddress,
      paymentMethod,
      paymentStatus: 'Pending',
      status: 'Processing',
      invoiceDate: new Date(),
      createdOn: new Date(),
    });

    await order.save();
    await Cart.deleteOne({ userId });

    // Clear applied coupon after order placement
    req.session.couponApplied = null;
    console.log('Order placed, coupon cleared');

    res.json({
      success: true,
      message: 'Order placed successfully.',
      orderId: order.orderId,
    });
  } catch (error) {
    console.error('Error placing order:', {
      message: error.message,
      stack: error.stack,
      userId: req.session.user,
    });
    res.json({
      success: false,
      message: 'An error occurred while placing the order.',
    });
  }
};

const loadOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const order = await Order.findOne({ _id: id, userId }).populate('orderItems.product');

    console.log('Order details:', order);

    if (!order) {
      return res.redirect('/pageNotFound');
    }

    const addressDoc = await Address.findOne({ userId });
    const selectedAddress = addressDoc
      ? addressDoc.address.find(addr => addr.isDefault) || addressDoc.address[0]
      : null;

    res.render('order-details', { user: userData, order, address: selectedAddress });
  } catch (error) {
    console.error('Error loading order details:', error);
    res.redirect('/pageNotFound');
  }
};

const returnOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ _id: orderId, userId }).populate('orderItems.product');
    if (!order) {
      return res.json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'Delivered' || order.isReturned || order.isReturnRequested) {
      return res.json({ success: false, message: 'Order cannot be returned' });
    }

    // Update order status and reason
    order.status = 'Return Request';
    order.isReturnRequested = true;
    order.returnReason = reason;
    await order.save();

    // Restore product quantities (optional: wait for admin approval)
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product);
      if (product) {
        product.quantity += item.stock;
        await product.save();
      }
    }

    res.json({ success: true, message: 'Return request submitted successfully' });
  } catch (error) {
    console.error('Error requesting return:', error);
    res.json({ success: false, message: 'An error occurred' });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ _id: orderId, userId });

    console.log(order);

    if (!order) {
      return res.json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'Processing') {
      return res.json({ success: false, message: 'Cannot cancel order in this status' });
    }

    // Update order status
    order.status = 'Cancelled';
    await order.save();

    // Restore product quantities
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product);
      if (product) {
        product.quantity += item.stock;
        await product.save();
      }
    }

    res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.json({ success: false, message: 'An error occurred' });
  }
};

const success = async (req, res) => {
  try {
    // Get userId from session
    const userId = req.session.user;
    const userData = await User.findById(userId);
    if (!userId) {
      console.error('No user ID in session');
      return res.redirect('/login');
    }

    let order = null;

    if (req.query.orderId) {
      order = await Order.findOne({ orderId: req.query.orderId, userId })
        .populate('userId')
        .populate('orderItems.product');
    }

    if (!order) {
      order = await Order.findOne({ userId })
        .sort({ createdOn: -1 })
        .populate('userId')
        .populate('orderItems.product');
    }

    if (!order) {
      return res.render('success', {
        user: userData,
        order: null,
        address: null,
        message: 'No order found. Please contact support if you completed a purchase.',
      });
    }

    res.render('success', {
      order,
      address: order.address || null,
      message: null,
      user: userData,
    });
  } catch (error) {
    console.error('Error in success route:', error);
    res.status(500).render('error', {
      message: 'An error occurred while loading your order details. Please try again later.',
    });
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
  loadOrderDetails,
  loadOrders,
  cancelOrder,
  success,
  returnOrder,
};