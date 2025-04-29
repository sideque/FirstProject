const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const adminController = require('./adminController');


const checkForDuplicateProducts = async () => {
    try {

        const allProducts = await Product.find({}, 'productName');

        // Track product names and potential duplicates
        const productNames = {};
        const duplicates = [];

        // Check for duplicates
        allProducts.forEach(product => {
            if (productNames[product.productName]) {
                duplicates.push({
                    name: product.productName,
                    ids: [productNames[product.productName]._id.toString(), product._id.toString()]
                });
            } else {
                productNames[product.productName] = product;
            }
        });


        if (duplicates.length > 0) {
            console.log('DUPLICATE PRODUCTS FOUND:');
            duplicates.forEach(dup => {
                console.log(`Product: "${dup.name}" has duplicates with IDs: ${dup.ids.join(', ')}`);
            });
        }

        return duplicates;
    } catch (error) {
        console.error('Error checking for duplicates:', error);
        return [];
    }
};

const getProductPage = async (req, res) => {
    try {
        const category = await Category.find({ isListed: true });
        const brand = await Brand.find({ isListed: true }) || [];
        res.render("add-product", {
            cat: category,
            brand: brand
        });
    } catch (error) {
        console.error("Error fetching categories/brands:", error);
        res.redirect("/admin/pageerror");
    }
};

