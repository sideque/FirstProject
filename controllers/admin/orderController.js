const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");



const loadOrder = async (req, res) => {
  try {
    console.log("Starting loadOrder...");

    // Get query parameters
    const { status, date, page = 1 } = req.query;
    const limit = 10; // 10 orders per page
    console.log("Query params:", { status, date, page });

    // Build query for filtering
    let query = {};
    if (status) {
      query.status = status;
      console.log("Filtering by status:", status);
    }
    if (date) {
      const now = new Date();
      if (date === "today") {
        query.createdAt = { $gte: new Date(now.setHours(0, 0, 0, 0)) };
      } else if (date === "this_week") {
        query.createdAt = { $gte: new Date(now.setDate(now.getDate() - 7)) };
      } else if (date === "this_month") {
        query.createdAt = { $gte: new Date(now.setMonth(now.getMonth(), 1)) };
      } else if (date === "last_month") {
        query.createdAt = {
          $gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          $lte: new Date(now.getFullYear(), now.getMonth(), 0),
        };
      }
      console.log("Filtering by date:", date);
    }

    // Pagination
    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);
    const skip = (page - 1) * limit;
    console.log("Pagination:", { totalOrders, totalPages, skip, limit });

    // Fetch orders
    const orders = await Order.find(query)
      .populate({
        path: "orderItems.product",
        select: "productImage",
      })
      .populate({
        path: "userId",
        select: "name",
      })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();
    console.log("Fetched orders:", orders.length);

    // Format orders for template
    const formattedOrders = orders.map((order) => {
      console.log("Formatting order:", order.orderId);
      return {
        ...order,
        shippingAddress: order.address || { name: "Unknown" }, // Fallback
        totalAmount: order.finalAmount || 0, // Fallback
        orderDate: order.createdAt,
        products: order.orderItems.map((item) => ({ // Map orderItems to products
          ...item,
          productImage: item.product?.productImage?.[0] || "/images/placeholder.png",
        })),
      };
    });

    // Render template
    res.render("order", {
      orders: formattedOrders,
      currentPage: parseInt(page),
      totalPages,
      statusFilter: status || "",
      dateFilter: date || "",
    });
  } catch (error) {
    console.error("Error in loadOrder:", error.message, error.stack);
    res.status(500).send("Something went wrong. Please try again.");
  }
};


const viewOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
      .populate({
        path: "orderItems.product",
        select: "name productName productImage",
      })
      .populate({
        path: "userId",
        select: "name email",
      })
      .lean();

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Detailed debugging
    console.log('Raw order:', JSON.stringify(order, null, 2));
    console.log('Order items details:');
    order.orderItems.forEach((item, index) => {
      console.log(`OrderItem ${index}:`, {
        productId: item.product?._id || 'null',
        productName: item.product?.name || item.product?.productName || 'undefined',
        productImage: item.product?.productImage || 'undefined',
        stock: item.stock,
        price: item.price,
        status: item.status
      });
    });

    const formattedOrder = {
      ...order,
      customerName: order.address?.name || 'N/A',
      customerEmail: order.userId?.email || 'N/A',
      products: order.orderItems
        .filter(item => item.product) // Skip items with null product
        .map(item => ({
          name: item.product.name || item.product.productName || 'N/A',
          image: item.product.productImage?.[0] || '/images/placeholder.png',
          quantity: item.stock,
          price: item.price,
          total: item.stock * item.price
        })),
      returnItems: order.orderItems
        .filter(item => item.product && (item.status === 'Returned' || item.status === 'Return Request'))
        .map(item => ({
          name: item.product.name || item.product.productName || 'N/A', // Support both fields
          image: item.product.productImage?.[0] || '/images/placeholder.png',
          quantity: item.stock,
          price: item.price,
          reason: order.returnReason || 'N/A'
        }))
    };


    if (formattedOrder.products.length === 0) {
      console.warn(`Order ${orderId} has no valid products after filtering`);
    }

    res.render('viewOrder', { order: formattedOrder });
  } catch (error) {
    console.error('Error in viewOrder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};




const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ["Pending", "Processing", "Shipped", "Delivered"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // If cancelling, restore stock
    if (status === "Cancelled" && order.status !== "Cancelled") {
      for (const item of order.orderItems) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.stock }
        });
      }
    }

    order.status = status;
    if (status === "Shipped") order.shippedDate = new Date();
    if (status === "Delivered") order.deliveredDate = new Date();

    await order.save();

    res.json({ success: true, message: "Order status updated successfully" });
  } catch (error) {

    console.log(error);

    console.error("Error in updateOrderStatus:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Verify Return Request
const verifyReturnRequest = async (req, res) => {
  try {

    const { orderId, itemId, action } = req.query; // The action: 'accept' or 'reject'

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }



    if (action === "accept") {

      order.orderItems.map(items => {
        items.status = 'Cancelled'
      })

      order.status = 'Returned';
      order.isReturnRequested = false

      // Refund to wallet
      const user = await User.findById(order.userId);
      const refundAmount = order.finalAmount;

      // let wallet = await Wallet.findOne({ userId: order.userId });
      // if (!wallet) {
      //   wallet = new Wallet({
      //     userId: order.userId,
      //     balance: 0,
      //     transactions: []
      //   });
      // }

      // wallet.balance += refundAmount;
      // wallet.transactions.push({
      //   type: "credit",
      //   amount: refundAmount,
      //   description: `Refund for order ${orderId}`,
      //   date: new Date()
      // });

      // await wallet.save();

    } else if (action === "reject") {
      order.status = "Delivered";
      order.isReturnRequested = false;
    }

    await order.save();

    res.json({
      success: true,
      message: `Return request ${action}ed successfully`
    });
  } catch (error) {
    console.error("Error in verifyReturnRequest:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Clear Search/Filters
const clearFilters = async (req, res) => {
  try {
    res.redirect("/admin/orders?page=1");
  } catch (error) {
    console.error("Error in clearFilters:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


module.exports = {
  loadOrder,
  viewOrder,
  updateOrderStatus,
  verifyReturnRequest,
  clearFilters
};