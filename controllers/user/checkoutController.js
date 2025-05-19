const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const upload = require("../../config/multerConfig");
const { getProductOffers } = require('./offerController');

// Initialize Razorpay with environment variables
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Helper function to create Razorpay order
const createRazorpayOrder = async (amount, userId) => {
  const roundedAmount = Math.round(parseFloat(amount) * 100);
  const options = {
    amount: roundedAmount,
    currency: 'INR',
    receipt: `order_${userId}_${Date.now()}`,
  };
  return await razorpay.orders.create(options);
};

// Load product details page
const loadProductDetails = async (req, res) => {
  try {
    const productId = req.query.id;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      console.error('Invalid product ID:', productId);
      return res.redirect('/pageNotFound');
    }

    const product = await Product.findById(productId).populate('category brand');
    if (!product) {
      console.error('Product not found for ID:', productId);
      return res.redirect('/pageNotFound');
    }

    console.log('Product data:', JSON.stringify(product, null, 2));
    console.log('Raw product images:', product.productImage);

    // Format images to match shop page
    let images = [];
    if (product.productImage && Array.isArray(product.productImage)) {
      images = product.productImage.map(img => img); // Use Cloudinary URL directly
    }
    const formattedImages = images.map(url => ({ url }));
    console.log('Formatted product images:', formattedImages);

    // Simplified offer handling
    const discountedPrice = product.salePrice;
    const offerPercentage = product.productOffer || 0;

    // Fetch related products
    const relatedProducts = await Product.find({
      category: product.category ? product.category._id : null,
      _id: { $ne: product._id },
      isBlocked: false,
      quantity: { $gt: 0 },
    })
      .limit(4)
      .select('productName productImage salePrice regularPrice productOffer brand quantity')
      .populate('brand');

    console.log('Raw related products:', JSON.stringify(relatedProducts, null, 2));

    const processedRelatedProducts = relatedProducts.map(relatedProduct => {
      let relatedImages = [];
      if (relatedProduct.productImage && Array.isArray(relatedProduct.productImage)) {
        relatedImages = relatedProduct.productImage.map(img => img);
      }
      const relatedFormattedImages = relatedImages.map(url => ({ url }));
      console.log(`Formatted images for ${relatedProduct.productName}:`, relatedFormattedImages);

      return {
        _id: relatedProduct._id,
        productName: relatedProduct.productName,
        formattedImages: relatedFormattedImages,
        salePrice: relatedProduct.salePrice,
        regularPrice: relatedProduct.regularPrice,
        productOffer: relatedProduct.productOffer || 0,
        brand: relatedProduct.brand,
        quantity: relatedProduct.quantity || 0,
      };
    });

    res.render('product-details', {
      product: {
        ...product.toObject(),
        salePrice: discountedPrice,
        productOffer: offerPercentage,
        formattedImages,
      },
      relatedProducts: processedRelatedProducts,
      allOffers: [], // Replace with actual offers if needed
    });
  } catch (error) {
    console.error('Error loading product details:', error);
    res.redirect('/pageNotFound');
  }
};

// Load checkout page
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
          image: item.productId.productImage && item.productId.productImage.length > 0 ? item.productId.productImage[0] : '', // Ensure valid Cloudinary URL or empty string
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
      currentPage: 'cart',
      csrfToken: req.csrfToken ? req.csrfToken() : '',
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.redirect('/cart?message=An error occurred');
  }
};

// Place order
const placeOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const user = await User.findById(userId);
    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) return res.status(400).json({ success: false, message: 'Address not found' });

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
        status: 'Processing',
      })),
      totalPrice: subtotal,
      discount,
      offerDiscount,
      couponDiscount,
      finalAmount,
      address: selectedAddress,
      paymentMethod,
      paymentStatus: paymentMethod === 'Wallet' ? 'Completed' : 'Pending',
      status: 'Pending',
      invoiceDate: new Date(),
      createdOn: new Date(),
      couponApplied,
    });

    if (paymentMethod === 'Razorpay' && finalAmount > 0) {
      const razorpayOrder = await createRazorpayOrder(finalAmount, userId);
      order.razorpayOrderId = razorpayOrder.id;
      await order.save();
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
          orderId: order.orderId,
        },
      });
    }

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
      order.paymentStatus = 'Completed';
      order.status = 'Processing';
    }

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

