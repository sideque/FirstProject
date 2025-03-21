const express = require('express');
const app = express();
const env = require('dotenv').config();
const db = require('./config/db');
db()


const PORT = parseInt(process.env.PORT);

app.listen(process.env.PORT, ()=>{
    console.log(`Server running on port ${PORT}`)
})


module.exports = app;