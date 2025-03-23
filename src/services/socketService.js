const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");

const setupSocketServer = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("Neue WebSocket-Verbindung");
    const token = socket.handshake.query.token;

    if (!token) {
      console.log("Kein Token bereitgestellt, Verbindung abgelehnt");
      socket.disconnect(true);
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.username;
      console.log(`Authentifizierter Benutzer: ${decoded.username}`);

      WebSocketManager.register(userId, socket);

      socket.onAny((event, data) => {
        console.log(`Event empfangen von ${userId}: ${event}`, data);
        WebSocketManager.dispatch(userId, event, data);
      });

      socket.on("disconnect", () => WebSocketManager.unregister(userId));
    } catch (err) {
      console.log("Ungültiges Token, Verbindung abgelehnt");
      socket.disconnect(true);
    }
  });
};

module.exports = { setupSocketServer };

// WebSocket-Verbindungen und Subscriber verwalten
const connections = new Map(); // userId -> WebSocket
const subscribers = new Map(); // eventType -> [callback1, callback2, ...]

class WebSocketManager {
  static register(userId, ws) {
    if (connections.has(userId)) {
      connections.get(userId).disconnect(true);
      connections.delete(userId);
    }
    connections.set(userId, ws);
    console.log(`User ${userId} connected`);
  }

  static unregister(userId) {
    if (connections.has(userId)) {
      connections.delete(userId);
      console.log(`User ${userId} disconnected`);
    }
  }

  static subscribe(eventType, callback) {
    if (!subscribers.has(eventType)) {
      subscribers.set(eventType, []);
    }
    subscribers.get(eventType).push(callback);
  }

  static dispatch(userId, eventType, data) {
    if (subscribers.has(eventType)) {
      subscribers.get(eventType).forEach((callback) => callback(userId, data));
    }
  }
}

// Beispiel-Subscriber für Chat-Nachrichten
WebSocketManager.subscribe("chat_message", (userId, data) => {
  console.log(`Chat von ${userId}: ${data.message}`);

  // Nachricht an alle Clients senden (Broadcast)
  connections.forEach((ws, uid) => {
    // if (uid !== userId) {
    //   ws.send(JSON.stringify({ event: "message", userId, message }));
    // }
    console.log(`Sending message to ${uid}`);
    console.log({ userId: userId, message: data.message });
    ws.emit("chat_message", { userId: userId, message: data.message });
  });
});
