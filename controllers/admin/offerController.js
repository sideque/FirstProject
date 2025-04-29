const Offer = require('../../models/offerSchema')
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const adminController = require('./adminController'); 


const loadOffers = async (req, res) => {
    try {
        const adminOffer = await adminController.getAdminData(req);
        const search = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 5;

        let query = {};
        if (search) {
            query.$or = [{ offerName: { $regex: new RegExp(search, 'i') } }];
        }

        const totalOffers = await Offer.countDocuments(query);
        const totalPages = Math.ceil(totalOffers / limit);

        const maxPagesToShow = 5;
        let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        const offers = await Offer.find(query)
            .populate({
                path: 'applicableTo',
                select: 'productName name'
            })
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ createdAt: -1 });

        return res.render('offers', {
            offers,
            totalPages,
            currentPage: page,
            totalOffers,
            search,
            startPage,
            endPage,
            adminOffer
        });
    } catch (error) {
        console.error('Error loading offers:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const addOffer = async (req, res) => {
    try {
        const {
            offerName,
            description,
            offerType,
            applicable,
            discountType,
            offerAmount,
            validFrom,
            validUpto
        } = req.body;

        let applicableTo;
        if (offerType === 'Product') {
            applicableTo = await Product.findOne({ productName: applicable, isBlocked: false }).select('_id');
        } else if (offerType === 'Category') {
            applicableTo = await Category.findOne({ name: applicable, isDeleted: false, isListed: true }).select('_id');
        } else if (offerType === 'Brand') {
            applicableTo = await Brand.findOne({ name: applicable, isDeleted: false, isListed: true }).select('_id');
        }

        if (!applicableTo) {
            return res.status(400).json({ success: false, message: 'Invalid applicable selection' });
        }

        const offer = new Offer({
            offerName,
            description,
            offerType,
            applicableTo: applicableTo._id,
            offerTypeRef: offerType,
            discountType,
            offerAmount,
            validFrom,
            validUpto,
            isList: true
        });

        await offer.save();
        res.json({ success: true, message: 'Offer added successfully' });
    } catch (error) {
        console.error('Error adding offer:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getOffer = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id).populate('applicableTo', 'productName name');
        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }
        res.json({ success: true, data: offer });
    } catch (error) {
        console.error('Error fetching offer:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const updateOffer = async (req, res) => {
    try {
        const {
            offerName,
            description,
            offerType,
            applicable,
            discountType,
            offerAmount,
            validFrom,
            validUpto
        } = req.body;

        let applicableTo;
        if (offerType === 'Product') {
            applicableTo = await Product.findOne({ productName: applicable, isBlocked: false }).select('_id');
        } else if (offerType === 'Category') {
            applicableTo = await Category.findOne({ name: applicable, isDeleted: false, isListed: true }).select('_id');
        } else if (offerType === 'Brand') {
            applicableTo = await Brand.findOne({ name: applicable, isDeleted: false, isListed: true }).select('_id');
        }

        if (!applicableTo) {
            return res.status(400).json({ success: false, message: 'Invalid applicable selection' });
        }

        const offer = await Offer.findByIdAndUpdate(
            req.params.id,
            {
                offerName,
                description,
                offerType,
                applicableTo: applicableTo._id,
                offerTypeRef: offerType,
                discountType,
                offerAmount,
                validFrom,
                validUpto
            },
            { new: true }
        );

        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }

        res.json({ success: true, message: 'Offer updated successfully' });
    } catch (error) {
        console.error('Error updating offer:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const listOffer = async (req, res) => {
    try {
        const offer = await Offer.findByIdAndUpdate(
            req.params.id,
            { isList: true },
            { new: true }
        );
        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }
        res.json({ success: true, message: 'Offer listed successfully' });
    } catch (error) {
        console.error('Error listing offer:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const unlistOffer = async (req, res) => {
    try {
        const offer = await Offer.findByIdAndUpdate(
            req.params.id,
            { isList: false },
            { new: true }
        );
        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }
        res.json({ success: true, message: 'Offer unlisted successfully' });
    } catch (error) {
        console.error('Error unlisting offer:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getProducts = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true, isDeleted: false });
        const brands = await Brand.find({ isListed: true, isDeleted: false });

        const products = await Product.find({
            isBlocked: false,
            category: { $in: categories.map((category) => category._id) },
            brand: { $in: brands.map((brand) => brand._id) },
        }).select('productName _id');


        res.json({ success: true, data: products });


    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getCategories = async (req, res) => {
    try {
        const categories = await Category.find({ isDeleted: false, isListed: true }).select('name _id');
        res.json({ success: true, data: categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getBrands = async (req, res) => {
    try {
        const brands = await Brand.find({ isDeleted: false, isListed: true }).select('name _id');
        res.json({ success: true, data: brands });
    } catch (error) {
        console.error('Error fetching brands:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    loadOffers,
    addOffer,
    getOffer,
    updateOffer,
    listOffer,
    unlistOffer,
    getProducts,
    getCategories,
    getBrands
};