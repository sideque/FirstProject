const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const cloudinary = require("cloudinary").v2;
const adminController = require("./adminController");
const mongoose = require("mongoose");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const checkForDuplicateProducts = async () => {
  try {
    const allProducts = await Product.find({}, "productName");
    const productNames = {};
    const duplicates = [];

    allProducts.forEach(product => {
      if (productNames[product.productName]) {
        duplicates.push({
          name: product.productName,
          ids: [productNames[product.productName]._id.toString(), product._id.toString()]
        });
      } else {
        productNames[product.productName] = product;
      }
    });

    if (duplicates.length > 0) {
      console.log('DUPLICATE PRODUCTS FOUND:');
      duplicates.forEach(dup => {
        console.log(`Product: "${dup.name}" has duplicates with IDs: ${dup.ids.join(', ')}`);
      });
    }

    return duplicates;
  } catch (error) {
    console.error('Error checking for duplicates:', error);
    return [];
  }
};

const getProductPage = async (req, res) => {
  try {
    const category = await Category.find({ isListed: true, isDeleted: false });
    const brand = await Brand.find({ isListed: true, isDeleted: false }) || [];
    res.render("add-product", {
      cat: category,
      brand: brand
    });
  } catch (error) {
    console.error("Error fetching categories/brands:", error);
    res.redirect("/admin/pageerror");
  }
};

const getProductAddPage = async (req, res) => {
  try {
    const category = await Category.find({ isListed: true, isDeleted: false }).select('_id name');
    const brand = await Brand.find({ isListed: true, isDeleted: false }).select('_id name');
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const search = req.query.search || "";

    const validCategoryIds = category.map(cat => cat._id);
    const validBrandIds = brand.map(brand => brand._id);

    let query = {
      category: { $in: validCategoryIds },
      brand: { $in: validBrandIds }
    };

    if (search) {
      const matchingBrands = await Brand.find({
        name: { $regex: new RegExp("^" + search, "i") },
        isListed: true,
        isDeleted: false
      }).select('_id');

      const brandIds = matchingBrands.map(brand => brand._id);

      query = {
        $or: [
          { productName: { $regex: new RegExp("^" + search, "i") } },
          { description: { $regex: new RegExp("^" + search, "i") } },
          { brand: { $in: brandIds } }
        ],
        category: { $in: validCategoryIds },
        brand: { $in: validBrandIds }
      };
    }

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('brand', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    const formattedProducts = products.map(product => {
      const productObj = product.toObject();
      productObj.formattedImages = (productObj.productImage || [])
        .filter(img => img)
        .map(image => ({ url: image }));
      return productObj;
    });

    const maxPagesToShow = 5;
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    res.render("product", {
      data: formattedProducts,
      currentPage: page,
      totalPages,
      totalProducts,
      cat: category,
      brand,
      startPage,
      endPage,
      search,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.redirect("/admin/pageerror");
  }
};

const addProducts = async (req, res) => {
  try {
    const {
      productName,
      description,
      brand,
      category,
      regularPrice,
      salePrice,
      quantity,
      discount,
      processor,
      ram,
      storage,
      camera,
    } = req.body;

    // Validate required fields
    if (!productName || !description || !brand || !category || !regularPrice || !quantity) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all required fields",
      });
    }

    // Validate product name format
    const productNameRegex = /^[a-zA-Z0-9\s\-_&()]+$/;
    if (!productNameRegex.test(productName)) {
      return res.status(400).json({
        success: false,
        message: "Product name contains invalid characters. Use letters, numbers, spaces, or -_&() only",
      });
    }

    // Check for existing product
    const existingProduct = await Product.findOne({ 
      productName: { $regex: new RegExp(`^${productName}$`, 'i') }
    });
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: "A product with this name already exists",
      });
    }

    // Validate brand and category
    const brandObj = await Brand.findOne({ _id: brand, isListed: true, isDeleted: false });
    if (!brandObj) {
      return res.status(400).json({
        success: false,
        message: "Invalid or unlisted brand",
      });
    }

    const categoryObj = await Category.findOne({ _id: category, isListed: true, isDeleted: false });
    if (!categoryObj) {
      return res.status(400).json({
        success: false,
        message: "Invalid or unlisted category",
      });
    }

    // Validate images
    const uploadedImages = req.files ? req.files.map(file => file.path) : [];
    if (uploadedImages.length !== 3) {
      for (const image of uploadedImages) {
        const publicId = image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`product-images/${publicId}`);
      }
      return res.status(400).json({
        success: false,
        message: "Exactly three product images are required.",
      });
    }

    // Create product
    const newProduct = new Product({
      productName,
      description,
      brand: brandObj._id,
      category: categoryObj._id,
      regularPrice: parseFloat(regularPrice),
      salePrice: salePrice ? parseFloat(salePrice) : null,
      quantity: parseInt(quantity),
      productOffer: parseFloat(discount) || 0,
      productImage: uploadedImages,
      isBlocked: false,
      status: "Available",
      processor: processor || "",
      ram: ram || "",
      storage: storage || "",
      camera: camera || "",
    });

    await newProduct.save();
    res.status(201).json({ success: true, message: "Product added successfully" });
  } catch (error) {
    if (req.files) {
      for (const file of req.files) {
        const publicId = file.path.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`product-images/${publicId}`);
      }
    }
    res.status(500).json({ success: false, message: "Error adding product", error: error.message });
  }
};

