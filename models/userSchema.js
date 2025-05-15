const mongoose = require('mongoose');
const {Schema} = mongoose;

const userSchema = new Schema({
    name:{
        type:String,
        required:true
    },
    username:{
        type:String,
        unique:true
    },
    email:{
        type : String,
        required:true,
        unique:true,
    },
    phone:{
        type:String,
        required:false,  
        unique:true,
        sparse:true, 
        default:null
    },
    gender: { type: String, enum: ["Male", "Female", "Other"] },
    googleId :{
        type:String,
        unique:true,
    },
    password:{
        type:String,
        require:false 
    },
    isBlocked :{
        type:Boolean,
        default:false
    },
    isAdmin : {
        type:Boolean,
        default:false
    },
    cart : [{
        type:Schema.Types.ObjectId,
        ref:"Cart",
    }],
    wallet : [{
        type:Schema.Types.ObjectId,
        ref:"Wishlist"
    }],
    orderHistory:[{
        type:Schema.Types.ObjectId,
        ref:"Order"
    }],
    createdOn : {
        type:Date,
        default:Date.now
    },
    referalCode:{
        type:String,
        unique: true,
        sparse: true
    },
    redeemed:{
        type:Boolean
    },
    redeemedUsers: [{
        type:Schema.Types.ObjectId,
        ref:"User"
    }],
    searchHistory : [{
        category:{
            type:Schema.Types.ObjectId,
            ref:"Category",
        },
        brand:{
            type:String
        },
        searchOn :{
            type:Date,
            default:Date.now
        }
    }],
    profileImage: { 
        type: String,
        required: false,
        default: null
    },
    createdAt:{
        type:Date,
        default:Date.now
    },
},{
    timestamps: true
});

const User = mongoose.model("User",userSchema);

module.exports = User;