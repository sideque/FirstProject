const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const mongoose = require('mongoose')



const loadOrders = async (req, res) => {
    try {
      const userId = req.session.user;
      if (!userId) {
        return res.redirect('/login');
      }
  
      const page = parseInt(req.query.page) || 1; // Current page
      const limit = parseInt(req.query.limit) || 10; // Orders per page
      const skip = (page - 1) * limit; // Calculate skip
  
      // Fetch orders for the user
      const orders = await Order.find({ userId })
        .skip(skip)
        .limit(limit)
        .populate('orderItems.product') // Populate product details
        .sort({ createdOn: -1 }); // Sort by newest
  
      // Count total orders
      const totalOrders = await Order.countDocuments({ userId });
  
      // Calculate total pages
      const totalPages = Math.ceil(totalOrders / limit);
  
      // Render orders page
      res.render('orders', {
        orders,
        currentPage: page,
        totalPages,
        limit
      });
    } catch (error) {
      console.error('Error loading orders:', error);
      res.redirect('/pageNotFound');
    }
  };



// // Render checkout page
// const loadCheckout = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.redirect('/login');
//     }

//     // Fetch addresses
//     const addressDoc = await Address.findOne({ userId });
//     const addresses = addressDoc ? addressDoc.address : [];

//     // Fetch cart
//     const cart = await Cart.findOne({ userId }).populate({
//       path: 'items.productId',
//       select: 'productName productImage salePrice quantity',
//     });
//     if (!cart || !cart.items.length) {
//       return res.redirect('/cart?message=Cart is empty');
//     }

//     // Calculate totals
//     let subtotal = 0;
//     const cartItems = cart.items.map(item => {
//       if (!item.productId) return null;
//       subtotal += item.totalPrice;
//       return {
//         productId: item.productId._id,
//         name: item.productId.productName,
//         price: item.productId.salePrice,
//         image: item.productId.productImage[0],
//         quantity: item.stock,
//       };
//     }).filter(item => item);

//     res.render('checkout', {
//       user,
//       addresses,
//       cart: cartItems,
//       subtotal,
//       shipping: 0, // Adjust as needed
//       discount: 0, // Adjust based on coupon logic
//       total: subtotal,
//     });
//   } catch (error) {
//     console.error('Error loading checkout page:', error);
//     res.redirect('/pageNotFound');
//   }
// };

const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }

    // Fetch addresses
    const addressDoc = await Address.findOne({ userId });
    const addresses = addressDoc ? addressDoc.address : [];
    console.log('User ID:', userId);
    console.log('Fetched addresses:', addresses);

    // Fetch cart
    const cart = await Cart.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'productName productImage salePrice quantity',
    });
    if (!cart || !cart.items.length) {
      return res.redirect('/cart?message=Cart is empty');
    }

    // Calculate totals
    let subtotal = 0;
    const cartItems = cart.items.map(item => {
      if (!item.productId) return null;
      subtotal += item.totalPrice;
      return {
        productId: item.productId._id,
        name: item.productId.productName,
        price: item.productId.salePrice,
        image: item.productId.productImage[0],
        quantity: item.stock,
      };
    }).filter(item => item);

    res.render('checkout', {
      user,
      addresses,
      cart: cartItems,
      subtotal,
      shipping: 0,
      discount: 0,
      total: subtotal,
    });
  } catch (error) {
    console.error('Error loading checkout page:', error);
    res.redirect('/pageNotFound');
  }
};

//Place order
const placeOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod } = req.body;
    const userId = req.session.user;
    console.log(userId,'userid')
    const objId = new mongoose.Types.ObjectId(userId._id);
    console.log(objId,'obj')
    // Validate address
    const addressDoc = await Address.findOne({ userId:objId});
    console.log(addressDoc,'doc')
    if (!addressDoc ) {
      return res.json({ success: false, message: 'Invalid address selected' });
    }

    // Fetch cart
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || !cart.items.length) {
      return res.json({ success: false, message: 'Cart is empty' });
    }

    // Create order items
    const orderItems = [];
    let totalPrice = 0;
    for (const item of cart.items) {
      const product = item.productId;
      if (!product) {
        return res.json({ success: false, message: `Product ${item.productId} not found` });
      }
      if (product.quantity < item.stock) {
        return res.json({ success: false, message: `${product.productName} is out of stock` });
      }
      orderItems.push({
        product: item.productId._id,
        stock: item.stock,
        price: product.salePrice,
      });
      totalPrice += product.salePrice * item.stock;

      // Update product quantity
      product.quantity -= item.stock;
      await product.save();
    }

    // Create order
    const order = new Order({
      orderId: `ORD${Date.now()}`, // Override UUID for consistency
      userId,
      orderItems,
      totalPrice,
      discount: 0, // Adjust based on coupon logic
      finalAmount: totalPrice,
      address: userId, // Store userId as per schema
      status: 'Pending',
      invoiceDate: new Date(),
      createdOn: new Date(),
    });

    await order.save();

    // Clear cart
    await Cart.deleteOne({ userId });

    res.json({ success: true, message: 'Order placed successfully', orderId: order.orderId });
  } catch (error) {
    console.error('Error placing order:', error);
    res.json({ success: false, message: 'An error occurred while placing your order' });
  }
};



