const express = require('express');
const socket = require('socket.io');
const http = require('http');
const { Chess } = require('chess.js');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = socket(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
});

const ROOM_MS = 10 * 60 * 1000;
const rooms = {};
const socketToRoom = new Map();

function genRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

function makeRoom(roomId) {
    return {
        id: roomId,
        chess: new Chess(),
        white: null,
        black: null,
        whiteName: '',
        blackName: '',
        whiteTime: ROOM_MS,
        blackTime: ROOM_MS,
        activeClock: null,
        status: 'waiting',
        drawOfferFrom: null,
        rematchWant: { w: false, b: false },
        lastMove: null,
    };
}

function getRoomState(room) {
    const c = room.chess;
    return {
        fen: c.fen(),
        movesSan: c.history(),
        whiteTime: room.whiteTime,
        blackTime: room.blackTime,
        activeClock: room.activeClock,
        status: room.status,
        whiteName: room.whiteName,
        blackName: room.blackName,
        turn: c.turn(),
        isGameOver: c.isGameOver(),
        inCheck: c.isCheck(),
        lastMove: room.lastMove,
    };
}

function resetRoomForRematch(room) {
    room.chess = new Chess();
    room.whiteTime = ROOM_MS;
    room.blackTime = ROOM_MS;
    room.activeClock = 'w';
    room.status = 'playing';
    room.drawOfferFrom = null;
    room.rematchWant = { w: false, b: false };
    room.lastMove = null;
}

