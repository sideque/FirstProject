const User = require("../../models/userSchema");
const nodemailer = require('nodemailer');
const env = require('dotenv').config();
const bcrypt = require('bcrypt');

const pageNotFound = async (req,res) => {
    try {
        res.render("page-404")
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}

const loadHomePage = async (req,res) =>{
    try{
        const user = req.session.user;
        if(user){
            const userData = await User.findOne({_id:user._id});
            res.render("home",{user:userData})
        }else{
            return res.render('home');
        }
    }catch (error){
        console.log("Home page not loading:",error);
        res.status(500).send("Server Error")
    }
}  
const loadLogin = async (req, res) => {
    try {
      if (!req.session.user) {
        return res.render("login", { message: "" }); 
      } else {
        res.redirect('/');
      }
    } catch (error) {
      res.redirect("/pageNotFound");
    }
  };
  

const login = async (req,res)=>{
    try{
        const {email,password} = req.body;

        const findUser = await User.findOne({isAdmin:0,email:email});

        if(!findUser){
            return res.render("login",{message:"User not found"})
        }
        if(findUser.isBlocked){
            return res.render("login",{message:"User is blocked by admin"})
        }

        const passwordMatch = await bcrypt.compare(password,findUser.password);

        if(!passwordMatch){
            return res.render("login",{message:"Incorrect Password"})
        }

        req.session.user = {
            _id: findUser._id,
            name: findUser.name,
            email: findUser.email,
            isAdmin: findUser.isAdmin
          };
          
        res.redirect('/')
    } catch (error) {
        console.error("login error",error);
        res.render("login",{message:"login failed. Please try again later"})
    }
}

const loadSignup = async (req,res)=>{
    try{
        return res.render("signup",{message:""});
    }catch (error){
        console.log("Signup page not found",error);
        res.status(500).send("Server error")
    }
}

function generateotp(){
    return Math.floor(100000 +Math.random()*900000).toString();
}
async function sendVerificationEmail(email,otp){
    try {
        const transporter=nodemailer.createTransport({
            service:"gmail",
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD
            }
        })

    const info = await transporter.sendMail({
        from:process.env.NODEMAILER_EMAIL,
        to:email,
        subject:"Verify your account",
        text:`Your OTP is ${otp}`,
        html:`<b>Your OTP:${otp}</b>`,
    }) 
    return info.accepted.length >0 
        
        
    } catch (error) {
        console.error("Error while sending email",error);
        return false;
        
    }
}
 const signup = async(req,res)=>{
    try {
        const {name,phone,email,password,confirmPassword}=req.body
        if(password!==confirmPassword){
            return res.render("signup",{message:"password do not match"})
 }
 const findUser=await User.findOne({email});
        if(findUser){
            return res.render('signup',({message:"User with this email already exist"}));

        }
  const otp = generateotp()
  const emailSent= await sendVerificationEmail(email,otp);
  if(!emailSent){
    return res.json("email-error")
  }
req.session.userOtp=otp;
req.session.userData={name,phone,email,password};
res.render('verify-otp');
console.log("OTP Sent",otp);

    } catch (error) {
        console.log("sign up error",error);
        res.redirect("/pageNotFound")
        
        
    }
 }

 const securePassword = async(password)=>{
    try {
        
        const passwordHash = await bcrypt.hash(password,10);

        return passwordHash;

    } catch (error) {
        
    }
 }

 const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!otp) {
            return res.status(400).json({ success: false, message: "OTP is required" });
        }

        // Optional: Use === if OTP is number, or convert both to string
        if (otp == req.session.userOtp) {
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
            });

            await saveUserData.save();

            // Set user session
            req.session.user = {
                _id: saveUserData._id,
                name: saveUserData.name,
                email: saveUserData.email,
                isAdmin: saveUserData.isAdmin
              };
              
            // Clear OTP and temp user data
            req.session.userOtp = null;
            req.session.userData = null;

            return res.json({ success: true, redirectUrl: "/" });
        } else {
            return res.status(400).json({ success: false, message: "Invalid OTP, please try again" });
        }
    } catch (error) {
        console.error("Error Verifying OTP:", error);
        return res.status(500).json({ success: false, message: "An error occurred" });
    }
};



 const resendOtp = async (req,res)=>{
    try {
        
        const {email} = req.session.userData;
        if(!email){
            return res.status(400).json({success:false,message:"Email not found in session"})
        }

        const otp = generateotp();
        req.session.userOtp = otp;

        const emailSent = await sendVerificationEmail(email,otp);
        if(emailSent){
            console.log("Resend OTP:",otp);
            res.status(200).json({success:true,message:"OTP Resend Successfully"})
        }else{
            res.status(500).json({success:false,message:"Failed to resend OTP. Please try again"});
        }

    } catch (error) {
        
        console.error("Error resending OTP",error);
        res.status(500).json({success:false,message:"Internal Server Error. Please try again"})

    }
 }

 const logout = async (req,res)=>{
    try{
        req.session.destroy((error)=>{
            if(error){
                console.log("Session destruction error",error.message);
                return res.redirect("/pageNotFound");
            }
            return res.redirect("/login")
        })
    }catch (error) {
        console.log("Logout error",error);
        res.redirect("/pageNotFound")
    }
 }


module.exports = {
    loadHomePage,
    pageNotFound,
    loadLogin,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    login,
    logout
}