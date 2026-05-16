// middleware/authMiddleware.js

const requireLogin = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Please log in to access this page.' });
  }
};

module.exports = { requireLogin };