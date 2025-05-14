const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');

const getAdminData = async (req) => {
    try {
        if (req.session.admin) {
            return {
                id: req.session.admin._id,
                name: req.session.admin.name || 'Admin User',
                email: req.session.admin.email,
                profileImage: req.session.admin.profileImage || 'https://i.pravatar.cc/150?img=12'
            };
        }
        return null;
    } catch (error) {
        console.error('Error getting admin data:', error);
        return null;
    }
};

const pageerror = async (req, res) => {
    res.render('admin-error', { message: 'An unexpected error occurred.' });
};

const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin-login', { message: req.session.admMsg || null });
    req.session.admMsg = null;
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            req.session.admMsg = 'Invalid email or password.';
            return res.redirect('/admin/login');
        }

        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (passwordMatch) {
            req.session.admin = { 
                _id: admin._id, 
                email: admin.email, 
                name: admin.name, 
                isAdmin: admin.isAdmin 
            };
            return res.redirect('/admin/dashboard');
        } else {
            req.session.admMsg = 'Invalid email or password.';
            return res.redirect('/admin/login');
        }
    } catch (error) {
        console.error('Login error:', error);
        req.session.admMsg = 'Something went wrong.';
        return res.redirect('/admin/login');
    }
};

const loadDashboard = async (req, res) => {
    try {
        const adminUser = await getAdminData(req);
        if (!req.session.admin) {
            return res.redirect('/admin/login');
        }

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, -1);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        const todaySales = await Order.aggregate([
            { $match: { 
                createdOn: { $gte: startOfToday }, 
                status: { $nin: ['Cancelled', 'Returned'] } 
            } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);

        const yesterdaySales = await Order.aggregate([
            { $match: { 
                createdOn: { $gte: startOfYesterday, $lte: endOfYesterday }, 
                status: { $nin: ['Cancelled', 'Returned'] } 
            } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);

        const monthlySales = await Order.aggregate([
            { $match: { 
                createdOn: { $gte: startOfMonth }, 
                status: { $nin: ['Cancelled', 'Returned'] } 
            } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);

        const yearlySales = await Order.aggregate([
            { $match: { 
                createdOn: { $gte: startOfYear }, 
                status: { $nin: ['Cancelled', 'Returned'] } 
            } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);

        res.render('dashboard', {
            todaySales: todaySales[0]?.total || 0,
            yesterdaySales: yesterdaySales[0]?.total || 0,
            monthlySales: monthlySales[0]?.total || 0,
            yearlySales: yearlySales[0]?.total || 0,
            activePage: 'dashboard',
            adminUser
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.redirect('/admin/pageerror');
    }
};

const getChartData = async (req, res) => {
    const filter = req.params.filter || 'monthly';
    const year = parseInt(req.query.year) || new Date().getFullYear();

    let startDate, endDate = new Date();
    if (filter === 'yearly') {
        startDate = new Date(year, 0, 1);
        endDate = new Date(year, 11, 31, 23, 59, 59);
    } else {
        startDate = new Date(endDate);
        if (filter === 'daily') startDate.setDate(endDate.getDate() - 1);
        else if (filter === 'weekly') startDate.setDate(endDate.getDate() - 6);
        else startDate.setDate(endDate.getDate() - 29);
    }

    try {
        const orders = await Order.find({
            createdOn: { $gte: startDate, $lte: endDate },
            status: { $nin: ['Cancelled', 'Returned'] }
        })
            .populate('userId')
            .populate({
                path: 'orderItems.product',
                populate: [
                    { path: 'category', select: 'name' },
                    { path: 'brand', select: 'name' }
                ]
            });

        let salesLabels = [], salesData = [];
        const now = new Date();

        if (filter === 'daily') {
            const today = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            const yest = yesterday.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            const dayMap = { [yest]: 0, [today]: 0 };

            orders.forEach(order => {
                const d = new Date(order.createdOn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                if (dayMap[d] !== undefined) dayMap[d] += order.finalAmount;
            });

            salesLabels = Object.keys(dayMap);
            salesData = Object.values(dayMap);
        } else if (filter === 'weekly' || filter === 'monthly') {
            const days = filter === 'weekly' ? 7 : 30;
            const dayMap = {};
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(now.getDate() - i);
                const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                dayMap[label] = 0;
            }

            orders.forEach(order => {
                const d = new Date(order.createdOn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                if (dayMap[d] !== undefined) dayMap[d] += order.finalAmount;
            });

            salesLabels = Object.keys(dayMap);
            salesData = Object.values(dayMap);
        } else if (filter === 'yearly') {
            const monthMap = {};
            for (let i = 0; i < 12; i++) {
                const month = new Date(year, i).toLocaleString('en-IN', { month: 'short' });
                monthMap[month] = 0;
            }

            orders.forEach(order => {
                const d = new Date(order.createdOn);
                if (d.getFullYear() === year) {
                    const label = d.toLocaleString('en-IN', { month: 'short' });
                    if (monthMap[label] !== undefined) monthMap[label] += order.finalAmount;
                }
            });

            salesLabels = Object.keys(monthMap);
            salesData = Object.values(monthMap);
        }

        // Product aggregation: Ensure only valid products are included
        const productMap = {};
        orders.forEach(order => {
            order.orderItems.forEach(item => {
                if (item.product && item.product._id && item.product.productName) {
                    const productId = item.product._id.toString();
                    productMap[productId] = (productMap[productId] || 0) + item.stock;
                }
            });
        });

        const sortedProducts = Object.entries(productMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const productIds = sortedProducts.map(([id]) => id);
        const productDocs = await Product.find({ 
            _id: { $in: productIds.map(id => new mongoose.Types.ObjectId(id)) },
            productName: { $exists: true, $ne: null }
        }).select('productName');

        const productDetails = productDocs.reduce((acc, p) => {
            acc[p._id.toString()] = p.productName;
            return acc;
        }, {});

        const validProducts = sortedProducts.filter(([id]) => productDetails[id]);
        const productLabels = validProducts.map(([id]) => productDetails[id]);
        const productData = validProducts.map(([_, qty]) => qty);

        // Category aggregation: Only include items with valid category names
        const categoryMap = {};
        orders.forEach(order => {
            order.orderItems.forEach(item => {
                if (item.product?.category?.name) {
                    const categoryName = item.product.category.name;
                    const itemRevenue = item.stock * (item.price || item.product.salePrice || 0);
                    categoryMap[categoryName] = (categoryMap[categoryName] || 0) + itemRevenue;
                }
            });
        });

        const sortedCategories = Object.entries(categoryMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        const categoryLabels = sortedCategories.map(([label]) => label);
        const categoryData = sortedCategories.map(([_, value]) => value);

        // Brand aggregation: Only include items with valid brand names
        const brandMap = {};
        orders.forEach(order => {
            order.orderItems.forEach(item => {
                if (item.product?.brand?.name) {
                    const brandName = item.product.brand.name;
                    const itemRevenue = item.stock * (item.price || item.product.salePrice || 0);
                    brandMap[brandName] = (brandMap[brandName] || 0) + itemRevenue;
                }
            });
        });

        const sortedBrands = Object.entries(brandMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        const brandLabels = sortedBrands.map(([label]) => label);
        const brandData = sortedBrands.map(([_, value]) => value);

        // Order status aggregation: Only include "Delivered" and "Processing"
        const statusMap = { Delivered: 0, Processing: 0 };
        orders.forEach(order => {
            if (order.status === 'Delivered' || order.status === 'Processing') {
                statusMap[order.status] += 1;
            }
        });
        const statusLabels = Object.keys(statusMap).filter(status => statusMap[status] > 0);
        const statusData = Object.values(statusMap).filter(count => count > 0);

        // Recent orders
        const recentOrders = await Order.find({
            createdOn: { $gte: startDate, $lte: endDate },
            status: { $nin: ['Cancelled', 'Returned'] }
        })
            .populate('userId')
            .sort({ createdOn: -1 })
            .limit(10)
            .lean();

        const formattedRecentOrders = recentOrders.map(order => ({
            orderId: order.orderId,
            customerName: order.userId?.name || 'Unknown',
            createdOn: order.createdOn,
            amount: order.finalAmount,
            status: order.status || 'Processing'
        }));

        res.json({
            sales: { labels: salesLabels, data: salesData },
            products: { labels: productLabels, data: productData },
            categories: { labels: categoryLabels, data: categoryData },
            brands: { labels: brandLabels, data: brandData },
            status: { labels: statusLabels, data: statusData },
            recentOrders: formattedRecentOrders
        });
    } catch (error) {
        console.error('Error fetching chart data:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.query.orderId;
        const order = await Order.findOne({ orderId })
            .populate('userId')
            .populate({
                path: 'orderItems.product',
                populate: [
                    { path: 'category', select: 'name' },
                    { path: 'brand', select: 'name' }
                ]
            })
            .lean();

        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }

        res.json({ success: true, order });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const downloadExcel = async (req, res) => {
    const { range } = req.query;
    let filter = {};

    if (range) {
        const days = parseInt(range);
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        filter.createdOn = { $gte: fromDate };
    } else {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        filter.createdOn = { $gte: fromDate };
    }

    try {
        const orders = await Order.find(filter).lean();
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        worksheet.columns = [
            { key: 'orderId', width: 30 },
            { key: 'amount', width: 15 },
            { key: 'discount', width: 15 },
            { key: 'coupon', width: 15 },
            { key: 'finalAmount', width: 15 },
            { key: 'status', width: 15 }
        ];

        worksheet.addRow(['Sales Report']).font = { size: 16, bold: true };
        worksheet.mergeCells('A1:F1');
        worksheet.getCell('A1').alignment = { horizontal: 'center' };

        const fromDate = range ? new Date(Date.now() - parseInt(range) * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN') : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN');
        const toDate = new Date().toLocaleDateString('en-IN');
        worksheet.addRow(['Report From:', fromDate, 'To:', toDate]);

        worksheet.addRow(['Order ID', 'Amount', 'Discount', 'Coupon', 'Final Amount', 'Status']).font = { bold: true };
        orders.forEach(order => {
            worksheet.addRow({
                orderId: order.orderId,
                amount: `₹${order.totalPrice.toLocaleString('en-IN')}`,
                discount: `₹${(order.discount || 0).toLocaleString('en-IN')}`,
                coupon: `₹${(order.couponDiscount || 0).toLocaleString('en-IN')}`,
                finalAmount: `₹${order.finalAmount.toLocaleString('en-IN')}`,
                status: order.status || 'N/A'
            });
        });

        const sumAmount = orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
        const sumDiscount = orders.reduce((sum, order) => sum + (order.discount || 0), 0);
        const sumCoupon = orders.reduce((sum, order) => sum + (order.couponDiscount || 0), 0);
        const sumFinalAmount = orders.reduce((sum, order) => sum + (order.finalAmount || 0), 0);

        worksheet.addRow(['Totals:', `₹${sumAmount.toLocaleString('en-IN')}`, `₹${sumDiscount.toLocaleString('en-IN')}`, `₹${sumCoupon.toLocaleString('en-IN')}`, `₹${sumFinalAmount.toLocaleString('en-IN')}`, `Total Orders: ${orders.length}`]).font = { bold: true };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generating Excel:', error);
        res.redirect('/admin/pageerror');
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy(err => {
            if (err) {
                console.error('Error destroying session:', err);
                return res.redirect('/admin/pageerror');
            }
            res.redirect('/admin/login');
        });
    } catch (error) {
        console.error('Unexpected error during logout:', error);
        res.redirect('/admin/pageerror');
    }
};

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    getChartData,
    getOrderDetails,
    downloadExcel,
    logout,
    getAdminData
};