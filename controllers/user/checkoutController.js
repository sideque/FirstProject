const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { getProductOffers } = require('./offerController');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createRazorpayOrder = async (amount, userId) => {
  const roundedAmount = Math.round(parseFloat(amount) * 100); 
  const options = {
    amount: roundedAmount,
    currency: 'INR',
    receipt: `order_${userId}_${Date.now()}`,
  };
  return await razorpay.orders.create(options);
};

const loadOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ userId })
      .skip(skip)
      .limit(limit)
      .populate('orderItems.product')
      .sort({ createdOn: -1 });

    const totalOrders = await Order.countDocuments({ userId });
    const totalPages = Math.ceil(totalOrders / limit);

    res.render('orders', {
      orders,
      currentPage: page,
      totalPages,
      limit,
    });
  } catch (error) {
    console.error('Error loading orders:', error);
    res.redirect('/pageNotFound');
  }
};

const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }

    const addressDoc = await Address.findOne({ userId });
    const addresses = addressDoc ? addressDoc.address : [];

    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'productName productImage salePrice quantity category brand',
    });

    if (!cart || !cart.items.length) {
      return res.redirect('/cart?message=Cart is empty');
    }

    const wallet = await Wallet.findOne({ userId }).lean();

    let subtotal = 0;
    let offerDiscount = 0;

    const cartItems = await Promise.all(
      cart.items.map(async (item) => {
        if (!item.productId) return null;

        const { bestOffer } = await getProductOffers(
          item.productId._id,
          item.productId.category,
          item.productId.brand
        );

        let price = item.productId.salePrice;
        let originalPrice = item.productId.salePrice;

        if (bestOffer && bestOffer.discountType === 'percentage') {
          price = Math.round(price * (1 - bestOffer.offerAmount / 100) * 100) / 100;
          offerDiscount += Math.round((originalPrice - price) * item.stock * 100) / 100;
        }

        subtotal += Math.round(originalPrice * item.stock * 100) / 100;

        return {
          productId: item.productId._id,
          name: item.productId.productName,
          price,
          originalPrice,
          image: item.productId.productImage[0],
          quantity: item.stock,
          offer: bestOffer
            ? {
                name: bestOffer.offerName,
                percentage: bestOffer.offerAmount,
              }
            : null,
        };
      })
    ).then((items) => items.filter((item) => item));

    let couponDiscount = 0;
    if (req.session.couponApplied) {
      const couponData = await Coupon.findById(req.session.couponApplied.couponId);
      if (
        couponData &&
        couponData.isList &&
        new Date() <= couponData.validUpto &&
        new Date() >= couponData.validFrom &&
        subtotal >= (couponData.minimumPrice || 0)
      ) {
        couponDiscount = couponData.offerAmount;
      } else {
        req.session.couponApplied = null;
      }
    }

    const total = Math.max(0, Math.round((subtotal - offerDiscount - couponDiscount) * 100) / 100);

    res.render('checkout', {
      user,
      addresses,
      cart: cartItems,
      subtotal,
      offerDiscount,
      shipping: 0,
      coupon: couponDiscount,
      total,
      wallet,
      csrfToken: req.csrfToken ? req.csrfToken() : '',
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.redirect('/cart?message=An error occurred');
  }
};

const loadProductDetails = async (req, res) => {
  try {
    const productId = req.query.id;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.redirect('/pageNotFound');
    }

    const product = await Product.findById(productId)
    .populate('category brand');
    if (!product) {
      return res.redirect('/pageNotFound');
    }

    const { bestOffer, allOffers } = await getProductOffers(
      product._id,
      product.category ? product.category._id : null,
      product.brand ? product.brand._id : null
    );

    // Apply best offer to salePrice if applicable
    let discountedPrice = product.salePrice;
    let offerPercentage = 0;
    if (bestOffer && bestOffer.discountType === 'percentage') {
      offerPercentage = bestOffer.offerAmount;
      discountedPrice = Math.round(product.salePrice * (1 - offerPercentage / 100) * 100) / 100;
    }

    const relatedProducts = await Product.find({
      category: product.category ? product.category._id : null,
      _id: { $ne: product._id },
    })
      .limit(4)
      .select('productName productImage salePrice brand')
      .populate('brand');

    // Apply offers to related products
    const processedRelatedProducts = await Promise.all(
      relatedProducts.map(async (relatedProduct) => {
        const { bestOffer: relatedBestOffer } = await getProductOffers(
          relatedProduct._id,
          relatedProduct.category ? relatedProduct.category._id : null,
          relatedProduct.brand ? relatedProduct.brand._id : null
        );

        let relatedDiscountedPrice = relatedProduct.salePrice;
        let relatedOfferPercentage = 0;
        if (relatedBestOffer && relatedBestOffer.discountType === 'percentage') {
          relatedOfferPercentage = relatedBestOffer.offerAmount;
          relatedDiscountedPrice =
            Math.round(relatedProduct.salePrice * (1 - relatedBestOffer.offerAmount / 100) * 100) /
            100;
        }

        return {
          ...relatedProduct.toObject(),
          salePrice: relatedDiscountedPrice,
          productOffer: relatedOfferPercentage,
        };
      })
    );

    res.render('product-details', {
      product: {
        ...product.toObject(),
        salePrice: discountedPrice,
        productOffer: offerPercentage,
      },
      relatedProducts: processedRelatedProducts,
      allOffers,
    });
  } catch (error) {
    console.error('Error loading product details:', error);
    res.redirect('/pageNotFound');
  }
};

const placeOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const user = await User.findById(userId);
    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res.status(400).json({ success: false, message: 'Address not found' });
    }

    const selectedAddress = addressDoc.address.find((addr) => addr._id.toString() === addressId);
    if (!selectedAddress) {
      return res.status(400).json({ success: false, message: 'Invalid address selected' });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'productName salePrice quantity category brand',
    });
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    let subtotal = 0;
    let offerDiscount = 0;
    const cartItems = await Promise.all(
      cart.items.map(async (item) => {
        const product = item.productId;
        if (!product) return null;
        if (product.quantity < item.stock) {
          return res.status(400).json({
            success: false,
            message: `${product.productName} is out of stock`,
          });
        }

        const { bestOffer } = await getProductOffers(product._id, product.category, product.brand);
        let price = product.salePrice;
        let originalPrice = product.salePrice;

        if (bestOffer && bestOffer.discountType === 'percentage') {
          price = Math.round(price * (1 - bestOffer.offerAmount / 100) * 100) / 100;
          offerDiscount += Math.round((originalPrice - price) * item.stock * 100) / 100;
        }

        subtotal += Math.round(originalPrice * item.stock * 100) / 100;

        return {
          productId: product._id,
          stock: item.stock,
          price,
          offerId: bestOffer?._id || null,
          offerAmount: bestOffer ? Math.round(bestOffer.offerAmount * item.stock * 100) / 100 : 0,
        };
      })
    ).then((items) => items.filter((item) => item));

    let couponDiscount = 0;
    let couponApplied = false;
    let couponId = null;
    if (req.session.couponApplied) {
      const coupon = await Coupon.findById(req.session.couponApplied.couponId);
      if (
        coupon &&
        coupon.isList &&
        new Date() >= coupon.validFrom &&
        new Date() <= coupon.validUpto &&
        subtotal >= (coupon.minimumPrice || 0)
      ) {
        couponDiscount = coupon.offerAmount;
        couponApplied = true;
        couponId = coupon._id;
      } else {
        req.session.couponApplied = null;
      }
    }

    const discount = Math.round((offerDiscount + couponDiscount) * 100) / 100;
    const finalAmount = Math.round(Math.max(0, subtotal - discount) * 100) / 100;

    if (finalAmount <= 0)
      return res.status(400).json({ success: false, message: 'Invalid total price' });

    // Validate payment method
    if (paymentMethod === 'Wallet') {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < finalAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Required: ₹${finalAmount.toFixed(
            2
          )}, Available: ₹${(wallet?.balance || 0).toFixed(2)}`,
        });
      }
    }

    if (paymentMethod === 'COD' && finalAmount >= 1000) {
      return res.status(400).json({
        success: false,
        message: `₹${finalAmount.toFixed(2)} is not allowed for Cash On Delivery`,
      });
    }

    // Handle Razorpay payment
    if (paymentMethod === 'Razorpay' && finalAmount > 0) {
      const razorpayOrder = await createRazorpayOrder(finalAmount, userId);
      return res.status(200).json({
        success: true,
        message: 'Razorpay order created',
        razorpayOrder: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          key: process.env.RAZORPAY_KEY_ID,
        },
        orderDetails: {
          userId,
          selectedAddress,
          cartItems,
          totalPrice: subtotal,
          discount,
          offerDiscount,
          couponDiscount,
          finalAmount,
          couponApplied,
        },
      });
    }

    // Create order for Wallet or COD
    const order = new Order({
      orderId: `ORD${Date.now()}`,
      userId,
      orderItems: cartItems.map((item) => ({
        product: item.productId,
        stock: item.stock,
        price: item.price,
        offerId: item.offerId,
        offerAmount: item.offerAmount,
        couponId: couponApplied ? couponId : null,
      })),
      totalPrice: subtotal,
      discount,
      offerDiscount,
      couponDiscount,
      finalAmount,
      address: selectedAddress,
      paymentMethod,
      paymentStatus: paymentMethod === 'Wallet' ? 'Completed' : 'Pending',
      status: 'Processing',
      invoiceDate: new Date(),
      createdOn: new Date(),
      couponApplied,
    });

    if (paymentMethod === 'Wallet') {
      const wallet = await Wallet.findOne({ userId });
      wallet.balance -= finalAmount;
      wallet.transactions.push({
        amount: finalAmount,
        type: 'debit',
        paymentMethod: 'Wallet',
        transactionId: `TXN${Date.now()}`,
        orderId: order.orderId,
        description: `Payment for order ${order.orderId}`,
        date: new Date(),
      });
      await wallet.save();
    }

    // Update product quantities
    for (const item of cartItems) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: -item.stock } });
    }

    await order.save();
    await Cart.deleteOne({ userId });
    req.session.couponApplied = null;

    res.json({ success: true, message: 'Order placed successfully', orderId: order.orderId });
  } catch (error) {
    console.error('Error in placeOrder:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderDetails } = req.body;

    // Verify Razorpay signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.redirect(
        `/paymentfailedpage?error=${encodeURIComponent('Invalid payment signature')}`
      );
    }

    const {
      userId,
      selectedAddress,
      cartItems,
      totalPrice,
      discount,
      offerDiscount,
      couponDiscount,
      finalAmount,
      couponApplied,
    } = orderDetails;

    if (Math.abs(discount - (offerDiscount + couponDiscount)) > 0.01) {
      return res.redirect(
        `/paymentfailedpage?error=${encodeURIComponent('Invalid discount data')}`
      );
    }

    // Create order after successful Razorpay payment
    const order = new Order({
      orderId: `ORD${Date.now()}`,
      userId,
      orderItems: cartItems.map((item) => ({
        product: item.productId,
        stock: item.stock,
        price: item.price,
        offerId: item.offerId,
        offerAmount: item.offerAmount,
      })),
      totalPrice,
      discount,
      offerDiscount,
      couponDiscount,
      finalAmount,
      address: selectedAddress,
      paymentMethod: 'Razorpay',
      paymentStatus: 'Completed',
      status: 'Processing',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      invoiceDate: new Date(),
      createdOn: new Date(),
      couponApplied,
    });

    // Update product quantities
    for (const item of cartItems) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: -item.stock } });
    }

    await Cart.deleteOne({ userId });
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order placed successfully',
      orderId: order.orderId,
    });
  } catch (error) {
    console.error('Error in verifyRazorpayPayment:', error);
    res.redirect(
      `/paymentfailedpage?error=${encodeURIComponent(
        error.message || 'Payment verification failed'
      )}`
    );
  }
};

const loadOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.redirect('/pageNotFound');

    const userId = req.session.user;
    const userData = await User.findById(userId);
    const order = await Order.findOne({ _id: id, userId }).populate('orderItems.product');

    if (!order) return res.redirect('/pageNotFound');

    const addressDoc = await Address.findOne({ userId });
    const selectedAddress = addressDoc
      ? addressDoc.address.find((addr) => addr.isDefault) || addressDoc.address[0] : null;

    res.render('order-details',{ 
        user: userData, 
        order, 
        address: selectedAddress 
      });
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
    if (!order) return res.json({ success: false, message: 'Order not found' });

    if (order.status !== 'Delivered' || order.isReturned || order.isReturnRequested) {
      return res.json({ success: false, message: 'Order cannot be returned' });
    }

    order.status = 'Return Request';
    order.isReturnRequested = true;
    order.returnReason = reason;
    await order.save();

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

    const order = await Order.findOne({ _id: orderId, userId }).populate('orderItems.product');
    if (!order) {
      return res.json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'Processing') {
      return res.json({ success: false, message: 'Cannot cancel order in this status' });
    }

    order.cancelOrReturn = order.finalAmount;
    order.revokedCoupon = order.couponDiscount;
    order.status = 'Cancelled';
    await order.save();

    // Refund to wallet for Wallet or Razorpay payments
    if (['Wallet', 'Razorpay'].includes(order.paymentMethod) && order.paymentStatus === 'Completed') {
      let wallet = await Wallet.findOne({ userId }) || new Wallet({ userId, balance: 0, transactions: [] });
      wallet.balance += order.finalAmount;
      wallet.transactions.push({
        amount: order.finalAmount,
        type: 'credit',
        paymentMethod: 'Refund',
        transactionId: `TXN${Date.now()}`,
        orderId: order.orderId,
        description: `Refund for canceled order ${order.orderId} (${order.paymentMethod} payment)`,
        date: new Date(),
      });
      await wallet.save();
    }

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
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const userData = await User.findById(userId);
    let order = req.query.orderId
      ? await Order.findOne({ orderId: req.query.orderId, userId }).populate('orderItems.product')
      : await Order.findOne({ userId }).sort({ createdOn: -1 }).populate('orderItems.product');

    if (!order) {
      return res.render('success', {
        user: userData,
        order: null,
        address: null,
        message: 'No order found. Please contact support.',
      });
    }

    res.render('success', { order, address: order.address || null, message: null, user: userData });
  } catch (error) {
    console.error('Error in success route:', error);
    res.status(500).render('error', { message: 'Error loading order details. Try again later.' });
  }
};

const paymentFailed = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      req.session.userMsg = 'Session expired!';
      return res.redirect('/login');
    }

    const user = await User.findById(userId);
    if (!user) {
      req.session.userMsg = 'Session expired!';
      return res.redirect('/login');
    }

    const error = req.query.error || 'Payment failed or was cancelled';

    res.render('paymentfailed', { user, error });
  } catch (error) {
    console.error('Error in paymentFailed:', error);
    res.redirect('/pageNotFound');
  }
};

const retryOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'productName salePrice quantity category brand',
    });

    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // Assume the last address used is the default or first available
    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc || !addressDoc.address.length) {
      return res.status(400).json({ success: false, message: 'No address found' });
    }
    const selectedAddress = addressDoc.address.find(addr => addr.isDefault) || addressDoc.address[0];

    let subtotal = 0;
    let offerDiscount = 0;
    const cartItems = await Promise.all(
      cart.items.map(async (item) => {
        const product = item.productId;
        if (!product) return null;
        if (product.quantity < item.stock) {
          return res.status(400).json({
            success: false,
            message: `${product.productName} is out of stock`,
          });
        }

        const { bestOffer } = await getProductOffers(product._id, product.category, product.brand);
        let price = product.salePrice;
        let originalPrice = product.salePrice;

        if (bestOffer && bestOffer.discountType === 'percentage') {
          price = Math.round(price * (1 - bestOffer.offerAmount / 100) * 100) / 100;
          offerDiscount += Math.round((originalPrice - price) * item.stock * 100) / 100;
        }

        subtotal += Math.round(originalPrice * item.stock * 100) / 100;

        return {
          productId: product._id,
          stock: item.stock,
          price,
          offerId: bestOffer?._id || null,
          offerAmount: bestOffer ? Math.round(bestOffer.offerAmount * item.stock * 100) / 100 : 0,
        };
      })
    ).then((items) => items.filter((item) => item));

    let couponDiscount = 0;
    let couponApplied = false;
    let couponId = null;
    if (req.session.couponApplied) {
      const coupon = await Coupon.findById(req.session.couponApplied.couponId);
      if (
        coupon &&
        coupon.isList &&
        new Date() >= coupon.validFrom &&
        new Date() <= coupon.validUpto &&
        subtotal >= (coupon.minimumPrice || 0)
      ) {
        couponDiscount = coupon.offerAmount;
        couponApplied = true;
        couponId = coupon._id;
      } else {
        req.session.couponApplied = null;
      }
    }

    const discount = Math.round((offerDiscount + couponDiscount) * 100) / 100;
    const finalAmount = Math.round(Math.max(0, subtotal - discount) * 100) / 100;

    if (finalAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid total price' });
    }

    // Create new Razorpay order
    const razorpayOrder = await createRazorpayOrder(finalAmount, userId);

    res.status(200).json({
      success: true,
      message: 'Razorpay order created for retry',
      razorpayOrder: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID,
      },
      orderDetails: {
        userId,
        selectedAddress,
        cartItems,
        totalPrice: subtotal,
        discount,
        offerDiscount,
        couponDiscount,
        finalAmount,
        couponApplied,
        orderId: `ORD${Date.now()}`,
      },
    });
  } catch (error) {
    console.error('Error in retryOrder:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
  verifyRazorpayPayment,
  loadOrderDetails,
  loadOrders,
  cancelOrder,
  success,
  returnOrder,
  loadProductDetails,
  paymentFailed,
  retryOrder
};