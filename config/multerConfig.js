require('dotenv').config();  // Load env variables early
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Debug: Check env variables before configuring Cloudinary
console.log("Cloudinary ENV:", {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify Cloudinary configuration
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('Cloudinary configuration is incomplete. Check .env variables.');
}

// Set up Cloudinary storage for product images
const productStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'product-images',
    format: async (req, file) => 'webp',
    public_id: (req, file) => `product-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    transformation: [{ width: 300, height: 300, crop: 'fill' }],
  },
});

// Set up Cloudinary storage for profile images
const profileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'profile-images',
    format: async (req, file) => 'webp',
    public_id: (req, file) => `profile-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    transformation: [{ width: 300, height: 300, crop: 'fill' }],
  },
});

// File filter for both product and profile images
const fileFilter = (req, file, cb) => {
  console.log('Multer file received:', file); // Debugging
  const expectedField = file.fieldname === 'images' || file.fieldname === 'profileImage';
  if (!expectedField) {
    console.error('Invalid field name:', file.fieldname);
    return cb(new Error(`Only images or profileImage fields are allowed!`));
  }
  const filetypes = /jpeg|jpg|png|webp/;
  const mimetype = filetypes.test(file.mimetype);
  if (mimetype) {
    return cb(null, true);
  }
  console.error('Invalid file type:', file.mimetype);
  cb(new Error('Only JPEG, JPG, PNG, and WEBP files are allowed!'));
};

// Initialize Multer for product images (multiple files)
const uploadProductImages = multer({
  storage: productStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter,
}).array('images', 3); // Accept up to 3 files for 'images'

// Initialize Multer for profile images (single file)
const uploadProfileImage = multer({
  storage: profileStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter,
}).single('profileImage'); // Accept a single file for 'profileImage'

module.exports = {
  uploadProductImages,
  uploadProfileImage,
};