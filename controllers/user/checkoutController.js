const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const mongoose = require('mongoose');
const { getProductOffers } = require('./offerController'); 

const loadOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login');
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const objectId = new mongoose.Types.ObjectId(userId);

    const orders = await Order.find({ userId: objectId })
      .skip(skip)
      .limit(limit)
      .populate('orderItems.product')
      .sort({ createdOn: -1 });

    const totalOrders = await Order.countDocuments({ userId: objectId });
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

    let subtotal = 0;
    let offerDiscount = 0;

    const cartItems = await Promise.all(
      cart.items.map(async (item) => {
        if (!item.productId) return null;
        
        // Get offers for this product
        const { bestOffer } = await getProductOffers(
          item.productId._id,
          item.productId.category,
          item.productId.brand
        );

        let price = item.productId.salePrice;
        let originalPrice = item.productId.salePrice;

        if (bestOffer && bestOffer.discountType === 'percentage') {
          price = price * (1 - bestOffer.offerAmount / 100);
          offerDiscount += (originalPrice - price) * item.stock;
        }

        subtotal += originalPrice * item.stock;
        return {
          productId: item.productId._id,
          name: item.productId.productName,
          price,
          originalPrice: item.productId.salePrice,
          image: item.productId.productImage[0],
          quantity: item.stock,
          offer: bestOffer ? {
            name: bestOffer.offerName,
            percentage: bestOffer.offerAmount,
          } : null,
        };
      })
    ).then(items => items.filter(item => item));

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
      } else {
        req.session.couponApplied = null;
      }
    }

    // Ensure total is calculated as subtotal minus offerDiscount and coupon
    const total = Math.max(0, subtotal - offerDiscount - coupon); // Prevent negative total

    res.render('checkout', {
      user,
      addresses,
      cart: cartItems,
      subtotal,
      offerDiscount,
      shipping: 0,
      discount: coupon,
      total,
      coupon,
    });
  } catch (error) {
    console.error('Error loading checkout page:', error);
    res.redirect('/cart?message=An error occurred, please try again');
  }
};

const loadProductDetails = async (req, res) => {
  try {
    const productId = req.query.id;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.redirect('/pageNotFound');
    }

    const product = await Product.findById(productId)
      .populate('category')
      .populate('brand');

    if (!product) {
      return res.redirect('/pageNotFound');
    }

    // Get offers for the product
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
      discountedPrice = product.salePrice * (1 - bestOffer.offerAmount / 100);
    }

    // Get related products with originalPrice
    const relatedProducts = await Product.find({
      category: product.category ? product.category._id : null,
      _id: { $ne: product._id },
    })
      .limit(4)
      .select('productName productImage salePrice originalPrice brand productOffer')
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
          relatedDiscountedPrice = relatedProduct.salePrice * (1 - relatedBestOffer.offerAmount / 100);
        }

        return {
          ...relatedProduct.toObject(),
          salePrice: relatedDiscountedPrice,
          originalPrice: relatedProduct.salePrice, // Original price before discount
          productOffer: relatedOfferPercentage,
        };
      })
    );

    res.render('product-details', {
      product: {
        ...product.toObject(),
        salePrice: discountedPrice,
        originalPrice: product.salePrice, // Original price before discount
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

    const addressDoc = await Address.findOne({ userId });
    const selectedAddress = addressDoc?.address.find(addr => addr._id.toString() === addressId);

    if (!selectedAddress) {
      return res.json({ success: false, message: 'Invalid address selected' });
    }

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || !cart.items.length) {
      return res.json({ success: false, message: 'Cart is empty' });
    }

    const orderItems = [];
    let totalPrice = 0;

    for (const item of cart.items) {
      const product = item.productId;
      if (!product || product.quantity < item.stock) {
        return res.json({
          success: false,
          message: `${product?.productName || 'Item'} is out of stock`,
        });
      }

      // Get best offer for this product
      const { bestOffer } = await getProductOffers(
        product._id,
        product.category,
        product.brand
      );

      let price = product.salePrice;
      if (bestOffer && bestOffer.discountType === 'percentage') {
        price = price * (1 - bestOffer.offerAmount / 100);
      }

      orderItems.push({
        product: product._id,
        stock: item.stock,
        price,
      });

      totalPrice += price * item.stock;
      product.quantity -= item.stock;
      await product.save();
    }

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

    const newOrder = await order.save();
    const orderId = newOrder.orderId;

    await Cart.deleteOne({ userId });
    req.session.couponApplied = null;

    res.json({
      success: true,
      message: 'Order placed successfully.',
      orderId: orderId,
    });
  } catch (error) {
    console.error('Error placing order:', error);
    res.json({
      success: false,
      message: 'An error occurred while placing the order.',
    });
  }
};

const loadOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.redirect('/pageNotFound');
    }

    const userId = req.session.user;
    const userData = await User.findById(userId);
    const order = await Order.findOne({ _id: id, userId }).populate('orderItems.product');

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

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'Processing') {
      return res.json({ success: false, message: 'Cannot cancel order in this status' });
    }

    order.status = 'Cancelled';
    await order.save();

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
    const userData = await User.findById(userId);
    if (!userId) {
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
  loadProductDetails,
};