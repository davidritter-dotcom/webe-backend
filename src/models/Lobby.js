const mongoose = require("mongoose");

const lobbySchema = new mongoose.Schema({
  lobbyId: { type: String, required: true, unique: true },
  host: { type: String, required: true }, // Username of the host
  players: [{ type: String }], // Usernames of players
  status: { type: String, enum: ["waiting", "started"], default: "waiting" },
  solutionWords: [{ type: String }], // List of solution words for the game
  currentWord: { type: String }, // The word for the current round
  currentDrawer: { type: String }, // The player currently drawing
  scores: { type: Map, of: Number }, // Scores for each player
  createdAt: { type: Date, default: Date.now },
  currentRound: { type: Number, default: 1 },
  totalRounds: { type: Number },
  correctGuesses: [{ type: String }], // Players who guessed correctly in current round
  roundStartTime: { type: Date },
  roundTime: { type: Number, default: 60 }, // Time for each round in seconds
  wordOptions: [{ type: String }], // Options for the current word
  chatHistory: [
    {
      userId: String,
      message: String,
    },
  ],
});

module.exports = mongoose.model("Lobby", lobbySchema);
