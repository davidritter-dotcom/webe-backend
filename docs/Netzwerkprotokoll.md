# Netzwerkprotokoll für WebE Semesterarbeit

## Übersicht

Dieses Protokoll definiert die Kommunikation zwischen dem Spielclient und dem Server für unser Multiplayer-Spiel. Es verwendet **JSON** als Nachrichtenformat und **WebSockets (Socket.io)** für Echtzeitkommunikation. Für nicht zeitkritische Aufgaben kommen **REST-APIs** zum Einsatz.

Jede Nachricht enthält mindestens die folgenden Felder:

```json
{
    "type": "messageType",
    "timestamp": "ISO8601 Zeitstempel",
    "payload": { ... }
}
```

---

## Nachrichtentypen

### **1. Allgemein**

| Typ     | Richtung        | Beschreibung      |
| ------- | --------------- | ----------------- |
| `ERROR` | Server ↔ Client | Fehlernachrichten |

### **2. Lobby & Spielverwaltung**

| Typ             | Richtung        | Beschreibung                     |
| --------------- | --------------- | -------------------------------- |
| `JOIN_LOBBY`    | Client → Server | Spieler tritt einer Lobby bei    |
| `LOBBY_JOINED`  | Server → Client | Bestätigung, enthält Lobby-Infos |
| `INVITE_PLAYER` | Server → Client | Einladung in eine Lobby          |
| `START_GAME`    | Client → Server | Host startet das Spiel           |
| `GAME_STARTED`  | Server → Client | Das Spiel beginnt                |
| `CREATE_LOBBY`  | Client → Server | Lobby erstellt                   |

### **3. Rundenmanagement**

| Typ            | Richtung        | Beschreibung                              |
| -------------- | --------------- | ----------------------------------------- |
| `NEW_ROUND`    | Server → Client | Ein neuer Zeichner wird bestimmt          |
| `WORD_CHOSEN`  | Server → Client | Zeichner erhält das Wort                  |
| `CURRENT_TURN` | Server → Client | Gibt an, welcher Spieler aktuell zeichnet |
| `TIMER_UPDATE` | Server → Client | Zeitanzeige für die Runde                 |

### **4. Zeichnen & Raten**

| Typ            | Richtung        | Beschreibung                      |
| -------------- | --------------- | --------------------------------- |
| `DRAW_DATA`    | Client ↔ Server | Echtzeit-Zeichnungsdaten          |
| `CLEAR_CANVAS` | Client → Server | Der Zeichner löscht das Canvas    |
| `GUESS_WORD`   | Client → Server | Spieler sendet eine Wortvermutung |
| `CORRECT_WORD` | Server → Client | Ein Spieler hat das Wort erraten  |
| `UPDATE_SCORE` | Server → Client | Punktestand wird aktualisiert     |

### **5. Chat-Funktion**

| Typ            | Richtung        | Beschreibung                 |
| -------------- | --------------- | ---------------------------- |
| `CHAT_MESSAGE` | Client → Server | Chatnachricht eines Spielers |
| `CHAT_UPDATE`  | Server → Client | Übermittlung an alle Spieler |

### **6. Spieleraktionen & Spielende**

| Typ           | Richtung        | Beschreibung                        |
| ------------- | --------------- | ----------------------------------- |
| `PLAYER_LEFT` | Server → Client | Ein Spieler hat das Spiel verlassen |
| `GAME_END`    | Server → Client | Das Spiel ist beendet               |

---

## Beispielnachrichten

### **1. INVITE_PLAYER (Server → Client)**

```json
{
  "type": "INVITE_PLAYER",
  "timestamp": "2025-03-23T12:00:00Z",
  "payload": {
    "lobbyId": "12345",
    "invitedPlayerUsername": "Enzo",
    "message": "please join my game"
  }
}
```

### **2. GAME_STARTED (Server → Client)**

```json
{
  "type": "GAME_STARTED",
  "timestamp": "2025-03-23T12:05:00Z",
  "payload": {
    "lobbyId": "12345"
  }
}
```

### **3. CHAT_MESSAGE (Client → Server)**

```json
{
  "type": "CHAT_MESSAGE",
  "timestamp": "2025-03-23T12:05:00Z",
  "payload": {
    "playerId": "P1",
    "message": "Hallo zusammen!"
  }
}
```

### **4. GAME_UPDATE (Server → Client)**

```json
{
  "type": "GAME_UPDATE",
  "timestamp": "2025-03-23T12:10:00Z",
  "payload": {
    "players": [
      { "playerId": "P1", "score": 10 },
      { "playerId": "P2", "score": 8 }
    ]
  }
}
```

### **5. WORD_CHOSEN (Server → Client)**

```json
{
  "type": "WORD_CHOSEN",
  "timestamp": "2025-03-23T12:11:00Z",
  "payload": {
    "drawerId": "P2",
    "word": "Banane"
  }
}
```

---

## REST-API Endpunkte

| Methode | Endpunkt         | Beschreibung                 |
| ------- | ---------------- | ---------------------------- |
| `POST`  | `/auth/register` | Registrierung eines Spielers |
| `POST`  | `/auth/login`    | Anmeldung eines Spielers     |
| `POST`  | `/auth/logout`   | Spieler ausloggen            |
| `GET`   | `/auth/refresh`  | Neues Token generieren       |
| `POST`  | `/api/invite`    | Spieler in Lobby einladen    |
| `GET`   | `/api/game/{id}` | Spielstatus abrufen          |

---

## Ablauf des Spiels

1. Der Host startet das Game mit `START_GAME`.
2. Der Client loggt sich ein und es wird ein websocket geöffnet.
3. Spieler treten einer Lobby mit `JOIN_LOBBY` bei.
4. Der Host startet das Spiel mit `START_GAME`, der Server sendet `GAME_STARTED`.
5. In jeder Runde:
   - Der Server sendet `NEW_ROUND`, der Zeichner erhält das Wort (`WORD_CHOSEN`).
   - Spieler erraten Wörter mit `GUESS_WORD`, richtige Antworten werden mit `CORRECT_WORD` bestätigt.
   - `DRAW_DATA` wird kontinuierlich an den Server gesendet und an alle Spieler.
6. Nach der finalen Runde sendet der Server `GAME_END`.

---

## Hinweise

- Alle Zeitstempel sind im **ISO8601**-Format.
