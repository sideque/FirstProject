const multer = require("multer");
const path = require("path");

// Configure storage for Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "public/uploads/product-images/"); 
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// Initialize multer
const upload = multer({ storage: storage });

module.exports = upload;
