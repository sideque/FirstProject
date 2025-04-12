const mongoose = require("mongoose");
const {Schema} = mongoose;

const brandSchema = new mongoose.Schema({
    name:{
        type:String,
        required:true,
        unique:true
    },
    description:{
        type:String,
        required:true
    },
    isListed:{
        type:Boolean,
        default:true
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    brandOffer:{
        type:Number,
        default:0
    },
    createdAt:{
        type:Date,
        default:Date.now
    }
})


const Brand = mongoose.model("Brand",brandSchema);
module.exports = Brand;