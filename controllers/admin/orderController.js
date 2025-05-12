const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");


const loadOrder = async (req, res) => {
  try {
    const { status, date, page = 1, search = '', sort = 'asc' } = req.query; 
    const limit = 10;

    let query = {};
    if (status) {
      query.status = status;
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
    }
    if (search) {
      query.$or = [
        { orderId: { $regex: new RegExp(search, 'i') } },
        { userId: { $in: await User.find({ name: { $regex: new RegExp(search, 'i') } }).distinct('_id') } },
      ];
    }

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);
    const skip = (page - 1) * limit;

    const maxPagesToShow = 5;
    let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    const sortOrder = sort === 'desc' ? 1 : -1;

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
      .sort({ createdAt: sortOrder }) 
      .lean();

    orders.forEach((order, index) => {
      console.log(`Order ${index + 1}:`, {
        orderId: order.orderId,
        orderDate: new Date(order.createdAt).toISOString(),
      });
    });

    const formattedOrders = orders.map((order) => {
      return {
        ...order,
        shippingAddress: order.address || { name: "Unknown" },
        totalAmount: order.finalAmount || 0,
        orderDate: order.createdAt,
        products: order.orderItems.map((item) => ({
          ...item,
          productImage: item.product?.productImage?.[0] || "/images/placeholder.png",
        })),
      };
    });

    res.render("order", {
      orders: formattedOrders,
      currentPage: parseInt(page),
      totalPages,
      statusFilter: status || "",
      dateFilter: date || "",
      startPage,
      endPage,
      search,
      sort, 
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
        .filter(item => item.product) 
        .map(item => ({
          name: item.product.name || item.product.productName || 'N/A',
          image: item.product.productImage?.[0] || '/images/placeholder.png',
          quantity: item.stock,
          price: item.price,
          total: item.stock * item.price,
          status: item.status // Ensure item status is passed
        })),
      returnItems: order.orderItems
        .filter(item => item.product && (item.status === 'Returned' || item.status === 'Return Request' || item.status === 'Return Requested'))
        .map(item => ({
          name: item.product.name || item.product.productName || 'N/A', 
          image: item.product.productImage?.[0] || '/images/placeholder.png',
          quantity: item.stock,
          price: item.price,
          reason: order.returnReason || 'N/A'
        })),
      isReturnRequested: order.orderItems.some(item => 
        item.status === 'Return Request' || item.status === 'Return Requested'
      ) // Update to handle both 
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

    const validStatuses = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
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
          // $inc: { stock: item.stock }
          $inc: { quantity: item.stock } // Use 'quantity' to match Product schema
        });
      }
    }

    // Update the overall order status
    order.status = status;

    // Update timestamps
    if (status === "Shipped") {
      order.shippedDate = new Date();
      // Update non-cancelled items to "Shipped"
      order.orderItems.forEach(item => {
        if (item.status !== "Cancelled") {
          item.status = "Shipped";
        }
      });
    }
    if (status === "Delivered") {
      order.deliveredDate = new Date();
      order.orderItems.forEach(item => {
        if (item.status !== "Cancelled") {
          item.status = "Delivered";
        }
      });
    }

    await order.save();

    res.json({ success: true, message: "Order status updated successfully" });
  } catch (error) {
    console.error("Error in updateOrderStatus:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const verifyReturnRequest = async (req, res) => {
  try {
    const { orderId, itemId, action } = req.query; 

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (action === "accept") {
      // Update items to "Returned" instead of "Cancelled"
      order.orderItems.forEach(item => {
        if (item.status === "Return Request" || item.status === "Return Requested") {
          item.status = "Returned";
          item.isReturned = true;
          item.isReturnRequested = false;
        }
      });

      order.status = "Returned";
      order.isReturnRequested = false;
      order.cancelOrReturn = order.finalAmount;
      order.revokedCoupon = order.couponDiscount;

      // Refund to wallet
      const user = await User.findById(order.userId);
      const refundAmount = order.finalAmount;

      let wallet = await Wallet.findOne({ userId: order.userId });
      if (!wallet) {
        wallet = new Wallet({
          userId: order.userId,
          balance: 0,
          transactions: [],
        });
      }

      wallet.balance += refundAmount;
      wallet.transactions.push({
        type: "credit",
        amount: refundAmount,
        orderId: order.orderId,  
        paymentMethod: order.paymentMethod,
        transactionId: `TXN${Date.now()}`,
        description: `Refund for order ${orderId}`,
        date: new Date()
      });

      await wallet.save();

    } else if (action === "reject") {
      // Revert items to "Delivered"
      order.orderItems.forEach(item => {
        if (item.status === "Return Request" || item.status === "Return Requested") {
          item.status = "Delivered";
          item.isReturnRequested = false;
        }
      });

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