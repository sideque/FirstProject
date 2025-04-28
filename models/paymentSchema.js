const mongoose = require('mongoose');
const { Schema } = mongoose;

const paymentMethodSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  type: {
    type: String, 
    enum: ['credit-card', 'paypal', 'bank'], 
    required: true 
  },
  details: {
    type: String,
    required: true 
  },
  isDefault: {
    type: Boolean, 
    default: false 
    },
});

const Payment = mongoose.model('Payment', paymentMethodSchema);  

module.exports = Payment;
