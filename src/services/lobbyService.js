const { socketIo, io } = require("socket.io");
const WebSocketManager = require("./WebSocketManager");
const Lobby = require("../models/Lobby");
const User = require("../models/User");
const { v4: uuidv4 } = require("uuid");

WebSocketManager.subscribe("CREATE_LOBBY", async (userId, data) => {
  const lobbyId = uuidv4();

  const newLobby = new Lobby({
    lobbyId,
    host: userId,
    players: [userId],
  });

  await newLobby.save();

  const socket = WebSocketManager.connections.get(userId);
  socket.emit("LOBBY_CREATED", { lobbyId });
  console.log(`${userId} hat Lobby ${lobbyId} erstellt.`);
});

WebSocketManager.subscribe("JOIN_LOBBY", async (userId, { lobbyId }) => {
  const lobby = await Lobby.findOne({ lobbyId });

  if (!lobby) {
    const socket = WebSocketManager.connections.get(userId);
    socket.emit("JOIN_LOBBY_ERROR", { message: "Lobby nicht gefunden." });
    return;
  }

  if (lobby.status !== "waiting") {
    const socket = WebSocketManager.connections.get(userId);
    socket.emit("JOIN_LOBBY_ERROR", { message: "Spiel hat bereits begonnen." });
    return;
  }

  if (!lobby.players.includes(userId)) {
    lobby.players.push(userId);
    await lobby.save();
  }

  lobby.players.forEach((player) => {
    const sock = WebSocketManager.connections.get(player);
    if (sock) {
      sock.emit("LOBBY_UPDATED", {
        lobbyId: lobby.lobbyId,
        players: lobby.players,
        host: lobby.host,
        isHost: lobby.host === player, // Wird noch optimiert
      });
    }
  });

  console.log(`${userId} ist Lobby ${lobbyId} beigetreten.`);
});

WebSocketManager.subscribe(
  "LOBBY_INVITE",
  async (userId, { targetUser, lobbyId }) => {
    const socket = WebSocketManager.connections.get(targetUser);
    if (socket) {
      socket.emit("LOBBY_INVITED", { from: userId, lobbyId });
      console.log(
        `${userId} hat ${targetUser} in Lobby ${lobbyId} eingeladen.`
      );
    }
  }
);

WebSocketManager.subscribe("LOBBY_START", async (userId, { lobbyId }) => {
  const lobby = await Lobby.findOne({ lobbyId });

  if (!lobby || lobby.host !== userId) {
    const socket = WebSocketManager.connections.get(userId);
    socket.emit("LOBBY_START_ERROR", {
      message: "Nur der Host kann das Spiel starten.",
    });
    return;
  }

  lobby.status = "started";
  await lobby.save();

  lobby.players.forEach((player) => {
    const sock = WebSocketManager.connections.get(player);
    if (sock) {
      sock.emit("GAME_STARTED", { lobbyId, players: lobby.players });
    }
  });

  console.log(`Spiel in Lobby ${lobbyId} wurde von ${userId} gestartet.`);
});

WebSocketManager.subscribe("LOBBY_SEARCH_USERS", async (userId, { query }) => {
  if (!query || query.length < 1) return;

  // Suche Usernamen die mit dem Query anfangen (case-insensitive)
  const users = await User.find({
    username: { $regex: `^${query}`, $options: "i" },
  })
    .limit(10)
    .select("username -_id"); // Nur den Namen zurückgeben

  console.log("Gefundene User: " + users);

  const socket = WebSocketManager.connections.get(userId);
  if (socket) {
    socket.emit(
      "LOBBY_SEARCH_RESULTS",
      users.map((u) => u.username)
    );
  }
});

WebSocketManager.subscribe("LEAVE_LOBBY", async (userId, { lobbyId }) => {
  const lobby = await Lobby.findOne({ lobbyId });

  if (!lobby) {
    const socket = WebSocketManager.connections.get(userId);
    socket.emit("LEAVE_LOBBY_ERROR", { message: "Lobby nicht gefunden." });
    return;
  }

  // Spieler aus der Lobby entfernen
  lobby.players = lobby.players.filter((id) => id !== userId);

  // Wenn der Host geht, übergebe Hostrolle oder lösche die Lobby
  if (lobby.host === userId) {
    if (lobby.players.length > 0) {
      lobby.host = lobby.players[0]; // Neuen Host setzen
    } else {
      // Keine Spieler mehr → Lobby löschen
      await Lobby.deleteOne({ lobbyId });
      console.log(`Lobby ${lobbyId} wurde gelöscht (letzter Spieler ging).`);
      return;
    }
  }

  await lobby.save();

  // Alle verbleibenden Spieler über die Änderung informieren
  lobby.players.forEach((player) => {
    const sock = WebSocketManager.connections.get(player);
    if (sock) {
      sock.emit("LOBBY_UPDATED", {
        lobbyId: lobby.lobbyId,
        players: lobby.players,
        host: lobby.host,
        isHost: lobby.host === player,
      });
    }
  });

  const socket = WebSocketManager.connections.get(userId);
  if (socket) {
    socket.emit("LOBBY_LEFT", { lobbyId });
  }

  console.log(`${userId} hat Lobby ${lobbyId} verlassen.`);
});
