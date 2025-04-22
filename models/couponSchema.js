const mongoose = require('mongoose')
const {Schema}  = mongoose

const couponSchema = new mongoose.Schema({
    couponName:{
        type:String,
        required:true,
        unique:true
    },
    couponCode:{
        type:String,
        required:true
    },
    description:{
        type:String,
        required:true,
    },
    validFrom:{
        type:Date,
        required:true
    },
    validUpto:{
        type:Date,
        required:true
    },
    minCartValue:{
        type:Number,
        required:false
    },
    offerAmount:{
        type:Number,
        required:false
    },
    isList:{
        type:Boolean,
        default:true
    },
    createdAt:{
        type:Date,
        default:Date.now()
    }
})

const Coupon = mongoose.model("Coupon",couponSchema);

module.exports = Coupon;