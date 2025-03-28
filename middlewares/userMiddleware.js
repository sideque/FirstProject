const admin = require("../models/userSchema");

const adminAuth = async (req, res, next) => {

  if (req.session.admin) {
    next()
  } else {
    res.send("not atuth") 
  }

}

module.exports ={
  adminAuth
}
