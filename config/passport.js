const passport = require('passport');
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require('../models/userSchema');
require('dotenv').config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://mobivault.shop/auth/google/callback'
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await User.findOne({ googleId: profile.id });
            if (user) {
                return done(null, user);
            } else {
                // Generate username safely
                let baseUsername = profile.displayName.replace(/\s+/g, '').toLowerCase();
                let username = baseUsername;
                let userExists = await User.findOne({ username });
                let suffix = 1;

                while (userExists) {
                    username = baseUsername + suffix;
                    userExists = await User.findOne({ username });
                    suffix++;
                }

                user = new User({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    googleId: profile.id,
                    username: username,
                });
                await user.save();
                return done(null, user);
            }
        } catch (error) {
            return done(error, null);
        }
    }
));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id)
        .then(user => done(null, user))
        .catch(err => done(err, null));
});

module.exports = passport;
