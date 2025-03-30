const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");

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
            res.render('add-category');
        }catch (error) {
            console.log(error.message);
            res.redirect('/pageerror');
        }
    }

module.exports = {
    categoryInfo,
    addCategory,
    loadAddCategory
}