// backend/middleware/auth.js

const jwt = require('jsonwebtoken');
require('dotenv').config(); // Loads variables from .env file

module.exports = function (req, res, next) {
  // 1. Get the token from the Authorization header
  const authHeader = req.header('Authorization');

  // 2. Check if the header or token exists
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    // 3. Extract the token from the "Bearer <token>" format
    const token = authHeader.split(' ')[1];

    // 4. Verify the token using the secret from your .env file
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next(); // Pass control to the next route handler
  } catch (err) {
    // This runs if the token is expired or invalid
    res.status(401).json({ msg: 'Token is not valid' });
  }
};