const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = 3001;

// A simple route
app.get("/", (req, res) => {
  res.send("Hello, this is our backend!");
});

// Create Socket.IO instance attached to the server
const io = new socketIo.Server(server, {
  cors: {
    origin: "http://localhost:3000", // Allow frontend port (Next.js default)
    methods: ["GET", "POST"],
  },
});

// WebSocket connection handling
io.on("connection", (socket) => {
  console.log("A user connected");

  // Listen for messages from the frontend
  socket.on("chat_message", (message) => {
    console.log(`"Message received from ${socket.id}: ${message}"`);
    // Broadcast the message to all other connected clients
    io.emit("chat_message", `${socket.id} writes: ${message}`);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`"User ${socket.id} disconnected"`);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
