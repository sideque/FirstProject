const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const adminController = require('./adminController');

// Function to check for duplicate products
const checkForDuplicateProducts = async () => {
    try {
        // Get all products
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

        // Log any duplicates found
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
        res.redirect("/pageerror");
    }
};

const getProductAddPage = async (req, res) => {
    try {
        const category = await Category.find({ isListed: true });
        const brand = await Brand.find({ isListed: true });
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const search = req.query.search || "";

        // Build search query
        let query = {};
        if (search) {
            query = {
                $or: [
                    { productName: { $regex: new RegExp(search, "i") } },
                    { description: { $regex: new RegExp(search, "i") } }
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
            .sort({ createdOn: -1, _id: 1 }) // Stable sort with _id as tiebreaker
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
                    console.log(`Image absolute path check: ${absolutePath}, exists: ${fs.existsSync(absolutePath)}`);
                    return { filename: image, path: path };
                });

                if (normalizedImages.length === 0) {
                    console.log(`Product ${product._id} (${product.productName}) has no valid images`);
                }
            } else {
                product.productImage = [];
                product.formattedImages = [];
                console.log(`Product ${product._id} (${product.productName}) has no productImage array`);
            }
            return product;
        });

        console.log("Products data:", formattedProducts.map(p => ({
            id: p._id,
            name: p.productName,
            hasImages: !!p.productImage,
            imageCount: p.productImage ? p.productImage.length : 0,
            firstImage: p.productImage && p.productImage.length > 0 ? p.productImage[0] : null
        })));

        // Calculate pagination values
        const maxPagesToShow = 5;
        let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        if (page < totalPages - 2) {
            endPage = Math.min(page + 2, totalPages);
        }

        res.render("product", {
            data: formattedProducts,
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
        res.redirect("/pageerror");
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

        // Validate required fields
        if (!productName || !description || !brand || !category || !regularPrice || !salePrice || !quantity) {
            return res.status(400).json({
                success: false,
                message: "Please fill in all required fields"
            });
        }

        // Check if product already exists
        const existingProduct = await Product.findOne({ productName });
        if (existingProduct) {
            return res.status(400).json({
                success: false,
                message: "Product with this name already exists"
            });
        }

        // Validate images
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please upload at least one image"
            });
        }

        // Process images
        const images = [];
        try {
            for (const file of req.files) {
                console.log('Processing file:', file.originalname);

                // Validate file type
                if (!file.mimetype.startsWith('image/')) {
                    throw new Error(`Invalid file type: ${file.mimetype}`);
                }

                // Validate file size (max 10MB)
                if (file.size > 10 * 1024 * 1024) {
                    throw new Error(`File too large: ${file.originalname}`);
                }

                const filename = file.filename;
                console.log('File processed successfully:', filename);
                images.push(filename);
            }

            // Get category ID
            const categoryObj = await Category.findOne({ name: category });
            if (!categoryObj) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid category name"
                });
            }

            // Create new product
            const newProduct = new Product({
                productName,
                description,
                brand,
                category: categoryObj._id,
                regularPrice,
                salePrice,
                productOffer: parseFloat(discount) || 0,
                quantity: parseInt(quantity) || 0,
                productImage: images,
                isBlocked: false,
                status: "Available",
                processor: processor || '',
                ram: ram || '',
                storage: storage || '',
                camera: camera || ''
            });

            await newProduct.save();
            console.log("New product saved:", newProduct); // Debug log

            res.status(201).json({
                success: true,
                message: "Product added successfully",
                product: newProduct
            });
        } catch (error) {
            console.error('Error processing images:', error);
            // Clean up any uploaded files if there was an error
            for (const image of images) {
                try {
                    const imagePath = path.join(process.cwd(), 'uploads', 'product-images', image);
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                } catch (cleanupError) {
                    console.error('Error cleaning up file:', cleanupError);
                }
            }
            return res.status(500).json({
                success: false,
                message: "Error processing images. Please try again.",
                error: error.message
            });
        }
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({
            success: false,
            message: "Error adding product",
            error: error.message
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
            products = await Product.aggregate([
                { $match: searchQuery },
                {
                    $lookup: {
                        from: 'brands',
                        localField: 'brand',
                        foreignField: '_id',
                        as: 'brandData'
                    }
                },
                { $unwind: { path: '$brandData', preserveNullAndEmptyArrays: true } },
                {
                    $match: {
                        $or: [
                            { productName: { $regex: new RegExp(search, "i") } },
                            { description: { $regex: new RegExp(search, "i") } },
                            { 'brandData.name': { $regex: new RegExp(search, "i") } }
                        ]
                    }
                },
                { $sort: { createdOn: -1, _id: 1 } },
                { $skip: (page - 1) * limit },
                { $limit: limit }
            ]);

            products = await Product.populate(products, [
                { path: 'category', select: 'name' },
                { path: 'brand', select: 'name' }
            ]);
        } else {
            products = await Product.find(searchQuery)
                .populate('category', 'name')
                .populate('brand', 'name')
                .sort({ createdOn: -1, _id: 1 })
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
                    console.log(`Image absolute path check: ${absolutePath}, exists: ${fs.existsSync(absolutePath)}`);
                    return { filename: image, path: path };
                });

                if (normalizedImages.length === 0) {
                    console.log(`Product ${product._id} (${product.productName}) has no valid images`);
                }
            } else {
                product.productImage = [];
                product.formattedImages = [];
                console.log(`Product ${product._id} (${product.productName}) has no productImage array`);
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
        res.redirect("/pageerror");
    }
};

