const WebSocketManager = require("./WebSocketManager");
const Lobby = require("../models/Lobby"); // Declare the Lobby variable

// Store active timers to prevent duplicates
const activeTimers = new Map();

async function startGame(userId, { lobbyId, rounds }) {
  console.log(
    `[DEBUG] LOBBY_START event received from ${userId} for lobby ${lobbyId}`
  );

  const lobby = await Lobby.findOne({ lobbyId });

  if (!lobby || lobby.host !== userId) {
    console.log(
      `[DEBUG] Error: ${!lobby ? "Lobby not found" : "User is not host"}`
    );
    const socket = WebSocketManager.connections.get(userId);
    socket.emit("LOBBY_START_ERROR", {
      message: "Only the host can start the game.",
    });
    return;
  }

  // Generate solution words (example list)
  const wordList = [
    "apple",
    "banana",
    "car",
    "dog",
    "elephant",
    "flower",
    "guitar",
    "house",
    "island",
    "jacket",
    "kite",
    "lemon",
    "mountain",
    "notebook",
    "ocean",
    "piano",
    "queen",
    "rainbow",
    "sun",
    "tree",
    "umbrella",
    "violin",
    "waterfall",
    "xylophone",
    "yacht",
    "zebra",
    "airplane",
    "butterfly",
    "castle",
    "dolphin",
  ];

  // Ensure rounds is a valid number
  const totalRounds = rounds || lobby.players.length * 2; // Default to 2x if not specified
  console.log(`[DEBUG] Starting game with ${totalRounds} rounds`);

  // Randomly select words from the list
  const solutionWords = [];

  // Make sure we have enough words for all rounds
  for (let i = 0; i < totalRounds; i++) {
    const randomIndex = Math.floor(Math.random() * wordList.length);
    solutionWords.push(wordList[randomIndex]);
  }

  // CRITICAL FIX: Ensure the first drawer is explicitly set
  const firstDrawer = lobby.players[0];

  lobby.solutionWords = solutionWords;
  lobby.currentWord = solutionWords[0];
  lobby.currentDrawer = firstDrawer; // Explicitly set the first drawer
  lobby.scores = new Map(lobby.players.map((player) => [player, 0])); // Initialize scores
  lobby.currentRound = 1;
  lobby.totalRounds = totalRounds;
  lobby.correctGuesses = []; // Track who has guessed correctly in the current round
  lobby.roundStartTime = new Date(); // Track when the round started

  lobby.status = "started";
  await lobby.save();

  // Log the game state for debugging
  console.log(`[DEBUG] Game started with:`);
  console.log(`[DEBUG] - Current drawer: ${lobby.currentDrawer}`);
  console.log(`[DEBUG] - Current word: ${lobby.currentWord}`);
  console.log(`[DEBUG] - Total rounds: ${lobby.totalRounds}`);
  console.log(`[DEBUG] - Players: ${lobby.players.join(", ")}`);

  // CRITICAL FIX: Send a pre-game notification to ensure all clients are ready
  lobby.players.forEach((player) => {
    const sock = WebSocketManager.connections.get(player);
    if (sock) {
      sock.emit("GAME_PREPARING", {
        message: "Game is starting...",
        firstDrawer: firstDrawer,
      });
    }
  });

  // Short delay to ensure all clients have received the preparation message
  setTimeout(() => {
    // Send game started event to all players with correct initial state
    lobby.players.forEach((player) => {
      const sock = WebSocketManager.connections.get(player);
      if (sock) {
        const isDrawing = player === firstDrawer;
        //const wordToSend = isDrawing ? lobby.currentWord : null TODO: check if needed
        const wordToSend = "test"; // send word to everyone

        console.log(
          `[DEBUG] Sending GAME_STARTED to ${player}: isDrawing=${isDrawing}, word=${
            wordToSend || "hidden"
          }`
        );

        // First, send a direct message to test socket connection
        sock.emit("DEBUG_MESSAGE", {
          message: `Hello ${player}, you ${
            isDrawing ? "are" : "are not"
          } the drawer. Drawer is ${firstDrawer}.`,
        });

        // Then send the actual game start data
        sock.emit("GAME_STARTED", {
          lobbyId,
          players: lobby.players,
          currentDrawer: firstDrawer,
          isDrawing: isDrawing,
          currentWord: wordToSend,
          currentRound: lobby.currentRound,
          totalRounds: lobby.totalRounds,
        });
      } else {
        console.log(`[DEBUG] ERROR: Socket not found for player ${player}`);
      }
    });

    console.log(
      `[DEBUG] Game in lobby ${lobbyId} started by ${userId} with ${totalRounds} rounds.`
    );

    // Start the round timer
    startRoundTimer(lobbyId);
  }, 1000); // 1 second delay before actually starting the game
}