// Verify Razorpay payment
const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderDetails } = req.body;

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
      orderId,
    } = orderDetails;

    if (Math.abs(discount - (offerDiscount + couponDiscount)) > 0.01) {
      return res.redirect(
        `/paymentfailedpage?error=${encodeURIComponent('Invalid discount data')}`
      );
    }

    const order = await Order.findOne({ orderId: orderId, userId });
    if (!order) {
      return res.redirect(`/paymentfailedpage?error=${encodeURIComponent('Order not found')}`);
    }

    order.orderItems.forEach((item) => {
      item.status = 'Processing';
    });
    order.totalPrice = totalPrice;
    order.discount = discount;
    order.offerDiscount = offerDiscount;
    order.couponDiscount = couponDiscount;
    order.finalAmount = finalAmount;
    order.address = selectedAddress;
    order.paymentMethod = 'Razorpay';
    order.paymentStatus = 'Completed';
    order.status = 'Processing';
    order.razorpayOrderId = razorpay_order_id;
    order.razorpayPaymentId = razorpay_payment_id;
    order.couponApplied = couponApplied;

    for (const item of cartItems) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: -item.stock } });
    }

    await order.save();
    await Cart.deleteOne({ userId });
    req.session.couponApplied = null;

    res.status(200).json({
      success: true,
      message: 'Order placed successfully',
      orderId: order.orderId,
    });
  } catch (error) {
    console.error('Error in verifyRazorpayPayment:', error);
    res.redirect(`/paymentfailedpage?error=${encodeURIComponent(error.message || 'Payment verification failed')}`);
  }
};

// Load order details page
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
      ? addressDoc.address.find((addr) => addr.isDefault) || addressDoc.address[0]
      : null;

    res.render('order-details', {
      user: userData,
      order,
      currentPage: 'cart',
      address: selectedAddress,
      csrfToken: req.csrfToken ? req.csrfToken() : '',
    });
  } catch (error) {
    console.error('Error loading order details:', error);
    res.redirect('/pageNotFound');
  }
};

// Return entire order
const returnOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ _id: orderId, userId }).populate('orderItems.product');
    if (!order) return res.json({ success: false, message: 'Order not found' });

    if (order.status !== 'Delivered' || order.isReturned || order.isReturnRequested) {
      return res.json({ success: false, message: 'Order cannot be returned' });
    }

    order.orderItems.forEach((item) => {
      if (item.status !== 'Cancelled') {
        item.status = 'Return Request';
        item.isReturnRequested = true;
        item.returnReason = reason;
      }
    });

    order.status = 'Return Request';
    order.isReturnRequested = true;
    order.returnReason = reason;

    for (const item of order.orderItems) {
      if (item.status !== 'Cancelled') {
        const product = await Product.findById(item.product);
        if (product) {
          product.quantity += item.stock;
          await product.save();
        }
      }
    }

    await order.save();

    res.json({ success: true, message: 'Return request submitted successfully' });
  } catch (error) {
    console.error('Error requesting return:', error);
    res.json({ success: false, message: 'An error occurred' });
  }
};

// Return single order item
const returnOrderItem = async (req, res) => {
  try {
    const { orderId, itemId, reason } = req.body;
    const userId = req.session.user;

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ success: false, message: 'Invalid order or item ID' });
    }

    const order = await Order.findOne({ _id: orderId, userId }).populate('orderItems.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.orderItems.find((i) => i._id.toString() === itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in order' });
    }

    if (item.status !== 'Delivered' || item.isReturned || item.isReturnRequested) {
      return res.status(400).json({ success: false, message: 'Item cannot be returned' });
    }

    const itemTotal = item.price * item.stock;
    const itemOfferDiscount = item.offerAmount || 0;
    const itemRefund = Math.round((itemTotal - itemOfferDiscount) * 100) / 100;

    item.status = 'Return Request';
    item.isReturnRequested = true;
    item.returnReason = reason;

    order.finalAmount = Math.max(0, Math.round((order.finalAmount - itemRefund) * 100) / 100);
    order.totalPrice = Math.max(0, Math.round((order.totalPrice - itemTotal) * 100) / 100);
    order.discount = Math.max(0, Math.round((order.discount - itemOfferDiscount) * 100) / 100);
    order.offerDiscount = Math.max(0, Math.round((order.offerDiscount - itemOfferDiscount) * 100) / 100);

    const hasReturnRequest = order.orderItems.some((i) => i.isReturnRequested || i.status === 'Return Request');
    if (hasReturnRequest) {
      order.isReturnRequested = true;
      order.returnReason = order.returnReason || reason || 'Item return requested';
      if (!['Return Request', 'Returned', 'Return Accepted', 'Return Rejected'].includes(order.status)) {
        order.status = 'Return Request';
      }
    }

    const product = await Product.findById(item.product);
    if (product) {
      product.quantity += item.stock;
      await product.save();
    }

    await order.save();

    res.json({ success: true, message: 'Item return request submitted successfully' });
  } catch (error) {
    console.error('Error requesting item return:', error);
    res.status(500).json({ success: false, message: 'An error occurred' });
  }
};

