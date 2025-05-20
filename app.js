const express = require("express");
const dotenv = require("dotenv");
dotenv.config({ path: "D:\\week 8\\myProject\\.env" });
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const flash = require("connect-flash");
const passport = require('./config/passport');
const mongoURI = require('./config/db');

dotenv.config();

const app = express();
// app.use(morgan('dev'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${req.method} request received at ${req.url}`);
  next();
});

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

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
const { applyTimestamps } = require("./models/userSchema");

app.use("/", userRouter);
app.use("/admin", adminRouter);

app.get("/admin/*", (req,res) => {
    res.redirect("/admin/dashboard")
})

app.get("/*",(req,res)=>{
    res.redirect('/')
})

const PORT = process.env.PORT || 3000;  
app.listen(PORT, () => {
    console.log(`Server Running on http://localhost:${PORT}`);
});

module.exports = app;