// Add this function to handle the round timer
function startRoundTimer(lobbyId) {
  console.log(`[DEBUG] Starting round timer for lobby ${lobbyId}`);

  // Clear any existing timer for this lobby
  if (activeTimers.has(lobbyId)) {
    clearInterval(activeTimers.get(lobbyId));
    activeTimers.delete(lobbyId);
    console.log(`[DEBUG] Cleared existing timer for lobby ${lobbyId}`);
  }

  const ROUND_TIME = 60; // 60 seconds per round
  let timeRemaining = ROUND_TIME;

  const timerInterval = setInterval(async () => {
    timeRemaining--;

    // Update all clients with the time
    const lobby = await Lobby.findOne({ lobbyId });
    if (!lobby || lobby.status !== "started") {
      console.log(
        `[DEBUG] Stopping timer: ${
          !lobby ? "Lobby not found" : "Game not started"
        }`
      );
      clearInterval(timerInterval);
      activeTimers.delete(lobbyId);
      return;
    }

    // Only send time updates every 5 seconds to reduce console spam
    if (timeRemaining % 5 === 0 || timeRemaining <= 10) {
      console.log(`[DEBUG] Round time remaining: ${timeRemaining}s`);
    }

    // Send time update to all players
    lobby.players.forEach((player) => {
      const sock = WebSocketManager.connections.get(player);
      if (sock) {
        sock.emit("ROUND_TIME_UPDATE", { timeRemaining });
      }
    });

    // If time is up, end the round
    if (timeRemaining <= 0) {
      console.log(`[DEBUG] Round time up, ending round`);
      clearInterval(timerInterval);
      activeTimers.delete(lobbyId);
      await endRound(lobbyId);
    }
  }, 1000);

  // Store the timer reference
  activeTimers.set(lobbyId, timerInterval);
}

