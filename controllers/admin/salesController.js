const Order = require('../../models/orderSchema');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');


const loadSalesReport = async (req, res) => {
    try {
        const { range, start, end, page = 1 } = req.query;
        const limit = 10;
        const currentPage = parseInt(page);

        // Determine date range
        let fromDate, toDate;
        if (start && end && !isNaN(new Date(start)) && !isNaN(new Date(end))) {
            fromDate = new Date(start);
            toDate = new Date(end);
            toDate.setHours(23, 59, 59, 999);
        } else if (range && !isNaN(parseInt(range))) {
            const days = parseInt(range);
            toDate = new Date();
            fromDate = new Date();
            fromDate.setDate(toDate.getDate() - days);
        } else {
            // Default to last 7 days
            toDate = new Date();
            fromDate = new Date();
            fromDate.setDate(toDate.getDate() - 7);
        }

        // Build filter
        let filter = {};
        if (fromDate && toDate) {
            filter.createdOn = { $gte: fromDate, $lte: toDate };
        }

        // Fetch orders with pagination
        const totalOrders = await Order.countDocuments(filter);
        const orders = await Order.find(filter)
            .sort({ createdOn: -1 })
            .skip((currentPage - 1) * limit)
            .limit(limit)
            .lean();

        // Calculate sales summary
        const allOrders = await Order.find(filter).lean();
        const salesSummary = calculateSales(allOrders);

        // Transform orders for display
        const ordersData = orders.map(order => ({
            orderId: order.orderId,
            amount: order.totalPrice || 0,
            discount: order.discount || 0,
            coupon: order.couponDiscount || 0,
            finalAmount: order.finalAmount || 0,
            returnCancelled: order.cancelOrReturn || 0,
            revokedCoupon: order.revokedCoupon || 0,
            date: order.createdOn.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' }),
            status: order.status || 'Pending'
        }));

        const totalPages = Math.ceil(totalOrders / limit);

        // Render EJS template
        res.render('sales-report', {
            orders: ordersData,
            salesSummary,
            totalOrders,
            range,
            start,
            end,
            currentPage,
            totalPages
        });
    } catch (error) {
        console.error(error);
        res.redirect('/admin/pageerror');
    }
};

const calculateSales = (orders) => {
    let totalSales = 0;
    let cancelOrReturn = 0;
    let coupons = 0;
    let discounts = 0;
    let netSales = 0;

    orders.forEach(order => {
        totalSales += order.totalPrice || 0;
        coupons += order.couponDiscount || 0;
        cancelOrReturn += order.cancelOrReturn || 0;
        discounts += order.discount || 0;
        netSales += order.finalAmount || 0;
    });

    return {
        totalSales,
        cancelOrReturn,
        coupons,
        discounts,
        netSales
    };
};

const downloadExcel = async (req, res) => {
    try {
        const { range, start, end } = req.query;

        const { report, salesSummary, totalOrders } = await getReportData(range, start, end);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        worksheet.columns = [
            { header: 'Order ID', key: 'orderId', width: 30 },
            { header: 'Amount', key: 'amount', width: 15 },
            { header: 'Discount', key: 'discount', width: 15 },
            { header: 'Coupon', key: 'coupon', width: 15 },
            { header: 'Final Amount', key: 'finalAmount', width: 15 },
            { header: 'Return/Cancelled', key: 'returnCancelled', width: 15 },
            { header: 'Revoked Coupon', key: 'revokedCoupon', width: 15 },
            { header: 'Date', key: 'date', width: 20 },
            { header: 'Status', key: 'status', width: 15 }
        ];

        // Add title
        worksheet.mergeCells('A1:I1');
        worksheet.getCell('A1').value = 'MobiVault, Sales Report';
        worksheet.getCell('A1').font = { size: 16, bold: true };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };

        // Add date range
        const fromDate = start ? new Date(start).toLocaleDateString('en-GB') : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB');
        const toDate = end ? new Date(end).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
        worksheet.mergeCells('A2:I2');
        worksheet.getCell('A2').value = `Report From: ${fromDate} To: ${toDate}`;
        worksheet.getCell('A2').font = { italic: true };
        worksheet.getCell('A2').alignment = { horizontal: 'center' };

        // Add data
        report.forEach(order => {
            worksheet.addRow({
                orderId: order.orderId,
                amount: `₹${order.amount.toLocaleString('en-IN')}`,
                discount: `₹${order.discount.toLocaleString('en-IN')}`,
                coupon: `₹${order.coupon.toLocaleString('en-IN')}`,
                finalAmount: `₹${order.finalAmount.toLocaleString('en-IN')}`,
                returnCancelled: `₹${order.returnCancelled.toLocaleString('en-IN')}`,
                revokedCoupon: `₹${order.revokedCoupon.toLocaleString('en-IN')}`,
                date: order.date,
                status: order.status
            });
        });

        // Add summary
        worksheet.addRow([]);
        worksheet.addRow([
            'Totals:',
            `₹${salesSummary.totalSales.toLocaleString('en-IN')}`,
            `₹${salesSummary.discounts.toLocaleString('en-IN')}`,
            `₹${salesSummary.coupons.toLocaleString('en-IN')}`,
            `₹${salesSummary.netSales.toLocaleString('en-IN')}`,
            `₹${salesSummary.cancelOrReturn.toLocaleString('en-IN')}`,
            `₹${salesSummary.revokedCoupon?.toLocaleString('en-IN') || '0'}`,
            '',
            `Total Orders: ${totalOrders}`
        ]);

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');

        // Write to response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(error);
        res.redirect('/admin/pageerror');
    }
};

