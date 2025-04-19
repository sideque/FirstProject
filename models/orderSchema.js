// const mongoose = require("mongoose");
// const {Schema} = mongoose;
// const {v4:uuidv4} = require('uuid');

// const orderSchema = new Schema({
//     orderId:{
//         type:String,
//         default:()=>uuidv4(),
//         unique:true
//     },
//     orderItems:[{
//        product:{
//         type:Schema.Types.ObjectId,
//         ref:"Product",
//         required:true
//        },
//        stock:{
//         type:Number,
//         required:true
//        },
//        price:{
//         type:Number,
//         default:0
//        }
//     }],
//         totalPrice:{
//             type:Number,
//             required:true
//         },
//         discount:{
//             type:Number,
//             default:0
//         },
//         finalAmount:{
//             type:Number,
//             required:true
//         },
//         address:{
//             type:Schema.Types.ObjectId,
//             ref:"User",
//             required:true
//         },
//         invoiceDate:{
//             type:Date
//         },
//         status:{
//             type:String,
//             required:true,
//             enum:["Pending","Processing","Shipped","Delivered","Cancelled","Return Request","Returned"]
//         },
//         createdOn:{
//             type:Date,
//             default:Date.now,
//             required:true
//         },
//         couponApplied:{
//             type:Boolean,
//             default:false
//         },
        
// }, {timestamps:true});

// const Order = mongoose.model("Order",orderSchema);
// module.exports = Order;

const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new Schema({
  orderId: {
    type: String,
    default: () => uuidv4(),
    unique: true
  },
  userId: { // Add userId field
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  orderItems: [{
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    stock: { type: Number, required: true },
    price: { type: Number, default: 0 }
  }],
  totalPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  finalAmount: { type: Number, required: true },
  address: { // Reference Address model
    type: Schema.Types.ObjectId,
    ref: "Address",
    required: true
  },
  // Alternative: Embed address details
  // address: {
  //   name: String,
  //   addressLine1: String,
  //   addressLine2: String,
  //   city: String,
  //   state: String,
  //   pincode: String,
  //   phone: String,
  //   addressType: String
  // },
  invoiceDate: { type: Date },
  status: {
    type: String,
    required: true,
    enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Return Request", "Returned"]
  },
  createdOn: { type: Date, default: Date.now, required: true },
  couponApplied: { type: Boolean, default: false }
}, { timestamps: true });

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;