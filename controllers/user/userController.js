const mongoose = require('mongoose');
const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

const pageNotFound = async (req, res) => {
    try {
        res.render("page-404");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const loadHomePage = async (req, res) => {
    try {
        
        const user = req.session.user;
        const categories = await Category.find({ isListed: true, isDeleted:false });
        const brands = await Brand.find({ isListed: true, isDeleted:false });
        

        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map((category) => category._id) },
            brand: { $in: brands.map((brand) => brand._id) },
            quantity: { $gt: 0 },
        })
            .populate("category", "name")
            .populate('brand','name')
            .select(
                "productName productImage regularPrice salePrice productOffer category rating createdOn"
            )
            .sort({ createdOn: -1 })
            .limit(4);
            console.log("Categories:", categories);
            console.log("Brands:", brands);
        console.log('ameerrrkkaaaaaaaaaaaaaaaaa',productData);
        
        const formattedProducts = productData.map((product) => {
            let images = [];
            if (product.productImage && Array.isArray(product.productImage)) {
                images = product.productImage.map((img) =>
                    img.startsWith("/uploads/product-images/")
                        ? img
                        : `/uploads/product-images/${img}`
                );
            }
            return {
                _id: product._id,
                name: product.productName,
                image: images[0] || "https://placehold.co/300x300/darkgray/white?text=No+Image",
                price: product.regularPrice,
                salePrice: product.salePrice || product.regularPrice,
                discount: product.productOffer || 0,
                category: product.category ? product.category.name : "Lifestyle",
                rating: product.rating || 0,
            };
        });

        if (user) {
            const userData = await User.findOne({ _id: user._id });
            res.render("home", { user: userData, products: formattedProducts });
        } else {
            res.render("home", { products: formattedProducts });
        }
    } catch (error) {
        console.log("Home page not loading:", error);
        res.status(500).send("Server Error");
    }
};

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
        req.session.otpExpires = Date.now() + 60 *1000
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

        const { userOtp, otpExpires, userData } = req.session;

        console.log('otp and user Otp',otp,userOtp)

        if (!userOtp || !otpExpires || Date.now() > otpExpires) {
            return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
        }

        // check if OTP matches
        if (otp == userOtp) {
            const passwordHash = await securePassword(userData.password);

            const saveUserData = new User({
                name: userData.name,
                email: userData.email,
                phone: userData.phone,
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
            req.session.otpExpires = null;

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
        req.session.otpExpires = Date.now() + 60 *1000

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
};

// const loadShoppingPage = async (req, res) => {
//     try {
//         const user = req.session.user;
//         const { category, brand, search, minPrice, maxPrice, page: pageQuery } = req.query;
//         const page = parseInt(pageQuery) || 1;
//         const limit = 9;
//         const skip = (page - 1) * limit;

//         if (category && !mongoose.isValidObjectId(category)) {
//             return res.redirect('/pageNotFound');
//         }

//         let userData = null;
//         if (user) {
//             userData = await User.findOne({ _id: user._id || user });
//         }

//         const categories = await Category.find({ isListed: true, isDeleted:false });
//         const categoriesWithIds = categories.map(category => ({
//             _id: category._id,
//             name: category.name,
//         }));

        
//         const brands = await Brand.find({ isListed: true, isDeleted:false });
//         const brandsWithIds = brands.map(brands => ({
//             _id: category,
//             name: category,
//         }));

//         const query = {
//             isBlocked: false,
//             quantity: { $gt: 0 },
//         };

//         if (category) {
//             query.category = category;
//         } else {
//             const categoryIds = categories.map(category => category._id);
//             query.category = { $in: categoryIds };
//         }

//         if (brand) {
//             const validBrand = await Brand.findOne({ _id: brand, isDeleted: false , isListed:true});
//             if (!validBrand) {
//                 return res.redirect('/pageNotFound');
//             query.brand = brand;
//             }
//             query.brand = brand;
//         }

//         if (search) {
//             query.productName = { $regex: search, $options: 'i' };
//         }

//         if (minPrice || maxPrice) {
//             query.salePrice = {};
//             if (minPrice) query.salePrice.$gte = parseFloat(minPrice);
//             if (maxPrice) query.salePrice.$lte = parseFloat(maxPrice);
//         }

//         const productsData = await Product.find(query)
//             .sort({ createdAt: -1 })
//             .skip(skip)
//             .limit(limit);

//         const products = productsData.map((product) => {
//             const formattedImages = (product.productImage || []).map((img) =>
//                 img.startsWith('/uploads/product-images/') ? img : `/uploads/product-images/${img}`
//             );
//             return {
//                 ...product.toObject(),
//                 productImage: formattedImages,
//             };
//         });

//         const totalProducts = await Product.countDocuments(query);
//         const totalPages = Math.ceil(totalProducts / limit);

//         if (userData && (category || brand || search || minPrice || maxPrice)) {
//             const searchEntry = {
//                 category: category || null,
//                 brand: brand || null,
//                 searchQuery: search || null,
//                 minPrice: minPrice ? parseFloat(minPrice) : null,
//                 maxPrice: maxPrice ? parseFloat(maxPrice) : null,
//                 searchedOn: new Date(),
//             };
//             userData.searchHistory.push(searchEntry);
//             await userData.save();
//         }

//         res.render('shop', {
//             user: userData,
//             products,
//             category: categoriesWithIds,
//             brand: brands,
//             totalProducts,
//             currentPage: page,
//             totalPages,
//             selectedCategory: category || null,
//             selectedBrand: brand || null,
//             search: search || '',
//             minPrice: minPrice || '',
//             maxPrice: maxPrice || '',
//         });
//     } catch (error) {
//         console.error('Load Shopping Page Error:', error.message, error.stack);
//         res.redirect('/pageNotFound');
//     }
// };
const loadShoppingPage = async (req, res) => {
    try {
        const user = req.session.user;
        const { category, brand, search, minPrice, maxPrice, page: pageQuery } = req.query;
        const page = parseInt(pageQuery) || 1;
        const limit = 9;
        const skip = (page - 1) * limit;

        // Validate category and brand ObjectIds
        if (category && !mongoose.isValidObjectId(category)) {
            console.log(`Invalid category ID: ${category}`);
            return res.redirect('/pageNotFound');
        }
        if (brand && !mongoose.isValidObjectId(brand)) {
            console.log(`Invalid brand ID: ${brand}`);
            return res.redirect('/pageNotFound');
        }

        // Fetch user data if logged in
        let userData = null;
        if (user) {
            userData = await User.findOne({ _id: user._id || user });
        }

        // Fetch only listed and non-deleted categories
        const categories = await Category.find({ isListed: true, isDeleted: false });
        const categoriesWithIds = categories.map(category => ({
            _id: category._id,
            name: category.name,
        }));

        // Fetch only listed and non-deleted brands
        const brands = await Brand.find({ isListed: true, isDeleted: false });
        const brandsWithIds = brands.map(brand => ({
            _id: brand._id,
            name: brand.name,
        }));

        // Build product query
        const query = {
            isBlocked: false,
            quantity: { $gt: 0 },
        };

        // Handle category filtering
        if (category) {
            const validCategory = await Category.findOne({ 
                _id: category, 
                isListed: true, 
                isDeleted: false 
            });
            if (!validCategory) {
                console.log(`Category not found or unlisted/deleted: ${category}`);
                return res.redirect('/pageNotFound');
            }
            query.category = category;
        } else {
            const categoryIds = categories.map(category => category._id);
            query.category = { $in: categoryIds };
        }

        // Handle brand filtering
        if (brand) {
            const validBrand = await Brand.findOne({ 
                _id: brand, 
                isListed: true, 
                isDeleted: false 
            });
            if (!validBrand) {
                console.log(`Brand not found or unlisted/deleted: ${brand}`);
                return res.redirect('/pageNotFound');
            }
            query.brand = brand;
        } else {
            // Only include products from listed and non-deleted brands
            const brandIds = brands.map(brand => brand._id);
            query.brand = { $in: brandIds };
        }

        // Handle search
        if (search) {
            query.productName = { $regex: search, $options: 'i' };
        }

        // Handle price range
        if (minPrice || maxPrice) {
            query.salePrice = {};
            if (minPrice) query.salePrice.$gte = parseFloat(minPrice);
            if (maxPrice) query.salePrice.$lte = parseFloat(maxPrice);
        }

        console.log('Product query:', JSON.stringify(query, null, 2));

        // Fetch products
        const productsData = await Product.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Format product images
        const products = productsData.map((product) => {
            const formattedImages = (product.productImage || []).map((img) =>
                img.startsWith('/uploads/product-images/') ? img : `/uploads/product-images/${img}`
            );
            return {
                ...product.toObject(),
                productImage: formattedImages,
            };
        });

        // Count total products for pagination
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        // Save search history for logged-in user
        if (userData && (category || brand || search || minPrice || maxPrice)) {
            const searchEntry = {
                category: category || null,
                brand: brand || null,
                searchQuery: search || null,
                minPrice: minPrice ? parseFloat(minPrice) : null,
                maxPrice: maxPrice ? parseFloat(maxPrice) : null,
                searchedOn: new Date(),
            };
            userData.searchHistory.push(searchEntry);
            await userData.save();
        }

        // Render shop page
        res.render('shop', {
            user: userData,
            products,
            category: categoriesWithIds,
            brand: brandsWithIds,
            totalProducts,
            currentPage: page,
            totalPages,
            selectedCategory: category || null,
            selectedBrand: brand || null,
            search: search || '',
            minPrice: minPrice || '',
            maxPrice: maxPrice || '',
        });
    } catch (error) {
        console.error('Load Shopping Page Error:', error.message, error.stack);
        res.redirect('/pageNotFound');
    }
};

module.exports = {
    loadHomePage,
    pageNotFound,
    loadLogin,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    login,
    logout,
    loadShoppingPage,
};