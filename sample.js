const mongoose = require('mongoose');
const User = require('./models/userSchema'); // adjust path if needed
require('dotenv').config();

function generateReferralCode(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

async function assignReferralCodes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const users = await User.find({ referralCode: { $exists: false } }); // only update users without a referralCode

        for (let user of users) {
            let newCode;
            let exists = true;

            // generate unique code
            while (exists) {
                newCode = generateReferralCode();
                exists = await User.findOne({ referralCode: newCode });
            }

            user.referalCode = newCode;
            await user.save();
            console.log(`Updated ${user.email} with referral code: ${newCode}`);
        }

        console.log('✅ All users updated with referral codes.');
        process.exit();
    } catch (err) {
        console.error('❌ Error updating users:', err);
        process.exit(1);
    }
}

assignReferralCodes();
