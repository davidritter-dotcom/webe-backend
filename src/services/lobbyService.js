const { socketIo, io } = require("socket.io")
const WebSocketManager = require("./WebSocketManager")
const Lobby = require("../models/Lobby")
const User = require("../models/User")
const { v4: uuidv4 } = require("uuid")

// Store active timers to prevent duplicates
const activeTimers = new Map()

WebSocketManager.subscribe("CREATE_LOBBY", async (userId, data) => {
  const lobbyId = uuidv4()

  const newLobby = new Lobby({
    lobbyId,
    host: userId,
    players: [userId],
  })

  await newLobby.save()

  const socket = WebSocketManager.connections.get(userId)
  socket.emit("LOBBY_CREATED", { lobbyId })
  console.log(`${userId} hat Lobby ${lobbyId} erstellt.`)
})

WebSocketManager.subscribe("JOIN_LOBBY", async (userId, { lobbyId }) => {
  const lobby = await Lobby.findOne({ lobbyId })

  if (!lobby) {
    const socket = WebSocketManager.connections.get(userId)
    socket.emit("JOIN_LOBBY_ERROR", { message: "Lobby nicht gefunden." })
    return
  }

  if (lobby.status !== "waiting") {
    const socket = WebSocketManager.connections.get(userId)
    socket.emit("JOIN_LOBBY_ERROR", { message: "Spiel hat bereits begonnen." })
    return
  }

  if (!lobby.players.includes(userId)) {
    lobby.players.push(userId)
    await lobby.save()
  }

  lobby.players.forEach((player) => {
    const sock = WebSocketManager.connections.get(player)
    if (sock) {
      sock.emit("LOBBY_UPDATED", {
        lobbyId: lobby.lobbyId,
        players: lobby.players,
        host: lobby.host,
        isHost: lobby.host === player, // Wird noch optimiert
      })
    }
  })

  console.log(`${userId} ist Lobby ${lobbyId} beigetreten.`)
})

WebSocketManager.subscribe("LOBBY_INVITE", async (userId, { targetUser, lobbyId }) => {
  const socket = WebSocketManager.connections.get(targetUser)
  if (socket) {
    socket.emit("LOBBY_INVITED", { from: userId, lobbyId })
    console.log(`${userId} hat ${targetUser} in Lobby ${lobbyId} eingeladen.`)
  }
})

