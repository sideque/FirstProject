const mongoose = require('mongoose');
const { Schema } = mongoose;

const couponSchema = new mongoose.Schema({
    couponName: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    couponCode: {
        type: String,
        required: true,
        unique: true,
        match: /^[A-Z0-9]{6,10}$/, // Allow 6-10 alphanumeric characters
        trim: true,
    },
    description: {
        type: String,
        required: true,
        trim: true,
    },
    validFrom: {
        type: Date,
        required: true,
    },
    validUpto: {
        type: Date,
        required: true,
    },
    minCartValue: {
        type: Number,
        required: true,
        min: 0,
    },
    offerAmount: {
        type: Number,
        required: true,
        min: 0,
    },
    isList: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Validate that validFrom is before validUpto
couponSchema.pre('save', function (next) {
    if (this.validFrom && this.validUpto && this.validFrom > this.validUpto) {
        return next(new Error('Valid From date must be before Valid Upto date'));
    }
    next();
});

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;