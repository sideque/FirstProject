const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const pageerror = async (req,res)=>{
    res.render("admin-error")
}

const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect("/admin/dashboard");
    }
    res.render("admin-login", { message: null });
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(req.body);

        
        const admin = await User.findOne({ email });

        
        if (!admin) {
            return res.render("admin-login", { message: "Invalid email or password." });
        }

        // Compare the password
        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (passwordMatch) {
            req.session.admin = true;
            return res.redirect("/admin");
        } else {
            return res.render("admin-login", { message: "Invalid email or password." });
        }
    } catch (error) {
        console.log("Login error", error);
        return res.redirect("/pageerror");
    }
}

// const loadDashboard = async (req, res) => {
//     if (req.session.admin) {
//         try {
//             res.render("dashboard");
//         } catch (error) {
//             res.redirect("/pageerror");
//         }
//     } else {
//         res.redirect("/admin/login"); 
//     }
// }

const loadDashboard = async (req,res) =>{
    if(req.session.admin){
        try{
            const message = req.session.message;
            req.session.message = null;
            res.render("dashboard",{message});
        } catch (error){
            res.redirect("/pageerror");
        }
    } else {
        res.redirect("/admin/login")
    }
}

const logout = async (req,res) =>{
    try{
        req.session.destroy(err =>{
            if(err){
                console.log("Error destroying session",err);
                return res.redirect("/pageerror")
            }
            res.redirect("/admin/login")
        })
    } catch(error){
        console.log("unexpected error during logout",error);
        res.redirect("/pageerror")
    }
}

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout
}