// Add this function to handle ending a round
async function endRound(lobbyId) {
  console.log(`[DEBUG] Ending round for lobby ${lobbyId}`);

  // Clear any existing timer
  if (activeTimers.has(lobbyId)) {
    clearInterval(activeTimers.get(lobbyId));
    activeTimers.delete(lobbyId);
  }

  const lobby = await Lobby.findOne({ lobbyId });
  if (!lobby || lobby.status !== "started") {
    console.log(
      `[DEBUG] Cannot end round: ${
        !lobby ? "Lobby not found" : "Game not started"
      }`
    );
    return;
  }

  // Notify all players that the round ended
  lobby.players.forEach((player) => {
    const sock = WebSocketManager.connections.get(player);
    if (sock) {
      console.log(`[DEBUG] Sending ROUND_ENDED to ${player}`);
      sock.emit("ROUND_ENDED", {
        word: lobby.currentWord,
        scores: Array.from(lobby.scores.entries()),
      });
    }
  });

  // Check if this was the last round
  if (lobby.currentRound >= lobby.totalRounds) {
    console.log(`[DEBUG] Last round completed, game over`);
    // Game is over
    setTimeout(async () => {
      const finalScores = Array.from(lobby.scores.entries()).sort(
        (a, b) => b[1] - a[1]
      ); // Sort by score descending

      lobby.players.forEach((player) => {
        const sock = WebSocketManager.connections.get(player);
        if (sock) {
          console.log(`[DEBUG] Sending GAME_OVER to ${player}`);
          sock.emit("GAME_OVER", {
            finalScores,
          });
        }
      });

      // Reset lobby status
      lobby.status = "waiting";
      await lobby.save();
      console.log(`[DEBUG] Lobby reset to waiting state`);
    }, 5000); // Show scores for 5 seconds
  } else {
    console.log(`[DEBUG] Preparing for next round in 5 seconds`);
    // Prepare for next round after 5 seconds
    setTimeout(async () => {
      // Move to the next round
      lobby.currentRound++;

      // Calculate next drawer index (rotate through players)
      const currentDrawerIndex = lobby.players.indexOf(lobby.currentDrawer);
      const nextDrawerIndex = (currentDrawerIndex + 1) % lobby.players.length;
      lobby.currentDrawer = lobby.players[nextDrawerIndex];

      // Set the next word
      lobby.currentWord = lobby.solutionWords[lobby.currentRound - 1];

      // Reset correct guesses for the new round
      lobby.correctGuesses = [];

      // Update round start time
      lobby.roundStartTime = new Date();

      await lobby.save();

      // Log the new round state for debugging
      console.log(`[DEBUG] New round ${lobby.currentRound} started:`);
      console.log(`[DEBUG] - Current drawer: ${lobby.currentDrawer}`);
      console.log(`[DEBUG] - Current word: ${lobby.currentWord}`);

      // Notify all players about the new round
      lobby.players.forEach((player) => {
        const sock = WebSocketManager.connections.get(player);
        if (sock) {
          const isDrawing = player === lobby.currentDrawer;
          const wordToSend = lobby.currentWord;

          console.log(
            `[DEBUG] Sending NEW_ROUND to ${player}: isDrawing=${isDrawing}, word=${
              wordToSend || "hidden"
            }`
          );

          sock.emit("NEW_ROUND", {
            currentRound: lobby.currentRound,
            totalRounds: lobby.totalRounds,
            currentDrawer: lobby.currentDrawer,
            isDrawing: isDrawing,
            currentWord: wordToSend,
          });
        }
      });

      // Start the timer for the new round
      startRoundTimer(lobbyId);
    }, 5000); // 5 second pause between rounds
  }
}

// Add a new handler for the PLAYER_READY event

WebSocketManager.subscribe("PLAYER_READY", async (userId, data) => {
  console.log(`[DEBUG] Player ${userId} is ready`);

  // Find any active games this player is in
  const Lobby = require("../models/Lobby");
  const lobby = await Lobby.findOne({
    players: userId,
    status: "started",
  });

  if (lobby) {
    console.log(
      `[DEBUG] Player ${userId} is in an active game (lobby ${lobby.lobbyId})`
    );

    // Re-send game state to this player
    const sock = WebSocketManager.connections.get(userId);
    if (sock) {
      const isDrawing = userId === lobby.currentDrawer;
      //const wordToSend = isDrawing ? lobby.currentWord : null // Only send the word to the drawer
      const wordToSend = lobby.currentWord;

      console.log(
        `[DEBUG] Re-sending game state to ${userId}: isDrawing=${isDrawing}, drawer=${lobby.currentDrawer}`
      );

      // Send debug message first
      sock.emit("DEBUG_MESSAGE", {
        message: `Game state refreshed. You ${
          isDrawing ? "are" : "are not"
        } the drawer. Drawer is ${lobby.currentDrawer}.`,
      });

      // Then send the game state
      sock.emit("GAME_STARTED", {
        lobbyId: lobby.lobbyId,
        players: lobby.players,
        currentDrawer: lobby.currentDrawer,
        isDrawing: isDrawing,
        currentWord: wordToSend,
        currentRound: lobby.currentRound,
        totalRounds: lobby.totalRounds,
        scores: Array.from(lobby.scores.entries()),
      });
    }
  }
});

