const Offer = require('../../models/offerSchema'); 

const getProductOffers = async (productId, categoryId, brandId) => {
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
      return {
        bestOffer: null,
        allOffers: []
      };
    };

    const percentageOffers = offers.filter(offer => offer.discountType === 'percentage');

    let bestOffer = null;
    for (let offer of percentageOffers) {
      if (!bestOffer || offer.offerAmount > bestOffer.offerAmount) {
        bestOffer = offer;
      }
    }

    return {
      bestOffer: bestOffer,
      allOffers: percentageOffers
    };

  } catch (error) {
    console.error('Error while getting product offers:', error);
    return {
      bestOffer: null,
      allOffers: []
    };
  }
};


module.exports = {
  getProductOffers
};
