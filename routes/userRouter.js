const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userController");
const profileController = require("../controllers/user/profileController")
const passport = require("passport");


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



//Home page & Shopping page
router.get('/',userController.loadHomePage);
router.get("/logout",userController.logout);

// Prodile Management 
router.get("/forgot-password",profileController.getForgotPassPage);
router.post("/forgot-email-valid",profileController.forgotEmailValid);
router.post("/reset-password",profileController.verifyForgotPassOtp);
router.get("/reset-password",profileController.getResetPassPage);
router.post("/resend-forgot-otp",profileController.resendOtp);
router.post("/new-password",profileController.postNewPassword);

  

module.exports = router