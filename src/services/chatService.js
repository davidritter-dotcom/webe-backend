const WebSocketManager = require("./WebSocketManager");
const Lobby = require("../models/Lobby");
const { endRound } = require("./gameServiceNew"); // Import the endRound function

// Chat message handler
WebSocketManager.subscribe("chat_message", async (userId, data) => {
  console.log(`Chat von ${userId}: ${data.message}`);

  // Check if this is a guess for a game
  const lobby = await Lobby.findOne({
    players: userId,
    status: "started",
  });

  if (lobby) {
    lobby.chatHistory.push({
      userId,
      message: data.message,
    });
    await lobby.save();

    // Don't allow the drawer to chat/guess
    if (userId === lobby.currentDrawer) {
      const socket = WebSocketManager.connections.get(userId);
      if (socket) {
        socket.emit("chat_message", {
          userId: "System",
          message: "You can't chat while drawing!",
        });
      }
      return;
    }

    // Don't allow players who already guessed correctly to chat
    if (lobby.correctGuesses.includes(userId)) {
      const socket = WebSocketManager.connections.get(userId);
      if (socket) {
        socket.emit("chat_message", {
          userId: "System",
          message: "You've already guessed correctly! Wait for the next round.",
        });
      }
      return;
    }

    // Check if the message is a correct guess
    if (
      data.message.toLowerCase().trim() ===
      lobby.currentWord.toLowerCase().trim()
    ) {
      // This player guessed correctly!
      lobby.correctGuesses.push(userId);

      // Determine points based on order of correct guesses
      let points = 1; // Default points
      if (lobby.correctGuesses.length === 1) points = 5;
      else if (lobby.correctGuesses.length === 2) points = 4;
      else if (lobby.correctGuesses.length === 3) points = 3;
      else if (lobby.correctGuesses.length === 4) points = 2;

      // Update score
      const currentScore = lobby.scores.get(userId) || 0;
      lobby.scores.set(userId, currentScore + points);
      await lobby.save();

      // Send success message to all players
      lobby.players.forEach((player) => {
        const ws = WebSocketManager.connections.get(player);
        if (ws) {
          ws.emit("chat_message", {
            userId: "System",
            message: `${
              userId === player ? "You have" : player + " has"
            } guessed the word! (+${points} points)`,
          });
        }
      });

      // Update scores for all players
      lobby.players.forEach((player) => {
        const sock = WebSocketManager.connections.get(player);
        if (sock) {
          sock.emit("SCORE_UPDATE", {
            scores: Array.from(lobby.scores.entries()),
            correctGuesses: lobby.correctGuesses,
          });
        }
      });

      // If all players have guessed correctly, end the round early
      if (lobby.correctGuesses.length >= lobby.players.length - 1) {
        // All except drawer
        // Find and call the endRound function from gameService
        endRound(lobby.lobbyId);
      }

      return;
    }

    // Regular chat message - send to all players
    lobby.players.forEach((player) => {
      const ws = WebSocketManager.connections.get(player);
      if (ws) {
        ws.emit("chat_message", { userId: userId, message: data.message });
      }
    });
    lobby.players.forEach((player) => {
      const sock = WebSocketManager.connections.get(player);
      if (sock) {
        sock.emit("SCORE_UPDATE", {
          scores: Array.from(lobby.scores.entries()),
          correctGuesses: lobby.correctGuesses,
        });
      }
    });
  } else {
    // Not in a game, just regular chat
    WebSocketManager.connections.forEach((ws, uid) => {
      ws.emit("chat_message", { userId: userId, message: data.message });
    });
  }
});
