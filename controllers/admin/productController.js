const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const getProductPage = async (req,res)=>{
    try {
        
        const category = await Category.find({isListed:true});
        const brand = await Brand.find({isBlocked:false});
        res.render("add-product",{
            cat:category,
            brand:brand
        });

    } catch (error) {
        
        res.redirect("/pageerror")

    }
}
const getProductAddPage = async (req,res)=>{
    try {
        
        const category = await Category.find({isListed:true});
        const brand = await Brand.find({isBlocked:false});
        res.render("product",{
            cat:category,
            brand:brand
        });

    } catch (error) {
        
        res.redirect("/pageerror")

    }
}


module.exports = {
    getProductAddPage,
    getProductPage
}