function cleanupSocketFromRoom(socketId) {
    const roomId = socketToRoom.get(socketId);
    if (!roomId) return;
    const room = rooms[roomId];
    socketToRoom.delete(socketId);
    if (!room) return;
    if (room.white === socketId) {
        room.white = null;
        room.whiteName = '';
    }
    if (room.black === socketId) {
        room.black = null;
        room.blackName = '';
    }
    if (!room.white && !room.black) {
        delete rooms[roomId];
        return;
    }
    io.to(roomId).emit('opponentDisconnected');
    room.status = 'ended';
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('index', { initialRoom: (req.query.room || '').toString().trim().slice(0, 8) });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', time: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

setInterval(() => {
    for (const roomId of Object.keys(rooms)) {
        const room = rooms[roomId];
        if (room.status !== 'playing' || !room.activeClock) continue;
        const side = room.activeClock;
        if (side === 'w') room.whiteTime -= 1000;
        else room.blackTime -= 1000;
        if (room.whiteTime < 0) room.whiteTime = 0;
        if (room.blackTime < 0) room.blackTime = 0;
        const t = side === 'w' ? room.whiteTime : room.blackTime;
        if (t <= 0) {
            room.status = 'ended';
            room.activeClock = null;
            room.rematchWant = { w: false, b: false };
            io.to(roomId).emit('gameOver', {
                reason: 'timeout',
                winner: side === 'w' ? 'b' : 'w',
            });
        }
        io.to(roomId).emit('clockUpdate', {
            whiteTime: room.whiteTime,
            blackTime: room.blackTime,
            activeClock: room.activeClock,
        });
    }
}, 1000);

io.on('connection', (sock) => {
    sock.on('joinRoom', ({ roomId, playerName, color }) => {
        let rid = (roomId || '').toString().replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
        if (rid.length < 4) {
            sock.emit('errorMsg', { message: 'Invalid room code' });
            return;
        }
        let room = rooms[rid];
        const want = color === 'w' || color === 'white' ? 'w' : 'b';
        if (!room) {
            if (want !== 'w') {
                sock.emit('errorMsg', { message: 'Room does not exist. Create as White first.' });
                return;
            }
            rooms[rid] = makeRoom(rid);
            room = rooms[rid];
        }
        const name = (playerName || 'Player').toString().slice(0, 32);
        if (want === 'w') {
            if (room.white) {
                sock.emit('errorMsg', { message: 'White seat is taken.' });
                return;
            }
            room.white = sock.id;
            room.whiteName = name;
        } else {
            if (room.black) {
                sock.emit('errorMsg', { message: 'Black seat is taken.' });
                return;
            }
            room.black = sock.id;
            room.blackName = name;
        }
        sock.join(rid);
        socketToRoom.set(sock.id, rid);
        sock.emit('joinedRoom', {
            roomId: rid,
            role: want,
            state: getRoomState(room),
        });
        io.to(rid).emit('roomUpdate', { roomId: rid, ...getRoomState(room) });
        if (room.white && room.black && room.status === 'waiting') {
            resetRoomForRematch(room);
            room.status = 'playing';
            io.to(rid).emit('gameStart', { roomId: rid, ...getRoomState(room) });
        }
    });

    sock.on('move', ({ roomId, from, to, promotion }) => {
        const rid = (roomId || '').toString();
        const room = rooms[rid];
        if (!room || room.status !== 'playing') return;
        const turn = room.chess.turn();
        if (turn === 'w' && room.white !== sock.id) return;
        if (turn === 'b' && room.black !== sock.id) return;
        const moveObj = { from, to };
        if (promotion) moveObj.promotion = promotion.slice(0, 1).toLowerCase();
        const result = room.chess.move(moveObj);
        if (!result) {
            sock.emit('invalidMove', { from, to });
            return;
        }
        room.lastMove = {
            from: result.from,
            to: result.to,
            san: result.san,
            captured: result.captured || null,
        };
        const over = room.chess.isGameOver();
        if (over) {
            room.status = 'ended';
            room.activeClock = null;
            room.rematchWant = { w: false, b: false };
        } else {
            room.activeClock = room.chess.turn();
        }
        const payload = { roomId: rid, ...getRoomState(room) };
        io.to(rid).emit('stateSync', payload);
        if (over) {
            let reason = 'draw';
            let winner = null;
            if (room.chess.isCheckmate()) {
                reason = 'checkmate';
                winner = room.chess.turn() === 'w' ? 'b' : 'w';
            } else if (room.chess.isStalemate()) reason = 'stalemate';
            else if (room.chess.isDraw()) reason = 'draw';
            io.to(rid).emit('gameOver', { reason, winner });
        }
    });

    sock.on('draw_offer', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.status !== 'playing') return;
        const color = room.white === sock.id ? 'w' : 'b';
        room.drawOfferFrom = color;
        sock.to(roomId).emit('draw_offer', { from: color });
    });

    sock.on('draw_accept', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.status !== 'playing') return;
        const color = room.white === sock.id ? 'w' : 'b';
        if (!room.drawOfferFrom || room.drawOfferFrom === color) return;
        room.status = 'ended';
        room.activeClock = null;
        room.rematchWant = { w: false, b: false };
        io.to(roomId).emit('gameOver', { reason: 'draw', winner: null, byAgreement: true });
    });

    sock.on('draw_decline', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;
        room.drawOfferFrom = null;
        sock.to(roomId).emit('draw_declined');
    });

    sock.on('resign', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.status !== 'playing') return;
        const color = room.white === sock.id ? 'w' : 'b';
        room.status = 'ended';
        room.activeClock = null;
        room.rematchWant = { w: false, b: false };
        const winner = color === 'w' ? 'b' : 'w';
        io.to(roomId).emit('gameOver', { reason: 'resignation', winner });
    });

    sock.on('chat', ({ roomId, name, msg, color }) => {
        const room = rooms[roomId];
        if (!room) return;
        const c =
            room.white === sock.id ? 'w' : room.black === sock.id ? 'b' : null;
        if (!c) return;
        io.to(roomId).emit('chat', {
            name: (name || '').toString().slice(0, 32),
            msg: (msg || '').toString().slice(0, 500),
            color: c,
        });
    });

    sock.on('requestState', ({ roomId }) => {
        const rid = roomId || socketToRoom.get(sock.id);
        if (!rid || !rooms[rid]) return;
        const room = rooms[rid];
        sock.emit('stateSync', { roomId: rid, ...getRoomState(room) });
    });

    sock.on('rematch_request', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;
        const color = room.white === sock.id ? 'w' : 'b';
        if (!color) return;
        room.rematchWant[color] = true;
        sock.to(roomId).emit('rematch_pending', { from: color });
        if (room.rematchWant.w && room.rematchWant.b) {
            resetRoomForRematch(room);
            io.to(roomId).emit('rematchStarted', { roomId, ...getRoomState(room) });
        }
    });

    sock.on('disconnect', () => {
        cleanupSocketFromRoom(sock.id);
    });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
    server.listen(port, '0.0.0.0', () => {
        console.log(`Server running on port ${port}`);
    });
}

module.exports = server;
