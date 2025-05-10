const Product = require('../models/productModel');
const Category = require('../models/categoryModel');
const User = require('../models/userModel');
const Brand = require('../models/brandModel');
const Offer = require('../models/offerModel');
const { getProductOffers } = require('../controllers/user/offerController');

const productController = async (req, res) => {
  try {
    const userId = req.session.user;
    
  }
}