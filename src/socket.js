const socketIo = require("socket.io");

const setupSocket = (server) => {
  const io = new socketIo.Server(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("chat_message", (message) => {
      console.log(`"Message received from ${socket.id}: ${message}"`);
      io.emit("chat_message", `${socket.id} writes: ${message}`);
    });

    socket.on("disconnect", () => {
      console.log(`"User ${socket.id} disconnected"`);
    });
  });
};

module.exports = { setupSocket };
