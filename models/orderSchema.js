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
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    stock: {
      type: Number, 
      required: true
    },
    price: { 
      type: Number, 
      default: 0 
    },
    status: {
      type: String,
      required: true,
      enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Return Request", "Returned"],
      default: "Processing"
    }
  }],
  totalPrice: { 
    type: Number, 
    required: true 
  },
  discount: { 
    type: Number, 
    default: 0 
  },
  shippingCost: {
    type: Number, 
    default: 0 
  },
  taxAmount: { 
    type: Number, 
    default: 0 
  },
  finalAmount: { 
    type: Number, 
    required: true 
  },
  address: {
    name: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    phone: String,
    altPhone: String
  },
  paymentMethod: { type: String },
  paymentStatus: { type: String },
  invoiceDate: { type: Date },
  status: {
    type: String,
    required: true,
    enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Return Request", "Returned"],
    default: "Processing"
  },
  createdOn: { 
    type: Date, 
    default: Date.now, 
    required: true 
  },
  shippedDate: { 
    type: Date 
  },
  deliveredDate: { 
    type: Date 
  },
  trackingId: {  
    type: String 
  },
  couponApplied: { 
    type: Boolean, 
    default: false 
  },
  couponDiscount: { 
    type: Number, 
    default: 0 
  },
  cancelOrReturn: { 
    type: Number, 
    default: 0 
  },
  revokedCoupon: { 
    type: Number, 
    default: 0 
  },
  isReviewed: { 
    type: Boolean, 
    default: false 
  },
  isReturned: { 
    type: Boolean, 
    default: false 
  },
  isReturnRequested: { 
    type: Boolean, 
    default: false 
  },
  returnReason: { 
    type: String 
  },
  cancelReason: { 
    type: String 
  },
  invoice: { 
    type: String 
  }
}, { timestamps: true });

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;