WebSocketManager.subscribe("GUESS_WORD", async (userId, { lobbyId, guess }) => {
  const lobby = await Lobby.findOne({ lobbyId });

  if (!lobby || lobby.status !== "started") {
    const socket = WebSocketManager.connections.get(userId);
    socket.emit("GUESS_ERROR", {
      message: "Lobby not found or game not started.",
    });
    return;
  }

  if (guess.toLowerCase() === lobby.currentWord.toLowerCase()) {
    // Update the score for the guessing player
    lobby.scores.set(userId, (lobby.scores.get(userId) || 0) + 1);

    // Notify all players
    lobby.players.forEach((player) => {
      const sock = WebSocketManager.connections.get(player);
      if (sock) {
        sock.emit("CHAT_MESSAGE", {
          message: `${userId} has found the word!`,
        });
        sock.emit("UPDATE_SCOREBOARD", Array.from(lobby.scores.entries()));
      }
    });

    // Move to the next round
    const nextDrawerIndex =
      (lobby.players.indexOf(lobby.currentDrawer) + 1) % lobby.players.length;
    lobby.currentDrawer = lobby.players[nextDrawerIndex];
    lobby.currentWord = lobby.solutionWords[nextDrawerIndex];

    await lobby.save();

    // Notify the new drawer
    lobby.players.forEach((player) => {
      const sock = WebSocketManager.connections.get(player);
      if (sock) {
        sock.emit("NEW_ROUND", {
          currentDrawer: lobby.currentDrawer,
          isDrawing: player === lobby.currentDrawer,
          currentWord: lobby.currentWord,
        });
      }
    });
  }
});

WebSocketManager.subscribe("LEAVE_GAME", async (userId, { lobbyId }) => {
  const lobby = await Lobby.findOne({ lobbyId });

  if (!lobby) {
    const socket = WebSocketManager.connections.get(userId);
    socket.emit("LEAVE_GAME_ERROR", { message: "Lobby nicht gefunden." });
    return;
  }

  // Spieler aus der Lobby entfernen
  lobby.players = lobby.players.filter((id) => id !== userId);
  lobby.scores.delete(userId); // Entferne den Spieler aus der Punktetabelle

  // Wenn der Host geht, übergebe Hostrolle oder lösche die Lobby
  if (lobby.host === userId) {
    if (lobby.players.length > 0) {
      lobby.host = lobby.players[0]; // Neuen Host setzen
    } else {
      // Keine Spieler mehr → Lobby löschen
      await Lobby.deleteOne({ lobbyId });
      console.log(`Game ${lobbyId} wurde gelöscht (letzter Spieler ging).`);
      const socket = WebSocketManager.connections.get(userId);
      if (socket) {
        socket.emit("GAME_LEFT", { lobbyId });
      }

      console.log(`${userId} hat Game ${lobbyId} verlassen.`);
      return;
    }
  }

  // Zeichnerwechsel
  if (lobby.currentDrawer === userId) {
    lobby.currentDrawer = lobby.players[0];
  }

  await lobby.save();

  // Alle verbleibenden Spieler über die Änderung informieren
  lobby.players.forEach((player) => {
    const sock = WebSocketManager.connections.get(player);
    if (sock) {
      sock.emit("USER_LEFT_GAME", {
        username: userId,
        currentDrawer: lobby.currentDrawer,
      });
    }
  });

  const socket = WebSocketManager.connections.get(userId);
  if (socket) {
    socket.emit("GAME_LEFT", { lobbyId });
  }

  console.log(`${userId} hat Game ${lobbyId} verlassen.`);
});

module.exports.endRound = endRound;
module.exports.startGame = startGame;
