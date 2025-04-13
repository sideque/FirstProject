// const mongoose = require("mongoose");
// const Product = require("./models/productSchema");

// // Connect to MongoDB
// mongoose.connect("mongodb://localhost:27017/yourDatabaseName")
//     .then(() => console.log("Connected to MongoDB"))
//     .catch(err => {
//         console.error("MongoDB connection error:", err);
//         process.exit(1);
//     });

// async function fixImagePaths() {
//     try {
//         const products = await Product.find();
//         for (let product of products) {
//             product.productImage = product.productImage.map(img => {
//                 // If your old paths are already correct, you don't need to change anything
//                 return img; // Keeping old paths as you said
//             });
//             await product.save();
//         }
//         console.log("Done using old image paths");
//         mongoose.connection.close();
//     } catch (error) {
//         console.error("Error updating image paths:", error);
//         mongoose.connection.close();
//     }
// }

// fixImagePaths();
