const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const Address = require("../../models/addressSchema");
const Order = require('../../models/orderSchema');
const env = require("dotenv").config();
const upload = require("../../middlewares/multerConfig");
const saltRounds = 10;
const mongoose = require("mongoose");


//Generate OTP
function generateOtp() {
  const digits = "1234567890";
  let otp = "";
  for (let i = 0; i < 6; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}


// sendVerificationEmail 
const sendVerificationEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });
    console.log(`This is OTP: ${otp}`)
   
    const mailOptions = {
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: `Your OTP for email verification is ${otp}`,
      text: `Your OTP is ${otp}`,
      html: `<b><h4>Your OTP: ${otp}</h4><br></b>`,
    };

    const info = await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Error sending email", error);
    return false;
  }
};



// getForgotPassPage
const getForgotPassPage = async (req, res) => {
  try {
    res.render("forgot-password");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const forgotEmailValid = async (req, res) => {
  try {
    const { email } = req.body;
    const findUser = await User.findOne({ email });

    if (findUser) {
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);

      if (emailSent) {
        req.session.userOtp = otp;
        req.session.email = email;
        res.render("forgotPass-otp");
        console.log("OTP:", otp);
      } else {
        res.json({ success: false, message: "Failed to send OTP. Please try again" });
      }
    } else {
      res.render("forgot-password", {
        message: "User with this email does not exist",
      });
    }
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};



// verifyForgotPassOtp
const verifyForgotPassOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;
    if (enteredOtp === req.session.userOtp) {
      return res.json({ success: true, redirectUrl: "/reset-password" });
    } else {
      return res.json({ success: false, message: "OTP not matching" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "An error occurred. Please try again" });
  }
};


//getResetPassPage
const getResetPassPage = async (req, res) => {
  try {
    res.render("reset-password");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};


// postNewPassword
const postNewPassword = async (req, res) => {
  try {
    const { NewPassword, password } = req.body;
    const email = req.session.email;

    if (NewPassword === password) {
      const passwordHash = await bcrypt.hash(NewPassword, saltRounds);
      await User.findOneAndUpdate({ email }, { $set: { password: passwordHash } });
      res.redirect("/login?passwordchanged=true");
    } else {
      res.render("reset-password", { message: "Passwords do not match" });
    }
  } catch (error) {
    console.error(error);
    res.redirect("/pageNotFound");
  }
};


// userProfile
const userProfile = async (req, res) => {
  try {
    // Check if user is logged in
    const user = req.session.user;
    if (!user || !user._id) {
      console.log('No user session found, redirecting to login');
      return res.redirect('/login');
    }

    // Fetch user data from the database
    const userData = await User.findOne({ _id: user._id });
    if (!userData) {
      console.log('User not found in database for ID:', user._id);
      return res.redirect('/login');
    }

    // Fetch orders for the logged-in user using userId
    const orders = await Order.find({ userId: new mongoose.Types.ObjectId(user._id) })
      .populate('orderItems.product')
      .sort({ createdOn: -1 });

    // Debug each order individually
    orders.forEach(order => {
      console.log('Individual order details:', order);
    });

    // Fetch addresses for the logged-in user
    const addressDoc = await Address.findOne({ userId: user._id });
    const addresses = addressDoc ? addressDoc.address : [];

    // Render the profile page with user, orders, and addresses data
    res.render('profile', {
      user: userData,
      orders,
      addresses,
    });
  } catch (error) {
    console.error('Error loading user profile:', error.message, error.stack);
    res.redirect('/pageNotFound');
  }
};



const postUserNewPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.user;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.json({ success: false, message: "All fields are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.json({ success: false, message: "Current password is incorrect" });
    }

    if (newPassword !== confirmPassword) {
      return res.json({ success: false, message: "New passwords do not match" });
    }

    if (newPassword.length < 8) {
      return res.json({ success: false, message: "New password must be at least 8 characters long" });
    }

    const passwordHash = await bcrypt.hash(newPassword, saltRounds);
    await User.findByIdAndUpdate(userId, { $set: { password: passwordHash } });

    return res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error(error);
    return res.json({ success: false, message: "An error occurred, please try again" });
  }
};

const profileUpdate = async (req, res) => {
  try {
    const userId = req.session.user;
    const { name, phone, username, gender } = req.body;
    const updateData = {
      name,
      phone: phone || undefined,
      username: username || undefined,
      gender: gender || undefined,
      profileImage: req.file ? req.file.filename : undefined,
    };

    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    await User.findByIdAndUpdate(userId, { $set: updateData });
    res.redirect("/userProfile");
  } catch (error) {
    console.error("Error updating profile:", error);
    res.redirect("/pageNotFound");
  }
};

const addAddress = async (req, res) => {
  try {
    const {
      addressType,
      name,
      phone,
      altPhone,
      addressLine1,
      addressLine2,
      landMark,
      city,
      state,
      pincode,
      isDefault,
    } = req.body;

    const userId = req.session.user;

    let addressData = {
      addressType,
      name,
      addressLine1,
      addressLine2,
      landMark,
      city,
      state,
      pincode,
      phone,
      altPhone,
      isDefault: isDefault === "on" || isDefault === true,
    };

    let addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      addressDoc = new Address({ userId, address: [addressData] });
    } else {
      if (addressData.isDefault) {
        addressDoc.address.forEach(addr => (addr.isDefault = false));
      }
      addressDoc.address.push(addressData);
    }

    await addressDoc.save();
    res.redirect("/userProfile");
  } catch (error) {
    console.error("Error adding address:", error);
    res.redirect("/pageNotFound");
  }
};

