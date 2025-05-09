const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const profileController = require('../controllers/user/profileController');
const checkoutController = require('../controllers/user/checkoutController');
const offerController = require('../controllers/user/offerController');
const { userAuth } = require('../middlewares/auth');
const passport = require('passport');
const productController = require('../controllers/user/productController');
const upload = require('../middlewares/multerConfig');
const cartController = require('../controllers/user/cartController');

router.use((req, res, next) => {
    // console.log('Route:', req.path, 'Session:', req.session.user);
    next();
});

router.get('/pageNotFound', userController.pageNotFound);

// Sign up Management
router.get('/signup', userController.loadSignup);
router.post('/signup', userController.signup);
router.post('/verify-otp', userController.verifyOtp);
router.post('/resend-otp', userController.resendOtp);

router.get(
    '/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
    '/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/signup',
        failureFlash: true,
    }),
    (req, res) => {
        if (req.user && req.user._id) {
            req.session.user = req.user._id;
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.redirect('/signup?error=session_save_failed');
                }
                req.session.user = req.user;
                res.redirect('/');
            });
        } else {
            console.error('Invalid user object:', req.user);
            res.redirect('/signup?error=invalid_user');
        }
    },
    (err, req, res, next) => {
        console.error('Google callback error:', err);
        res.redirect('/signup?error=authentication_failed');
    }
);

router.get('/config', (req, res) => {
    res.json({
        EMAILJS_PUBLIC_KEY: 'i1J2JkmCjVYU7yS5t',
        EMAILJS_SERVICE_ID: 'service_bdn6rmi',
        EMAILJS_TEMPLATE_ID: 'template_dls774f'
    });
});

router.get('/login', userController.loadLogin);
router.post('/login', userController.login);
router.get('/logout', userController.logout);
router.get('/about', userController.loadAboutPage);
router.get('/contact', userController.loadContactPage);

// Home page & Shopping page
router.get('/', userController.loadHomePage);
router.get('/shop', userAuth, userController.loadShoppingPage);

// Profile Management
router.get('/forgot-password', profileController.getForgotPassPage);
router.post('/forgot-email-valid', profileController.forgotEmailValid);
router.post('/reset-password', profileController.verifyForgotPassOtp);
router.get('/reset-password', profileController.getResetPassPage);
router.post('/resend-forgot-otp', profileController.resendOtp);
router.post('/new-password', profileController.postNewPassword);
router.get('/userProfile', userAuth, profileController.userProfile);
router.post('/profileUpdate', userAuth, upload.single('profileImage'), profileController.profileUpdate);
router.post('/profile/change-password', userAuth, profileController.postUserNewPassword);

// Address routes
router.get('/addAddress', userAuth, profileController.loadAddress);
router.post('/addAddress', userAuth, profileController.addAddress);
router.post('/profile/address/default', userAuth, profileController.setDefaultAddress);
router.post('/profile/address/delete', userAuth, profileController.deleteAddress);
router.post('/profile/address/edit', userAuth, profileController.editAddress);
router.get('/profile/address/:addressIndex', userAuth, profileController.getAddressForEdit);
router.post('/order/cancel', userAuth, profileController.cancelOrder);
router.post('/editemail', userAuth, profileController.editEmail);
router.post('/verify-email-otp', userAuth, profileController.verifyEmailOtp);
router.post('/resend-email-otp', userAuth, profileController.resendOtp);

// Product Management
router.get('/product', userAuth, productController.productController);
router.post('/quantityController', userAuth, productController.checkQuantity);

// Cart
router.get('/cart', userAuth, cartController.loadCart);
router.post('/cart/add', userAuth, cartController.addToCart);
router.post('/cart/update', userAuth, cartController.updateCartItem);
router.post('/cart/remove', userAuth, cartController.removeCartItem);

// Order
router.get('/checkout', userAuth, checkoutController.loadCheckout);
router.post('/place-order', userAuth, checkoutController.placeOrder);
router.post('/cancelOrder', userAuth, checkoutController.cancelOrder);
router.get('/order/success', userAuth, checkoutController.success);
router.get('/order/:id', userAuth, checkoutController.loadOrderDetails);
router.post('/order/return', userAuth, checkoutController.returnOrder);
router.post('/verify-razorpay-payment', userAuth, checkoutController.verifyRazorpayPayment);
router.post('/retry-order', userAuth, checkoutController.retryOrder);
router.get('/paymentfailedpage', userAuth, checkoutController.paymentFailed);
router.post('/cancelOrder',userAuth, checkoutController.cancelOrder);
router.post('/cancelOrderItem',userAuth, checkoutController.cancelOrderItem);
router.post('/order/returnItem',userAuth, checkoutController.returnOrderItem); 

// Coupon Management
router.get('/applyCoupon', userAuth, cartController.couponApply);
router.get('/cancel-coupon', userAuth, cartController.couponCancel);
router.get('/coupons/available', userAuth, cartController.getAvailableCoupons);
router.get('/check-applied-coupon', userAuth, cartController.checkAppliedCoupon);

// Offer Management
router.get('/offer', userAuth, offerController.getProductOffers);

// WishList Management
router.get('/wishlist', userAuth, cartController.loadWishlist);
router.post('/addtowish', userAuth, cartController.addToWishList);
router.post('/wishlist/remove', userAuth, cartController.removeFromWishlist);

// Wallet Management
router.get('/wallet', userAuth, profileController.loadWallet);
router.get('/wallet/transaction/:id', userAuth, profileController.getTransactionDetails);

module.exports = router;