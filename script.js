(() => {
  const COLS = 5;
  const ROWS = 4;
  const TOTAL = COLS * ROWS;
  const UNIT = 100;
  const TAB = 24;
  const canvas = document.getElementById("puzzle");
  const ctx = canvas.getContext("2d");
  const image = new Image();
  const status = document.getElementById("game-status");
  const timer = document.getElementById("timer");
  const progress = document.getElementById("progress");
  const remaining = document.getElementById("remaining");
  const resetButton = document.getElementById("reset-button");

  let pieces = [];
  let board = null;
  let drag = null;
  let startedAt = null;
  let timerInterval = null;
  let locked = false;

  function horizontalTab(col, row) {
    return (col * 7 + row * 3) % 2 === 0 ? 1 : -1;
  }

  function verticalTab(col, row) {
    return (col * 5 + row * 11) % 2 === 0 ? 1 : -1;
  }

  function addEdge(x, y, dx, dy, nx, ny, direction) {
    const point = (t, offset) => [
      x + dx * t + nx * offset * direction,
      y + dy * t + ny * offset * direction,
    ];
    ctx.lineTo(...point(0.32, 0));
    ctx.quadraticCurveTo(...point(0.36, 0), ...point(0.38, 12));
    ctx.quadraticCurveTo(...point(0.4, 28), ...point(0.5, 28));
    ctx.quadraticCurveTo(...point(0.6, 28), ...point(0.62, 12));
    ctx.quadraticCurveTo(...point(0.64, 0), ...point(0.68, 0));
    ctx.lineTo(x + dx, y + dy);
  }

  function piecePath(col, row) {
    ctx.beginPath();
    ctx.moveTo(TAB, TAB);
    addEdge(
      TAB, TAB, UNIT, 0, 0, -1,
      row === 0 ? 0 : -horizontalTab(col, row),
    );
    addEdge(
      TAB + UNIT, TAB, 0, UNIT, 1, 0,
      col === COLS - 1 ? 0 : verticalTab(col + 1, row),
    );
    addEdge(
      TAB + UNIT, TAB + UNIT, -UNIT, 0, 0, 1,
      row === ROWS - 1 ? 0 : horizontalTab(col, row + 1),
    );
    addEdge(
      TAB, TAB + UNIT, 0, -UNIT, -1, 0,
      col === 0 ? 0 : -verticalTab(col, row),
    );
    ctx.closePath();
  }

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function makePieces() {
    pieces = shuffle(
      Array.from({ length: TOTAL }, (_, index) => ({
        col: index % COLS,
        row: Math.floor(index / COLS),
        placed: false,
        x: 0,
        y: 0,
        trayIndex: index,
      })),
    );
    pieces.forEach((piece, index) => {
      piece.trayIndex = index;
    });
  }

  function resizeCanvas() {
    if (!image.complete || !image.naturalWidth) return;

    const width = canvas.clientWidth;
    const desktopLayout = width >= 820;
    const trayColumns = COLS;
    const trayRows = Math.ceil(TOTAL / trayColumns);
    const boardWidth = desktopLayout
      ? Math.min(width * 0.52, 640)
      : Math.min(width - 28, 760);
    const boardHeight = boardWidth * (image.naturalHeight / image.naturalWidth);
    const cellWidth = boardWidth / COLS;
    const cellHeight = boardHeight / ROWS;
    const boardX = desktopLayout ? 20 : (width - boardWidth) / 2;
    const boardY = desktopLayout ? 42 : 48;
    const trayX = desktopLayout ? boardX + boardWidth + 30 : 12;
    const trayWidth = desktopLayout ? width - trayX - 18 : width - 24;
    const slotWidth = trayWidth / trayColumns;
    const slotHeight = Math.max(
      desktopLayout ? 58 : 66,
      desktopLayout ? (boardHeight / trayRows) * 0.92 : cellHeight * 1.48,
    );
    const pieceScale = Math.min(
      (slotWidth * 0.82) / ((UNIT + TAB * 2) * cellWidth / UNIT),
      (slotHeight * 0.82) / ((UNIT + TAB * 2) * cellHeight / UNIT),
    );
    const trayY = desktopLayout ? boardY : boardY + boardHeight + 58;
    const height = desktopLayout
      ? Math.max(boardY + boardHeight, trayY + trayRows * slotHeight) + 24
      : trayY + trayRows * slotHeight + 16;
    const dpr = window.devicePixelRatio || 1;

    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    board = {
      width,
      height,
      boardWidth,
      boardHeight,
      cellWidth,
      cellHeight,
      boardX,
      boardY,
      desktopLayout,
      trayColumns,
      trayRows,
      trayX,
      trayWidth,
      trayY,
      slotWidth,
      slotHeight,
      pieceScale,
    };

    pieces.forEach((piece) => {
      if (piece.placed) {
        piece.x = targetX(piece);
        piece.y = targetY(piece);
      } else {
        setTrayPosition(piece);
      }
    });
    draw();
  }

  function pieceSize() {
    return {
      width: (UNIT + TAB * 2) * (board.cellWidth / UNIT) * board.pieceScale,
      height: (UNIT + TAB * 2) * (board.cellHeight / UNIT) * board.pieceScale,
    };
  }

  function setTrayPosition(piece) {
    const { width, height } = pieceSize();
    const col = piece.trayIndex % board.trayColumns;
    const row = Math.floor(piece.trayIndex / board.trayColumns);
    const slotX = board.trayX + col * board.slotWidth;
    const slotY = board.trayY + row * board.slotHeight;
    piece.x = slotX + (board.slotWidth - width) / 2;
    piece.y = slotY + (board.slotHeight - height) / 2;
  }

  function targetX(piece) {
    return board.boardX + piece.col * board.cellWidth
      - TAB * board.cellWidth / UNIT;
  }

  function targetY(piece) {
    return board.boardY + piece.row * board.cellHeight
      - TAB * board.cellHeight / UNIT;
  }

  function drawPiece(piece, isDragging = false) {
    const scaleX = board.cellWidth / UNIT * (piece.placed ? 1 : board.pieceScale);
    const scaleY = board.cellHeight / UNIT * (piece.placed ? 1 : board.pieceScale);
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.scale(scaleX, scaleY);
    if (!piece.placed || isDragging) {
      ctx.shadowColor = "#1c2a48aa";
      ctx.shadowBlur = (isDragging ? 12 : 5) / scaleX;
      ctx.shadowOffsetY = (isDragging ? 4 : 2) / scaleY;
    }
    piecePath(piece.col, piece.row);
    ctx.save();
    ctx.clip();
    const sourceCellWidth = image.naturalWidth / COLS;
    const sourceCellHeight = image.naturalHeight / ROWS;
    const sourceX = piece.col * sourceCellWidth - (TAB / UNIT) * sourceCellWidth;
    const sourceY = piece.row * sourceCellHeight - (TAB / UNIT) * sourceCellHeight;
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceCellWidth * (1 + 2 * TAB / UNIT),
      sourceCellHeight * (1 + 2 * TAB / UNIT),
      0,
      0,
      UNIT + 2 * TAB,
      UNIT + 2 * TAB,
    );
    ctx.restore();
    piecePath(piece.col, piece.row);
    ctx.lineWidth = (piece.placed ? 1.5 : 3.2) / Math.min(scaleX, scaleY);
    ctx.strokeStyle = "#30415d";
    ctx.stroke();
    piecePath(piece.col, piece.row);
    ctx.lineWidth = (piece.placed ? 1.1 : 1.8) / Math.min(scaleX, scaleY);
    ctx.strokeStyle = piece.placed ? "#ffffffb8" : "#ffffff";
    ctx.stroke();
    ctx.restore();
  }

  function drawBoard() {
    ctx.fillStyle = "#30415d";
    ctx.font = "700 14px 'Segoe UI', Tahoma, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("กระดานต่อภาพ", board.boardX, 29);
    ctx.fillStyle = "#66718a";
    ctx.font = "12px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText("ภาพตัวอย่าง", board.boardX + board.boardWidth - 68, 29);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.drawImage(image, board.boardX, board.boardY, board.boardWidth, board.boardHeight);
    ctx.restore();

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const x = board.boardX + col * board.cellWidth - TAB * board.cellWidth / UNIT;
        const y = board.boardY + row * board.cellHeight - TAB * board.cellHeight / UNIT;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(board.cellWidth / UNIT, board.cellHeight / UNIT);
        piecePath(col, row);
        ctx.lineWidth = 1.4 / Math.min(board.cellWidth / UNIT, board.cellHeight / UNIT);
        ctx.strokeStyle = "#7182a966";
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function draw() {
    if (!board) return;
    ctx.clearRect(0, 0, board.width, board.height);
    drawBoard();
    ctx.fillStyle = "#30415d";
    ctx.font = "700 14px 'Segoe UI', Tahoma, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("ชิ้นส่วนทั้งหมด 20 ชิ้น", board.trayX, 29);
    for (let index = 0; index < TOTAL; index += 1) {
      const col = index % board.trayColumns;
      const row = Math.floor(index / board.trayColumns);
      const x = board.trayX + col * board.slotWidth;
      const y = board.trayY + row * board.slotHeight;
      ctx.fillStyle = "#edf1f8";
      ctx.fillRect(x + 2, y + 3, board.slotWidth - 5, board.slotHeight - 6);
      ctx.strokeStyle = "#d6deed";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2.5, y + 3.5, board.slotWidth - 6, board.slotHeight - 7);
    }
    pieces.forEach((piece) => {
      if (!piece.placed && piece !== (drag && drag.piece)) drawPiece(piece);
    });
    pieces.filter((piece) => piece.placed).forEach((piece) => drawPiece(piece));
    if (drag) drawPiece(drag.piece, true);
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (board.width / rect.width),
      y: (event.clientY - rect.top) * (board.height / rect.height),
    };
  }

  function updateProgress() {
    const placed = pieces.filter((piece) => piece.placed).length;
    progress.textContent = `${placed} / ${TOTAL}`;
    remaining.textContent = String(TOTAL - placed);
    if (placed === TOTAL) {
      locked = true;
      clearInterval(timerInterval);
      status.textContent = `เก่งมาก! ต่อภาพสำเร็จในเวลา ${timer.textContent}`;
    } else {
      status.textContent = placed ? "เยี่ยมเลย! ต่ออีกนิดนะ" : "ลากชิ้นส่วนไปวางบนภาพ";
    }
  }

  function startTimer() {
    if (startedAt !== null) return;
    startedAt = Date.now();
    timerInterval = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      const minutesText = String(Math.floor(seconds / 60)).padStart(2, "0");
      const secondsText = String(seconds % 60).padStart(2, "0");
      timer.textContent = `${minutesText}:${secondsText}`;
    }, 1000);
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (locked || !board) return;
    const point = pointerPosition(event);
    const piece = [...pieces].reverse().find((item) => {
      if (item.placed) return false;
      const size = pieceSize();
      return point.x >= item.x && point.x <= item.x + size.width
        && point.y >= item.y && point.y <= item.y + size.height;
    });
    if (!piece) return;

    startTimer();
    pieces.splice(pieces.indexOf(piece), 1);
    pieces.push(piece);
    drag = {
      piece,
      offsetX: point.x - piece.x,
      offsetY: point.y - piece.y,
    };
    canvas.setPointerCapture(event.pointerId);
    draw();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drag || !board) return;
    const point = pointerPosition(event);
    const size = pieceSize();
    drag.piece.x = Math.max(0, Math.min(board.width - size.width, point.x - drag.offsetX));
    drag.piece.y = Math.max(0, Math.min(board.height - size.height, point.y - drag.offsetY));
    draw();
  });

  function finishDrag() {
    if (!drag) return;
    const piece = drag.piece;
    const size = pieceSize();
    const pieceCenterX = piece.x + size.width / 2;
    const pieceCenterY = piece.y + size.height / 2;
    const targetCenterX = board.boardX + (piece.col + 0.5) * board.cellWidth;
    const targetCenterY = board.boardY + (piece.row + 0.5) * board.cellHeight;
    const distance = Math.hypot(
      pieceCenterX - targetCenterX,
      pieceCenterY - targetCenterY,
    );
    if (distance < Math.max(26, board.cellWidth * 0.3)) {
      piece.x = targetX(piece);
      piece.y = targetY(piece);
      piece.placed = true;
      updateProgress();
    } else {
      setTrayPosition(piece);
    }
    drag = null;
    draw();
  }

  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);

  resetButton.addEventListener("click", () => {
    clearInterval(timerInterval);
    timerInterval = null;
    drag = null;
    startedAt = null;
    locked = false;
    timer.textContent = "00:00";
    makePieces();
    updateProgress();
    if (board) {
      pieces.forEach(setTrayPosition);
      draw();
    }
  });

  image.addEventListener("load", () => {
    status.textContent = "ลากชิ้นส่วนไปวางบนภาพ";
    makePieces();
    resizeCanvas();
    updateProgress();
  });
  image.addEventListener("error", () => {
    status.textContent = "โหลด car.jpg ไม่สำเร็จ กรุณาตรวจสอบว่าไฟล์อยู่ในโฟลเดอร์เดียวกับเกม";
  });
  window.addEventListener("resize", resizeCanvas);
  image.src = "car.jpg";
})();