const loadAddress = (req, res) => {
  try {
    res.redirect("/userProfile");
  } catch (error) {
    console.log(error);
    res.redirect("/pageNotFound");
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const { addressIndex } = req.body;
    const userId = req.session.user;

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res.redirect("/pageNotFound");
    }

    addressDoc.address.forEach(addr => (addr.isDefault = false));
    addressDoc.address[addressIndex].isDefault = true;

    await addressDoc.save();
    res.redirect("/userProfile");
  } catch (error) {
    console.error("Error setting default address:", error);
    res.redirect("/pageNotFound");
  }
};

const deleteAddress = async (req, res) => {
  try {
    const { addressIndex } = req.body;
    const userId = req.session.user;

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res.redirect("/pageNotFound");
    }

    addressDoc.address.splice(addressIndex, 1);

    if (addressDoc.address.length > 0 && !addressDoc.address.some(addr => addr.isDefault)) {
      addressDoc.address[0].isDefault = true;
    }

    await addressDoc.save();
    res.redirect("/userProfile");
  } catch (error) {
    console.error("Error deleting address:", error);
    res.redirect("/pageNotFound");
  }
};

const editAddress = async (req, res) => {
  try {
    const {
      addressIndex,
      addressType,
      name,
      phone,
      altPhone,
      addressLine1,
      addressLine2,
      landMark,
      city,
      state,
      pincode,
      isDefault,
    } = req.body;

    const userId = req.session.user;

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return res.redirect("/pageNotFound");
    }

    addressDoc.address[addressIndex] = {
      addressType,
      name,
      phone,
      altPhone,
      addressLine1,
      addressLine2,
      landMark,
      city,
      state,
      pincode,
      isDefault: isDefault === "on" || isDefault === true,
    };

    if (addressDoc.address[addressIndex].isDefault) {
      addressDoc.address.forEach((addr, idx) => {
        if (idx !== parseInt(addressIndex)) {
          addr.isDefault = false;
        }
      });
    }

    await addressDoc.save();
    res.redirect("/userProfile");
  } catch (error) {
    console.error("Error editing address:", error);
    res.redirect("/pageNotFound");
  }
};