// const placeOrder = async (req, res) => {
//   try {
//     const { addressId, paymentMethod } = req.body;
//     const userId = req.session.user;

//     // Validate address
//     const addressDoc = await Address.findOne({ userId });
//     if (!addressDoc || !addressDoc.address[addressId]) {
//       return res.json({ success: false, message: 'Invalid address selected' });
//     }

//     const selectedAddress = addressDoc.address[addressId]; // ✅ Correct address

//     // Fetch cart
//     const cart = await Cart.findOne({ userId }).populate('items.productId');
//     if (!cart || !cart.items.length) {
//       return res.json({ success: false, message: 'Cart is empty' });
//     }

//     // Create order items
//     const orderItems = [];
//     let totalPrice = 0;

//     for (const item of cart.items) {
//       const product = item.productId;

//       if (!product) {
//         return res.json({ success: false, message: `Product ${item.productId} not found` });
//       }

//       if (product.quantity < item.stock) {
//         return res.json({ success: false, message: `${product.productName} is out of stock` });
//       }

//       orderItems.push({
//         product: item.productId._id,
//         stock: item.stock,
//         price: product.salePrice,
//       });

//       totalPrice += product.salePrice * item.stock;

//       // Update product quantity
//       product.quantity -= item.stock;
//       await product.save();
//     }

//     // Create order
//     const order = new Order({
//       orderId: `ORD${Date.now()}`, // Simple unique orderId
//       userId,
//       orderItems,
//       totalPrice,
//       discount: 0,
//       finalAmount: totalPrice,
//       address: selectedAddress, // ✅ Save actual address object
//       paymentMethod,
//       status: 'Pending',
//       invoiceDate: new Date(),
//       createdOn: new Date(),
//     });

//     await order.save();

//     // Clear cart
//     await Cart.deleteOne({ userId });

//     res.json({ success: true, message: 'Order placed successfully', orderId: order.orderId });

//   } catch (error) {
//     console.error('Error placing order:', error);
//     res.json({ success: false, message: 'An error occurred while placing your order' });
//   }
// };


const loadOrderDetails = async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session.user;
      const order = await Order.findOne({ _id: id, userId }).populate('orderItems.product');
      
      if (!order) {
        return res.redirect('/pageNotFound');
      }

      const addressDoc = await Address.findOne({ userId });
      const selectedAddress = addressDoc ? addressDoc.address.find(addr => addr.isDefault) || addressDoc.address[0] : null;
      console.log(selectedAddress,'selectedaddress')
      res.render('order-details', { order, address: selectedAddress });
    } catch (error) {
      console.error('Error loading order details:', error);
      res.redirect('/pageNotFound');
    }
  };

  
// Cancel Order
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body; // Assuming orderId is sent in the body
    const userId = req.session.user;

    const order = await Order.findOne({ _id: orderId, userId });
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
    // Log session, user, and query for debugging
    console.log('Session:', req.session);
    console.log('User:', req.session.user);
    console.log('Query:', req.query);

    // Get userId from session
    const userId = req.session.user;

    let order = null;

    // Option 1: Fetch order by query parameter
    if (req.query.orderId) {
      console.log('Fetching order by query orderId:', req.query.orderId);
      const order = await Order.findOne({
        orderId: req.query.orderId,
        user: req.user._id,
      });      
    }

    // Option 2: Fallback to most recent order for user
    if (!order && userId) {
      console.log('Fetching most recent order for userId:', userId);
      order = await Order.findOne({ userId }).sort({ createdOn: -1 });
    }

    // Log the result
    console.log('Order found:', order);

    // Render success.ejs with order or fallback message
    res.render('success', {
      order,
      message: order ? null : 'No order found. Please contact support if you completed a purchase.'
    });

  } catch (error) {
    console.error('Error in success route:', error);
    res.status(500).render('error', {
      message: 'An error occurred while loading your order details. Please try again later.'
    });
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
  loadOrderDetails,
  loadOrders, // New function
  cancelOrder, // New function
  success
};
