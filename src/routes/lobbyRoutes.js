const express = require("express");
const verifyToken = require("../middleware/authMiddleware");
const Lobby = require("../models/Lobby");

const router = express.Router();

router.get("/state", verifyToken, async (req, res) => {
  const userId = req.user.username; // angenommen, auth middleware ist aktiv

  const lobby = await Lobby.findOne({
    players: userId,
  });

  if (!lobby) {
    return res.json({ inLobby: false });
  }

  return res.json({
    inLobby: true,
    lobbyId: lobby.lobbyId,
    players: lobby.players,
    host: lobby.host,
    status: lobby.status,
    isHost: lobby.host === userId,
  });
});

module.exports = router;
