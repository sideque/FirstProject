require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASSWORD,
  },
});

const mailOptions = {
  from: process.env.NODEMAILER_EMAIL,
  to: 'xidhique@gmail.com', // try your own email first
  subject: 'Test Email',
  text: 'This is a test email',
};

transporter.sendMail(mailOptions, function (error, info) {
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('Email sent:', info.response);
  }
});
