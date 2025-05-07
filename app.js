const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const flash = require("connect-flash");
// const morgan = require("morgan");
const fs = require('fs');
const passport = require('./config/passport');
const mongoURI = require('./config/db');

dotenv.config();



const app = express();
// app.use(morgan('dev'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.set('cache-control', 'no-store')
    next()
});
app.use(session({
    secret: process.env.SESSION_SECRET || "mySecret",
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, 
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 72
    },
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 72 * 60 * 60 // 72 hours in seconds
    })
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

app.use((req, res, next) => {
    res.locals.admin = req.session.admin || null;
    res.locals.message = req.flash("message");
    next();
});

app.set("view engine", "ejs");
app.set("views", [
    path.join(__dirname, "views/user"),
    path.join(__dirname, "views/admin"),
    path.join(__dirname, "views/partials")
]);

app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

app.use((req, res, next) => {
    if (req.url.includes('/uploads/')) {
        const relativePath = req.url.replace('/uploads/', '');
        const absolutePath = path.join(__dirname, 'Uploads', relativePath);
    }
    next();
});

const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
const { applyTimestamps } = require("./models/userSchema");

app.use("/", userRouter);
app.use("/admin", adminRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server Running on http://localhost:${PORT}`);
});

module.exports = app;