WebSocketManager.subscribe("LOBBY_START", async (userId, { lobbyId, rounds }) => {
  console.log(`[DEBUG] LOBBY_START event received from ${userId} for lobby ${lobbyId}`)

  const lobby = await Lobby.findOne({ lobbyId })

  if (!lobby || lobby.host !== userId) {
    console.log(`[DEBUG] Error: ${!lobby ? "Lobby not found" : "User is not host"}`)
    const socket = WebSocketManager.connections.get(userId)
    socket.emit("LOBBY_START_ERROR", {
      message: "Only the host can start the game.",
    })
    return
  }

  // Generate solution words (example list)
  const wordList = [
    "apple",
    "banana",
    "car",
    "dog",
    "elephant",
    "flower",
    "guitar",
    "house",
    "island",
    "jacket",
    "kite",
    "lemon",
    "mountain",
    "notebook",
    "ocean",
    "piano",
    "queen",
    "rainbow",
    "sun",
    "tree",
    "umbrella",
    "violin",
    "waterfall",
    "xylophone",
    "yacht",
    "zebra",
    "airplane",
    "butterfly",
    "castle",
    "dolphin",
  ]

  // Ensure rounds is a valid number
  const totalRounds = rounds || lobby.players.length * 2 // Default to 2x if not specified
  console.log(`[DEBUG] Starting game with ${totalRounds} rounds`)

  // Randomly select words from the list
  const solutionWords = []

  // Make sure we have enough words for all rounds
  for (let i = 0; i < totalRounds; i++) {
    const randomIndex = Math.floor(Math.random() * wordList.length)
    solutionWords.push(wordList[randomIndex])
  }

  // CRITICAL FIX: Ensure the first drawer is explicitly set
  const firstDrawer = lobby.players[0]

  lobby.solutionWords = solutionWords
  lobby.currentWord = solutionWords[0]
  lobby.currentDrawer = firstDrawer // Explicitly set the first drawer
  lobby.scores = new Map(lobby.players.map((player) => [player, 0])) // Initialize scores
  lobby.currentRound = 1
  lobby.totalRounds = totalRounds
  lobby.correctGuesses = [] // Track who has guessed correctly in the current round
  lobby.roundStartTime = new Date() // Track when the round started

  lobby.status = "started"
  await lobby.save()

  // Log the game state for debugging
  console.log(`[DEBUG] Game started with:`)
  console.log(`[DEBUG] - Current drawer: ${lobby.currentDrawer}`)
  console.log(`[DEBUG] - Current word: ${lobby.currentWord}`)
  console.log(`[DEBUG] - Total rounds: ${lobby.totalRounds}`)
  console.log(`[DEBUG] - Players: ${lobby.players.join(", ")}`)

  // CRITICAL FIX: Send a pre-game notification to ensure all clients are ready
  lobby.players.forEach((player) => {
    const sock = WebSocketManager.connections.get(player)
    if (sock) {
      sock.emit("GAME_PREPARING", {
        message: "Game is starting...",
        firstDrawer: firstDrawer,
      })
    }
  })

  // Short delay to ensure all clients have received the preparation message
  setTimeout(() => {
    // Send game started event to all players with correct initial state
    lobby.players.forEach((player) => {
      const sock = WebSocketManager.connections.get(player)
      if (sock) {
        const isDrawing = player === firstDrawer
        const wordToSend = isDrawing ? lobby.currentWord : null

        console.log(`[DEBUG] Sending GAME_STARTED to ${player}: isDrawing=${isDrawing}, word=${wordToSend || "hidden"}`)

        // First, send a direct message to test socket connection
        sock.emit("DEBUG_MESSAGE", {
          message: `Hello ${player}, you ${isDrawing ? "are" : "are not"} the drawer. Drawer is ${firstDrawer}.`,
        })

        // Then send the actual game start data
        sock.emit("GAME_STARTED", {
          lobbyId,
          players: lobby.players,
          currentDrawer: firstDrawer,
          isDrawing: isDrawing,
          currentWord: wordToSend,
          currentRound: lobby.currentRound,
          totalRounds: lobby.totalRounds,
        })
      } else {
        console.log(`[DEBUG] ERROR: Socket not found for player ${player}`)
      }
    })

    console.log(`[DEBUG] Game in lobby ${lobbyId} started by ${userId} with ${totalRounds} rounds.`)

    // Start the round timer
    startRoundTimer(lobbyId)
  }, 1000) // 1 second delay before actually starting the game
})

// Add this function to handle the round timer
function startRoundTimer(lobbyId) {
  console.log(`[DEBUG] Starting round timer for lobby ${lobbyId}`)

  // Clear any existing timer for this lobby
  if (activeTimers.has(lobbyId)) {
    clearInterval(activeTimers.get(lobbyId))
    activeTimers.delete(lobbyId)
    console.log(`[DEBUG] Cleared existing timer for lobby ${lobbyId}`)
  }

  const ROUND_TIME = 60 // 60 seconds per round
  let timeRemaining = ROUND_TIME

  const timerInterval = setInterval(async () => {
    timeRemaining--

    // Update all clients with the time
    const lobby = await Lobby.findOne({ lobbyId })
    if (!lobby || lobby.status !== "started") {
      console.log(`[DEBUG] Stopping timer: ${!lobby ? "Lobby not found" : "Game not started"}`)
      clearInterval(timerInterval)
      activeTimers.delete(lobbyId)
      return
    }

    // Only send time updates every 5 seconds to reduce console spam
    if (timeRemaining % 5 === 0 || timeRemaining <= 10) {
      console.log(`[DEBUG] Round time remaining: ${timeRemaining}s`)
    }

    // Send time update to all players
    lobby.players.forEach((player) => {
      const sock = WebSocketManager.connections.get(player)
      if (sock) {
        sock.emit("ROUND_TIME_UPDATE", { timeRemaining })
      }
    })

    // If time is up, end the round
    if (timeRemaining <= 0) {
      console.log(`[DEBUG] Round time up, ending round`)
      clearInterval(timerInterval)
      activeTimers.delete(lobbyId)
      await endRound(lobbyId)
    }
  }, 1000)

  // Store the timer reference
  activeTimers.set(lobbyId, timerInterval)
}

