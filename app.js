const express = require('express');
const socket = require('socket.io');
const http = require('http');
const { Chess } = require('chess.js');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO
const io = socket(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
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

// Health check for Render
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});





