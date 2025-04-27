const mongoose = require("mongoose");
const Offer = require('../../models/offerSchema');
const User = require('../../models/userSchema');

const getProductOffers= async (productId, categoryId, brandId) => {
    try {
      const currentDate = new Date();
      const offers = await Offer.find({
        isList: true,
        validFrom: { $lte: currentDate },
        validUpto: { $gte: currentDate },
        $or: [
          { offerType: 'Product', applicableTo: productId },
          { offerType: 'Category', applicableTo: categoryId },
          { offerType: 'Brand', applicableTo: brandId },
        ],
      });
  
      if (!offers || offers.length === 0) {
        return { bestOffer: null, allOffers: [] };
      }
  
      const validOffers = offers.filter(offer => offer.discountType === 'percentage');
      const bestOffer = validOffers.reduce((prev, curr) => {
        return (!prev || curr.offerAmount > prev.offerAmount) ? curr : prev;
      }, null);
  
      return {
        bestOffer,
        allOffers: validOffers,
      };
    } catch (error) {
      console.error('Error fetching product offers:', error);
      return { bestOffer: null, allOffers: [] };
    }
  };
  
  module.exports = { getProductOffers };