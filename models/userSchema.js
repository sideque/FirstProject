const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      sparse: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    phone: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      default: null,
      trim: true,
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
    },
    googleId: {
      type: String,
      sparse: true,
    },
    password: {
      type: String,
      required: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    cart: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Cart',
      },
    ],
    wallet: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Wallet',
      },
    ],
    orderHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Order',
      },
    ],
    referalCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    redeemed: {
      type: Boolean,
      default: false,
    },
    redeemedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    searchHistory: [
      {
        category: {
          type: Schema.Types.ObjectId,
          ref: 'Category',
        },
        brand: {
          type: String,
        },
        searchOn: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    profileImage: {
      type: String,
      required: false,
      default: '/images/default-profile.webp',
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model('User', userSchema);

module.exports = User;