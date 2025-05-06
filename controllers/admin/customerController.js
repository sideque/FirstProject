const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema"); 
const adminController = require('./adminController');

const customerInfo = async (req, res) => {
    try {
        const adminUser = await adminController.getAdminData(req);
        const search = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 20;

        // Build search query
        let query = {};
        if (search) {
            query = {
                $or: [
                    { name: { $regex: new RegExp(search, 'i') } },
                    { email: { $regex: new RegExp(search, 'i') } },
                    { phone: { $regex: new RegExp(search, 'i') } }
                ]
            };
        }

        // Get total count for pagination
        const totalUsers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalUsers / limit);

        // Calculate pagination values
        const maxPagesToShow = 5;
        let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        // Get users with pagination
        const users = await User.find(query)
            .sort({ createdOn: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('name email phone createdOn isBlocked _id');

        res.render("users", {
            users,
            currentPage: page,
            totalPages,
            totalUsers,
            search,
            startPage,
            endPage,
            adminUser
        });
    } catch (error) {
        console.log(error.message);
        res.redirect('/admin/pageerror');
    }
};

const customerBlocked = async (req, res) => {
    try {
        let id = req.query.id;
        await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
        res.redirect("/admin/users?status=blocked");
    } catch (error) {
        res.redirect("/admin/pageerror");
    }
};

const customerunBlocked = async (req, res) => {
    try {
        let id = req.query.id;
        await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
        res.redirect("/admin/users?status=unblocked");
    } catch (error) {
        res.redirect("/admin/pageerror");
    }
};

const getWalletDetails = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate('wallet');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Ensure wallet data is included, even if not populated correctly
        let walletData = user.wallet || await Wallet.findOne({ userId: user._id });
        if (!walletData) {
            walletData = { balance: 0, transactions: [] };
        }
        res.json({
            name: user.name,
            email: user.email,
            phone: user.phone,
            createdOn: user.createdOn,
            wallet: walletData
        });
    } catch (error) {
        console.error('Error fetching wallet details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    customerInfo,
    customerBlocked,
    customerunBlocked,
    getWalletDetails
};