const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const getProductPage = async (req,res)=>{
    try {
        
        // const category = await Category.find({isListed:true});
        const category = await Category.find();

        // const brand = await Brand.find({ isListed:true }) || [];
        const brand = await Brand.find();
        res.render("add-product",{
            cat:category,
            brand:brand
        });

    } catch (error) {
        
        console.error("Error fetching categories/brands:", error);
        res.redirect("/pageerror");

    }
}

const getProductAddPage = async (req, res) => {
    try {
        const category = await Category.find({ isListed: true });
        const brand = await Brand.find({ isListed: true });

        const productData = await Product.find().populate("category");  // 🆕 get all products

        console.log("Brands Retrieved:", JSON.stringify(brand, null, 2)); // Debugging  

        if (!brand || brand.length === 0) {
            console.error("No brands found in database!");
        }

        res.render("product", {
            cat: category,
            brand: brand,
            data: productData,   // ✅ Pass products as "data"
            currentPage: 1,
            totalPages: 1
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.redirect("/pageerror");
    }
};


const addProducts = async (req, res) => {
    try {

        const product = req.body
        
        const productExists = await Product.findOne({ productName: product.productName });

        if (!productExists) {
            const images = [];

            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {

                    const originalImagePath = path.normalize(req.files[i].path);  
                    const resizedImagePath = path.join(__dirname, '..', 'public', 'uploads', 'product-images', req.files[i].filename);
            
                    const outputDir = path.dirname(resizedImagePath);
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }
            
                    try {
                        await sharp(originalImagePath)
                            .resize({ width: 440, height: 440 })
                            .toFile(resizedImagePath);
            
                        images.push(req.files[i].filename);
                    } catch (error) {
                        console.error("Image Processing Error:", error);
                    }
                }
            }

            const categoryObj = await Category.findOne({ name: product.category });

            if (!categoryObj) {
                return res.status(400).json({ error: "Invalid category name" });
            }
                
            const newProduct = new Product({
                productName: product.productName,
                description: product.description,
                brand: product.brand,
                category: categoryObj._id,
                regularPrice: product.regularPrice,
                salePrice: product.salePrice,
                createdOn: new Date(),
                stock: product.stock,
                color: product.color,
                // Add these fields if they're in your form:
                processor: req.body.processor,
                storage: req.body.storage,
                ram: req.body.ram,
                camera: req.body.graphicsCard, // Note: you're using graphicsCard for camera
                productImage: images,
                status: 'Available'
            });

            await newProduct.save();

            console.log("Product saved successfully!");
            return res.redirect("/admin/add-product");
        } else {
            return res.status(400).json({ error: "Product already exists, please try with another name" });
        }

    } catch (error) {
        console.error("Error saving product:", error);
        return res.redirect("/admin/pageerror");
    }
};


// const addProducts = async (req, res) => {
//     try {
//         const product = req.body;

//         // Check if product with same name already exists
//         const productExists = await Product.findOne({ productName: product.productName });

//         if (productExists) {
//             return res.status(400).json({ success: false, error: "Product already exists" });
//         }

//         const images = [];

//         if (req.files && req.files.length > 0) {
//             for (let i = 0; i < req.files.length; i++) {
//                 const originalImagePath = path.normalize(req.files[i].path);
//                 const resizedImagePath = path.join(__dirname, '..', 'public', 'uploads', 'product-images', req.files[i].filename);

//                 const outputDir = path.dirname(resizedImagePath);
//                 if (!fs.existsSync(outputDir)) {
//                     fs.mkdirSync(outputDir, { recursive: true });
//                 }

//                 try {
//                     await sharp(originalImagePath)
//                         .resize({ width: 440, height: 440 })
//                         .toFile(resizedImagePath);

//                     images.push(req.files[i].filename);
//                 } catch (error) {
//                     console.error("Image Processing Error:", error);
//                 }
//             }
//         }

//         const categoryObj = await Category.findOne({ name: product.category });

//         if (!categoryObj) {
//             return res.status(400).json({ success: false, error: "Invalid category name" });
//         }

//         const newProduct = new Product({
//             productName: product.productName,
//             description: product.description || '',
//             brand: product.brand || '',
//             category: categoryObj._id,
//             regularPrice: product.regularPrice,
//             salePrice: product.salePrice,
//             productOffer: product.productOffer || 0,
//             quantity: product.quantity,
//             color: product.color,
//             productImage: images,
//             isBlocked: false,
//             status: "Available"
//         });

//         await newProduct.save();

//         res.status(200).json({ success: true, message: "Product added successfully!" });

//     } catch (error) {
//         console.error("Error adding product:", error);
//         res.status(500).json({ success: false, error: "Server Error" });
//     }
// };


const listProducts = async (req, res) => {
    try {
        // Fetch all products with populated category and brand information
        const products = await Product.find({})
            .populate('category', 'name')
            .sort({ createdOn: -1 }); // Most recent first
        
        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isListed: true });
        
        res.render("product-list", { 
            products: products,
            categories: categories,
            brands: brands 
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.redirect("/pageerror");
    }
};

const deleteProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        
        // Find the product to get image paths before deletion
        const product = await Product.findById(productId);
        
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not foundx`" });
        }
        
        // Delete the product images from the file system
        if (product.productImage && product.productImage.length > 0) {
            product.productImage.forEach(image => {
                // const imagePath = path.join('public', 'uploads', 'product-images', image);
                const imagePath = path.join('uploads', 'product-images', image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            });
        }
        
        // Delete the product from the database
        await Product.findByIdAndDelete(productId);
        
        return res.status(200).json({ success: true, message: "Product deleted successfully" });
    } catch (error) {
        console.error("Error deleting product:", error);
        return res.status(500).json({ success: false, message: "Failed to delete product" });
    }
};

const updateProduct = async (req, res) => {
    try {
        const productId = req.body.productId || req.params.id;
        if (!productId) {
            return res.status(400).json({ success: false, error: "Product ID is required" });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, error: "Product not found" });
        }

        const productData = req.body;
        console.log('Received body:', productData); // Debug

        // Handle cropped images (base64 from frontend)
        let images = product.productImage;
        if (productData.croppedImages) {
            const croppedImages = Array.isArray(productData.croppedImages) 
                ? productData.croppedImages 
                : [productData.croppedImages].filter(Boolean);
            if (croppedImages.length > 0) {
                images = await Promise.all(croppedImages.map(async (img, i) => {
                    if (img && img.startsWith('data:image')) {
                        const filename = `cropped_${productId}_${i}.jpg`;
                        const filepath = path.join('Uploads', 'product-images', filename);
                        const buffer = Buffer.from(img.split(',')[1], 'base64');
                        await sharp(buffer)
                            .resize({ width: 440, height: 440 })
                            .toFile(filepath);
                        return filename;
                    }
                    return null; // Skip invalid images
                }));
                images = images.filter(Boolean); // Remove nulls
            }
        }

        // Handle multer file uploads
        if (req.files && req.files.length > 0) {
            images = await Promise.all(req.files.map(async (file) => {
                const resizedImagePath = path.join('Uploads', 'product-images', file.filename);
                await sharp(file.path)
                    .resize({ width: 440, height: 440 })
                    .toFile(resizedImagePath);
                return file.filename;
            }));
        }

        const updatedProduct = {
            productName: productData.productName || product.productName,
            description: productData.description || product.description,
            brand: productData.brand || product.brand,
            category: (await Category.findOne({ name: productData.category }))?._id || product.category,
            regularPrice: productData.regularPrice || product.regularPrice,
            salePrice: productData.salePrice || product.salePrice,
            stock: productData.quantity || product.stock,
            color: productData.color || product.color,
            processor: productData.processor || product.processor,
            storage: productData.storage || product.storage,
            ram: productData.ram || product.ram,
            camera: productData.camera || product.camera,
            productImage: images.length > 0 ? images : product.productImage
        };

        await Product.findByIdAndUpdate(productId, updatedProduct, { new: true });
        console.log("Product updated successfully!");
        return res.status(200).json({ success: true, message: "Product updated successfully" });
    } catch (error) {
        console.error("Error updating product:", error);
        return res.status(500).json({ success: false, error: "Server error" });
    }
};


const getAllProducts = async (req,res)=>{
    try {
        
        const search = req.query.search || "";
        const page = req.query.page || 1;
        const limit = 4;
        const productData = await Product.find({
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
                { brand: { $regex: new RegExp(".*" + search + ".*", "i") } },
            ],
        })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('category')
        .populate('brand') // <-- added this line
        .exec();
        

        const count = await Product.find({
            $or:[
                {productName:{$regex:new RegExp(".*"+search+".*","i")}},
                {brand:{$regex:new RegExp(".*"+search+".*","i")}}
            ],
        })
        .countDocuments();

        const category = await Category.find({isListed:true});
        const brand = await Brand.find({isBlocked:false});

        if(category && brand){
            res.render("product",{
                data:productData,
                currentPage:page,
                totalPages:Math.ceil(count/limit),
                cat:category,
                brand:brand
            })
        }else{
            res.render("admin-error")
        }

    } catch (error) {
        
        res.redirect("/pageerror")

    }
}




const blockProduct = async (req,res)=>{
    try {
        
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:true}});
        res.redirect("/admin/product")

    } catch (error) {
        
        res.redirect("/pageerror");

    }
}

const unblockProduct = async (req,res)=>{
    try {
        
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect("/admin/product")

    } catch (error) {
        
        res.redirect("/pageerror")

    }
}


const getEditProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const product = await Product.findById(id)
            .populate('category', 'name')
            .populate('brand', 'name');
        if (!product) {
            return res.redirect("/admin/pageerror");
        }
        const category = await Category.find({});
        const brand = await Brand.find({});
        res.render("edit-product", { // Ensure this matches your view file name
            product: product,
            cat: category,
            brand: brand
        });
    } catch (error) {
        console.error("Error fetching product for edit:", error);
        res.redirect("/admin/pageerror");
    }
};

const getProductData = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId)
            .populate("category", "name")
            .populate("brand", "name");
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        console.log('Sending product:', product); // Debug
        res.status(200).json({ success: true, product });
    } catch (error) {
        console.error("Error fetching product data:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
module.exports = {
    getProductAddPage,
    getProductPage,
    addProducts,
    listProducts,
    deleteProduct,
    updateProduct,
    getAllProducts,
    blockProduct,
    unblockProduct,
    getEditProduct,
    getProductData
}