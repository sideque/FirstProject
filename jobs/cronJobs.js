const cron = require('node-cron');
const Offer = require("../models/offerSchema");
const Order = require("../models/orderSchema");

// Function to disable expired offers
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

const updatePendingOrders = async () => {
    try {
        console.log('Running Pending order status update check...');
        const pendingOrders = await Order.find({ status: 'Pending' });

        const currentTime = new Date();
        const thirtyMinutesInMs = 30 * 60 * 1000; // 30 minutes in milliseconds

        for (const order of pendingOrders) {
            const timeDifference = currentTime - new Date(order.createdOn);

            
            if (timeDifference > thirtyMinutesInMs) {
                if (order.paymentStatus === 'Completed') {
                    order.status = 'Processing';
                } else {
                    order.status = 'Cancelled';
                    order.cancelReason = 'Payment not completed within 30 minutes';
                }

  
                order.orderItems.forEach((item) => {
                    if (item.status === 'Pending') {
                        item.status = order.status; // Set to 'Processing' or 'Cancelled'
                        if (order.status === 'Cancelled') {
                            item.cancelReason = 'Payment not completed within 30 minutes';
                        }
                    }
                });

                await order.save();
                console.log(`Updated order ${order.orderId} to status: ${order.status}`);
            }
        }
    } catch (error) {
        console.error('Error in updatePendingOrders cron job:', error);
    }
};

const scheduleCronJobs = () => {
    cron.schedule('* * * * *', async () => {
        await disableExpiredOffers();
        await updatePendingOrders();
    }, {
        scheduled: true,
        timezone: 'Asia/Kolkata'
    });
    console.log('Scheduled cron jobs to run every minute');
};

module.exports = { 
    disableExpiredOffers, 
    updatePendingOrders, 
    scheduleCronJobs 
};