const listProducts = async (req, res) => {
  try {
    const adminUser = await adminController.getAdminData(req);
    const duplicateProducts = await checkForDuplicateProducts();
    if (duplicateProducts.length > 0) {
      console.log(`Found ${duplicateProducts.length} duplicate product entries in the database`);
    }

    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 5;

    const validCategories = await Category.find({ isListed: true, isDeleted: false }).select('_id name');
    const validBrands = await Brand.find({ isListed: true, isDeleted: false }).select('_id name');
    const validCategoryIds = validCategories.map(cat => cat._id);
    const validBrandIds = validBrands.map(brand => brand._id);

    let searchQuery = {
      category: { $in: validCategoryIds },
      brand: { $in: validBrandIds }
    };

    if (search) {
      searchQuery.$or = [
        { productName: { $regex: new RegExp(search, "i") } },
        { description: { $regex: new RegExp(search, "i") } }
      ];
    }

    const totalProducts = await Product.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalProducts / limit);

    const maxPagesToShow = 5;
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    const products = await Product.find(searchQuery)
      .populate('category', 'name')
      .populate('brand', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    const formattedProducts = products.map(product => {
      const productObj = product.toObject();
      productObj.formattedImages = (productObj.productImage || [])
        .filter(img => img)
        .map(image => ({ url: image }));
      return productObj;
    });

        const categories = await Category.find({ isListed: true, isDeleted: false });
        const brands = await Brand.find({ isListed: true, isDeleted: false });

    res.render("product", {
      data: formattedProducts,
      categories: validCategories,
      brands: validBrands,
      currentPage: page,
      totalPages,
      totalProducts,
      search,
      startPage,
      endPage,
      adminUser
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.redirect("/admin/pageerror");
  }
};

const deleteProductImage = async (req, res) => {
  try {
    const { productId, imageName } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const decodedImageName = decodeURIComponent(imageName);
    const imageIndex = product.productImage.indexOf(decodedImageName);
    if (imageIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Image not found"
      });
    }

    const publicId = decodedImageName.split('/').pop().split('.')[0];
    await cloudinary.uploader.destroy(`product-images/${publicId}`);

    product.productImage.splice(imageIndex, 1);
    await product.save();

    res.status(200).json({ success: true, message: "Image deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting image", error: error.message });
  }
};

const getProductEditPage = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId)
      .populate("category", "name")
      .populate("brand", "name");
    if (!product) return res.redirect("/admin/product");

    const categories = await Category.find({ isListed: true, isDeleted: false });
    const brands = await Brand.find({ isListed: true, isDeleted: false });

    res.render("edit-product", { product, cat: categories, brand: brands });
  } catch (error) {
    console.error("Error in getProductEditPage:", error);
    res.redirect("/admin/product");
  }
};

