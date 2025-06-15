const WebSocketManager = require("./WebSocketManager");
const Lobby = require("../models/Lobby");
const { getRandomWords } = require("../utils/wordList");

const activeTimers = new Map();
const roundLocks = new Set();

function emitToLobbyPlayers(lobby, event, payloadFn) {
  lobby.players.forEach((player) => {
    const sock = WebSocketManager.connections.get(player);
    if (sock) {
      sock.emit(event, payloadFn(player));
    }
  });
}

function broadcastTimerUpdate(lobbyId, timeLeft) {
  const lobby = WebSocketManager.lobbies.get(lobbyId);
  if (!lobby) return;
  emitToLobbyPlayers(lobby, "TIMER_UPDATE", () => ({ timeLeft }));
}

async function startGame(userId, { lobbyId, rounds }) {
  const lobby = await Lobby.findOne({ lobbyId });
  if (!lobby || lobby.host !== userId) return;

  lobby.totalRounds = rounds;
  lobby.currentRound = 0;
  lobby.roundTime = 90;
  lobby.points = new Map(lobby.players.map((p) => [p, 0]));
  lobby.guessedPlayers = [];
  lobby.solutionWords = getRandomWords(rounds);

  await lobby.save();
  await startNextRound(lobby);
}

async function startNextRound(lobby) {
  //todo: if round 0 wait for players to be ready
  if (++lobby.currentRound > lobby.totalRounds) {
    return await endGame(lobby);
  }

  lobby.drawingPlayer =
    lobby.players[lobby.currentRound % lobby.players.length];
  lobby.currentWord = lobby.solutionWords[lobby.currentRound - 1];
  lobby.guessedPlayers = [];

  await lobby.save();

  emitToLobbyPlayers(lobby, "NEW_ROUND", (playerId) => ({
    currentWord: playerId === lobby.drawingPlayer ? lobby.currentWord : null,
    currentDrawer: lobby.drawingPlayer,
    currentRound: lobby.currentRound,
    totalRounds: lobby.totalRounds,
    roundTime: lobby.roundTime,
    scores: Object.fromEntries(lobby.points),
  }));

  startRoundTimer(lobby);
}

function startRoundTimer(lobby) {
  const { lobbyId, roundTime } = lobby;
  let timeLeft = roundTime;

  clearInterval(activeTimers.get(lobbyId));

  const interval = setInterval(async () => {
    if (--timeLeft <= 0) {
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

  emitToLobbyPlayers(lobby, "ROUND_ENDED", () => ({
    word: lobby.currentWord,
    points: Object.fromEntries(lobby.points),
  }));

  setTimeout(() => startNextRound(lobby), 3000);
}

async function handleGuess(userId, { lobbyId, guess }) {
  const lobby = await Lobby.findOne({ lobbyId });
  if (
    !lobby ||
    userId === lobby.drawingPlayer ||
    lobby.guessedPlayers.includes(userId)
  )
    return;

  if (guess.trim().toLowerCase() === lobby.currentWord.trim().toLowerCase()) {
    lobby.guessedPlayers.push(userId);
    lobby.points.set(userId, (lobby.points.get(userId) || 0) + 10);
    await lobby.save();

    emitToLobbyPlayers(lobby, "CORRECT_GUESS", () => ({
      player: userId,
      guessedPlayers: lobby.guessedPlayers,
      points: Object.fromEntries(lobby.points),
    }));

    if (lobby.guessedPlayers.length === lobby.players.length - 1) {
      clearInterval(activeTimers.get(lobbyId));
      activeTimers.delete(lobbyId);
      await safeEndRound(lobbyId);
    }
  }
}

async function endGame(lobby) {
  emitToLobbyPlayers(lobby, "GAME_ENDED", () => ({
    points: Object.fromEntries(lobby.points),
  }));
}

async function leaveGame(userId, { lobbyId }) {
  const lobby = await Lobby.findOne({ lobbyId });
  if (!lobby) return;

  lobby.players = lobby.players.filter((p) => p !== userId);

  if (lobby.players.length === 0) {
    clearInterval(activeTimers.get(lobbyId));
    await Lobby.deleteOne({ lobbyId });
    return;
  }

  if (userId === lobby.host) {
    lobby.host = lobby.players[0];
  }

  await lobby.save();

  emitToLobbyPlayers(lobby, "PLAYER_LEFT", () => ({
    playerId: userId,
    players: lobby.players,
    host: lobby.host,
  }));
}

async function playerReady(userId, { lobbyId }) {
  //TODO: send initial or actual game state
  const lobby = await Lobby.findOne({ lobbyId });
  if (!lobby || !lobby.players.includes(userId)) return;

  if (!lobby.readyPlayers) lobby.readyPlayers = [];
  if (!lobby.readyPlayers.includes(userId)) lobby.readyPlayers.push(userId);

  await lobby.save();

  if (lobby.readyPlayers.length === lobby.players.length) {
    await startGame(lobby.host, { lobbyId, rounds: lobby.totalRounds || 5 });
  }
}

module.exports = {
  startGame,
  handleGuess,
  leaveGame,
  playerReady,
};
