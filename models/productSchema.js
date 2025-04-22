const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema({
    productName: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true
    },
    brand: {
        type: Schema.Types.ObjectId,
        ref: "Brand",
        required: true
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },
    regularPrice: {
        type: Number,
        required: true
    },
    salePrice: {
        type: Number,
        required: true
    },
    productOffer: {
        type: Number,
        default: 0
    },
    quantity: {
        type: Number,
        default: 0
    },
    productImage: {
        type: [String],
        required: true
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ["Available", "out of stock", "Discountinued"],
        required: true,
        default: "Available"
    },
    processor: { 
        type: String,
        default: '' 
    }, // Add processor field
    ram: { 
        type: String, 
        default: '' 
    },      // Add ram field
    storage: { 
        type: String, 
        default: '' 
    },  // Add storage field
    camera: { 
        type: String, 
        default: '' 
    },   // Add camera field
    createdOn: { 
        type: Date, 
        default: Date.now 
    }

    
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);

module.exports = Product;