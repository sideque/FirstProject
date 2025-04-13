const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userController");
const profileController = require("../controllers/user/profileController");
const { userAuth } = require("../middlewares/auth");
const passport = require("passport");
const productController = require("../controllers/user/productController");


router.get("/pageNotFound",userController.pageNotFound);


//Sign up Management
router.get("/signup",userController.loadSignup);
router.post("/signup",userController.signup);
router.post("/verify-otp",userController.verifyOtp);
router.post("/resend-otp",userController.resendOtp);
router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
router.get('/auth/google/callback',
    passport.authenticate('google', { 
      failureRedirect: '/signup',
      failureFlash:true
     }),
    (req, res) => {
      req.session.user = req.user;
      res.redirect('/');
    }
  );


  router.get("/login",userController.loadLogin);
  router.post('/login',userController.login)
  router.get("/logout",userController.logout);


//Home page & Shopping page
router.get('/',userController.loadHomePage);
router.get('/shop',userAuth,userController.loadShoppingPage);
// router.get("/filter",userAuth,userController.filterProduct);

// Prodile Management 
router.get("/forgot-password",profileController.getForgotPassPage);
router.post("/forgot-email-valid",profileController.forgotEmailValid);
router.post("/reset-password",profileController.verifyForgotPassOtp);
router.get("/reset-password",profileController.getResetPassPage);
router.post("/resend-forgot-otp",profileController.resendOtp);
router.post("/new-password",profileController.postNewPassword);


//Product Management
router.get("/product",userAuth,productController.productController);
  

// Catch-all route for unmatched URLs
// router.get("*", (req, res) => {
//   res.status(404).redirect("/pageNotFound");
// });

module.exports = router