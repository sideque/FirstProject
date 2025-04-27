const User = require("../models/userSchema");

const userAuth = (req,res,next) =>{
    if(req.session.user){
        User.findById(req.session.user)
        .then(data => {
            if(data && !data.isBlocked){
                next();
            }else{
                res.redirect("/login")
            }
        })
        .catch(error =>{
            console.log("Error in user auth middleware");
            res.status(500).send("Internal Server error");
        })
    }else{
        res.redirect("/login")
    }
}

const adminAuth = (req, res, next) => {

    if (req.session.admin && req.session.admin.isAdmin) { 
        User.findById(req.session.admin.id)
            .then(admin => {
                if (admin && admin.isAdmin) {
                    next(); // Admin authenticated
                } else {
                    console.log("Not an Admin or Invalid Session");
                    req.session.destroy();
                    res.redirect("/admin/login");
                }
            })
            .catch(error => {
                console.log("Error in adminAuth middleware", error);
                req.session.destroy();
                res.redirect("/admin/login");
            });
    } else {
        console.log("No Admin Session Found");
        res.redirect("/admin/login");
    }
};


module.exports = {
    userAuth,
    adminAuth
}