const getAllProducts = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 5;

    const validCategories = await Category.find({ isListed: true, isDeleted: false }).select('_id name');
    const validBrands = await Brand.find({ isListed: true, isDeleted: false }).select('_id name');
    const validCategoryIds = validCategories.map(cat => cat._id);
    const validBrandIds = validBrands.map(brand => brand._id);

    let searchQuery = {
      category: { $in: validCategoryIds },
      brand: { $in: validBrandIds }
    };

    if (search) {
      searchQuery.$or = [
        { productName: { $regex: new RegExp(search, "i") } },
        { description: { $regex: new RegExp(search, "i") } }
      ];
    }

    const totalProducts = await Product.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalProducts / limit);

    const maxPagesToShow = 5;
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    const products = await Product.find(searchQuery)
      .populate('category', 'name')
      .populate('brand', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    const formattedProducts = products.map(product => {
      const productObj = product.toObject();
      productObj.formattedImages = (productObj.productImage || [])
        .filter(img => img)
        .map(image => ({ url: image }));
      return productObj;
    });

    res.render("product", {
      data: formattedProducts,
      currentPage: page,
      totalPages,
      totalProducts,
      search,
      cat: validCategories,
      brand: validBrands,
      startPage,
      endPage
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching products",
      error: error.message
    });
  }
};

const blockProduct = async (req, res) => {
  try {
    const id = req.query.id;
    await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.redirect("/admin/product");
  } catch (error) {
    res.redirect("/admin/pageerror");
  }
};

const unblockProduct = async (req, res) => {
  try {
    const id = req.query.id;
    await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.redirect("/admin/product");
  } catch (error) {
    res.redirect("/admin/pageerror");
  }
};

const getEditProduct = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      console.log("Missing product ID");
      return res.redirect("/admin/product");
    }

    const product = await Product.findById(id)
      .populate('category', 'name')
      .populate('brand', 'name');

    if (!product) {
      return res.redirect("/admin/product");
    }

    const category = await Category.find({ isListed: true, isDeleted: false });
    const brand = await Brand.find({ isListed: true, isDeleted: false });

    res.render("edit-product", {
      product,
      cat: category,
      brand,
    });
  } catch (error) {
    console.log("Error fetching product for edit:", error);
    return res.redirect("/admin/product");
  }
};

const getProductData = async (req, res) => {
  try {
    const productId = req.params.id;
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required"
      });
    }

    const product = await Product.findById(productId)
      .populate("category", "name")
      .populate("brand", "name");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    res.status(200).json({
      success: true,
      product
    });
  } catch (error) {
    console.error("Error in getProductData:", error);
    res.status(500).json({
      success: false,
      message: "Error loading product data",
      error: error.message
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (product.productImage && Array.isArray(product.productImage)) {
      for (const image of product.productImage) {
        if (image) {
          const publicId = image.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`product-images/${publicId}`);
        }
      }
    }

    await Product.findByIdAndDelete(productId);
    return res.status(200).json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({
      success: false,
      message: "Error deleting product",
      error: error.message
    });
  }
};

const toggleProductStatus = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    product.isBlocked = !product.isBlocked;
    await product.save();

    return res.status(200).json({
      success: true,
      message: `Product ${product.isBlocked ? 'blocked' : 'unblocked'} successfully`,
      status: product.isBlocked
    });
  } catch (error) {
    console.error('Error toggling product status:', error);
    return res.status(500).json({
      success: false,
      message: "Error updating product status",
      error: error.message
    });
  }
};

const getProductByID = async (req, res) => {
  try {
    const productId = req.params.id;
    if (!productId) {
      return res.status(400).json({ success: false, message: "Product ID is required" });
    }

    const product = await Product.findById(productId).populate('category');
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const categories = await Category.find({ isListed: true, isDeleted: false });

    return res.render('admin/edit-product', {
      product,
      categories,
      pageTitle: 'Edit Product',
      path: '/admin/edit-product',
      errors: null
    });
  } catch (error) {
    console.error("Error retrieving product by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving product",
      error: error.message
    });
  }
};

