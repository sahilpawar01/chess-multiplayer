import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/dist/esm/chess.js';

const socket = window.io(window.location.origin, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
    transports: ['websocket', 'polling'],
  });

  const chess = new Chess();
  let roomId = '';
  let role = null;
  let playerName = '';
  let lastFrom = null;
  let lastTo = null;
  let pendingPromo = null;
  let soundOn = true;
  let prevMoveCount = 0;
  let lastHistoryLen = -1;

  const $ = (id) => document.getElementById(id);

  const els = {
    lobby: $('screen-lobby'),
    game: $('screen-game'),
    board: $('board'),
    roomCode: $('room-code'),
    playerName: $('player-name'),
    connDot: $('conn-dot'),
    connLabel: $('conn-label'),
    roomBadge: $('room-badge'),
    roleBadge: $('role-badge'),
    nameWhite: $('name-white'),
    nameBlack: $('name-black'),
    timerWhite: $('timer-white'),
    timerBlack: $('timer-black'),
    cardWhite: $('card-white'),
    cardBlack: $('card-black'),
    moveHistory: $('move-history'),
    chatLog: $('chat-log'),
    chatInput: $('chat-input'),
    capturedWhite: $('captured-white'),
    capturedBlack: $('captured-black'),
    material: $('material-score'),
    gameRoomPill: $('game-room-pill'),
    themeSelect: $('theme-select'),
    modalGo: $('modal-gameover'),
    goBody: $('go-body'),
    goTitle: $('go-title'),
    modalDraw: $('modal-draw'),
    modalPromo: $('modal-promo'),
    promoGrid: $('promo-grid'),
    toasts: $('toasts'),
    topbar: $('topbar'),
  };

  const UNICODE = {
    p: '♟',
    r: '♜',
    n: '♞',
    b: '♝',
    q: '♛',
    k: '♚',
    P: '♙',
    R: '♖',
    N: '♘',
    B: '♗',
    Q: '♕',
    K: '♔',
  };

  function pieceChar(piece) {
    const t = piece.type;
    const k = piece.color === 'w' ? t.toUpperCase() : t;
    return UNICODE[k] || '';
  }

  function fmtTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }

  function playSound(kind) {
    if (!soundOn) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    const freq =
      kind === 'capture'
        ? 220
        : kind === 'check'
          ? 880
          : kind === 'gameover'
            ? 140
            : kind === 'move'
              ? 440
              : 330;
    o.type = kind === 'capture' ? 'square' : 'sine';
    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (kind === 'gameover' ? 0.35 : 0.12));
    o.start(now);
    o.stop(now + (kind === 'gameover' ? 0.35 : 0.12));
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    els.toasts.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  function baseUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function copyLink() {
    const code = (els.roomCode.value || roomId || '').trim();
    const url = code ? `${baseUrl()}?room=${encodeURIComponent(code)}` : baseUrl();
    navigator.clipboard.writeText(url).then(
      () => toast('Link copied'),
      () => toast('Copy failed')
    );
  }

  function genRoom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
    els.roomCode.value = id;
    toast('New room code');
  }

  function getCapturedAndMaterial() {
    const board = chess.board();
    const on = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    };
    for (const row of board) {
      for (const sq of row) {
        if (!sq) continue;
        on[sq.color][sq.type]++;
      }
    }
    const start = {
      w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
      b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    };
    const symB = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
    const symW = { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' };
    let lineByBlack = '';
    let lineByWhite = '';
    let adv = 0;
    const vals = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    for (const t of ['p', 'n', 'b', 'r', 'q', 'k']) {
      const missW = start.w[t] - on.w[t];
      const missB = start.b[t] - on.b[t];
      for (let i = 0; i < missW; i++) {
        lineByBlack += symW[t];
        adv -= vals[t];
      }
      for (let i = 0; i < missB; i++) {
        lineByWhite += symB[t];
        adv += vals[t];
      }
    }
    els.capturedWhite.textContent = lineByWhite || '—';
    els.capturedBlack.textContent = lineByBlack || '—';
    if (adv === 0) els.material.textContent = 'Material: even';
    else if (adv > 0) els.material.textContent = `Material: +${adv} for White`;
    else els.material.textContent = `Material: +${-adv} for Black`;
  }

  function renderCoords() {
    const files = $('files-coords');
    const ranks = $('ranks-coords');
    if (!files || !ranks) return;
    files.innerHTML = '';
    ranks.innerHTML = '';
    const flip = role === 'b';
    const fileLabels = flip ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const rankLabels = flip ? ['1', '2', '3', '4', '5', '6', '7', '8'] : ['8', '7', '6', '5', '4', '3', '2', '1'];
    fileLabels.forEach((f) => {
      const s = document.createElement('span');
      s.textContent = f;
      files.appendChild(s);
    });
    rankLabels.forEach((r) => {
      const s = document.createElement('span');
      s.textContent = r;
      ranks.appendChild(s);
    });
  }

  function renderHistory(movesSan) {
    const list = movesSan || chess.history();
    els.moveHistory.innerHTML = '';
    for (let i = 0; i < list.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'move-row';
      const num = document.createElement('span');
      num.className = 'idx';
      num.textContent = `${Math.floor(i / 2) + 1}.`;
      const w = document.createElement('span');
      w.className = 'san';
      w.textContent = list[i] || '';
      const b = document.createElement('span');
      b.className = 'san';
      b.textContent = list[i + 1] || '';
      const lastIdx = list.length - 1;
      if (i === lastIdx) w.classList.add('recent');
      if (i + 1 === lastIdx) b.classList.add('recent');
      row.appendChild(num);
      row.appendChild(w);
      row.appendChild(b);
      els.moveHistory.appendChild(row);
    }
    const grew = list.length > lastHistoryLen;
    lastHistoryLen = list.length;
    if (grew) {
      els.moveHistory.scrollTop = els.moveHistory.scrollHeight;
    }
  }

  let draggedPiece = null;
  let sourceSquare = null;

  function renderBoard() {
    const board = chess.board();
    els.board.innerHTML = '';
    board.forEach((row, ri) => {
      row.forEach((square, ci) => {
        const sq = document.createElement('div');
        const isLight = (ri + ci) % 2 === 0;
        sq.className = `square ${isLight ? 'light' : 'dark'}`;
        const algebraic = `${String.fromCharCode(97 + ci)}${8 - ri}`;
        if (lastFrom && lastTo && (algebraic === lastFrom || algebraic === lastTo)) {
          sq.classList.add('last-move');
        }
        sq.dataset.algebraic = algebraic;
        if (square) {
          const pe = document.createElement('div');
          pe.className = `piece ${square.color === 'w' ? 'white' : 'black'}`;
          pe.textContent = pieceChar(square);
          const myTurn = chess.turn() === square.color;
          const myPiece = role === square.color;
          pe.draggable = !!(myTurn && myPiece && !chess.isGameOver());
          if (pe.draggable) pe.classList.add('draggable');
          pe.addEventListener('dragstart', (e) => {
            if (!pe.draggable) return;
            draggedPiece = pe;
            sourceSquare = algebraic;
            e.dataTransfer.setData('text/plain', '');
            e.dataTransfer.effectAllowed = 'move';
          });
          pe.addEventListener('dragend', () => {
            draggedPiece = null;
            sourceSquare = null;
          });
          sq.appendChild(pe);
        }
        sq.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        });
        sq.addEventListener('dragenter', (e) => {
          e.preventDefault();
          sq.classList.add('drag-over');
        });
        sq.addEventListener('dragleave', () => sq.classList.remove('drag-over'));
        sq.addEventListener('drop', (e) => {
          e.preventDefault();
          sq.classList.remove('drag-over');
          if (!sourceSquare) return;
          tryMove(sourceSquare, algebraic);
        });
        els.board.appendChild(sq);
      });
    });
    if (role === 'b') els.board.classList.add('flipped');
    else els.board.classList.remove('flipped');
    getCapturedAndMaterial();
  }

  function tryMove(from, to) {
    if (!roomId || !role) return;
    const turn = chess.turn();
    if (turn !== role) {
      toast("Not your turn");
      return;
    }
    const piece = chess.get(from);
    if (!piece || piece.color !== role) return;
    const isPromo =
      piece.type === 'p' &&
      ((role === 'w' && to.charAt(1) === '8') || (role === 'b' && to.charAt(1) === '1'));
    if (isPromo) {
      pendingPromo = { from, to };
      openPromoModal();
      return;
    }
    submitMove(from, to);
  }

  function submitMove(from, to, promotion) {
    const before = chess.fen();
    const payload = { roomId, from, to };
    if (promotion) payload.promotion = promotion;
    socket.emit('move', payload);
    chess.load(before);
    renderBoard();
  }

  function openPromoModal() {
    els.promoGrid.innerHTML = '';
    const opts = ['q', 'r', 'b', 'n'];
    const labels = { q: '♕♛', r: '♖♜', b: '♗♝', n: '♘♞' };
    opts.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = labels[p];
      b.addEventListener('click', () => {
        if (!pendingPromo) return;
        const { from, to } = pendingPromo;
        pendingPromo = null;
        els.modalPromo.classList.add('hidden');
        submitMove(from, to, p);
      });
      els.promoGrid.appendChild(b);
    });
    els.modalPromo.classList.remove('hidden');
  }

  function applyState(payload) {
    if (payload.fen) chess.load(payload.fen);
    const moves = payload.movesSan || chess.history();
    if (payload.lastMove && payload.lastMove.from) {
      lastFrom = payload.lastMove.from;
      lastTo = payload.lastMove.to;
    } else {
      lastFrom = null;
      lastTo = null;
    }
    if (moves.length > prevMoveCount && prevMoveCount >= 0) {
      const wasCap = payload.lastMove && payload.lastMove.captured != null;
      playSound(wasCap ? 'capture' : 'move');
      if (payload.inCheck) playSound('check');
    }
    prevMoveCount = moves.length;
    renderBoard();
    renderHistory(payload.movesSan);
    updateTimers(payload);
    highlightTurn(payload);
  }

  function updateTimers(p) {
    if (!p) return;
    const w = p.whiteTime != null ? p.whiteTime : 600000;
    const b = p.blackTime != null ? p.blackTime : 600000;
    els.timerWhite.textContent = fmtTime(w);
    els.timerBlack.textContent = fmtTime(b);
    const warn = 60000;
    els.timerWhite.classList.toggle('warn', w < warn);
    els.timerBlack.classList.toggle('warn', b < warn);
  }

  function highlightTurn(p) {
    const t = p.turn || chess.turn();
    els.cardWhite.classList.toggle('active', t === 'w');
    els.cardBlack.classList.toggle('active', t === 'b');
  }

  function showGameOver(data) {
    playSound('gameover');
    let msg = '';
    if (data.reason === 'checkmate' && data.winner) {
      msg = `${data.winner === 'w' ? 'White' : 'Black'} wins by checkmate.`;
    } else if (data.reason === 'timeout' && data.winner) {
      msg = `${data.winner === 'w' ? 'White' : 'Black'} wins on time.`;
    } else if (data.reason === 'resignation' && data.winner) {
      msg = `${data.winner === 'w' ? 'White' : 'Black'} wins by resignation.`;
    } else if (data.reason === 'draw' || data.byAgreement) {
      msg = 'Draw.';
    } else if (data.reason === 'stalemate') {
      msg = 'Draw by stalemate.';
    } else {
      msg = 'Game over.';
    }
    els.goBody.textContent = msg;
    els.modalGo.classList.remove('hidden');
  }

  function hideGameOver() {
    els.modalGo.classList.add('hidden');
  }

  function enterGame(data) {
    roomId = data.roomId || roomId;
    els.lobby.classList.add('hidden');
    els.game.classList.remove('hidden');
    els.roomBadge.textContent = roomId ? `Room ${roomId}` : '—';
    els.gameRoomPill.textContent = roomId ? `Room ${roomId}` : 'Room';
    els.roleBadge.classList.remove('hidden');
    els.roleBadge.textContent = role === 'w' ? 'White' : 'Black';
    els.roleBadge.classList.toggle('role-w', role === 'w');
    els.roleBadge.classList.toggle('role-b', role === 'b');
    if (data.whiteName) els.nameWhite.textContent = data.whiteName;
    if (data.blackName) els.nameBlack.textContent = data.blackName;
    renderCoords();
    applyState(data);
  }

  $('btn-generate').addEventListener('click', genRoom);
  $('btn-copy-lobby').addEventListener('click', copyLink);
  $('btn-copy-game').addEventListener('click', copyLink);
  $('btn-create-white').addEventListener('click', () => {
    playerName = els.playerName.value.trim() || 'Guest';
    const code = els.roomCode.value.trim().toUpperCase();
    if (code.length < 4) {
      toast('Generate or enter a room code first');
      return;
    }
    socket.emit('joinRoom', { roomId: code, playerName, color: 'w' });
  });
  $('btn-join-black').addEventListener('click', () => {
    playerName = els.playerName.value.trim() || 'Guest';
    const code = els.roomCode.value.trim().toUpperCase();
    if (code.length < 4) {
      toast('Enter the room code');
      return;
    }
    socket.emit('joinRoom', { roomId: code, playerName, color: 'b' });
  });

  $('btn-chat-send').addEventListener('click', sendChat);
  els.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  function sendChat() {
    const msg = els.chatInput.value.trim();
    if (!msg || !roomId) return;
    socket.emit('chat', { roomId, name: playerName, msg, color: role });
    els.chatInput.value = '';
  }

  document.querySelectorAll('.quick-msgs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-qm');
      if (!q || !roomId) return;
      socket.emit('chat', { roomId, name: playerName, msg: q, color: role });
    });
  });

  $('btn-draw').addEventListener('click', () => {
    if (!roomId) return;
    socket.emit('draw_offer', { roomId });
    toast('Draw offer sent');
  });
  $('btn-resign').addEventListener('click', () => {
    if (!roomId) return;
    if (confirm('Resign this game?')) socket.emit('resign', { roomId });
  });
  $('btn-draw-accept').addEventListener('click', () => {
    socket.emit('draw_accept', { roomId });
    els.modalDraw.classList.add('hidden');
  });
  $('btn-draw-decline').addEventListener('click', () => {
    socket.emit('draw_decline', { roomId });
    els.modalDraw.classList.add('hidden');
  });
  $('btn-rematch').addEventListener('click', () => {
    socket.emit('rematch_request', { roomId });
    toast('Rematch requested');
    hideGameOver();
  });
  $('btn-lobby').addEventListener('click', () => {
    window.location.href = baseUrl();
  });

  els.themeSelect.addEventListener('change', () => {
    const v = els.themeSelect.value;
    document.documentElement.setAttribute('data-theme', v === 'classic' ? '' : v);
  });

  $('sound-toggle').addEventListener('change', (e) => {
    soundOn = e.target.checked;
  });

  socket.on('connect', () => {
    els.connDot.classList.remove('off');
    els.connLabel.textContent = 'Live';
  });
  socket.on('disconnect', () => {
    els.connDot.classList.add('off');
    els.connLabel.textContent = 'Offline';
  });

  socket.on('errorMsg', (d) => {
    toast(typeof d === 'string' ? d : d.message || 'Error');
  });

  socket.on('joinedRoom', (data) => {
    roomId = data.roomId;
    role = data.role;
    enterGame({ ...data.state, roomId: data.roomId });
    toast(role === 'w' ? 'You are White — share the link' : 'Joined as Black');
  });

  socket.on('roomUpdate', (data) => {
    if (data.whiteName) els.nameWhite.textContent = data.whiteName;
    if (data.blackName) els.nameBlack.textContent = data.blackName;
    if (data.fen) applyState(data);
  });

  socket.on('gameStart', (data) => {
    toast('Opponent joined — White to move');
    applyState(data);
  });

  socket.on('stateSync', (data) => {
    applyState(data);
  });

  socket.on('clockUpdate', (data) => {
    updateTimers(data);
  });

  socket.on('invalidMove', () => {
    toast('Illegal move');
    // Local FEN was already restored in submitMove(); avoid requestState + full
    // re-render so move-history / page scrollbars do not flash.
  });

  socket.on('chat', (c) => {
    const line = document.createElement('div');
    line.className = `chat-msg ${c.color === 'b' ? 'b' : ''}`;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = c.name || (c.color === 'w' ? 'White' : 'Black');
    line.appendChild(who);
    line.appendChild(document.createTextNode(c.msg));
    els.chatLog.appendChild(line);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  });

  socket.on('draw_offer', () => {
    els.modalDraw.classList.remove('hidden');
    toast('Draw offer received');
  });

  socket.on('draw_declined', () => toast('Draw declined'));

  socket.on('gameOver', (data) => {
    showGameOver(data);
  });

  socket.on('opponentDisconnected', () => {
    toast('Opponent disconnected');
  });

  socket.on('rematch_pending', () => {
    toast('Opponent wants a rematch — click Rematch');
  });

  socket.on('rematchStarted', (data) => {
    hideGameOver();
    lastFrom = null;
    lastTo = null;
    prevMoveCount = 0;
    lastHistoryLen = -1;
    toast('New game');
    applyState(data);
  });

  if (window.__INITIAL_ROOM__) {
    els.roomCode.value = window.__INITIAL_ROOM__;
  }

  renderCoords();
  renderBoard();
  renderHistory([]);
