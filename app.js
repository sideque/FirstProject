const express = require('express');
const app = express();
const path = require("path");
const dotenv = require('dotenv');
const session = require("express-session");
const passport = require("./config/passport")
dotenv.config();
const db = require('./config/db');
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter"); 
db()
const userMiddleware = require('./middlewares/userMiddleware');
// app.use(userMiddleware);  // എല്ലാ routes-ലും ഈ middleware പ്രവർത്തിക്കും


app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000
    }
}));


app.use((req, res, next) => {
    res.locals.user = req.user || req.session.user || null;  
    next();
  });
  



app.set('view engine','ejs')
app.set('views',[path.join(__dirname,'views/user'),
path.join(__dirname,'views/admin'),
path.join(__dirname,'views/partials')]);
app.use(express.static(path.join(__dirname, 'public')));

app.use("/",userRouter);
app.use("/admin", adminRouter);   

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`Server Running on http://localhost:${PORT}`);
});

module.exports = app; 