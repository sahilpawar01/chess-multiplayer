const express = require('express');
const socket = require('socket.io');
const http = require('http');
const { Chess } = require('chess.js');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with additional options for Render
const io = socket(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// Store active games with initial position
const games = {
    default: {
        chess: new Chess(),
        players: {},
        currentPlayer: 'w',
        moves: [] // Store move history
    }
};

// Static files
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

// Routes
app.get("/", (req, res) => {
    res.render("index");
});

// Add error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Health check endpoint - important for Render
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        time: new Date().toISOString()
    });
});

// Socket.IO connection handling
io.on("connection", function (uniquesocket) {
    console.log("New client connected:", uniquesocket.id);
    
    const game = games.default;
    
    // Send current game state to new connection
    uniquesocket.emit("boardState", game.chess.fen());
    uniquesocket.emit("moveHistory", game.moves);

    if(!game.players.white){
        game.players.white = uniquesocket.id;
        uniquesocket.emit("playerRole", "w");
    } else if(!game.players.black){
        game.players.black = uniquesocket.id;
        uniquesocket.emit("playerRole", "b");
    } else {
        uniquesocket.emit("spectatorRole");
    }

    uniquesocket.on("disconnect", function(){
        if(uniquesocket.id === game.players.white){
            delete game.players.white;
        } else if(uniquesocket.id === game.players.black){
            delete game.players.black;
        }
        console.log("Client disconnected:", uniquesocket.id);
    });

    uniquesocket.on("move", (move) => {
        try {
            // Validate player's turn
            if(game.chess.turn() === 'w' && uniquesocket.id !== game.players.white) {
                console.log("Not white player's turn");
                return;
            }
            if(game.chess.turn() === 'b' && uniquesocket.id !== game.players.black) {
                console.log("Not black player's turn");
                return;
            }

            // Validate move
            const possibleMoves = game.chess.moves({ verbose: true });
            const isValidMove = possibleMoves.some(m => 
                m.from === move.from && 
                m.to === move.to
            );

            if (!isValidMove) {
                console.log("Invalid move attempted:", move);
                uniquesocket.emit("invalidMove", move);
                return;
            }

            // Make the move
            const result = game.chess.move(move);
            if(result){
                game.currentPlayer = game.chess.turn();
                game.moves.push(move); // Store the move
                io.emit("move", move);
                io.emit("boardState", game.chess.fen());
                
                // Check game status
                if(game.chess.isGameOver()) {
                    let gameStatus = '';
                    if(game.chess.isCheckmate()) gameStatus = 'checkmate';
                    else if(game.chess.isDraw()) gameStatus = 'draw';
                    else if(game.chess.isStalemate()) gameStatus = 'stalemate';
                    
                    io.emit("gameOver", gameStatus);
                }
            }
        } catch(err) {
            console.error("Move error:", err);
            uniquesocket.emit("error", "Invalid move");
        }
    });

    // Handle request for current game state
    uniquesocket.on("requestState", () => {
        const game = games.default;
        uniquesocket.emit("boardState", game.chess.fen());
        uniquesocket.emit("moveHistory", game.moves);
    });

    // Add ping/pong to keep connection alive
    uniquesocket.on("ping", () => {
        uniquesocket.emit("pong");
    });
});

// Listen on all network interfaces
const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

// Handle process errors
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});





