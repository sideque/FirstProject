const loadCart = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || !user._id) {
      return res.redirect('/login');
    }

    const userData = await User.findById(user);

    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;

    let cart = await Cart.findOne({ userId: user._id }).populate({
      path: 'items.productId',
      select: 'productName productImage salePrice originalPrice brand quantity'
    });

    if (cart) {
      cart.items = cart.items.filter(item => item.productId && item.productId.salePrice !== undefined);
      await cart.save();
    }

    const cartItems = cart ? cart.items : [];
    const totalItems = cartItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedItems = cartItems.slice(skip, skip + limit);

    const getDeliveryDate = (days) => {
      const today = new Date();
      const deliveryDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
      return deliveryDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    };

    let coupon = 0;
    if (req.session.couponApplied) {
      coupon = req.session.couponApplied.offerAmount;
    }

    res.render('cart', {
      cartItems: paginatedItems,
      getDeliveryDate,
      totalPages,
      currentPage: page,
      totalItems,
      user: userData,
      coupon
    });
  } catch (error) {
    console.error('Error loading cart:', error);
    res.redirect('/pageNotFound');
  }
};