// Cancel entire order
const cancelOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ _id: orderId, userId }).populate('orderItems.product');
    if (!order) {
      return res.json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'Processing' && order.status !== 'Pending') {
      return res.json({ success: false, message: 'Cannot cancel order in this status' });
    }

    order.orderItems.forEach((item) => {
      if (item.status !== 'Delivered') {
        item.status = 'Cancelled';
        item.cancelReason = reason || 'No reason provided';
      }
    });

    let refundAmount = 0;
    for (const item of order.orderItems) {
      if (item.status === 'Cancelled') {
        const itemTotal = item.price * item.stock;
        const itemOfferDiscount = item.offerAmount || 0;
        refundAmount += Math.round((itemTotal - itemOfferDiscount) * 100) / 100;
      }
    }

    order.cancelOrReturn = refundAmount;
    order.revokedCoupon = order.couponDiscount;
    order.finalAmount = Math.max(0, Math.round((order.finalAmount - refundAmount) * 100) / 100);
    order.totalPrice = Math.max(
      0,
      Math.round(
        (order.totalPrice -
          order.orderItems
            .filter((i) => i.status === 'Cancelled')
            .reduce((sum, i) => sum + i.price * i.stock, 0)) *
          100
      ) / 100
    );
    order.discount = Math.max(
      0,
      Math.round(
        (order.discount -
          order.orderItems
            .filter((i) => i.status === 'Cancelled')
            .reduce((sum, i) => sum + (i.offerAmount || 0), 0)) *
          100
      ) / 100
    );
    order.offerDiscount = Math.max(
      0,
      Math.round(
        (order.offerDiscount -
          order.orderItems
            .filter((i) => i.status === 'Cancelled')
            .reduce((sum, i) => sum + (i.offerAmount || 0), 0)) *
          100
      ) / 100
    );

    order.status = 'Pending';
    order.isRetryable = true;
    order.cancelReason = reason || 'Order cancelled, pending retry';

    if (
      ['Wallet', 'Razorpay'].includes(order.paymentMethod) &&
      order.paymentStatus === 'Completed' &&
      refundAmount > 0
    ) {
      let wallet =
        (await Wallet.findOne({ userId })) ||
        new Wallet({ userId, balance: 0, transactions: [] });
      wallet.balance += refundAmount;
      wallet.transactions.push({
        amount: refundAmount,
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
      if (item.status === 'Cancelled') {
        const product = await Product.findById(item.product);
        if (product) {
          product.quantity += item.stock;
          await product.save();
        }
      }
    }

    await order.save();

    res.json({ success: true, message: 'Order cancelled and set to pending for retry' });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.json({ success: false, message: 'An error occurred' });
  }
};

