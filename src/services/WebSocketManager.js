const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");

class WebSocketManager {
    static connections = new Map(); // userId -> WebSocket
    static subscribers = new Map(); // eventType -> [callback1, callback2, ...]

    static setupSocketServer(server) {
      const allowedOrigins = [
        "http://localhost:3000",
        "https://drawduel.vibetastic.ch",
      ];

      const io = socketIo(server, {
        cors: {
          origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error("Not allowed by CORS"));
            }
          },
          methods: ["GET", "POST"],
          credentials: true,
        },
      });

        // Middleware for authenticating socket connections
        io.use((socket, next) => {
            const token = socket.handshake.auth.token;

            if (!token) {
                console.log("Kein Token bereitgestellt");
                return next(new Error("Token erforderlich"));
            }

            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.user = decoded; // Save user info on socket
                console.log(`Authentifizierter Benutzer: ${decoded.username}`);
                next();
            } catch (err) {
                console.log("Ungültiges Token");
                next(new Error("Ungültiges Token"));
            }
        });

        io.on("connection", (socket) => {
            const userId = socket.user?.username;
            if (!userId) {
                console.log("Fehlender Benutzer im Socket – Verbindung abgelehnt");
                socket.disconnect(true);
                return;
            }

            console.log(`Neue WebSocket-Verbindung: ${userId}`);

            WebSocketManager.register(userId, socket);

            socket.onAny((event, data) => {
                console.log(`Event empfangen von ${userId}: ${event}`, data);
                WebSocketManager.dispatch(userId, event, data);
            });

            socket.on("disconnect", () => {
                console.log(`Socket getrennt: ${userId}`);
                WebSocketManager.unregister(userId);
            });
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
        if (WebSocketManager.subscribers.has(eventType)) {
            console.log("Dispatching to subscribers", eventType);
            WebSocketManager.subscribers
                .get(eventType)
                .forEach((callback) => callback(userId, data));
        }
    }

    // New method to broadcast a message to all connected clients
    static broadcast(eventType, data) {
        console.log(`Broadcasting ${eventType} to all users`);
        WebSocketManager.connections.forEach((socket, userId) => {
            console.log(`Sending ${eventType} to ${userId}`);
            socket.emit(eventType, data);
        });
    }

    // New method to send a message to a specific user
    static sendToUser(userId, eventType, data) {
        const socket = WebSocketManager.connections.get(userId);
        if (socket) {
            console.log(`Sending ${eventType} to ${userId}:`, data);
            socket.emit(eventType, data);
            return true;
        } else {
            console.log(
                `Failed to send ${eventType} to ${userId}: User not connected`
            );
            return false;
        }
    }
}

module.exports = WebSocketManager;
