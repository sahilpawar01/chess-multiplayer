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

const chess = new Chess();
let players = {};
let currentPlayer = "w";

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

    if(!players.white){
        players.white = uniquesocket.id;
        uniquesocket.emit("playerRole", "w");
    } else if(!players.black){
        players.black = uniquesocket.id;
        uniquesocket.emit("playerRole", "b");
    } else {
        uniquesocket.emit("spectatorRole");
    }

    uniquesocket.on("disconnect", function(){
        if(uniquesocket.id === players.white){
            delete players.white;
        } else if(uniquesocket.id === players.black){
            delete players.black;
        }
    });

    uniquesocket.on("move", (move) => {
        try {
            if(chess.turn() === 'w' && uniquesocket.id !== players.white) return;
            if(chess.turn() === 'b' && uniquesocket.id !== players.black) return;

            const result = chess.move(move);
            if(result){
                currentPlayer = chess.turn();
                io.emit("move", move);
                io.emit("boardState", chess.fen());
            }
        } catch(err) {
            console.error("Move error:", err);
        }
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





