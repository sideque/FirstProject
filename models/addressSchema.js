const mongoose = require("mongoose");
const {Schema} = mongoose;

const addressSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    address: [{
        addressType: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        phone: {
            type: String,
            required: true
        },
        altPhone: String,
        addressLine1: {
            type: String,
            required: true
        },
        addressLine2: String,
        landMark: String,
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        pincode: {
            type: String,
            required: true
        },
        isDefault: {
            type: Boolean,
            default: false
        }
    }]
}, {
    timestamps: true
});


const Address = mongoose.model("Address", addressSchema);
module.exports = Address;