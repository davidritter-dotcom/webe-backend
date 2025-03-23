const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const verifyToken = require("../middleware/authMiddleware"); // Import your middleware

const router = express.Router();

// Registration
router.post("/register", async (req, res) => {
  const { username, password } = req.body;

  const existingUser = await User.findOne({ username });
  if (existingUser)
    return res.status(400).json({ message: "Benutzername existiert bereits" });

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const newUser = new User({ username, password: hashedPassword });
  await newUser.save();

  res.json({ message: "Benutzer registriert!" });
});

// Login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user)
    return res.status(400).json({ message: "Benutzer nicht gefunden" });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ message: "Falsches Passwort" });

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    sameSite: "strict",
  });
  res.json({ accessToken });
});

// Logout
router.post("/logout", (req, res) => {
  res.clearCookie("refreshToken");
  res.json({ message: "Logged out" });
});

// refresh token
router.get("/refresh", (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  console.log(req.cookies);
  if (!refreshToken) return res.status(401).json({ message: "Unauthorized" });

  jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Forbidden" });

    const accessToken = generateAccessToken(user);
    res.json({ accessToken });
  });
});

// Function to generate access token
const generateAccessToken = (user) => {
  console.log(`Generated Access Token for ${user.username}`);
  return jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

// Function to generate refresh token
const generateRefreshToken = (user) => {
  console.log(`Generated Refresh Token for ${user.username}`);
  return jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

module.exports = router;
