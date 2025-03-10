require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { connectDB } = require("./config");
const authRoutes = require("./routes/auth");
const protectedRoutes = require("./routes/protected");
const { setupSocket } = require("./socket");
const cookieParser = require("cookie-parser");

const app = express();
const server = http.createServer(app);

// Allow requests from frontend
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json()); // Parses JSON bodies
app.use(express.urlencoded({ extended: true })); // Parses URL-encoded bodies
app.use(cookieParser());

const PORT = 3001;

// A simple route
app.get("/", (req, res) => {
  res.send("Hello, this is our backend!");
});

// Connect to MongoDB
connectDB();

// Use routes
app.use("/auth", authRoutes);
app.use("/protected", protectedRoutes);

// Setup WebSocket
setupSocket(server);

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
