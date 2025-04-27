const cron = require('node-cron');
const Offer = require('../../models/offerSchema');

const disableExpiredOffers = async () => {
    try {
        const currentDate = new Date();
        const result = await Offer.updateMany(
            { validUpto: { $lt: currentDate }, isList: true },
            { $set: { isList: false } }
        );
        console.log(`Disabled ${result.modifiedCount} expired offers at ${new Date().toISOString()}`);
    } catch (error) {
        console.error('Error disabling expired offers:', error);
    }
};

// Schedule to run every day at midnight (IST)
cron.schedule('0 0 * * *', disableExpiredOffers, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
});

module.exports = { disableExpiredOffers };