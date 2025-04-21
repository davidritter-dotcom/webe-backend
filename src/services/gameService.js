const express = require("express");
const http = require("http");
const { socketIo, io } = require("socket.io");
const cors = require("cors");
const WebSocketManager = require("./WebSocketManager");

const lobbies = new Map();

function generateLobbyId() {
  return Math.random().toString(36).substring(2, 10);
}

//   socket.on("createLobby", () => {
//     const lobbyId = generateLobbyId();
//     lobbies.set(lobbyId, {
//       players: new Set([socket.id]),
//       messages: [],
//       leader: socket.id,
//     });
//     socket.join(lobbyId);
//     socket.emit("lobbyCreated", lobbyId);
//     io.to(lobbyId).emit(
//       "playerJoined",
//       Array.from(lobbies.get(lobbyId).players)
//     );
//   });

WebSocketManager.subscribe("createLobby", (userId, data) => {
  console.log("createLobby", data);
  const socket = WebSocketManager.connections.get(userId);
  const lobbyId = generateLobbyId();
  lobbies.set(lobbyId, {
    players: new Set([socket.id]),
    messages: [],
    leader: socket.id,
  });
  socket.join(lobbyId);
  socket.emit("lobbyCreated", lobbyId);
  io.to(lobbyId).emit("playerJoined", Array.from(lobbies.get(lobbyId).players));
});

WebSocketManager.subscribe("joinLobby", (userId, data) => {
  const socket = WebSocketManager.connections.get(userId);
  console.log(data);
  const lobbyId = data.lobbyId;
  console.log(`Attempt to join lobby: ${lobbyId}`);
  if (lobbies.has(lobbyId)) {
    socket.join(lobbyId);
    const lobby = lobbies.get(lobbyId);
    lobby.players.add(socket.id);
    socket.emit("joinedLobby", lobbyId);
    io.to(lobbyId).emit("playerJoined", Array.from(lobby.players));
  } else {
    socket.emit("error", "Lobby not found");
  }
});

//   socket.on("joinLobby", (lobbyId) => {
//     console.log(`Attempt to join lobby: ${lobbyId}`);
//     if (lobbies.has(lobbyId)) {
//       socket.join(lobbyId);
//       const lobby = lobbies.get(lobbyId);
//       lobby.players.add(socket.id);
//       socket.emit("joinedLobby", lobbyId);
//       io.to(lobbyId).emit("playerJoined", Array.from(lobby.players));
//     } else {
//       socket.emit("error", "Lobby not found");
//     }
//   });

//   socket.on("startGame", (lobbyId) => {
//     const lobby = lobbies.get(lobbyId);
//     if (lobby && lobby.leader === socket.id) {
//       io.to(lobbyId).emit("gameStarted", lobbyId);
//     }
//   });

WebSocketManager.subscribe("startGame", (userId, data) => {
  const socket = WebSocketManager.connections.get(userId);
  console.log(data);
  const lobbyId = data.lobbyId;
  const lobby = lobbies.get(lobbyId);
  if (lobby && lobby.leader === socket.id) {
    io.to(lobbyId).emit("gameStarted", lobbyId);
  }
});

//   socket.on("sendMessage", ({ lobbyId, message }) => {
//     const lobby = lobbies.get(lobbyId);
//     if (lobby) {
//       const username = `User${socket.id.substr(0, 4)}`;
//       lobby.messages.push({ username, message });
//       io.to(lobbyId).emit("newMessage", { username, message });
//     }
//   });

WebSocketManager.subscribe("sendMessage", (userId, data) => {
  const socket = WebSocketManager.connections.get(userId);
  console.log(data);
  const lobbyId = data.lobbyId;
  const message = data.message;
  const lobby = lobbies.get(lobbyId);
  if (lobby) {
    const username = `User${socket.id.substr(0, 4)}`;
    lobby.messages.push({ username, message });
    io.to(lobbyId).emit("newMessage", { username, message });
  }
});

//   socket.on("draw", ({ lobbyId, drawData }) => {
//     socket.to(lobbyId).emit("draw", drawData);
//   });

WebSocketManager.subscribe("draw", (userId, data) => {
  const socket = WebSocketManager.connections.get(userId);
  console.log(data);
  const lobbyId = data.lobbyId;
  const drawData = data.drawData;
  socket.to(lobbyId).emit("draw", drawData);
});

//   socket.on("disconnect", () => {
//     console.log("Client disconnected");
//     lobbies.forEach((lobby, lobbyId) => {
//       if (lobby.players.has(socket.id)) {
//         lobby.players.delete(socket.id);
//         io.to(lobbyId).emit("playerJoined", Array.from(lobby.players));
//         if (lobby.players.size === 0) {
//           lobbies.delete(lobbyId);
//         }
//       }
//     });
//   });

WebSocketManager.subscribe("disconnect", (userId, data) => {
  const socket = WebSocketManager.connections.get(userId);
  console.log(data);
  console.log("Client disconnected");
  lobbies.forEach((lobby, lobbyId) => {
    if (lobby.players.has(socket.id)) {
      lobby.players.delete(socket.id);
      io.to(lobbyId).emit("playerJoined", Array.from(lobby.players));
      if (lobby.players.size === 0) {
        lobbies.delete(lobbyId);
      }
    }
  });
});

WebSocketManager.subscribe("draw_data", (userId, data) => {
  // Nachricht an alle Clients senden (Broadcast)
  WebSocketManager.connections.forEach((ws, uid) => {
    if (uid !== userId) {
      console.log(`Sending draw_data to ${uid}`);
      ws.emit("draw_data", userId, data);
    }
  });
});

WebSocketManager.subscribe("start_path", (userId, data) => {
  // Nachricht an alle Clients senden (Broadcast)
  WebSocketManager.connections.forEach((ws, uid) => {
    if (uid !== userId) {
      console.log(`Sending start_path to ${uid} with data`, data);
      ws.emit("start_path", userId, data);
    }
  });
});

WebSocketManager.subscribe("end_path", (userId, data) => {
  // Nachricht an alle Clients senden (Broadcast)
  WebSocketManager.connections.forEach((ws, uid) => {
    if (uid !== userId) {
      console.log(`Sending end_path to ${uid}`);
      ws.emit("end_path", userId);
    }
  });
});

WebSocketManager.subscribe("clear_canvas", (userId, data) => {
  // Nachricht an alle Clients senden (Broadcast)
  WebSocketManager.connections.forEach((ws, uid) => {
    if (uid !== userId) {
      console.log(`Sending clear_canvas to ${uid}`);
      ws.emit("clear_canvas", userId);
    }
  });
});
