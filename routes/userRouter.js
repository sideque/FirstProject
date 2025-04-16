const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userController");
const profileController = require("../controllers/user/profileController");
const { userAuth } = require("../middlewares/auth");
const passport = require("passport");
const productController = require("../controllers/user/productController");
const upload = require("../middlewares/multerConfig");

router.get("/pageNotFound", userController.pageNotFound);

// Sign up Management
router.get("/signup", userController.loadSignup);
router.post("/signup", userController.signup);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/signup",
    failureFlash: true,
  }),
  (req, res) => {
    req.session.user = req.user;
    res.redirect("/");
  }
);

router.get("/login", userController.loadLogin);
router.post("/login", userController.login);
router.get("/logout", userController.logout);

// Home page & Shopping page
router.get("/",userAuth, userController.loadHomePage);
router.get("/shop", userAuth, userController.loadShoppingPage);

// Profile Management
router.get("/forgot-password", profileController.getForgotPassPage);
router.post("/forgot-email-valid", profileController.forgotEmailValid);
router.post("/reset-password", profileController.verifyForgotPassOtp);
router.get("/reset-password", profileController.getResetPassPage);
router.post("/resend-forgot-otp", profileController.resendOtp);
router.post("/new-password", profileController.postNewPassword);
router.get("/userProfile", userAuth, profileController.userProfile);
router.post("/profileUpdate", userAuth, upload.single("profileImage"), profileController.profileUpdate);
router.post("/profile/change-password", userAuth, profileController.postUserNewPassword);

// Address routes
router.get("/addAddress", userAuth, profileController.loadAddress);
router.post("/addAddress", userAuth, profileController.addAddress);
router.post("/profile/address/default", userAuth, profileController.setDefaultAddress);
router.post("/profile/address/delete", userAuth, profileController.deleteAddress);
router.post("/profile/address/edit", userAuth, profileController.editAddress);
router.get("/profile/address/:addressIndex", userAuth, profileController.getAddressForEdit);
router.post('/order/cancel', userAuth, profileController.cancelOrder);

router.post('/editemail', userAuth, profileController.editEmail);
router.post('/verify-email-otp', userAuth, profileController.verifyEmailOtp);
router.post('/resend-email-otp', userAuth, profileController.resendOtp)

// Product Management
router.get("/product", userAuth, productController.productController);

module.exports = router;