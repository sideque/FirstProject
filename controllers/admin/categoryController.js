const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const adminController = require('./adminController');

const categoryInfo = async (req, res) => {
    try {
        // Get admin user data
        const adminUser = await adminController.getAdminData(req);

        // Get search and pagination parameters
        const search = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 5;

        // Build search query
        let query = { isDeleted: false };
        if (search) {
            query = {
                isDeleted: false,
                $or: [
                    { name: { $regex: new RegExp(search, 'i') } },
                    { description: { $regex: new RegExp(search, 'i') } }
                ]
            };
        }

        // Get total count for pagination
        const totalCategories = await Category.countDocuments(query);
        const totalPages = Math.ceil(totalCategories / limit);

        // Calculate pagination values
        const maxPagesToShow = 5;
        let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        // Get categories with pagination and sorting
        const categories = await Category.find(query)
            .sort({ name: 1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.render("category", {
            categories,
            currentPage: page,
            totalPages,
            totalCategories,
            search,
            startPage,
            endPage,
            adminUser
        });
    } catch (error) {
        console.log(error.message);
        res.redirect('/admin/pageerror');
    }
};

const addCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name || !description) {
            return res.status(400).json({ error: "Name and description are required" })
        }

        const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists" });
        }

        const newCategory = new Category({
            name,
            description
        });

        await newCategory.save();
        return res.status(200).json({ success: true, message: "Category added successfully" });

    } catch (error) {
        console.log(error.message);
        return res.status(500).json({ error: "Internal server error" })
    }
};

const loadAddCategory = (req, res) => {
    try {
        res.render('add-category', {
            activePage: "category"
        });
    } catch (error) {
        console.log(error.message);
        res.redirect('/admin/pageerror');
    }
};

const addCategoryOffer = async (req, res) => {
    try {
        const percentage = parseInt(req.body.percentage);
        const categoryId = req.body.categoryId;

        // Validate percentage
        if (percentage < 0 || percentage > 100 || isNaN(percentage)) {
            return res.status(400).json({ status: false, message: "Invalid percentage value" });
        }

        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ status: false, message: "Category not found" });
        }

        const products = await Product.find({ category: category._id });
        const hasProductOffer = products.some((product) => product.productOffer > percentage);

        if (hasProductOffer) {
            return res.json({ status: false, message: "Products within this category already have higher product offers" });
        }

        // Update category offer
        await Category.updateOne({ _id: categoryId }, { $set: { categoryOffer: percentage } });

        // Apply category offer to all products in this category
        for (const product of products) {
            // Reset product-specific offer
            product.productOffer = 0;

            // Apply category discount to regular price
            product.salePrice = product.regularPrice - Math.floor(product.regularPrice * (percentage / 100));
            await product.save();
        }

        res.json({ status: true });
    } catch (error) {
        console.error("Error adding category offer:", error);
        res.status(500).json({ status: false, message: "Internal Server Error" });
    }
};

const removeCategoryOffer = async (req, res) => {
    try {
        const categoryId = req.body.categoryId;
        const category = await Category.findById(categoryId);

        if (!category) {
            return res.status(404).json({ status: false, message: "Category not found" });
        }

        const percentage = category.categoryOffer;
        const products = await Product.find({ category: category._id });

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
        res.json({ status: true });
    } catch (error) {
        console.error("Error removing category offer:", error);
        res.status(500).json({ status: false, message: "Internal Server Error" });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;

        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        await Category.findOneAndUpdate({ _id: categoryId }, { $set: { isDeleted: true } })

        return res.status(200).json({ success: true, message: "Category deleted successfully" });
    } catch (error) {
        console.log(error.message);
        return res.status(500).json({ success: false, message: "Internal server error" });
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
        res.render('edit-category', {
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

const getListCategory = async (req, res) => {
    try {

        let id = req.query.id;
        await Category.updateOne({ _id: id }, { $set: { isListed: false } });
        res.redirect("/admin/category");

    } catch (error) {

        res.redirect("/admin/pageerror");

    }
};

const getUnlistCategory = async (req, res) => {
    try {

        let id = req.query.id;
        await Category.updateOne({ _id: id }, { $set: { isListed: true } });
        res.redirect("/admin/category");

    } catch (error) {

        res.redirect("/admin/pageerror")

    }
};

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