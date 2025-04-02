const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");

const categoryInfo = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const categoryData = await Category.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories / limit);

        res.render("category", {
            categories: categoryData, 
            currentPage: page,        
            totalPages: totalPages,
            totalCategories: totalCategories,
            activePage: "category"
        });
    } catch (error) {
        console.error(error);
        res.redirect("/pageerror");
    }
};
    const addCategory = async (req,res) => {
        try {
            const { name,description } = req.body;

            if(!name || !description){
                return res.status(400).json({error:"Name and description are required"})
            }

            const existingCategory = await Category.findOne({ name:{$regex:new RegExp(`^${name}$`,'i')}});
            if (existingCategory) {
                return res.status(409).json({ error: "Category already exists" });
            }

            const newCategory = new Category({
                name,
                description
            });

                await newCategory.save();
                return res.status(200).json({ success: true, message: "Category added successfully" });

        } catch (error) {
            console.log(error.message);
            return res.status(500).json({ error:"Internal server error"})
        }
    }
    const loadAddCategory = (req,res) => {
        try {
            res.render('add-category',{
                 activePage: "category"
            });
        }catch (error) {
            console.log(error.message);
            res.redirect('/pageerror');
        }
    }


    const addCategoryOffer = async (req, res) => {
        try {
            const percentage = parseInt(req.body.percentage);
            const categoryId = req.body.categoryId;
            
            // Validate percentage
            if (percentage < 0 || percentage > 100 || isNaN(percentage)) {
                return res.status(400).json({status: false, message: "Invalid percentage value"});
            }
            
            const category = await Category.findById(categoryId);
            if (!category) {
                return res.status(404).json({status: false, message: "Category not found"});
            }
    
            const products = await Product.find({category: category._id});
            const hasProductOffer = products.some((product) => product.productOffer > percentage);
            
            if (hasProductOffer) {
                return res.json({status: false, message: "Products within this category already have higher product offers"});
            }
    
            // Update category offer
            await Category.updateOne({_id: categoryId}, {$set: {categoryOffer: percentage}});
    
            // Apply category offer to all products in this category
            for (const product of products) {
                // Reset product-specific offer
                product.productOffer = 0;
                
                // Apply category discount to regular price
                product.salePrice = product.regularPrice - Math.floor(product.regularPrice * (percentage/100));
                await product.save();
            }
    
            res.json({status: true});
        } catch (error) {
            console.error("Error adding category offer:", error);
            res.status(500).json({status: false, message: "Internal Server Error"});
        }
    };
    
    const removeCategoryOffer = async (req, res) => {
        try {
            const categoryId = req.body.categoryId;
            const category = await Category.findById(categoryId);
    
            if (!category) {
                return res.status(404).json({status: false, message: "Category not found"});
            }
    
            const percentage = category.categoryOffer;
            const products = await Product.find({category: category._id});
    
            if (products.length > 0) {
                for (const product of products) {
                    // Reset sale price to regular price since no discount applies now
                    product.salePrice = product.regularPrice;
                    await product.save();
                }
            }
    
            // Reset category offer
            category.categoryOffer = 0;
            await category.save();
            res.json({status: true});
        } catch (error) {
            console.error("Error removing category offer:", error);
            res.status(500).json({status: false, message: "Internal Server Error"});
        }
    }

    // Functions to add to your categoryController.js

const deleteCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        
        // Handle both DELETE and POST methods
        const fallbackCategoryId = req.body?.fallbackCategory;
        const deleteProducts = req.body?.deleteProducts === true || req.body?.deleteProducts === 'true';
        
        // Find the category
        const category = await Category.findById(categoryId);
        
        if (!category) {
            if (req.xhr) {
                return res.status(404).json({ success: false, message: 'Category not found' });
            }
            req.flash('error', 'Category not found');
            return res.redirect('/admin/category');
        }
        
        // Find associated products
        const associatedProducts = await Product.find({ category: categoryId });
        
        if (associatedProducts.length > 0) {
            // If fallback category provided, reassign products
            if (fallbackCategoryId && !deleteProducts) {
                // Verify fallback category exists
                const fallbackCategory = await Category.findById(fallbackCategoryId);
                if (!fallbackCategory) {
                    if (req.xhr) {
                        return res.status(404).json({ success: false, message: 'Fallback category not found' });
                    }
                    req.flash('error', 'Fallback category not found');
                    return res.redirect('/admin/category');
                }
                
                // Reassign products to fallback category
                await Product.updateMany(
                    { category: categoryId },
                    { $set: { category: fallbackCategoryId } }
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
                        message: 'Cannot delete category with associated products. Please reassign or delete products first.' 
                    });
                }
                req.flash('error', 'Cannot delete category with associated products. Please reassign or delete products first.');
                return res.redirect('/admin/category');
            }
        }
        
        // Remove any category offers (similar to your removeCategoryOffer function)
        if (category.categoryOffer > 0) {
            // Reset product prices if needed
            for (const product of associatedProducts) {
                if (!deleteProducts) { // Only update if not deleting products
                    product.salePrice = product.regularPrice;
                    await product.save();
                }
            }
        }
        
        // Delete the category
        await Category.findByIdAndDelete(categoryId);
        
        if (req.xhr) {
            return res.json({ success: true, message: 'Category deleted successfully' });
        }
        
        req.flash('success', 'Category deleted successfully');
        res.redirect('/admin/category');
        
    } catch (error) {
        console.error('Error deleting category:', error);
        
        if (req.xhr) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        
        req.flash('error', 'Internal server error');
        res.redirect('/admin/category');
    }
};

const categoryHasProducts = async (req, res) => {
    try {
        const categoryId = req.params.id;
        const count = await Product.countDocuments({ category: categoryId });
        res.json({ hasProducts: count > 0, count });
    } catch (error) {
        console.error('Error checking category products:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getCategories = async (req, res) => {
    try {
        const categories = await Category.find({ _id: { $ne: req.params.id } }).select('_id name');
        res.json({ success: true, categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const loadEditCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        const category = await Category.findById(categoryId);
        if (!category) {
            req.flash('error', 'Category not found');
            return res.redirect('/admin/category');
        }
        res.render('edit-category', {  // Remove 'admin/' prefix
            category, 
            title: 'Edit Category',
            error: req.flash('error'),
            success: req.flash('success')
        });
    } catch (error) {
        console.error('Error loading edit category page:', error);
        res.redirect('/admin/category');
    }
};

const editCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        const { name, description } = req.body;
        
        // Validate input
        if (!name || !description) {
            req.flash('error', 'Category name and description are required');
            return res.redirect(`/admin/edit-category/${categoryId}`);
        }
        
        // Check if name already exists (excluding current category)
        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${name}$`, 'i') }, 
            _id: { $ne: categoryId } 
        });
        
        if (existingCategory) {
            req.flash('error', 'Category name already exists');
            return res.redirect(`/admin/edit-category/${categoryId}`);
        }
        
        // Update category
        await Category.findByIdAndUpdate(categoryId, { name, description });
        
        req.flash('success', 'Category updated successfully');
        res.redirect('/admin/category');
    } catch (error) {
        console.error('Error updating category:', error);
        req.flash('error', 'Internal server error');
        res.redirect(`/admin/edit-category/${req.params.id}`);
    }
};

const getListCategory = async (req,res) =>{
    try {
        
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:false}});
        res.redirect("/admin/category");

    } catch (error) {
        
        res.redirect("/pageerror");

    }
}

    const getUnlistCategory = async (req,res) =>{
        try {
            
            let id = req.query.id;
            await Category.updateOne({_id:id},{$set:{isListed:true}});
            res.redirect("/admin/category");

        } catch (error) {
            
            res.redirect("/pageerror")

        }
    }
// Update your module.exports
module.exports = {
    categoryInfo,
    addCategory,
    loadAddCategory,
    addCategoryOffer,
    removeCategoryOffer,
    deleteCategory,
    categoryHasProducts,
    getCategories,
    loadEditCategory,
    editCategory,
    getListCategory,
    getUnlistCategory
};