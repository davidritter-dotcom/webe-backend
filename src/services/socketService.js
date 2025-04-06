const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");

class WebSocketManager {
  static connections = new Map(); // userId -> WebSocket
  static subscribers = new Map(); // eventType -> [callback1, callback2, ...]

  static setupSocketServer(server) {
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
  }

  static register(userId, ws) {
    console.log("Registering user", userId);
    if (WebSocketManager.connections.has(userId)) {
      WebSocketManager.connections.get(userId).disconnect(true);
      WebSocketManager.connections.delete(userId);
    }
    WebSocketManager.connections.set(userId, ws);
    console.log(`User ${userId} connected`);
  }

  static unregister(userId) {
    if (WebSocketManager.connections.has(userId)) {
      WebSocketManager.connections.delete(userId);
      console.log(`User ${userId} disconnected`);
    }
  }

  static subscribe(eventType, callback) {
    console.log("Subscribing to event", eventType);
    if (!WebSocketManager.subscribers.has(eventType)) {
      WebSocketManager.subscribers.set(eventType, []);
    }
    WebSocketManager.subscribers.get(eventType).push(callback);
  }

  static dispatch(userId, eventType, data) {
    console.log("Dispatching event", eventType);
    if (WebSocketManager.subscribers.has(eventType)) {
      WebSocketManager.subscribers
        .get(eventType)
        .forEach((callback) => callback(userId, data));
    }
  }
}

module.exports = WebSocketManager;
