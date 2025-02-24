const express = require("express");
const app = express();

const PORT = 3000;

// Eine einfache Route
app.get("/", (req, res) => {
    res.send("Hallo, Welt!");
});

// Server starten
app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});