const deleteProductImage = async (req, res) => {
    try {
        const { productId, imageName } = req.params;
        console.log("Attempting to delete image:", { productId, imageName });

        const product = await Product.findById(productId);
        if (!product) {
            console.log("Product not found");
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
                console.log("Image not found in product's images");
                return res.status(404).json({
                    success: false,
                    message: "Image not found in product"
                });
            }
        }

        try {
            const imagePath = path.join(process.cwd(), 'uploads', 'product-images', normalizedImageName);
            console.log("Attempting to delete file at path:", imagePath);

            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
                console.log("File deleted successfully");
            } else {
                console.log("File does not exist at path:", imagePath);
            }

            product.productImage.splice(imageIndex, 1);
            await product.save();
            console.log("Product updated in database");

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
        console.log("Request body:", req.body);
        console.log("Files received:", req.files ? req.files.length : 'No files');

        const productId = req.body.productId;
        if (!productId) {
            return res.status(400).json({ success: false, message: "Product ID is required" });
        }

        const productData = req.body;

        const existingProduct = await Product.findById(productId);
        if (!existingProduct) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        console.log("Existing product images:", existingProduct.productImage);

        const newImages = [];
        if (req.files && req.files.length > 0) {
            console.log("Processing new uploaded images:", req.files.length);
            for (let i = 0; i < req.files.length; i++) {
                try {
                    const originalImagePath = req.files[i].path;
                    const filename = `${Date.now()}-${req.files[i].originalname}`;
                    const resizedImagePath = path.join('uploads', 'product-images', filename);

                    const dir = path.join('uploads', 'product-images');
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    await sharp(originalImagePath)
                        .resize(440, 440)
                        .toFile(resizedImagePath);

                    fs.unlinkSync(originalImagePath);

                    newImages.push(filename);
                } catch (error) {
                    console.error("Error processing image:", error);
                }
            }
        }

        let categoryId;
        if (productData.category) {
            const categoryDoc = await Category.findOne({ name: productData.category });
            if (!categoryDoc) {
                return res.status(400).json({ success: false, message: "Invalid category name" });
            }
            categoryId = categoryDoc._id;
        } else {
            categoryId = existingProduct.category;
        }

        const updatedProduct = {
            productName: productData.productName || existingProduct.productName,
            description: productData.description || existingProduct.description,
            brand: productData.brand || existingProduct.brand,
            category: categoryId,
            regularPrice: productData.regularPrice || existingProduct.regularPrice,
            salePrice: productData.salePrice || existingProduct.salePrice,
            stock: productData.quantity || productData.stock || existingProduct.stock,
            processor: productData.processor || existingProduct.processor,
            storage: productData.storage || existingProduct.storage,
            ram: productData.ram || existingProduct.ram,
            camera: productData.camera || existingProduct.camera,
        };

        if (productData.productImage && productData.productImage.length > 0) {
            updatedProduct.productImage = productData.productImage;
        } else {
            updatedProduct.productImage = existingProduct.productImage;
        }

        const normalizedExistingImages = existingProduct.productImage.map(img => {
            if (img && img.startsWith('/uploads/product-images/')) {
                return img.substring('/uploads/product-images/'.length);
            }
            return img;
        });

        let finalProductImages = normalizedExistingImages;

        if (newImages.length > 0) {
            console.log("Using newly uploaded images");
            finalProductImages = newImages;

            if (existingProduct.productImage && existingProduct.productImage.length > 0) {
                for (const oldImage of normalizedExistingImages) {
                    if (!oldImage) continue;
                    const oldImagePath = path.join(process.cwd(), 'uploads', 'product-images', oldImage);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }
            }
        } else if (productData.croppedImages && (Array.isArray(productData.croppedImages) || typeof productData.croppedImages === 'string')) {
            console.log("Using cropped images from the form");
            if (Array.isArray(productData.croppedImages)) {
                finalProductImages = productData.croppedImages;
            } else {
                finalProductImages = [productData.croppedImages];
            }
        } else if (productData.existingImages) {
            try {
                const parsedImages = JSON.parse(productData.existingImages);
                if (Array.isArray(parsedImages) && parsedImages.length > 0) {
                    const normalizedParsedImages = parsedImages.map(img => {
                        if (img && img.startsWith('/uploads/product-images/')) {
                            return img.substring('/uploads/product-images/'.length);
                        }
                        return img;
                    });
                    finalProductImages = normalizedParsedImages.filter(img => img !== null);
                }
            } catch (error) {
                console.error("Error parsing existingImages:", error);
            }
        }

        updatedProduct.productImage = finalProductImages;
        console.log("Final product images:", updatedProduct.productImage);

        const result = await Product.findByIdAndUpdate(
            productId,
            updatedProduct,
            { new: true }
        );

        console.log("Product updated successfully:", result);

        return res.status(200).json({
            success: true,
            message: "Product updated successfully",
            product: result
        });
    } catch (error) {
        console.error("Error updating product:", error);
        return res.status(500).json({
            success: false,
            message: "Error updating product",
            error: error.message
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
                console.log(`Image absolute path check: ${absolutePath}, exists: ${fs.existsSync(absolutePath)}`);
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
                    console.log(`Image absolute path check: ${absolutePath}, exists: ${fs.existsSync(absolutePath)}`);
                    return { filename: image, path: path };
                });

                if (normalizedImages.length === 0) {
                    console.log(`Product ${product._id} (${product.productName}) has no valid images`);
                }
            } else {
                product.productImage = [];
                product.formattedImages = [];
                console.log(`Product ${product._id} (${product.productName}) has no productImage array`);
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
        res.redirect("/pageerror");
    }
};

