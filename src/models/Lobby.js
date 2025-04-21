const mongoose = require("mongoose");

const lobbySchema = new mongoose.Schema({
  lobbyId: { type: String, required: true, unique: true },
  host: { type: String, required: true }, // Username des Erstellers
  players: [{ type: String }], // Usernames
  status: { type: String, enum: ["waiting", "started"], default: "waiting" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Lobby", lobbySchema);
