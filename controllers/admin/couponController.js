const express = require("express");
const router = express.Router();
const mongoose = require('mongoose');
const Coupon = require('../../models/couponSchema');
const adminController = require("./adminController");

const loadCoupon = async (req, res) => {
    try {
        const adminCoupon = await adminController.getAdminData(req);
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const listingStatus = req.query.status === 'unlisted' ? false : true; // Filter by listing status

        let query = { isList: listingStatus };
        if (search) {
            query = {
                isList: listingStatus,
                $or: [
                    { couponName: { $regex: new RegExp(search, "i") } },
                    { couponCode: { $regex: new RegExp(search, "i") } }
                ]
            };
        }

        const totalCoupons = await Coupon.countDocuments(query);
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

        return res.render("coupons", { 
            coupons, 
            totalPages, 
            currentPage: page,
            totalPages,
            totalCoupons,
            search,
            startPage,
            endPage,
            adminCoupon,
            listingStatus // Pass the current listing status to the frontend
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const addingCoupon = async (req, res) => {
    try {
        const couponData = req.body;

        if (!couponData) {
            return res.status(400).json({ success: false, message: 'Data not found' });
        }

        const existingCoupon = await Coupon.findOne({
            $or: [
                { couponName: couponData.couponName },
                { couponCode: couponData.couponCode }
            ]
        });
        
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: 'Coupon name or code already exists'
            });
        }

        const newCoupon = new Coupon({
            couponName: couponData.couponName,
            couponCode: couponData.couponCode,
            description: couponData.description,
            validFrom: couponData.validFrom,
            validUpto: couponData.validUpto,
            minCartValue: couponData.minCartValue,
            offerAmount: couponData.offerAmount
        });

        await newCoupon.save();

        return res.status(200).json({ success: true, message: 'Coupon Added Successfully', newCoupon });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const couponListing = async (req, res) => {
    try {
        const listingStatus = req.query.status === 'unlisted' ? false : true;
        const coupons = await Coupon.find({ isList: listingStatus })
            .sort({ createdOn: -1 });

        return res.status(200).json({
            success: true,
            data: coupons
        });
    } catch (error) {
        console.error('Error fetching coupons by listing status:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getEditData = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid coupon ID' });
        }

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        res.status(200).json({ success: true, data: coupon });
    } catch (error) {
        console.error('Error fetching coupon:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const updateCoupon = async (req, res) => {
    try {
        const { couponId, couponName, couponCode, description, validFrom, validUpto, minCartValue, offerAmount } = req.body;

        if (!couponId || !couponName || !couponCode || !description || !validFrom || !validUpto) {
            return res.status(400).json({ success: false, message: 'Required fields are missing' });
        }

        if (!/^[A-Z0-9]{6}$/.test(couponCode)) {
            return res.status(400).json({ success: false, message: 'Coupon code must be 6 alphanumeric characters' });
        }

        const fromDate = new Date(validFrom);
        const toDate = new Date(validUpto);
        if (isNaN(fromDate) || isNaN(toDate)) {
            return res.status(400).json({ success: false, message: 'Invalid date format' });
        }

        if (minCartValue !== undefined && minCartValue < 0) {
            return res.status(400).json({ success: false, message: 'Minimum cart value must be non-negative' });
        }
        if (offerAmount !== undefined && offerAmount < 0) {
            return res.status(400).json({ success: false, message: 'Offer amount must be non-negative' });
        }

        const existingCoupon = await Coupon.findOne({
            _id: { $ne: couponId },
            $or: [{ couponName }, { couponCode }],
        });

        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: existingCoupon.couponName === couponName ? 'Coupon name already exists' : 'Coupon code already exists',
            });
        }

        const updateData = {
            couponName,
            couponCode,
            description,
            validFrom: fromDate,
            validUpto: toDate,
        };
        if (minCartValue !== undefined) updateData.minCartValue = Number(minCartValue);
        if (offerAmount !== undefined) updateData.offerAmount = Number(offerAmount);

        const updatedCoupon = await Coupon.findByIdAndUpdate(couponId, updateData, {
            new: true,
            runValidators: true,
        });

        if (!updatedCoupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        res.status(200).json({ success: true, message: 'Coupon updated successfully', data: updatedCoupon });
    } catch (error) {
        console.error('Error updating coupon:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
};

const toggleCouponStatus = async (req, res) => {
    try {
        const { couponId } = req.params;
        const action = req.url.includes('list') ? true : false;

        if (!mongoose.Types.ObjectId.isValid(couponId)) {
            return res.status(400).json({ success: false, message: 'Invalid coupon ID' });
        }

        const coupon = await Coupon.findById(couponId);
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        coupon.isList = action;
        await coupon.save();

        res.status(200).json({
            success: true,
            message: `Coupon ${action ? 'listed' : 'unlisted'} successfully`,
        });
    } catch (error) {
        console.error('Error toggling coupon status:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    loadCoupon,
    addingCoupon,
    couponListing,
    getEditData,
    updateCoupon,
    toggleCouponStatus,
};