const getProductAddPage = async (req, res) => {
    try {
        const category = await Category.find({ isListed: true, isDeleted: false }).select('_id');
        const brand = await Brand.find({ isListed: true, isDeleted: false }).select('_id');
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const search = req.query.search || "";

        const validCategoryIds = category.map(cat => cat._id);
        const validBrandIds = brand.map(brand => brand._id);

        let query = {
            isBlocked: false,
            category: { $in: validCategoryIds },
            brand: { $in: validBrandIds }
        };

        if (search) {
            const matchingBrands = await Brand.find({
                name: { $regex: new RegExp("^" + search, "i") },
                isListed: true,
                isDeleted: false
            }).select('_id');

            const brandIds = matchingBrands.map(brand => brand._id);

            // 2. Build query using those brandIds
            query = {
                $or: [
                    { productName: { $regex: new RegExp("^" + search, "i") } },
                    { description: { $regex: new RegExp("^" + search, "i") } },
                    { brand: { $in: brandIds } }
                ]
            };
        }

        // Get total count for pagination
        const totalProducts = await Product.countDocuments();
        const totalPages = Math.ceil(totalProducts / limit);

        // Get products with pagination
        const products = await Product.find(query)
            .populate('category')
            .populate('brand')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .exec();

        // Process products to ensure consistent image path handling
        const formattedProducts = products.map(product => {
            if (product.productImage && Array.isArray(product.productImage)) {
                const filteredImages = product.productImage.filter(img => img !== null && img !== undefined);
                const normalizedImages = filteredImages.map(img => {
                    if (typeof img === 'string') {
                        if (img.startsWith('/uploads/product-images/')) {
                            return img.substring('/uploads/product-images/'.length);
                        }
                        return img;
                    } else if (img && img.filename) {
                        return img.filename;
                    }
                    return null;
                }).filter(img => img !== null);

                product.productImage = normalizedImages;
                product.formattedImages = normalizedImages.map(image => {
                    let path = `/uploads/product-images/${image}`;
                    const absolutePath = process.cwd() + path.replace(/\//g, '\\');
                    return { filename: image, path: path };
                });

                if (normalizedImages.length === 0) {
                }
            } else {
                product.productImage = [];
                product.formattedImages = [];
            }
            return product;
        });

        // pagination 
        const maxPagesToShow = 5;
        let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        if (page < totalPages - 2) {
            endPage = Math.min(page + 2, totalPages);
        }

        const sortedProducts = formattedProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.render("product", {
            data: sortedProducts,
            currentPage: page,
            totalPages: totalPages,
            totalProducts: totalProducts,
            cat: category,
            brand: brand,
            startPage: startPage,
            endPage: endPage,
            search: search
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.redirect("/admin/pageerror");
    }
};

const addProducts = async (req, res) => {
    try {
        const {
            productName,
            description,
            brand,
            category,
            regularPrice,
            salePrice,
            quantity,
            discount,
            processor,
            ram,
            storage,
            camera,
        } = req.body;

        if (!productName || !description || !brand || !category || !regularPrice || !salePrice || !quantity) {
            return res.status(400).json({
                success: false,
                message: "Please fill in all required fields",
            });
        }

        const existingProduct = await Product.findOne({ productName });
        if (existingProduct) {
            return res.status(400).json({
                success: false,
                message: "Product with this name already exists",
            });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please upload at least one image",
            });
        }

        const images = [];

        for (const file of req.files) {
            if (!file.mimetype.startsWith('image/')) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid file type: ${file.originalname}`,
                });
            }

            if (file.size > 10 * 1024 * 1024) {
                return res.status(400).json({
                    success: false,
                    message: `File too large: ${file.originalname}`,
                });
            }

            images.push(file.filename);
        }

        // ✅ Brand name മുതൽ Brand ObjectId കിട്ടണം
        const brandObj = await Brand.findOne({ name: brand });
        if (!brandObj) {
            return res.status(400).json({
                success: false,
                message: "Invalid brand name",
            });
        }

        // ✅ Category name മുതൽ Category ObjectId കിട്ടണം
        const categoryObj = await Category.findOne({ name: category });
        if (!categoryObj) {
            return res.status(400).json({
                success: false,
                message: "Invalid category name",
            });
        }

        const newProduct = new Product({
            productName,
            description,
            brand: brandObj._id, // ✅ Brand ObjectId കൊടുക്കണം
            category: categoryObj._id,
            regularPrice,
            salePrice,
            quantity,
            productOffer: parseFloat(discount) || 0,
            productImage: images,
            isBlocked: false,
            status: "Available",
            processor: processor || '',
            ram: ram || '',
            storage: storage || '',
            camera: camera || '',
        });

        await newProduct.save();

        res.status(201).json({
            success: true,
            message: "Product added successfully",
            product: newProduct,
        });

    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({
            success: false,
            message: "Error adding product",
            error: error.message,
        });
    }
};

const listProducts = async (req, res) => {
    try {
        const adminUser = await adminController.getAdminData(req);

        const duplicateProducts = await checkForDuplicateProducts();
        if (duplicateProducts.length > 0) {
            console.log(`Found ${duplicateProducts.length} duplicate product entries in the database`);
        }

        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 5;

        let searchQuery = {};
        if (search) {
            searchQuery = {
                $or: [
                    { productName: { $regex: new RegExp(search, "i") } },
                    { description: { $regex: new RegExp(search, "i") } }
                ]
            };
        }

        const totalProducts = await Product.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalProducts / limit);

        const maxPagesToShow = 5;
        let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        let products;
        if (search) {
            products = await Product.find({
                $or: [
                    { productName: { $regex: new RegExp(search, "i") } },
                    { description: { $regex: new RegExp(search, "i") } },
                ]
            })
                .populate('category', 'name')
                .populate('brand', 'name')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .exec();
        } else {
            products = await Product.find({})
                .populate('category', 'name')
                .populate('brand', 'name')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .exec();
        }

        const formattedProducts = products.map(product => {
            if (product.productImage && Array.isArray(product.productImage)) {
                const filteredImages = product.productImage.filter(img => img !== null && img !== undefined);
                const normalizedImages = filteredImages.map(img => {
                    if (typeof img === 'string') {
                        if (img.startsWith('/uploads/product-images/')) {
                            return img.substring('/uploads/product-images/'.length);
                        }
                        return img;
                    } else if (img && img.filename) {
                        return img.filename;
                    }
                    return null;
                }).filter(img => img !== null);

                product.productImage = normalizedImages;
                product.formattedImages = normalizedImages.map(image => {
                    let path = `/uploads/product-images/${image}`;
                    const absolutePath = process.cwd() + path.replace(/\//g, '\\');
                    return { filename: image, path: path };
                });

                if (normalizedImages.length === 0) {
                }
            } else {
                product.productImage = [];
                product.formattedImages = [];
            }
            return product;
        });

        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isListed: true });

        res.render("product", {
            data: formattedProducts,
            categories: categories,
            brands: brands,
            currentPage: page,
            totalPages: totalPages,
            totalProducts: totalProducts,
            search: search,
            startPage: startPage,
            endPage: endPage,
            adminUser: adminUser
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.redirect("/admin/pageerror");
    }
};

const deleteProductImage = async (req, res) => {
    try {
        const { productId, imageName } = req.params;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        let normalizedImageName = imageName;
        if (imageName.startsWith('/uploads/product-images/')) {
            normalizedImageName = imageName.substring('/uploads/product-images/'.length);
        }

        let imageIndex = product.productImage.indexOf(normalizedImageName);
        if (imageIndex === -1) {
            imageIndex = product.productImage.indexOf('/uploads/product-images/' + normalizedImageName);
            if (imageIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: "Image not found in product"
                });
            }
        }

        try {
            const imagePath = path.join(process.cwd(), 'uploads', 'product-images', normalizedImageName);

            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
                console.log("File deleted successfully");
            } else {

            }

            product.productImage.splice(imageIndex, 1);
            await product.save();


            return res.status(200).json({
                success: true,
                message: "Image deleted successfully"
            });
        } catch (fileError) {
            console.error("Error handling file:", fileError);
            product.productImage.splice(imageIndex, 1);
            await product.save();

            return res.status(200).json({
                success: true,
                message: "Image reference removed from database"
            });
        }
    } catch (error) {
        console.error("Error in deleteProductImage:", error);
        return res.status(500).json({
            success: false,
            message: "Error deleting image",
            error: error.message
        });
    }
};

const updateProduct = async (req, res) => {
    try {

        const productId = req.body.productId;
        if (!productId) {
            return res.status(400).json({ success: false, message: "Product ID is required" });
        }

        const productData = req.body;

        const existingProduct = await Product.findById(productId);
        if (!existingProduct) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // Process new images 
        const newImages = [];

        // Handle cropped images
        const croppedImages = [
            productData.croppedImage0,
            productData.croppedImage1,
            productData.croppedImage2,
        ].filter((img) => img && img.startsWith("data:image")); // Only valid base64 images

        if (croppedImages.length > 0) {
            for (let i = 0; i < croppedImages.length; i++) {
                try {

                    const base64Data = croppedImages[i].replace(/^data:image\/\w+;base64,/, "");
                    const buffer = Buffer.from(base64Data, "base64");

                    // Generate unique filename
                    const filename = `cropped-${Date.now()}-${i}.jpg`;
                    const filePath = path.join("uploads", "product-images", filename);

                    // Ensure directory exists
                    const dir = path.join("uploads", "product-images");
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    // Resize and save image using sharp
                    await sharp(buffer).resize(440, 440).toFile(filePath);

                    newImages.push(filename);
                } catch (error) {
                    console.error(`Error processing cropped image ${i}:`, error);
                }
            }
        }

        // Handle file uploads (if any)
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                try {
                    const originalImagePath = req.files[i].path;
                    const filename = `${Date.now()}-${req.files[i].originalname}`;
                    const resizedImagePath = path.join("uploads", "product-images", filename);

                    const dir = path.join("uploads", "product-images");
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    await sharp(originalImagePath)
                        .resize(440, 440)
                        .toFile(resizedImagePath);

                    fs.unlinkSync(originalImagePath);

                    newImages.push(filename);
                } catch (error) {
                    console.error("Error processing uploaded image:", error);
                }
            }
        }


        // Prepare updated product data
        const updatedProduct = {
            productName: productData.productName || existingProduct.productName,
            description: productData.description || existingProduct.description,
            brand: productData.brand || existingProduct.brand,
            category: productData.category || existingProduct.category,
            regularPrice: productData.regularPrice || existingProduct.regularPrice,
            salePrice: productData.salePrice || existingProduct.salePrice,
            quantity: productData.quantity || existingProduct.quantity,
            processor: productData.processor || existingProduct.processor,
            storage: productData.storage || existingProduct.storage,
            ram: productData.ram || existingProduct.ram,
            camera: productData.camera || existingProduct.camera,
        };

        // Handle images
        let finalProductImages = existingProduct.productImage; // Default to existing images

        if (newImages.length > 0) {
            finalProductImages = newImages;

            // Delete old images if new ones are uploaded
            if (existingProduct.productImage && existingProduct.productImage.length > 0) {
                for (const oldImage of existingProduct.productImage) {
                    if (!oldImage) continue;
                    const oldImagePath = path.join(process.cwd(), "uploads", "product-images", oldImage);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }
            }
        } else if (productData.existingImages) {
            try {
                const parsedImages = JSON.parse(productData.existingImages || "[]");
                if (Array.isArray(parsedImages)) {
                    // Filter out null or empty values and normalize paths
                    finalProductImages = parsedImages
                        .filter((img) => img && typeof img === "string")
                        .map((img) => {
                            if (img.startsWith("/uploads/product-images/")) {
                                return img.substring("/uploads/product-images/".length);
                            }
                            return img;
                        });

                    // Remove any deleted images from the existing array
                    const imagesToDelete = existingProduct.productImage.filter(
                        (img) => img && !finalProductImages.includes(img)
                    );
                    for (const oldImage of imagesToDelete) {
                        const oldImagePath = path.join(process.cwd(), "Uploads", "product-images", oldImage);
                        if (fs.existsSync(oldImagePath)) {
                            fs.unlinkSync(oldImagePath);
                        }
                    }
                }
            } catch (error) {
                // Fallback to existing images if parsing fails
                finalProductImages = existingProduct.productImage;
            }
        }

        // Validate image count
        if (finalProductImages.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one product image is required",
            });
        }

        updatedProduct.productImage = finalProductImages;
        console.log("Final product images:", updatedProduct.productImage);

        // Update the product
        const result = await Product.findByIdAndUpdate(productId, updatedProduct, { new: true });

        console.log("Product updated successfully:", result);

        return res.status(200).json({
            success: true,
            message: "Product updated successfully",
            product: result,
        });
    } catch (error) {
        console.error("Error updating product:", error);
        return res.status(500).json({
            success: false,
            message: "Error updating product",
            error: error.message,
        });
    }
};

const getProductEditPage = async (req, res) => {
    try {
        const productId = req.params.id;

        if (!productId) {
            console.log('No product ID provided');
            return res.redirect("/admin/product");
        }

        const product = await Product.findById(productId)
            .populate('category', 'name')
            .populate('brand', 'name');

        if (!product) {
            console.log('Product not found with ID:', productId);
            return res.redirect("/admin/product");
        }

        if (product.productImage && product.productImage.length > 0) {
            product.productImage = product.productImage.map(img => {
                if (img && img.startsWith('/uploads/product-images/')) {
                    return img.substring('/uploads/product-images/'.length);
                }
                return img;
            });

            product.formattedImages = product.productImage.map(image => {
                let path = `/uploads/product-images/${image}`;
                const absolutePath = process.cwd() + path.replace(/\//g, '\\');
                return { filename: image, path: path };
            });
        }

        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isListed: true });

        res.render("edit-product", {
            product: product,
            cat: categories,
            brand: brands
        });
    } catch (error) {
        console.error("Error in getProductEditPage:", error);
        res.redirect("/admin/product");
    }
};

const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 5;

        let searchQuery = {};
        if (search) {
            searchQuery = {
                $or: [
                    { productName: { $regex: new RegExp(search, "i") } },
                    { brand: { $regex: new RegExp(search, "i") } },
                    { description: { $regex: new RegExp(search, "i") } }
                ]
            };
        }

        const totalProducts = await Product.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalProducts / limit);

        const maxPagesToShow = 5;
        let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        const products = await Product.find(searchQuery)
            .populate('category')
            .populate('brand')
            .sort({ createdOn: -1, _id: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .exec();

        const formattedProducts = products.map(product => {
            if (product.productImage && Array.isArray(product.productImage)) {
                const filteredImages = product.productImage.filter(img => img !== null && img !== undefined);
                const normalizedImages = filteredImages.map(img => {
                    if (typeof img === 'string') {
                        if (img.startsWith('/uploads/product-images/')) {
                            return img.substring('/uploads/product-images/'.length);
                        }
                        return img;
                    } else if (img && img.filename) {
                        return img.filename;
                    }
                    return null;
                }).filter(img => img !== null);

                product.productImage = normalizedImages;
                product.formattedImages = normalizedImages.map(image => {
                    let path = `/uploads/product-images/${image}`;
                    const absolutePath = process.cwd() + path.replace(/\//g, '\\');
                    // console.log(`Image absolute path check: ${absolutePath}, exists: ${fs.existsSync(absolutePath)}`);
                    return { filename: image, path: path };
                });

                if (normalizedImages.length === 0) {

                }
            } else {
                product.productImage = [];
                product.formattedImages = [];

            }
            return product;
        });

        const category = await Category.find({ isListed: true });
        const brand = await Brand.find({ isListed: true });

        res.render("product", {
            data: formattedProducts,
            currentPage: page,
            totalPages: totalPages,
            totalProducts: totalProducts,
            search: search,
            cat: category,
            brand: brand,
            startPage: startPage,
            endPage: endPage
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching products",
            error: error.message
        });
    }
};

const blockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });
        res.redirect("/admin/product");
    } catch (error) {
        res.redirect("/admin/pageerror");
    }
};

const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
        res.redirect("/admin/product");
    } catch (error) {
        res.redirect("/admin/pageerror");
    }
};

const getEditProduct = async (req, res) => {
    try {
        const id = req.params.id;

        if (!id) {
            console.log("Missing product ID");
            return res.redirect("/admin/product");
        }

        const product = await Product.findById(id)
            .populate('category', 'name')
            .populate('brand', 'name');

        if (!product) {
            return res.redirect("/admin/product");
        }

        if (product.productImage && product.productImage.length > 0) {
            product.productImage = product.productImage.map(img => {
                if (img && img.startsWith('/uploads/product-images/')) {
                    return img.substring('/uploads/product-images/'.length);
                }
                return img;
            });

            product.formattedImages = product.productImage.map(image => {
                let path = `/uploads/product-images/${image}`;
                const absolutePath = process.cwd() + path.replace(/\//g, '\\');
                // console.log(`Image absolute path check: ${absolutePath}, exists: ${fs.existsSync(absolutePath)}`);
                return { filename: image, path: path };
            });
        }

        const category = await Category.find({ isListed: true });
        const brand = await Brand.find({ isListed: true });


        res.render("edit-product", {
            product: product,
            cat: category,
            brand: brand,
        });
    } catch (error) {
        console.log("Error fetching product for edit:", error);
        return res.redirect("/admin/product");
    }
};

const getProductData = async (req, res) => {
    try {
        const productId = req.params.id;

        if (!productId) {
            console.log('No product ID provided');
            return res.status(400).json({
                success: false,
                message: "Product ID is required"
            });
        }

        const product = await Product.findById(productId)
            .populate("category", "name")
            .populate("brand", "name");

        if (!product) {

            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }


        if (product.productImage && product.productImage.length > 0) {
            const normalizedImages = product.productImage.map(img => {
                if (img && img.startsWith('/uploads/product-images/')) {
                    return img.substring('/uploads/product-images/'.length);
                }
                return img;
            });

            product.productImage = normalizedImages;
            product.formattedImages = normalizedImages.map(image => ({
                filename: image,
                path: `/uploads/product-images/${image}`
            }));
        }

        res.status(200).json({
            success: true,
            product: product
        });
    } catch (error) {
        console.error("Error in getProductData:", error);
        console.error("Error stack:", error.stack);
        res.status(500).json({
            success: false,
            message: "Error loading product data",
            error: error.message
        });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        if (product.productImage && Array.isArray(product.productImage)) {
            for (const image of product.productImage) {
                const imagePath = path.join(process.cwd(), 'uploads', 'product-images', image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }
        }

        await Product.findByIdAndDelete(productId);

        return res.status(200).json({ success: true, message: "Product deleted successfully" });
    } catch (error) {
        console.log(error.message);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const toggleProductStatus = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        product.isBlocked = !product.isBlocked;
        await product.save();

        return res.status(200).json({
            success: true,
            message: `Product ${product.isBlocked ? 'blocked' : 'unblocked'} successfully`,
            status: product.isBlocked
        });
    } catch (error) {
        console.error('Error toggling product status:', error);
        return res.status(500).json({
            success: false,
            message: "Error updating product status",
            error: error.message
        });
    }
};

const getProductByID = async (req, res) => {
    try {
        const productId = req.params.id;

        if (!productId) {
            return res.status(400).json({ success: false, message: "Product ID is required" });
        }

        const product = await Product.findById(productId).populate('category');

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        if (product.productImage && product.productImage.length > 0) {
            product.productImage = product.productImage.map(img => {
                if (img && img.startsWith('/uploads/product-images/')) {
                    return img.substring('/uploads/product-images/'.length);
                }
                return img;
            });

            product.formattedImages = product.productImage.map(image => ({
                filename: image,
                path: `/uploads/product-images/${image}`
            }));
        }

        const categories = await Category.find();

        return res.render('admin/edit-product', {
            product,
            categories,
            pageTitle: 'Edit Product',
            path: '/admin/edit-product',
            errors: null
        });
    } catch (error) {
        console.error("Error retrieving product by ID:", error);
        return res.status(500).json({
            success: false,
            message: "Error retrieving product",
            error: error.message
        });
    }
};

const removeDuplicateProducts = async (req, res) => {
    try {
        const duplicates = await checkForDuplicateProducts();

        if (duplicates.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No duplicate products found"
            });
        }

        const productsToDelete = [];
        const productsToKeep = [];

        for (const dup of duplicates) {
            productsToKeep.push(dup.ids[0]);
            for (let i = 1; i < dup.ids.length; i++) {
                productsToDelete.push(dup.ids[i]);
            }
        }

        const deleteResult = await Product.deleteMany({
            _id: { $in: productsToDelete }
        });

        return res.status(200).json({
            success: true,
            message: `Removed ${deleteResult.deletedCount} duplicate products`,
            details: {
                kept: productsToKeep,
                deleted: productsToDelete
            }
        });
    } catch (error) {
        console.error("Error removing duplicates:", error);
        return res.status(500).json({
            success: false,
            message: "Error removing duplicate products",
            error: error.message
        });
    }
};

module.exports = {
    getProductAddPage,
    getProductPage,
    addProducts,
    listProducts,
    deleteProductImage,
    updateProduct,
    getAllProducts,
    getProductEditPage,
    blockProduct,
    unblockProduct,
    getEditProduct,
    getProductData,
    deleteProduct,
    toggleProductStatus,
    getProductByID,
    removeDuplicateProducts
};