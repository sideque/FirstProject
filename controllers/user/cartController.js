const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const Address = require("../../models/addressSchema");
const Order = require('../../models/orderSchema');
const env = require("dotenv").config();
const Cart = require("../../models/cartSchema");
const upload = require("../../middlewares/multerConfig");
const saltRounds = 10;

// const loadCart = async (req, res) => {
//   try {
//     const user = req.session.user;
//     if (!user || !user._id) {
//       return res.redirect('/login');
//     }

//     let cart = await Cart.findOne({ userId: user._id }).populate('items.productId');
//     if (cart) {
//       cart.items = cart.items.filter(item => item.productId && item.productId.salePrice !== undefined);
//       await cart.save();
//     }

//     const cartItems = cart ? cart.items : [];

//     // Define getDeliveryDate function
//     const getDeliveryDate = (days) => {
//       const today = new Date();
//       const deliveryDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
//       return deliveryDate.toLocaleDateString('en-US', {
//         weekday: 'short',
//         month: 'short',
//         day: 'numeric',
//         year: 'numeric'
//       });
//     };

//     res.render('cart', { cartItems, getDeliveryDate });
//   } catch (error) {
//     console.error('Error loading cart:', error);
//     res.redirect('/pageNotFound');
//   }
// };  


const loadCart = async (req, res) => {
    try {
      const user = req.session.user;
      if (!user || !user._id) {
        return res.redirect('/login');
      }
  
      let cart = await Cart.findOne({ userId: user._id }).populate({
        path: 'items.productId',
        select: 'productName productImage salePrice stock' // Include productImage
      });
      if (cart) {
        cart.items = cart.items.filter(item => item.productId && item.productId.salePrice !== undefined);
        await cart.save();
      }
  
      const cartItems = cart ? cart.items : [];
  
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
  
      res.render('cart', { cartItems, getDeliveryDate });
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
    const quantity = req.body.quantity ? parseInt(req.body.quantity) : 1; // Default to 1 if not provided

    // Find or create the user's cart
    let cart = await Cart.findOne({ userId: user._id });
    if (!cart) {
      cart = new Cart({ userId: user._id, items: [] });
    }

    // Check if the product already exists in the cart
    const existingItem = cart.items.find(item => item.productId.toString() === productId);
    if (existingItem) {
      existingItem.stock += quantity; // Update quantity (assuming 'stock' is quantity)
      existingItem.totalPrice = existingItem.price * existingItem.stock; // Recalculate total price
    } else {
      // Fetch product details to get price (assuming a Product model)
      const Product = require('../../models/productSchema'); // Adjust path
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
    res.redirect('/cart');
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.redirect('/pageNotFound');
  }
};


// const loadShoppingPage = async (req, res) => {
//     try {
//       const products = await Product.find().select('productName productImage salePrice brand productOffer stock'); // Adjust fields as needed
//       res.render('shop', { products, totalPages: 1, currentPage: 1 }); // Update pagination logic as per your implementation
//     } catch (error) {
//       console.error('Error loading shopping page:', error);
//       res.redirect('/pageNotFound');
//     }
//   };



module.exports = {
  loadCart,
  addToCart,
};