// Cancel single order item
const cancelOrderItem = async (req, res) => {
  try {
    const { orderId, itemId, reason } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ _id: orderId, userId }).populate('orderItems.product');
    if (!order) return res.json({ success: false, message: 'Order not found' });

    if (order.status !== 'Processing' && order.status !== 'Pending') {
      return res.json({ success: false, message: 'Cannot cancel items in this order status' });
    }

    const item = order.orderItems.find((i) => i._id.toString() === itemId);
    if (!item) return res.json({ success: false, message: 'Item not found in order' });

    if (item.status === 'Cancelled' || item.status === 'Delivered') {
      return res.json({ success: false, message: 'Item cannot be cancelled' });
    }

    const itemTotal = item.price * item.stock;
    const itemOfferDiscount = item.offerAmount || 0;
    const itemRefund = Math.round((itemTotal - itemOfferDiscount) * 100) / 100;

    item.status = 'Cancelled';
    item.cancelReason = reason || 'No reason provided';

    order.finalAmount = Math.max(0, Math.round((order.finalAmount - itemRefund) * 100) / 100);
    order.totalPrice = Math.max(0, Math.round((order.totalPrice - itemTotal) * 100) / 100);
    order.discount = Math.max(0, Math.round((order.discount - itemOfferDiscount) * 100) / 100);
    order.offerDiscount = Math.max(0, Math.round((order.offerDiscount - itemOfferDiscount) * 100) / 100);

    const allCancelled = order.orderItems.every((i) => i.status === 'Cancelled');
    if (allCancelled) {
      order.status = 'Pending';
      order.isRetryable = true;
      order.cancelReason = reason || 'All items cancelled';
    }

    if (
      ['Wallet', 'Razorpay'].includes(order.paymentMethod) &&
      order.paymentStatus === 'Completed'
    ) {
      let wallet =
        (await Wallet.findOne({ userId })) ||
        new Wallet({ userId, balance: 0, transactions: [] });
      wallet.balance += itemRefund;
      wallet.transactions.push({
        amount: itemRefund,
        type: 'credit',
        paymentMethod: 'Refund',
        transactionId: `TXN${Date.now()}`,
        orderId: order.orderId,
        description: `Refund for cancelled item in order ${order.orderId}`,
        date: new Date(),
      });
      await wallet.save();
    }

    const product = await Product.findById(item.product);
    if (product) {
      product.quantity += item.stock;
      await product.save();
    }

    await order.save();

    res.json({ success: true, message: 'Item cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling item:', error);
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
        currentPage: "profile",
        message: 'No order found. Please contact support.',
      });
    }

    res.render('success', { 
      order, 
      address: order.address || null, 
      message: null, 
      user: userData,
      currentPage: 'profile' 
    });
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

    const order = await Order.findOne({ user: userId }).sort({ createdAt: -1 }); 
    const error = req.query.error || 'Payment failed or was cancelled';

    res.render('paymentfailed', { 
      user, 
      error,
      order,
      currentPage: 'cart', 
    });
  } catch (error) {
    console.error('Error in paymentFailed:', error);
    res.redirect('/pageNotFound');
  }
};

const retryOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'productName salePrice quantity category brand',
    });

    if (!cart || !cart.items.length) return res.status(400).json({ success: false, message: 'Cart is empty' });

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc || !addressDoc.address.length) return res.status(400).json({ success: false, message: 'No address found' });
    const selectedAddress = addressDoc.address.find((addr) => addr.isDefault) || addressDoc.address[0];

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

    if (finalAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid total price' });

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

const updateOrderStatusToDelivered = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user;

    const order = await Order.findOne({ orderId, userId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.status = 'Delivered';
    order.deliveredDate = new Date();
    order.orderItems.forEach((item) => {
      if (item.status !== 'Cancelled') item.status = 'Delivered';
    });

    await order.save();
    res.status(200).json({ success: true, message: 'Order status updated to Delivered' });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'An error occurred' });
  }
};

const retryPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user;

    if (!userId) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const order = await Order.findOne({ _id: orderId, userId }).populate({
      path: 'orderItems.product',
      select: 'productName salePrice quantity category brand',
    });

    if (!order || order.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Order not eligible for retry' });
    }

    for (const item of order.orderItems) {
      const product = item.product;
      if (product.quantity < item.stock) {
        return res.status(400).json({
          success: false,
          message: `${product.productName} is out of stock`,
        });
      }
    }

    const finalAmount = order.finalAmount;

    if (finalAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid total price' });

    const razorpayOrder = await createRazorpayOrder(finalAmount, userId);

    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    const cartItems = order.orderItems.map((item) => ({
      productId: item.product._id,
      stock: item.stock,
      price: item.price,
      offerId: item.offerId || null,
      offerAmount: item.offerAmount || 0,
    }));

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
        selectedAddress: order.address,
        cartItems,
        totalPrice: order.totalPrice,
        discount: order.discount,
        offerDiscount: order.offerDiscount,
        couponDiscount: order.couponDiscount,
        finalAmount: order.finalAmount,
        couponApplied: order.couponApplied,
        orderId: order.orderId,
      },
    });
  } catch (error) {
    console.error('Error in retryPayment:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

module.exports = {
  loadProductDetails,
  loadCheckout,
  placeOrder,
  verifyRazorpayPayment,
  loadOrderDetails,
  cancelOrder,
  cancelOrderItem,
  success,
  returnOrder,
  returnOrderItem,
  loadProductDetails,
  paymentFailed,
  retryOrder,
  retryPayment,
  updateOrderStatusToDelivered,
};