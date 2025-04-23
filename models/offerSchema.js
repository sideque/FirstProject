const mongoose = require('mongoose');
const { Schema } = mongoose;

const offerSchema = new Schema({
  offerName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  discountType: {
    type: String,
    enum: 'percentage',
    required: true
  },
  offerAmount: {
    type: Number,
    required: true,
    min: 0
  },
  validFrom: {
    type: Date,
    required: true
  },
  validUpto: {
    type: Date,
    required: true
  },
  offerType: {
    type: String,
    enum: ['Product', 'Category', 'Brand'],
    required: true
  },
  applicableTo: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'offerTypeRef'
  },
  offerTypeRef: {
    type: String,
    required: true,
    enum: ['Product', 'Category', 'Brand']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isList: {
    type: Boolean,
    default: true
  }
});

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;