const getAddressForEdit = async (req, res) => {
  try {
    const { addressIndex } = req.params;
    const userId = req.session.user;

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc || !addressDoc.address[addressIndex]) {
      return res.status(404).json({ error: "Address not found" });
    }

    res.json(addressDoc.address[addressIndex]);
  } catch (error) {
    console.error("Error getting address for edit:", error);
    res.status(400).json({ error: error.message });
  }
};



const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user;
    const order = await Order.findOne({ _id: orderId, address: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.status !== 'Processing') {
      return res.status(400).json({ success: false, message: 'Order cannot be canceled' });
    }
    order.status = 'Canceled';
    await order.save();
    res.redirect('/userProfile');
  } catch (error) {
    console.error('Error canceling order:', error);
    res.redirect('/pageNotFound');
  }
};




const editEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.session.user;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (email === user.email) {
      return res.status(400).json({ success: false, message: 'New email cannot be the same as current email' });
    }
    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(500).json({ success: false, message: 'Failed to send verification email' });
    }
    req.session.newEmail = email;
    req.session.emailOtp = otp;
    req.session.otpExpires = Date.now() + 40 * 1000; // Set OTP expiration to 40 seconds
    res.render('verify-email-otp', { message: 'Please enter the OTP sent to your new email' });
  } catch (error) {
    console.error('Error updating email:', error);
    res.redirect('/pageNotFound');
  }
};

const verifyEmailOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    // console.log(`This is an OTP: ${otp}`);

    // Check if OTP exists and is not expired
    if (!req.session.emailOtp || !req.session.otpExpires) {
      return res.json({
        success: false,
        message: "OTP not found or session expired",
      });
    }

    // Check if OTP has expired
    if (Date.now() > req.session.otpExpires) {
      delete req.session.emailOtp;
      delete req.session.otpExpires;
      return res.json({
        success: false,
        message: "OTP has expired, please request a new one",
      });
    }

    // Validate OTP
    if (otp === req.session.emailOtp) {
      const userId = req.session.user;
      const newEmail = req.session.newEmail;
      await User.findByIdAndUpdate(userId, { $set: { email: newEmail } });
      delete req.session.newEmail;
      delete req.session.emailOtp;
      delete req.session.otpExpires; // Clean up expiration
      res.json({
        success: true,
        redirectUrl: "/userProfile?emailChanged=true",
      });
    } else {
      res.json({
        success: false,
        message: "Invalid OTP, please try again",
      });
    }
  } catch (error) {
    console.error("Error verifying email OTP:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during verification",
    });
  }
};

const resendOtp = async (req, res) => {
  try {
    // Use the new email from session set by editEmail
    const newEmail = req.session.newEmail;
    if (!newEmail) {
      return res.status(400).json({ success: false, message: "New email not found in session" });
    }

    const otp = generateOtp();
    req.session.emailOtp = otp; // Use emailOtp to match verifyEmailOtp
    req.session.otpExpires = Date.now() + 40 * 1000; // OTP valid for 40 seconds

    const emailSent = await sendVerificationEmail(newEmail, otp);
    if (emailSent) {
      console.log("Resend OTP:", otp);
      res.status(200).json({ success: true, message: "OTP resent successfully" });
    } else {
      res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again" });
    }
  } catch (error) {
    console.error("Error resending OTP:", error);
    res.status(500).json({ success: false, message: "Internal server error. Please try again" });
  }
};

module.exports = {
  getForgotPassPage,
  forgotEmailValid,
  verifyForgotPassOtp,
  getResetPassPage,
  resendOtp,
  postNewPassword,
  userProfile,
  postUserNewPassword,
  profileUpdate,
  addAddress,
  loadAddress,
  setDefaultAddress,
  deleteAddress,
  editAddress,
  getAddressForEdit,
  cancelOrder,
  editEmail,
  verifyEmailOtp,
  
};