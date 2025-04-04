const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");

const brandInfo = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const brandData = await Brand.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalBrand = await Brand.countDocuments();
        const totalPages = Math.ceil(totalBrand / limit);

        res.render("brand", {
            brands: brandData, 
            currentPage: page,        
            totalPages: totalPages,
            totalBrand: totalBrand,
            activePage: "brand"
        });
    } catch (error) {
        console.error(error);
        res.redirect("/pageerror");
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
                
                // Apply brand discount to regular price
                product.salePrice = product.regularPrice - Math.floor(product.regularPrice * (percentage/100));
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
        
        // Handle both DELETE and POST methods
        const fallbackBrandId = req.body?.fallbackBrand;
        const deleteProducts = req.body?.deleteProducts === true || req.body?.deleteProducts === 'true';
        
        // Find the brand
        const brand = await Brand.findById(brandId);
        
        if (!brand) {
            if (req.xhr) {
                return res.status(404).json({ success: false, message: 'Brand not found' });
            }
            req.flash('error', 'Brand not found');
            return res.redirect('/admin/brand');
        }
        
        // Find associated products
        const associatedProducts = await Product.find({ brand: brandId });
        
        if (associatedProducts.length > 0) {
            // If fallback brand provided, reassign products
            if (fallbackCategoryId && !deleteProducts) {
                // Verify fallback brand exists
                const fallbackBrand = await Brand.findById(fallbackBrandId);
                if (!fallbackBrand) {
                    if (req.xhr) {
                        return res.status(404).json({ success: false, message: 'Fallback brand not found' });
                    }
                    req.flash('error', 'Fallback brand not found');
                    return res.redirect('/admin/brand');
                }
                
                // Reassign products to fallback brand
                await Product.updateMany(
                    { brand: brandId },
                    { $set: { brand: fallbackBrandId } }
                );
            } 
            // If deleteProducts flag is true, delete all associated products
            else if (deleteProducts) {
                // for (const product of associatedProducts) {
                //     // Delete the product
                //     await Product.findByIdAndDelete(product._id);
                // }
                await Promise.all(
                    associatedProducts.map(product => Product.findByIdAndDelete(product._id))
                );
                
            } 
            // If no fallback category and not deleting products, prevent deletion
            else {
                if (req.xhr) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Cannot delete brnad with associated products. Please reassign or delete products first.' 
                    });
                }
                req.flash('error', 'Cannot delete brand with associated products. Please reassign or delete products first.');
                return res.redirect('/admin/brand');
            }
        }
        
        // Remove any brand offers (similar to your removeBrandOffer function)
        if (brand.brandOffer > 0) {
            // Reset product prices if needed
            for (const product of associatedProducts) {
                if (!deleteProducts) { // Only update if not deleting products
                    product.salePrice = product.regularPrice;
                    await product.save();
                }
            }
        }
        
        // Delete the brand
        await Brand.findByIdAndDelete(brandId);
        
        if (req.xhr) {
            return res.json({ success: true, message: 'Brand deleted successfully' });
        }
        
        req.flash('success', 'Brand deleted successfully');
        res.redirect('/admin/brand');
        
    } catch (error) {
        console.error('Error deleting brand:', error);
        
        if (req.xhr) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        
        req.flash('error', 'Internal server error');
        res.redirect('/admin/brand');
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
// Update your module.exports
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