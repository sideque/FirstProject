// routes/adminRouter.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController");
const brandController = require("../controllers/admin/brandController");
const productController = require("../controllers/admin/productController");
const {userAuth,adminAuth} = require("../middlewares/auth");

// Route to load the admin login page
router.get("/pageerror",adminController.pageerror);
router.get("/login", adminController.loadLogin);
router.post("/login",adminController.login);
router.get("/",adminAuth,adminController.loadDashboard);
router.get("/logout",adminController.logout);

//Cumstomer Management
router.get("/users",adminAuth,customerController.customerInfo);
router.get("/blockCustomer",adminAuth,customerController.customerBlocked);
router.get("/unblockCustomer",adminAuth,customerController.customerunBlocked);

//Category Management
router.get("/category",adminAuth,categoryController.categoryInfo);
router.post("/addCategory",adminAuth,categoryController.addCategory); 
router.get("/add-category", adminAuth, categoryController.loadAddCategory);
router.post("/addCategoryOffer",adminAuth,categoryController.addCategoryOffer);
router.post("/removeCategoryOffer",adminAuth,categoryController.removeCategoryOffer);
router.get("/listCategory",adminAuth,categoryController.getListCategory);
router.get("/unlistCategory",adminAuth,categoryController.getUnlistCategory);
// New routes for category deletion
router.get("/category-has-products/:id", adminAuth, categoryController.categoryHasProducts);
router.get("/get-categories", adminAuth, categoryController.getCategories);
router.delete("/delete-category/:id", adminAuth, categoryController.deleteCategory);
router.post("/delete-category/:id", adminAuth, categoryController.deleteCategory);
router.get("/edit-category/:id", adminAuth, categoryController.loadEditCategory);
router.post("/edit-category/:id", adminAuth, categoryController.editCategory);


//Brand Management
router.get("/brand",adminAuth,brandController.brandInfo);
router.post("/addBrand",adminAuth,brandController.addBrand); 
router.get("/add-brand", adminAuth, brandController.loadAddBrand);
router.post("/addBrandOffer",adminAuth,brandController.addBrandOffer);
router.post("/removeBrandOffer",adminAuth,brandController.removeBrandOffer);
router.get("/listBrand",adminAuth,brandController.getListBrand);
router.get("/unlistBrand",adminAuth,brandController.getUnlistBrand);
// New routes for category deletion
router.get("/brand-has-products/:id",adminAuth, brandController.brandHasProducts);
router.get("/get-brands",adminAuth,brandController.getBrands);
router.delete("/delete-brand/:id",adminAuth,brandController.deleteBrand);
router.post("/delete-brand/:id",adminAuth,brandController.deleteBrand);
router.get("/edit-brand/:id",adminAuth,brandController.loadEditBrand);
router.post("/edit-brand/:id",adminAuth,brandController.editBrand);


//Product Management
router.get("/product", adminAuth, productController.getProductAddPage);
router.get("/add-product", adminAuth, productController.getProductPage);

module.exports = router;