// routes/adminRouter.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController");
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

// New routes for category deletion
router.get("/category-has-products/:id", adminAuth, categoryController.categoryHasProducts);
router.get("/get-categories", adminAuth, categoryController.getCategories);
router.delete("/delete-category/:id", adminAuth, categoryController.deleteCategory);
router.post("/delete-category/:id", adminAuth, categoryController.deleteCategory);
router.get("/edit-category/:id", adminAuth, categoryController.loadEditCategory);
router.post("/edit-category/:id", adminAuth, categoryController.editCategory);

module.exports = router;