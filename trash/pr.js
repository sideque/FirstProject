

const profileUpdate = async (req, res) => {
  try {
    // Extract user ID
    const userId = req.user?._id || req.session.user?._id || req.session.user;
    console.log('User ID:', userId); // Debugging
    if (!userId) {
      console.error('No user ID found in session or passport');
      req.flash('error', 'You must be logged in to update your profile');
      return res.redirect('/login');
    }

    // Log file upload
    console.log('File uploaded:', req.file); // Debugging
    if (req.file) {
      console.log('Cloudinary URL:', req.file.path); // Debugging
    }

    // Extract form data
    const { name, phone, username, gender } = req.body;
    console.log('Form data:', { name, phone, username, gender }); // Debugging

    // Validate required fields
    if (!name || name.trim().length < 2) {
      req.flash('error', 'Full name is required and must be at least 2 characters');
      return res.redirect('/userProfile');
    }

    // Validate phone
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      req.flash('error', 'Phone number must be a valid 10-digit Indian number');
      return res.redirect('/userProfile');
    }

    // Validate username
    if (username && username.trim().length < 3) {
      req.flash('error', 'Username must be at least 3 characters');
      return res.redirect('/userProfile');
    }

    // Validate gender
    if (gender && !['Male', 'Female', 'Other'].includes(gender)) {
      req.flash('error', 'Invalid gender value');
      return res.redirect('/userProfile');
    }

    // Prepare update data
    const updateData = {
      name: name.trim(),
      phone: phone || null,
      username: username ? username.trim() : null,
      gender: gender || undefined,
    };

    // Handle profile image
    if (req.file) {
      updateData.profileImage = req.file.path; // Cloudinary URL
    }

    // Remove undefined fields
    Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);
    console.log('Update data:', updateData); // Debugging

    // Check for duplicates
    if (username || phone) {
      const existingUser = await User.findOne({
        $or: [
          { username: username ? username.trim() : null },
          { phone: phone || null },
        ],
        _id: { $ne: userId },
      });

      if (existingUser) {
        if (existingUser.username === username) {
          req.flash('error', 'Username is already taken');
        } else if (existingUser.phone === phone) {
          req.flash('error', 'Phone number is already in use');
        }
        return res.redirect('/userProfile');
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      console.error('User not found for ID:', userId);
      req.flash('error', 'User not found');
      return res.redirect('/userProfile');
    }

    console.log('Updated user:', updatedUser); // Debugging

    // Update session
    req.session.user = updatedUser.toObject();
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
    });

    req.flash('success', 'Profile updated successfully');
    res.redirect('/userProfile');
  } catch (error) {
    console.error('Error updating profile:', error);
    if (error instanceof multer.MulterError) {
      req.flash('error', `File upload error: ${error.message}`);
    } else if (
      error.message.includes('Only profileImage field is allowed') ||
      error.message.includes('Only JPEG, JPG, PNG, and WEBP files are allowed')
    ) {
      req.flash('error', error.message);
    } else if (error.code === 11000) {
      if (error.keyPattern.username) {
        req.flash('error', 'Username is already taken');
      } else if (error.keyPattern.phone) {
        req.flash('error', 'Phone number is already in use');
      } else {
        req.flash('error', 'Duplicate value error');
      }
    } else {
      req.flash('error', 'An error occurred while updating your profile');
    }
    res.redirect('/userProfile');
  }
};

// Placeholder for other controller functions
