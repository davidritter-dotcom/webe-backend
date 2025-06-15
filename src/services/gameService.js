const WebSocketManager = require("./WebSocketManager");
const Lobby = require("../models/Lobby");
const { getRandomWords } = require("../utils/wordList");

const activeTimers = new Map();
const roundLocks = new Set();
const playerReadyMap = new Map(); // lobbyId => Set of ready playerIds

function emitToLobbyPlayers(lobby, event, payloadFn) {
  lobby.players.forEach((player) => {
    const sock = WebSocketManager.connections.get(player);
    if (sock) {
      sock.emit(event, payloadFn(player));
      console.log(`[DEBUG] Emitting ${event} to player ${player}`);
    }
  });
}

async function broadcastTimerUpdate(lobbyId, timeLeft) {
  const lobby = await Lobby.findOne({ lobbyId });
  if (!lobby) return;
  emitToLobbyPlayers(lobby, "ROUND_TIME_UPDATE", () => ({
    timeRemaining: timeLeft,
  }));
}

async function startGame(userId, { lobbyId, rounds }) {
  const lobby = await Lobby.findOne({ lobbyId });
  if (!lobby || lobby.host !== userId) return;

  lobby.totalRounds = rounds;
  lobby.currentRound = 0;
  lobby.roundTime = 60; // Default round time in seconds
  lobby.scores = new Map(lobby.players.map((p) => [p, 0]));
  lobby.guessedPlayers = [];
  lobby.solutionWords = getRandomWords(rounds);
  lobby.status = "started";

  playerReadyMap.set(lobby.lobbyId, new Set());
  emitToLobbyPlayers(lobby, "GAME_STARTED", () => ({}));

  await lobby.save();
  await startNextRound(lobby);
}

async function startNextRound(lobby) {
  console.log(`[DEBUG] Starting next round ${lobby.currentRound + 1}`);
  //todo: if round 0 wait for players to be ready

  // Round 0 check (before increment)
  if (lobby.currentRound === 0) {
    // Wait for all players to send PLAYER_READY
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        const readySet = playerReadyMap.get(lobby.lobbyId);
        if (readySet && readySet.size === lobby.players.length) {
          clearInterval(interval);
          playerReadyMap.delete(lobby.lobbyId);
          resolve();
        }
      }, 500); // Check every 500ms
    });
  }

  if (++lobby.currentRound > lobby.totalRounds) {
    return await endGame(lobby);
  }

  lobby.currentDrawer =
    lobby.players[lobby.currentRound % lobby.players.length];
  //lobby.currentWord = lobby.solutionWords[lobby.currentRound - 1];
  lobby.guessedPlayers = [];
  await lobby.save();

  await handleWordSelection(lobby);

  emitToLobbyPlayers(lobby, "NEW_ROUND", (playerId) => ({
    currentDrawer: lobby.currentDrawer,
    isDrawing: playerId === lobby.currentDrawer,
    currentWord: lobby.currentWord,
    currentRound: lobby.currentRound,
    totalRounds: lobby.totalRounds,
    roundTime: lobby.roundTime,
    //scores: Array.from(lobby.scores.entries()),
  }));

  startRoundTimer(lobby);
}

function startRoundTimer(lobby) {
  const { lobbyId, roundTime } = lobby;
  let timeLeft = roundTime;

  clearInterval(activeTimers.get(lobbyId));

  const interval = setInterval(async () => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(interval);
      activeTimers.delete(lobbyId);
      await safeEndRound(lobbyId);
    } else {
      broadcastTimerUpdate(lobbyId, timeLeft);
    }
  }, 1000);

  activeTimers.set(lobbyId, interval);
}

async function safeEndRound(lobbyId) {
  if (roundLocks.has(lobbyId)) return;
  roundLocks.add(lobbyId);
  try {
    await endRound(lobbyId);
  } catch (err) {
    console.error(`[ERROR] endRound: ${err}`);
  } finally {
    roundLocks.delete(lobbyId);
  }
}

async function endRound(lobbyId) {
  const lobby = await Lobby.findOne({ lobbyId });
  if (!lobby) return;

  clearInterval(activeTimers.get(lobbyId));

  //Reset correct guesses for the new round
  lobby.correctGuesses = [];
  lobby.chatHistory = []; // Clear chat history for the new round
  await lobby.save();

  emitToLobbyPlayers(lobby, "ROUND_ENDED", () => ({
    word: lobby.currentWord,
    scores: Array.from(lobby.scores.entries()),
  }));

  startNextRound(lobby);
}

