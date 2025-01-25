const socket = io(window.location.origin, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity // Keep trying to reconnect
});
const chess = new Chess();

const boardElement = document.querySelector(".chessboard");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;


const renderBoard = ()=> {
   const board =  chess.board();
   boardElement.innerHTML = "";
   board.forEach((row , rowindex) => {
    row.forEach((square , squareindex) => {
        const squareElement = document.createElement("div");
        squareElement.classList.add("square", 
            (rowindex + squareindex)%2 === 0 ? "light" : "dark"
        );


        squareElement.dataset.row = rowindex;
        squareElement.dataset.col = squareindex;


        if(square){
            const pieceElement = document.createElement("div");
            pieceElement.classList.add("piece" , square.color === 'w' ? "white" : "black" );
            pieceElement.innerText = getPieceUnicode(square);
            pieceElement.draggable = playerRole === square.color;

            pieceElement.addEventListener("dragstart" , (e) =>{
                if(pieceElement.draggable){
                    draggedPiece = pieceElement;
                    sourceSquare = {row: rowindex, col: squareindex};
                    e.dataTransfer.setData("text/plain", "");
                }
            });

            pieceElement.addEventListener("dragend" , (e) =>{
                
                draggedPiece = null;
                sourceSquare = null;
                
            });

            squareElement.appendChild(pieceElement);

        }

        squareElement.addEventListener("dragover", function (e) {
            e.preventDefault();
        });


        squareElement.addEventListener("drop", function (e) {
            e.preventDefault();
            if (draggedPiece) {
                const targetSource = {
                    row: parseInt(squareElement.dataset.row),
                    col: parseInt(squareElement.dataset.col),
                };
        
                handleMove(sourceSquare, targetSource);
            }
        });
        
        boardElement.appendChild(squareElement);
    });

    
   });

   if(playerRole === 'b'){
    boardElement.classList.add("flipped");
   }else{
        boardElement.classList.remove("flipped");
   }

   

};

const handleMove = (source, target) => {
    const move = {
        from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
        to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
        promotion: 'q',
    };

    console.log(move);
    socket.emit("move", move);
};




const getPieceUnicode = (piece)=> {
    const UnicodePiece = {
        p: "♟", // Black pawn
        r: "♜", // Black rook
        n: "♞", // Black knight
        b: "♝", // Black bishop
        q: "♛", // Black queen
        k: "♚", // Black king
        P: "♙", // White pawn
        R: "♖", // White rook
        N: "♘", // White knight
        B: "♗", // White bishop
        Q: "♕", // White queen
        K: "♔"  // White king
      };

      return UnicodePiece [piece.type] || "";
      
}

socket.on("playerRole", function(role) {
    playerRole = role;
    renderBoard();

});

socket.on("spectatorRole", function(){
    playerRole = null;
    renderBoard();
});


socket.on("boardState", function(fen){
    chess.load(fen);
    renderBoard();
});

socket.on("move", function(move){
    chess.move(move);
    renderBoard();
});

// Add error handling for socket connection
socket.on('connect_error', (error) => {
    console.error('Connection Error:', error);
});

socket.on('connect_timeout', () => {
    console.error('Connection Timeout');
});

// Add connection status handling
socket.on('connect', () => {
    console.log('Connected to server');
});

// Add ping to keep connection alive
setInterval(() => {
    socket.emit("ping");
}, 25000);

socket.on("pong", () => {
    console.log("Connection alive");
});

// Add reconnection handlers
socket.on('reconnect_attempt', () => {
    console.log('Attempting to reconnect...');
});

socket.on('reconnect', () => {
    console.log('Reconnected to server');
    // Request current game state
    socket.emit("requestState");
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

// Add this to show a loading message
window.addEventListener('load', () => {
    const loadingMessage = document.createElement('div');
    loadingMessage.style.position = 'fixed';
    loadingMessage.style.top = '10px';
    loadingMessage.style.right = '10px';
    loadingMessage.style.padding = '10px';
    loadingMessage.style.backgroundColor = '#333';
    loadingMessage.style.color = 'white';
    loadingMessage.style.borderRadius = '5px';
    loadingMessage.style.display = 'none';
    loadingMessage.textContent = 'Reconnecting to server...';
    document.body.appendChild(loadingMessage);

    socket.on('disconnect', () => {
        loadingMessage.style.display = 'block';
    });

    socket.on('connect', () => {
        loadingMessage.style.display = 'none';
    });
});

// Add handler for invalid moves
socket.on("invalidMove", (move) => {
    console.log("Invalid move:", move);
    // Optionally show an error message to the user
    const errorMessage = document.createElement('div');
    errorMessage.style.position = 'fixed';
    errorMessage.style.top = '50%';
    errorMessage.style.left = '50%';
    errorMessage.style.transform = 'translate(-50%, -50%)';
    errorMessage.style.padding = '20px';
    errorMessage.style.backgroundColor = '#ff4444';
    errorMessage.style.color = 'white';
    errorMessage.style.borderRadius = '5px';
    errorMessage.style.zIndex = '1000';
    errorMessage.textContent = 'Invalid move!';
    document.body.appendChild(errorMessage);
    
    setTimeout(() => {
        errorMessage.remove();
    }, 2000);
    
    // Reset the board to the last valid state
    renderBoard();
});

// Add handler for game over
socket.on("gameOver", (status) => {
    let message = "Game Over: ";
    switch(status) {
        case 'checkmate':
            message += "Checkmate!";
            break;
        case 'draw':
            message += "Draw!";
            break;
        case 'stalemate':
            message += "Stalemate!";
            break;
        default:
            message += "Game ended.";
    }
    
    alert(message);
});

renderBoard();



