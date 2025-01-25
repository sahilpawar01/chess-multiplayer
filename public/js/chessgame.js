const socket = io(window.location.origin, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
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

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

renderBoard();