const removeDuplicateProducts = async (req, res) => {
  try {
    const duplicates = await checkForDuplicateProducts();
    if (duplicates.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No duplicate products found"
      });
    }

    const productsToDelete = [];
    const productsToKeep = [];

    for (const dup of duplicates) {
      productsToKeep.push(dup.ids[0]);
      for (let i = 1; i < dup.ids.length; i++) {
        productsToDelete.push(dup.ids[i]);
      }
    }

    const deleteResult = await Product.deleteMany({
      _id: { $in: productsToDelete }
    });

    return res.status(200).json({
      success: true,
      message: `Removed ${deleteResult.deletedCount} duplicate products`,
      details: {
        kept: productsToKeep,
        deleted: productsToDelete
      }
    });
  } catch (error) {
    console.error("Error removing duplicates:", error);
    return res.status(500).json({
      success: false,
      message: "Error removing duplicate products",
      error: error.message
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const productId = req.body.productId;
    const existingProduct = await Product.findById(productId);
    if (!existingProduct) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const {
      productName,
      description,
      brand,
      category,
      regularPrice,
      salePrice,
      quantity,
      processor,
      storage,
      ram,
      camera,
      existingImages
    } = req.body;

    // Validate required fields
    if (!productName || !description || !brand || !category || !regularPrice || !quantity) {
      return res.status(400).json({ success: false, message: "Please fill in all required fields" });
    }

    // Validate brand and category
    const brandObj = await Brand.findOne({ _id: brand, isListed: true, isDeleted: false });
    if (!brandObj) {
      return res.status(400).json({ success: false, message: "Invalid or unlisted brand" });
    }

    const categoryObj = await Category.findOne({ _id: category, isListed: true, isDeleted: false });
    if (!categoryObj) {
      return res.status(400).json({ success: false, message: "Invalid or unlisted category" });
    }

    // Handle images
    let imagesToKeep = JSON.parse(existingImages || "[]").filter(img => img);
    const newImages = req.files ? req.files.map(file => file.path) : [];

    const finalImages = [];
    let newImageIndex = 0;
    let existingImageIndex = 0;

    for (let i = 0; i < 3; i++) {
      if (newImageIndex < newImages.length) {
        finalImages.push(newImages[newImageIndex++]);
      } else if (existingImageIndex < imagesToKeep.length) {
        finalImages.push(imagesToKeep[existingImageIndex++]);
      }
    }

    if (finalImages.length !== 3) {
      for (const image of newImages) {
        const publicId = image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`product-images/${publicId}`);
      }
      return res.status(400).json({ success: false, message: "Exactly three product images are required." });
    }

    // Delete unused old images
    const imagesToDelete = existingProduct.productImage.filter(img => !finalImages.includes(img));
    for (const image of imagesToDelete) {
      if (image) {
        const publicId = image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`product-images/${publicId}`);
      }
    }

    // Update product
    existingProduct.set({
      productName,
      description,
      brand: brandObj._id,
      category: categoryObj._id,
      regularPrice: parseFloat(regularPrice),
      salePrice: salePrice ? parseFloat(salePrice) : null,
      quantity: parseInt(quantity),
      productImage: finalImages,
      processor: processor || "",
      ram: ram || "",
      storage: storage || "",
      camera: camera || "",
    });

    await existingProduct.save();
    res.status(200).json({ success: true, message: "Product updated successfully" });
  } catch (error) {
    if (req.files) {
      for (const file of req.files) {
        const publicId = file.path.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`product-images/${publicId}`);
      }
    }
    res.status(500).json({ success: false, message: "Error updating product", error: error.message });
  }
};

module.exports = {
  getProductAddPage,
  getProductPage,
  addProducts,
  listProducts,
  deleteProductImage,
  updateProduct,
  getAllProducts,
  getProductEditPage,
  blockProduct,
  unblockProduct,
  getEditProduct,
  getProductData,
  deleteProduct,
  toggleProductStatus,
  getProductByID,
  removeDuplicateProducts
};