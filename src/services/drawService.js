const WebSocketManager = require("./WebSocketManager");
const Lobby = require("../models/Lobby"); // Declare the Lobby variable

WebSocketManager.subscribe("draw_data", (userId, data) => {
  // Don't log every draw_data event to avoid console spam
  // But do broadcast it to everyone
  WebSocketManager.connections.forEach((ws, uid) => {
    if (uid !== userId) {
      ws.emit("draw_data", userId, data);
    }
  });
});

WebSocketManager.subscribe("start_path", (userId, data) => {
  console.log(`[DEBUG] start_path from ${userId}:`, data);
  // Include color information in the broadcast
  WebSocketManager.connections.forEach((ws, uid) => {
    if (uid !== userId) {
      console.log(`[DEBUG] Sending start_path to ${uid}`);
      ws.emit("start_path", userId, data);
    }
  });
});

WebSocketManager.subscribe("end_path", (userId, data) => {
  console.log(`[DEBUG] end_path from ${userId}`);
  // Nachricht an alle Clients senden (Broadcast)
  WebSocketManager.connections.forEach((ws, uid) => {
    if (uid !== userId) {
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