const downloadPDF = async (req, res) => {
    try {
        const { range, start, end } = req.query;
        const { report, salesSummary, totalOrders } = await getReportData(range, start, end);

        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
        doc.pipe(res);

        // Add title
        doc.fontSize(16).font('Helvetica-Bold').text('MobiVault, Sales Report', { align: 'center' });
        doc.moveDown(1);

        // Add date range
        const fromDate = start ? new Date(start).toLocaleDateString('en-GB') : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB');
        const toDate = end ? new Date(end).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
        doc.fontSize(10).font('Helvetica-Oblique').text(`Report From: ${fromDate} To: ${toDate}`, { align: 'center' });
        doc.moveDown(2);

        // Table headers
        const headers = ['Order ID', 'Amount', 'Discount', 'Coupon', 'Final Amount', 'Return/Cancelled', 'Revoked Coupon', 'Date', 'Status'];
        const columnWidths = [90, 90, 70, 70, 90, 100, 100, 80, 90];
        const startX = 30;
        let currentY = doc.y;

        doc.fontSize(10).font('Helvetica-Bold');
        let currentX = startX;
        headers.forEach((header, i) => {
            doc.rect(currentX, currentY, columnWidths[i], 20).stroke();
            doc.text(header, currentX + 5, currentY + 5, { width: columnWidths[i] - 10, align: 'left' });
            currentX += columnWidths[i];
        });
        currentY += 20;

        // Table data
        doc.fontSize(9).font('Helvetica');
        report.forEach(row => {
            currentX = startX;
            const rowData = [
                row.orderId,
                `₹${row.amount.toLocaleString('en-IN')}`,
                `₹${row.discount.toLocaleString('en-IN')}`,
                `₹${row.coupon.toLocaleString('en-IN')}`,
                `₹${row.finalAmount.toLocaleString('en-IN')}`,
                `₹${row.returnCancelled.toLocaleString('en-IN')}`,
                `₹${row.revokedCoupon.toLocaleString('en-IN')}`,
                row.date,
                row.status
            ];
            rowData.forEach((cell, i) => {
                doc.rect(currentX, currentY, columnWidths[i], 20).stroke();
                doc.text(cell, currentX + 5, currentY + 5, { width: columnWidths[i] - 10, align: 'left' });
                currentX += columnWidths[i];
            });
            currentY += 20;
        });

        // Totals row
        currentY += 10;
        const totalsRow = [
            'Totals:',
            `₹${salesSummary.totalSales.toLocaleString('en-IN')}`,
            `₹${salesSummary.discounts.toLocaleString('en-IN')}`,
            `₹${salesSummary.coupons.toLocaleString('en-IN')}`,
            `₹${salesSummary.netSales.toLocaleString('en-IN')}`,
            `₹${salesSummary.cancelOrReturn.toLocaleString('en-IN')}`,
            `₹${salesSummary.revokedCoupon?.toLocaleString('en-IN') || '0'}`,
            '',
            `Total Orders: ${totalOrders}`
        ];
        currentX = startX;
        doc.fontSize(10).font('Helvetica-Bold');
        totalsRow.forEach((cell, i) => {
            doc.rect(currentX, currentY, columnWidths[i], 20).stroke();
            doc.text(cell, currentX + 5, currentY + 5, { width: columnWidths[i] - 10, align: 'left' });
            currentX += columnWidths[i];
        });

        doc.end();
    } catch (error) {
        console.error(error);
        res.redirect('/admin/pageerror');
    }
};

const getReportData = async (range, start, end) => {
    let filter = {};
    if (range && range !== 'custom') {
        const days = parseInt(range);
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        filter.createdOn = { $gte: fromDate };
    } else if (start && end) {
        filter.createdOn = {
            $gte: new Date(start),
            $lte: new Date(end).setHours(23, 59, 59, 999)
        };
    } else {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        filter.createdOn = { $gte: fromDate };
    }

    const orders = await Order.find(filter).lean();
    const salesSummary = calculateSales(orders);

    const report = orders.map(order => ({
        orderId: order.orderId,
        amount: order.totalPrice || 0,
        discount: order.discount || 0,
        coupon: order.couponDiscount || 0,
        finalAmount: order.finalAmount || 0,
        returnCancelled: order.cancelOrReturn || 0,
        revokedCoupon: order.revokedCoupon || 0,
        date: order.createdOn.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' }),
        status: order.status || 'Pending'
    }));

    return {
        report,
        salesSummary,
        totalOrders: orders.length
    };
};

module.exports = {
    loadSalesReport,
    downloadExcel,
    downloadPDF
};