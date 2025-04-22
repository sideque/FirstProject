const Coupons = require('../../models/couponSchema');
const Categories = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const Product = require('../../models/productSchema');
const Offer = require('../../models/offerSchema');
const adminController = require("./adminController");
const Coupon = require('../../models/couponSchema');
const { success } = require('../user/checkoutController');

const loadCoupon = async (req,res)=>{

    try {

        const adminCoupon = await adminController.getAdminData(req);
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 5;

        let query = {isList:true,};
        if (search) {
            query = {
                isList:true,
                $or: [
                    { couponName: { $regex: new RegExp(search, "i") } },
                    { couponCode: { $regex: new RegExp(search, "i") } }
                ]
            }
        }

        const totalCoupons = await Brand.countDocuments(query);
        const totalPages = Math.ceil(totalCoupons / limit);

        const maxPagesToShow = 5;
        let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        const coupons = await Coupon.find(query)
            .sort({ createdOn: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

            console.log(coupons)

        return res.render("coupons", { 
            coupons, 
            totalPages, 
            currentPage: page,
            totalPages,
            totalCoupons,
            search,
            startPage,
            endPage,
            adminCoupon
        });

    } catch (error) {
        
        console.error(error)
        return res.redirect("/admin/pageerror")
    }

};


const addingCoupon = async (req,res)=>{
    try {
        const couponData = req.body

        if(!couponData){
            return res.json({success:false, message:'Data not found'})
        }

        const existingCoupon = await Coupon.findOne({
            $or: [
              { couponName: couponData.couponName },
              { couponCode: couponData.couponCode }
            ]
          });
          
          if (existingCoupon) {
            return res.json({
              success: false,
              message: 'Coupon name or code already exists'
            });
          }


          console.log("couponData.couponName",couponData.couponName);
          

          
        const newCoupon = new Coupon({
            couponName:couponData.couponName,
            couponCode:couponData.couponCode,
            description:couponData.description,
            validFrom:couponData.validFrom,
            validUpto:couponData.validUpto,
            minCartValue:couponData.minCartValue,
            offerAmount:couponData.offerAmount
        })

        await newCoupon.save()

        return res.json({success:true, message:'Coupon Added Successfully',newCoupon})
        
    } catch (error) {
        console.error(error)
        return res.redirect('/admin/pageerror')
    }
}

module.exports = {

    loadCoupon,
    addingCoupon
    
}