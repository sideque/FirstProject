const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const adminController = require('./adminController');

const brandInfo = async (req, res) => {
    try {
        const adminUser = await adminController.getAdminData(req);
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 5; 
        
        // Build search query
        let query = {};
        if (search) {
            query = {
                $or: [
                    { name: { $regex: new RegExp(search, "i") } },
                    { description: { $regex: new RegExp(search, "i") } }
                ]
            };
        }
        
        // Get total count for pagination
        const totalBrands = await Brand.countDocuments(query);
        const totalPages = Math.ceil(totalBrands / limit);
        
        // Calculate pagination values
        const maxPagesToShow = 5;
        let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
        
        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }
        
        // Get brands with pagination and sorting
        const brands = await Brand.find(query)
            .sort({ name: 1 })
            .skip((page - 1) * limit)
            .limit(limit);
        
        res.render("brand", {
            brands,
            currentPage: page,
            totalPages,
            totalBrands,
            search,
            startPage,
            endPage,
            adminUser
        });
    } catch (error) {
        console.log(error.message);
        res.redirect('/pageerror');
    }
};

const addBrand = async (req,res) => {
    try {
        const { name,description } = req.body;

        if(!name || !description){
            return res.status(400).json({error:"Name and description are required"})
        }

        const existingBrand = await Brand.findOne({ name:{$regex:new RegExp(`^${name}$`,'i')}});
        if (existingBrand) {
            return res.status(409).json({ error: "Brand already exists" });
        }

        const newBrand = new Brand({
            name,
            description
        });

            await newBrand.save();
            return res.status(200).json({ success: true, message: "Brand added successfully" });

    } catch (error) {
        console.log(error.message);
        return res.status(500).json({ error:"Internal server error"})
    }
}

const loadAddBrand = (req,res) => {
    try {
        res.render('add-brand',{
             activePage: "brand"
        });
    }catch (error) {
        console.log(error.message);
        res.redirect('/pageerror');
    }
}

const addBrandOffer = async (req, res) => {
    try {
        const percentage = parseInt(req.body.percentage);
        const brandId = req.body.brandId;
        
        // Validate percentage
        if (percentage < 0 || percentage > 100 || isNaN(percentage)) {
            return res.status(400).json({status: false, message: "Invalid percentage value"});
        }
        
        const brand = await Brand.findById(brandId);
        if (!brand) {
            return res.status(404).json({status: false, message: "Brand not found"});
        }

        const products = await Product.find({brand: brand._id});
        const hasProductOffer = products.some((product) => product.productOffer > percentage);
        
        if (hasProductOffer) {
            return res.json({status: false, message: "Products within this brand already have higher product offers"});
        }

        // Update brand offer
        await Brand.updateOne({_id: brandId}, {$set: {brandOffer: percentage}});

        // Apply brand offer to all products in this brand
        for (const product of products) {
            // Reset product-specific offer
            product.productOffer = 0;
            
            const discountAmount = (product.regularPrice * percentage) / 100;
            product.salePrice = parseFloat((product.regularPrice - discountAmount).toFixed(2));

            await product.save();
        }

        res.json({status: true});
    } catch (error) {
        console.error("Error adding brand offer:", error);
        res.status(500).json({status: false, message: "Internal Server Error"});
    }
};

const removeBrandOffer = async (req, res) => {
    try {
        const brandId = req.body.brandId;
        const brand = await Brand.findById(brandId);

        if (!brand) {
            return res.status(404).json({status: false, message: "Brand not found"});
        }

        const percentage = Brand.brandOffer;
        const products = await Product.find({brand: brand._id});

        if (products.length > 0) {
            for (const product of products) {
                // Reset sale price to regular price since no discount applies now
                product.salePrice = product.regularPrice;
                await product.save();
            }
        }

        // Reset brand offer
        brand.brandOffer = 0;
        await brand.save();
        res.json({status: true});
    } catch (error) {
        console.error("Error removing brand offer:", error);
        res.status(500).json({status: false, message: "Internal Server Error"});
    }
}

// Functions to add to your brandController.js

const deleteBrand = async (req, res) => {
    try {
        const brandId = req.params.id;
        
        const brand = await Brand.findById(brandId);
        if (!brand) {
            return res.status(404).json({ success: false, message: "Brand not found" });
        }

        await Brand.findByIdAndDelete(brandId);

        return res.status(200).json({ success: true, message: "Brand deleted successfully" });
    } catch (error) {
        console.log(error.message);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const brandHasProducts = async (req, res) => {
    try {
        const brandId = req.params.id;
        const count = await Product.countDocuments({ brand: brandId });
        res.json({ hasProducts: count > 0, count });
    } catch (error) {
        console.error('Error checking brand products:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getBrands = async (req, res) => {
    try {
        const brands = await Brand.find({ _id: { $ne: req.params.id } }).select('_id name');
        res.json({ success: true, brands });
    } catch (error) {
        console.error('Error fetching brands:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const loadEditBrand = async (req, res) => {
    try {
        const brandId = req.params.id;
        const brand = await Brand.findById(brandId);
        if (!brand) {
            req.flash('error', 'Brand not found');
            return res.redirect('/admin/brand');
        }
        res.render('edit-brand', {  
            brand, 
            title: 'Edit Brand',
            error: req.flash('error'),
            success: req.flash('success')
        });
    } catch (error) {
        console.error('Error loading edit brand page:', error);
        res.redirect('/admin/brand');
    }
};

const editBrand = async (req, res) => {
    try {
        const brandId = req.params.id;
        const { name, description } = req.body;
        
        // Validate input
        if (!name || !description) {
            req.flash('error', 'Brand name and description are required');
            return res.redirect(`/admin/edit-brand/${brandId}`);
        }
        
        // Check if name already exists (excluding current brand)
        const existingBrand = await Brand.findOne({ 
            name: { $regex: new RegExp(`^${name}$`, 'i') }, 
            _id: { $ne: brandId } 
        });
        
        if (existingBrand) {
            req.flash('error', 'Brand name already exists');
            return res.redirect(`/admin/edit-brand/${brandId}`);
        }
        
        // Update brand
        await Brand.findByIdAndUpdate(brandId, { name, description });
        
        req.flash('success', 'Brand updated successfully');
        res.redirect('/admin/brand');
    } catch (error) {
        console.error('Error updating brand:', error);
        req.flash('error', 'Internal server error');
        res.redirect(`/admin/edit-brand/${req.params.id}`);
    }
};

const getListBrand = async (req,res) =>{
    try {
        
        let id = req.query.id;
        await Brand.updateOne({_id:id},{$set:{isListed:false}});
        res.redirect("/admin/brand");

    } catch (error) {
        
        res.redirect("/pageerror");

    }
}

const getUnlistBrand = async (req,res) =>{
    try {
        
        let id = req.query.id;
        await Brand.updateOne({_id:id},{$set:{isListed:true}});
        res.redirect("/admin/brand");

    } catch (error) {
        
        res.redirect("/pageerror")

    }
}


module.exports = {
    brandInfo,
    addBrand,
    loadAddBrand,
    addBrandOffer,
    removeBrandOffer,
    deleteBrand,
    brandHasProducts,
    getBrands,
    loadEditBrand,
    editBrand,
    getListBrand,
    getUnlistBrand
};