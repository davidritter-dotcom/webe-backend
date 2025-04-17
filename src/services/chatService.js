const WebSocketManager = require("./socketService");

// Beispiel-Subscriber für Chat-Nachrichten
WebSocketManager.subscribe("chat_message", (userId, data) => {
  console.log(`Chat von ${userId}: ${data.message}`);

  // Nachricht an alle Clients senden (Broadcast)
  WebSocketManager.connections.forEach((ws, uid) => {
    // if (uid !== userId) {
    //   ws.send(JSON.stringify({ event: "message", userId, message }));
    // }
    console.log(`Sending message to ${uid}`);
    console.log({ userId: userId, message: data.message });
    ws.emit("chat_message", { userId: userId, message: data.message });
  });
});
