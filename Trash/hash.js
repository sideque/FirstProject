const bcrypt = require("bcrypt");

const password = "Ax2Sidhique@123"; // Your new password
const saltRounds = 10;

bcrypt.hash(password, saltRounds, function (err, hash) {
    if (err) {
        console.error("Error hashing password:", err);
    } else {
        console.log("Hashed Password:", hash);
    }
});