WebSocketManager.subscribe("GUESS_WORD", async (userId, { lobbyId, guess }) => {
  const lobby = await Lobby.findOne({ lobbyId });
  if (
    !lobby ||
    userId === lobby.drawingPlayer ||
    lobby.guessedPlayers.includes(userId)
  )
    return;

  if (guess.trim().toLowerCase() === lobby.currentWord.trim().toLowerCase()) {
    lobby.guessedPlayers.push(userId);
    lobby.scores.set(userId, (lobby.scores.get(userId) || 0) + 10);
    await lobby.save();

    emitToLobbyPlayers(lobby, "SCORE_UPDATE", () => ({
      player: userId,
      guessedPlayers: lobby.guessedPlayers,
      scores: Array.from(lobby.scores.entries()),
    }));

    if (lobby.guessedPlayers.length === lobby.players.length - 1) {
      clearInterval(activeTimers.get(lobbyId));
      activeTimers.delete(lobbyId);
      await safeEndRound(lobbyId);
    }
  }
});

async function endGame(lobby) {
  emitToLobbyPlayers(lobby, "GAME_OVER", () => ({
    finalScores: Array.from(lobby.scores.entries()),
  }));

  // Reset lobby status
  lobby.status = "waiting";
  lobby.currentRound = 0;
  await lobby.save();
  playerReadyMap.delete(lobby.lobbyId);
}

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

  // Wenn weniger als 2 Spieler übrig sind → Spiel beenden
  if (lobby.players.length < 2 && lobby.status === "started") {
    await endGame(lobby);

    // Alle verbleibenden Spieler benachrichtigen
    lobby.players.forEach((player) => {
      const sock = WebSocketManager.connections.get(player);
      if (sock) {
        sock.emit("FORCED_GAME_OVER", {
          message: "Das Spiel wurde beendet, da zu wenige Spieler übrig sind.",
        });
      }
    });

    await lobby.save();

    const socket = WebSocketManager.connections.get(userId);
    if (socket) {
      socket.emit("GAME_LEFT", { lobbyId });
    }

    console.log(
      `${userId} hat Game ${lobbyId} verlassen (zu wenige Spieler, Spiel beendet).`
    );
    return;
  }

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
      const wordToSend = lobby.currentWord;

      // Send the game state
      // maybe put guessed players in the payload?
      // maybe send all the previous chat messages from the round?
      sock.emit("GAME_STATE", {
        lobbyId: lobby.lobbyId,
        players: lobby.players,
        isDrawing: isDrawing,
        currentWord: wordToSend,
        currentDrawer: lobby.currentDrawer,
        currentRound: lobby.currentRound,
        totalRounds: lobby.totalRounds,
        roundTime: lobby.roundTime,
        scores: Array.from(lobby.scores.entries()),
        chatHistory: lobby.chatHistory,
      });
    }
    // Add player to the ready set for this lobby
    if (lobby.currentRound === 0) {
      if (!playerReadyMap.has(lobby.lobbyId)) {
        playerReadyMap.set(lobby.lobbyId, new Set());
      }
      playerReadyMap.get(lobby.lobbyId).add(userId);
    }
  }
});

async function handleWordSelection(lobby) {
  console.log(
    `[DEBUG] Handling word selection for round ${lobby.currentRound}`
  );
  return new Promise(async (resolve) => {
    const drawerId = lobby.currentDrawer;
    const socket = WebSocketManager.connections.get(drawerId);
    if (!socket) return resolve();

    const wordOptions = getRandomWords(3);
    lobby.wordOptions = wordOptions;
    lobby.currentWord = null;
    await lobby.save();

    socket.emit("WORD_CHOICES", {
      wordOptions,
      timeoutSeconds: 10,
    });

    // Temporärer Handler
    const onWordChosen = async (userId, { lobbyId, word }) => {
      if (userId !== drawerId || lobby.lobbyId !== lobbyId) return;

      if (!lobby.wordOptions.includes(word)) return;

      clearTimeout(timeoutId);

      lobby.currentWord = word;
      lobby.wordOptions = [];
      await lobby.save();

      const sock = WebSocketManager.connections.get(drawerId);
      if (sock) {
        sock.emit("WORD_SELECTED_CONFIRMATION", { chosenWord: word });
      }

      WebSocketManager.unsubscribe("WORD_CHOSEN", onWordChosen); // <- Entferne Handler
      resolve();
    };

    // Handler abonnieren
    WebSocketManager.subscribe("WORD_CHOSEN", onWordChosen);

    // Timeout → zufälliges Wort wählen
    const timeoutId = setTimeout(async () => {
      const fallbackWord =
        wordOptions[Math.floor(Math.random() * wordOptions.length)];
      lobby.currentWord = fallbackWord;
      lobby.wordOptions = [];
      await lobby.save();

      if (socket) {
        socket.emit("WORD_SELECTED_CONFIRMATION", {
          chosenWord: fallbackWord,
          autoSelected: true,
        });
      }

      WebSocketManager.unsubscribe("WORD_CHOSEN", onWordChosen); // <- Entferne Handler
      resolve();
    }, 10000);
  });
}

module.exports = {
  startGame,
  endRound,
};
