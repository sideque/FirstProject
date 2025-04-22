const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const getAdminData = async (req) => {
    try {
        if (req.session.admin) {
            return {
                id: req.session.admin._id,
                name: req.session.admin.name || 'Admin User',
                email: req.session.admin.email,
                profileImage: req.session.admin.profileImage || 'https://i.pravatar.cc/150?img=12'
            };
        }
        return null;
    } catch (error) {
        console.error("Error getting admin data:", error);
        return null;
    }
};

const pageerror = async (req, res) => {
    res.render("admin-error")
}

const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect("/admin");
    }
    res.render("admin-login", { message: null });
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email });

        if (!admin || !admin.isAdmin) {
            return res.render("admin-login", { message: "Invalid email or password." });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (passwordMatch) {
            req.session.admin = { id: admin._id, email: admin.email, isAdmin: admin.isAdmin };
            return res.redirect("/admin");
        } else {
            console.log("Incorrect Password");
            return res.render("admin-login", { message: "Invalid email or password." });
        }
    } catch (error) {
        console.log("Login error", error);
        return res.redirect("/admin/pageerror");
    }
};

const loadDashboard = async (req, res) => {
    try {
        const adminUser = await getAdminData(req);

        if (req.session.admin) {
            try {
                const message = req.session.message;
                req.session.message = null;

                const itemsPerPage = 5;
                const currentPage = parseInt(req.query.page) || 1;

                const totalUsers = await User.countDocuments();
                const totalPages = Math.ceil(totalUsers / itemsPerPage);

                const users = await User.find()
                    .skip((currentPage - 1) * itemsPerPage)
                    .limit(itemsPerPage);

                res.render("dashboard", {
                    users,
                    message,
                    totalPages,
                    currentPage,
                    activePage: "dashboard",
                    adminUser
                });

            } catch (error) {
                console.log("Dashboard Error:", error);
                res.redirect("/admin/pageerror");
            }
        } else {
            res.redirect("/admin/login");
        }
    } catch (error) {
        console.log(error.message);
        res.redirect("/admin/pageerror");
    }
};


const logout = async (req, res) => {
    try {
        req.session.destroy(err => {
            if (err) {
                console.log("Error destroying session", err);
                return res.redirect("/admin/pageerror")
            }
            res.redirect("/admin/login")
        })
    } catch (error) {
        console.log("unexpected error during logout", error);
        res.redirect("/admin/pageerror")
    }
}

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout,
    getAdminData
}