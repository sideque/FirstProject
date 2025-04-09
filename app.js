const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const flash = require("connect-flash");
const passport = require('./config/passport')

// Load environment variables
dotenv.config();

// Database connection
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI).then(() => {
    console.log("MongoDB connected successfully");
}).catch(err => {
    console.error("MongoDB connection error:", err);
});


// Express app setup
const app = express();

// Middleware for JSON and URL encoding
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(session({
    secret:process.env.SESSION_SECRET || "mySecret",
    resave:false,
    saveUninitialized:true,
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge: 1000 * 60 * 60 * 72 
    }
}))

app.use(passport.initialize());
app.use(passport.session());

// Flash messages middleware
app.use(flash());



// Store user session globally for templates
app.use((req, res, next) => {
    res.locals.admin = req.session.admin || null;
    res.locals.message = req.flash("message");
    next();
});

// View engine setup
app.set("view engine", "ejs");
app.set("views", [
    path.join(__dirname, "views/user"),
    path.join(__dirname, "views/admin"),
    path.join(__dirname, "views/partials")
]);

// Static files
app.use(express.static(path.join(__dirname, "public")));
// Add debug middleware to log requested URLs
app.use((req, res, next) => {
    if (req.url.includes('/uploads/')) {
        console.log(`Static file requested: ${req.url}`);
        const absolutePath = path.join(__dirname, req.url);
        console.log(`Absolute path: ${absolutePath}, exists: ${require('fs').existsSync(absolutePath)}`);
    }
    next();
});
// Ensure uploads directory is properly served as static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Routers
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");

app.use("/", userRouter);
app.use("/admin", adminRouter);


// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server Running on http://localhost:${PORT}`);
});

module.exports = app;
