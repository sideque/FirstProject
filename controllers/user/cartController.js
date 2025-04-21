const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const Address = require("../../models/addressSchema");
const Order = require('../../models/orderSchema');
const env = require("dotenv").config();
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema"); 
const saltRounds = 10;

const loadCart = async (req, res) => {
    try {
      const user = req.session.user;
      if (!user || !user._id) {
        return res.redirect('/login');
      }



      const userData = await User.findById(user)
  
      const page = parseInt(req.query.page) || 1;
      const limit = 3; // Limit to 5 items per page
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
  
      res.render('cart', {
        cartItems: paginatedItems,
        getDeliveryDate,
        totalPages,
        currentPage: page,
        totalItems,
        user:userData
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
      // Redirect with success message using query parameter
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

      if (quantity > item.productId.stock) {
          return res.status(400).json({
              success: false,
              message: `Cannot increase. Only ${item.productId.stock} items in stock.`,
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

module.exports = {
  loadCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  
};