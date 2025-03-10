const express = require("express");
const verifyToken = require("../middleware/auth");

const router = express.Router();

// Protected route
router.get("/", verifyToken, (req, res) => {
  res.json({
    message: "Du hast Zugriff auf diese Route! Test erfolgreich!",
    user: req.user,
  });
});

module.exports = router;