// Add this function to handle ending a round
async function endRound(lobbyId) {
  console.log(`[DEBUG] Ending round for lobby ${lobbyId}`)

  // Clear any existing timer
  if (activeTimers.has(lobbyId)) {
    clearInterval(activeTimers.get(lobbyId))
    activeTimers.delete(lobbyId)
  }

  const lobby = await Lobby.findOne({ lobbyId })
  if (!lobby || lobby.status !== "started") {
    console.log(`[DEBUG] Cannot end round: ${!lobby ? "Lobby not found" : "Game not started"}`)
    return
  }

  // Notify all players that the round ended
  lobby.players.forEach((player) => {
    const sock = WebSocketManager.connections.get(player)
    if (sock) {
      console.log(`[DEBUG] Sending ROUND_ENDED to ${player}`)
      sock.emit("ROUND_ENDED", {
        word: lobby.currentWord,
        scores: Array.from(lobby.scores.entries()),
      })
    }
  })

  // Check if this was the last round
  if (lobby.currentRound >= lobby.totalRounds) {
    console.log(`[DEBUG] Last round completed, game over`)
    // Game is over
    setTimeout(async () => {
      const finalScores = Array.from(lobby.scores.entries()).sort((a, b) => b[1] - a[1]) // Sort by score descending

      lobby.players.forEach((player) => {
        const sock = WebSocketManager.connections.get(player)
        if (sock) {
          console.log(`[DEBUG] Sending GAME_OVER to ${player}`)
          sock.emit("GAME_OVER", {
            finalScores,
          })
        }
      })

      // Reset lobby status
      lobby.status = "waiting"
      await lobby.save()
      console.log(`[DEBUG] Lobby reset to waiting state`)
    }, 5000) // Show scores for 5 seconds
  } else {
    console.log(`[DEBUG] Preparing for next round in 5 seconds`)
    // Prepare for next round after 5 seconds
    setTimeout(async () => {
      // Move to the next round
      lobby.currentRound++

      // Calculate next drawer index (rotate through players)
      const currentDrawerIndex = lobby.players.indexOf(lobby.currentDrawer)
      const nextDrawerIndex = (currentDrawerIndex + 1) % lobby.players.length
      lobby.currentDrawer = lobby.players[nextDrawerIndex]

      // Set the next word
      lobby.currentWord = lobby.solutionWords[lobby.currentRound - 1]

      // Reset correct guesses for the new round
      lobby.correctGuesses = []

      // Update round start time
      lobby.roundStartTime = new Date()

      await lobby.save()

      // Log the new round state for debugging
      console.log(`[DEBUG] New round ${lobby.currentRound} started:`)
      console.log(`[DEBUG] - Current drawer: ${lobby.currentDrawer}`)
      console.log(`[DEBUG] - Current word: ${lobby.currentWord}`)

      // Notify all players about the new round
      lobby.players.forEach((player) => {
        const sock = WebSocketManager.connections.get(player)
        if (sock) {
          const isDrawing = player === lobby.currentDrawer
          const wordToSend = isDrawing ? lobby.currentWord : null

          console.log(`[DEBUG] Sending NEW_ROUND to ${player}: isDrawing=${isDrawing}, word=${wordToSend || "hidden"}`)

          sock.emit("NEW_ROUND", {
            currentRound: lobby.currentRound,
            totalRounds: lobby.totalRounds,
            currentDrawer: lobby.currentDrawer,
            isDrawing: isDrawing,
            currentWord: wordToSend,
          })
        }
      })

      // Start the timer for the new round
      startRoundTimer(lobbyId)
    }, 5000) // 5 second pause between rounds
  }
}

