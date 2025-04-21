// // const mongoose = require("mongoose");
// // const {Schema} = mongoose;
// // const {v4:uuidv4} = require('uuid');

// // const orderSchema = new Schema({
// //     orderId:{
// //         type:String,
// //         default:()=>uuidv4(),
// //         unique:true
// //     },
// //     orderItems:[{
// //        product:{
// //         type:Schema.Types.ObjectId,
// //         ref:"Product",
// //         required:true
// //        },
// //        stock:{
// //         type:Number,
// //         required:true
// //        },
// //        price:{
// //         type:Number,
// //         default:0
// //        }
// //     }],
// //         totalPrice:{
// //             type:Number,
// //             required:true
// //         },
// //         discount:{
// //             type:Number,
// //             default:0
// //         },
// //         finalAmount:{
// //             type:Number,
// //             required:true
// //         },
// //         address:{
// //             type:Schema.Types.ObjectId,
// //             ref:"User",
// //             required:true
// //         },
// //         invoiceDate:{
// //             type:Date
// //         },
// //         status:{
// //             type:String,
// //             required:true,
// //             enum:["Pending","Processing","Shipped","Delivered","Cancelled","Return Request","Returned"]
// //         },
// //         createdOn:{
// //             type:Date,
// //             default:Date.now,
// //             required:true
// //         },
// //         couponApplied:{
// //             type:Boolean,
// //             default:false
// //         },
        
// // }, {timestamps:true});

// // const Order = mongoose.model("Order",orderSchema);
// // module.exports = Order;

// const mongoose = require("mongoose");
// const { Schema } = mongoose;
// const { v4: uuidv4 } = require('uuid');

// const orderSchema = new Schema({
//   orderId: {
//     type: String,
//     default: () => uuidv4(),
//     unique: true
//   },
//   userId: { // Add userId field
//     type: Schema.Types.ObjectId,
//     ref: "User",
//     required: true
//   },
//   orderItems: [{
//     product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
//     stock: { type: Number, required: true },
//     price: { type: Number, default: 0 }
//   }],
//   totalPrice: { type: Number, required: true },
//   discount: { type: Number, default: 0 },
//   finalAmount: { type: Number, required: true },
//   address: { // Reference Address model
//     type: Schema.Types.ObjectId,
//     ref: "Address",
//     required: true
//   },
//   // Alternative: Embed address details
//   // address: {
//   //   name: String,
//   //   addressLine1: String,
//   //   addressLine2: String,
//   //   city: String,
//   //   state: String,
//   //   pincode: String,
//   //   phone: String,
//   //   addressType: String
//   // },
//   invoiceDate: { type: Date },
//   status: {
//     type: String,
//     required: true,
//     enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Return Request", "Returned"]
//   },
//   createdOn: { type: Date, default: Date.now, required: true },
//   couponApplied: { type: Boolean, default: false }
// }, { timestamps: true });

// const Order = mongoose.model("Order", orderSchema);
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
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  orderItems: [{
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    stock: { type: Number, required: true },
    price: { type: Number, default: 0 },
    status: {
      type: String,
      required: true,
      enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Return Request", "Returned"],
      default: "Processing" // Changed to Processing to fix cancel button
    }
  }],
  totalPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  shippingCost: { type: Number, default: 0 }, // Added for order summary
  taxAmount: { type: Number, default: 0 }, // Added for order summary
  finalAmount: { type: Number, required: true },
  address: { // Changed to embedded address for consistency with order-details.ejs
    name: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    phone: String,
    altPhone: String
  },
  paymentMethod: { type: String }, // Added for payment info
  paymentStatus: { type: String }, // Added for payment info
  invoiceDate: { type: Date },
  status: {
    type: String,
    required: true,
    enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Return Request", "Returned"],
    default: "Processing" // Changed to Processing to fix cancel button
  },
  createdOn: { type: Date, default: Date.now, required: true },
  shippedDate: { type: Date }, // Added for tracking
  deliveredDate: { type: Date }, // Added for tracking
  trackingId: { type: String }, // Added for tracking
  couponApplied: { type: Boolean, default: false },
  isReviewed: { type: Boolean, default: false }, // Added for review option
  isReturned: { type: Boolean, default: false }, // Added for return
  isReturnRequested: { type: Boolean, default: false }, // Added for return
  returnReason: { type: String }, // Added for return
  cancelReason: { type: String }, // Added for cancellation
  invoice: { type: String } // Path or URL to invoice PDF
}, { timestamps: true });

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;