const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
        res.redirect("/admin/product");
    } catch (error) {
        res.redirect("/pageerror");
    }
};

const getEditProduct = async (req, res) => {
    try {
        const id = req.params.id;
        console.log("Edit product request for ID:", id);

        if (!id) {
            console.log("Missing product ID");
            return res.redirect("/admin/product");
        }

        const product = await Product.findById(id)
            .populate('category', 'name')
            .populate('brand', 'name');

        if (!product) {
            console.log('Product not found with ID:', id);
            return res.redirect("/admin/product");
        }

        console.log("Found product:", product.productName);

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
                console.log(`Image absolute path check: ${absolutePath}, exists: ${fs.existsSync(absolutePath)}`);
                return { filename: image, path: path };
            });
        }

        const category = await Category.find({ isListed: true });
        const brand = await Brand.find({ isListed: true });

        console.log("Rendering edit-product view with data");

        res.render("edit-product", {
            product: product,
            cat: category,
            brand: brand,
        });
    } catch (error) {
        console.log("Error fetching product for edit:", error);
        console.log("Error stack:", error.stack);
        return res.redirect("/admin/product");
    }
};

const getProductData = async (req, res) => {
    try {
        const productId = req.params.id;
        console.log('Fetching product with ID:', productId);

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
            console.log('Product not found with ID:', productId);
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        console.log('Product found:', product);

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

        console.log("Retrieved product:", {
            id: product._id,
            name: product.productName,
            hasImages: !!product.productImage,
            imageCount: product.productImage ? product.productImage.length : 0,
            firstImage: product.productImage && product.productImage.length > 0 ? product.productImage[0] : null
        });

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