// Add a special debug event handler
WebSocketManager.subscribe("DEBUG_DRAWING_TEST", async (userId, data) => {
  console.log(`[DEBUG] Received drawing test from ${userId}:`, data)

  // Echo back to all clients to test drawing communication
  WebSocketManager.connections.forEach((ws, uid) => {
    if (uid !== userId) {
      console.log(`[DEBUG] Sending drawing test to ${uid}`)
      ws.emit("DEBUG_DRAWING_TEST_RESPONSE", { from: userId, data })
    }
  })
})

WebSocketManager.subscribe("start_path", (userId, data) => {
  console.log(`[DEBUG] start_path from ${userId}:`, data)
  // Include color information in the broadcast
  WebSocketManager.connections.forEach((ws, uid) => {
    if (uid !== userId) {
      console.log(`[DEBUG] Sending start_path to ${uid}`)
      ws.emit("start_path", userId, data)
    }
  })
})

WebSocketManager.subscribe("draw_data", (userId, data) => {
  // Don't log every draw_data event to avoid console spam
  // But do broadcast it to everyone
  WebSocketManager.connections.forEach((ws, uid) => {
    if (uid !== userId) {
      ws.emit("draw_data", userId, data)
    }
  })
})

WebSocketManager.subscribe("end_path", (userId, data) => {
  console.log(`[DEBUG] end_path from ${userId}`)
  // Nachricht an alle Clients senden (Broadcast)
  WebSocketManager.connections.forEach((ws, uid) => {
    if (uid !== userId) {
      ws.emit("end_path", userId)
    }
  })
})

WebSocketManager.subscribe("LOBBY_SEARCH_USERS", async (userId, { query }) => {
  if (!query || query.length < 1) return

  // Suche Usernamen die mit dem Query anfangen (case-insensitive)
  const users = await User.find({
    username: { $regex: `^${query}`, $options: "i" },
  })
    .limit(10)
    .select("username -_id") // Nur den Namen zurückgeben

  console.log("Gefundene User: " + users)

  const socket = WebSocketManager.connections.get(userId)
  if (socket) {
    socket.emit(
      "LOBBY_SEARCH_RESULTS",
      users.map((u) => u.username),
    )
  }
})

WebSocketManager.subscribe("LEAVE_LOBBY", async (userId, { lobbyId }) => {
  const lobby = await Lobby.findOne({ lobbyId })

  if (!lobby) {
    const socket = WebSocketManager.connections.get(userId)
    socket.emit("LEAVE_LOBBY_ERROR", { message: "Lobby nicht gefunden." })
    return
  }

  // Spieler aus der Lobby entfernen
  lobby.players = lobby.players.filter((id) => id !== userId)

  // Wenn der Host geht, übergebe Hostrolle oder lösche die Lobby
  if (lobby.host === userId) {
    if (lobby.players.length > 0) {
      lobby.host = lobby.players[0] // Neuen Host setzen
    } else {
      // Keine Spieler mehr → Lobby löschen
      await Lobby.deleteOne({ lobbyId })
      console.log(`Lobby ${lobbyId} wurde gelöscht (letzter Spieler ging).`)
      const socket = WebSocketManager.connections.get(userId)
      if (socket) {
        socket.emit("LOBBY_LEFT", { lobbyId })
      }

      console.log(`${userId} hat Lobby ${lobbyId} verlassen.`)
      return
    }
  }

  await lobby.save()

  // Alle verbleibenden Spieler über die Änderung informieren
  lobby.players.forEach((player) => {
    const sock = WebSocketManager.connections.get(player)
    if (sock) {
      sock.emit("LOBBY_UPDATED", {
        lobbyId: lobby.lobbyId,
        players: lobby.players,
        host: lobby.host,
        isHost: lobby.host === player,
      })
    }
  })

  const socket = WebSocketManager.connections.get(userId)
  if (socket) {
    socket.emit("LOBBY_LEFT", { lobbyId })
  }

  console.log(`${userId} hat Lobby ${lobbyId} verlassen.`)
})

// Add this at the end of the file
module.exports.endRound = endRound
