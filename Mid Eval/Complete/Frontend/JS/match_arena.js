// match_arena.js

document.addEventListener('DOMContentLoaded', () => {

    // 1. Auth Guard (Lockdown mode)
    const loggedInUser = sessionStorage.getItem("arena_auth_user");
    const loggedInUid  = sessionStorage.getItem("arena_auth_uid");

    if (!loggedInUser || !loggedInUid) {
        window.location.replace("login.html");
        return; 
    }

    // Extract URL Params for WebSocket
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    const mySymbol = urlParams.get('symbol'); // "X" or "O"

    if (!roomId || !mySymbol) {
        alert("Invalid match routing. Returning to lobby.");
        window.location.href = "lobby_command_center.html";
        return;
    }

    // Set User Profile Data Locally
    const storedElo = parseInt(sessionStorage.getItem("arena_auth_elo") || "1450");
    const safeUser = loggedInUser || "OPERATOR_01";
    document.querySelector('.js-my-name').innerText = safeUser.replaceAll('_', ' ').toUpperCase();
    document.querySelector('.js-my-elo').innerHTML = `${storedElo.toLocaleString()} <span class="elo-label">ELO</span>`;
    
    function getInitials(name) {
        if (!name) return "??";
        const parts = name.trim().split(/[_\s]+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    const myInitials = getInitials(safeUser);
    document.querySelector('.js-my-initials').innerText = myInitials;
    document.getElementById('hdr-initials').innerText = myInitials;
    document.getElementById('hdr-elo').innerText = `${storedElo.toLocaleString()} ELO`;

    // 2. DOM Elements
    const cells = document.querySelectorAll('.cell');
    const toast = document.getElementById('toast-container');
    const turnIndicator = document.getElementById('turn-indicator');
    const turnText = document.getElementById('turn-text');
    const combatLogBody = document.getElementById('combat-log-body');
    
    const liveDurationEl = document.getElementById('live-duration');
    const liveMovesText = document.getElementById('live-moves-text');
    const liveMovesBar = document.getElementById('live-moves-bar');
    const liveResponseTime = document.getElementById('live-response-time');

    // 3. Match State
    let isMyTurn = false; 
    let gameActive = true;
    let boardState = ["", "", "", "", "", "", "", "", ""]; 
    
    let moveCount = 0;
    let matchStartTime = Date.now();
    let lastTurnTime = Date.now();
    let totalThinkTime = 0;
    let timerInterval;

    // -------------------------------------------------------------
    // BACKEND: MATCH INITIALIZATION 
    // -------------------------------------------------------------
    async function initializeMatch() {
        try {
            let response = await fetch(`http://localhost:5001/api/match_init/${roomId}/${loggedInUid}`);
            let data = await response.json();
            
            // Populate real opponent data
            document.getElementById('opp-name').innerText = data.opponent_name;
            document.getElementById('opp-elo').innerText = data.opponent_elo;
            document.getElementById('opp-initials').innerText = getInitials(data.opponent_name);
            document.getElementById('opp-winrate').innerText = data.opponent_winrate + '%';
            document.getElementById('opp-region').innerText = data.opponent_region;
            
            document.getElementById('my-winrate').innerText = data.my_winrate + '%';
            document.getElementById('my-streak').innerText = data.my_streak;
            
        } catch(e) {
            console.warn("Backend not connected for init. Waiting for server...");
        }
    }
    initializeMatch();

    // --- LIVE MATCH DURATION TIMER ---
    function updateMatchDuration() {
        if (!gameActive) return;
        const elapsed = Math.floor((Date.now() - matchStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        liveDurationEl.innerText = `${mins}:${secs}`;
    }
    timerInterval = setInterval(updateMatchDuration, 1000);

    function addLog(text) {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" });
        const logLine = document.createElement('div');
        logLine.className = 'log-line';
        logLine.innerHTML = `<span class="log-time">${time}</span> <span class="log-text">${text}</span>`;
        combatLogBody.appendChild(logLine);
        combatLogBody.scrollTop = combatLogBody.scrollHeight; 
    }
    
    addLog("SYSTEM: Handshake complete.");
    addLog("ARENA: Awaiting server synchronization.");

    function showToast(message = "ACCESS DENIED: NOT YOUR TURN") {
        document.getElementById('toast-message').innerText = message;
        toast.classList.remove('hidden');
        setTimeout(() => { toast.classList.add('hidden'); }, 2500); 
    }

    function setTurnUI(myTurn) {
        isMyTurn = myTurn;
        if (myTurn) {
            turnIndicator.classList.remove('opponent-turn');
            turnText.innerText = "YOUR TURN";
        } else {
            turnIndicator.classList.add('opponent-turn');
            turnText.innerText = "OPPONENT COMPUTING...";
        }
    }

    function updateLiveAnalytics() {
        moveCount++;
        liveMovesText.innerText = `${moveCount} / 9`;
        const percentage = (moveCount / 9) * 100;
        liveMovesBar.style.width = `${percentage}%`;

        const timeTakenForThisMove = (Date.now() - lastTurnTime) / 1000;
        totalThinkTime += timeTakenForThisMove;
        const avgResponse = (totalThinkTime / moveCount).toFixed(1);
        liveResponseTime.innerText = `${avgResponse}s`;

        lastTurnTime = Date.now();
    }

    // =========================================================================
    // WEBSOCKET INTEGRATION
    // =========================================================================
    const gameSocket = new WebSocket(`ws://localhost:5001/ws/game/${roomId}/${loggedInUid}`);

    gameSocket.onopen = () => {
        addLog("ARENA: Server synchronization established.");
    };

    gameSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // 1. Board updates and turn toggling
        if (data.type === "board_state" || data.type === "board_update") {
            updateBoardFromBackend(data.board);
            setTurnUI(data.turn === mySymbol);
            
            if (data.last_move) {
                const mover = data.last_move.uid === loggedInUid ? "YOU" : "OPPONENT";
                const sector = (data.last_move.row * 3) + data.last_move.col;
                addLog(`Move: ${mover} -> Sector [${sector}]`);
            }
        }

        // 2. Reject Invalid Moves
        if (data.type === "move_rejected") {
            showToast(data.reason.toUpperCase());
        }

        // 3. Match Complete
        if (data.type === "game_over") {
            showEndScreen(data);
        }
    };

    gameSocket.onclose = () => {
        if (gameActive) addLog("SYSTEM ERROR: Connection to Arena lost.");
    };

    function updateBoardFromBackend(backendBoard) {
        let newMoves = 0;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const index = (row * 3) + col;
                const mark = backendBoard[row][col];
                
                if (mark !== "") newMoves++;

                if (boardState[index] !== mark) {
                    boardState[index] = mark;
                    const cellEl = cells[index];
                    if (mark === "X") {
                        cellEl.innerHTML = `<span class="material-symbols-outlined mark-x">close</span>`;
                    } else if (mark === "O") {
                        cellEl.innerHTML = `<span class="material-symbols-outlined mark-o">radio_button_unchecked</span>`;
                    }
                }
            }
        }
        
        if (newMoves > moveCount) {
            updateLiveAnalytics();
        }
    }

    // -------------------------------------------------------------
    // SENDING MOVES TO WEBSOCKET
    // -------------------------------------------------------------
    cells.forEach(cell => {
        cell.addEventListener('click', (e) => {
            if (!gameActive) return;
            const index = parseInt(e.currentTarget.getAttribute('data-index'));

            if (boardState[index] !== "") return;
            if (!isMyTurn) { showToast("ACCESS DENIED: NOT YOUR TURN"); return; }

            const row = Math.floor(index / 3);
            const col = index % 3;

            gameSocket.send(JSON.stringify({
                type: "move",
                row: row,
                col: col
            }));
        });
    });

    // =========================================================================
    // END OF MATCH LOGIC 
    // =========================================================================

    const overlay = document.getElementById('match-result-overlay');
    
    function showEndScreen(matchData) {
        if (!gameActive) return; 
        gameActive = false; 
        clearInterval(timerInterval); 

        let resultType = "draw";
        if (matchData.winner === mySymbol) resultType = "victory";
        else if (matchData.winner && matchData.winner !== "DRAW") resultType = "defeat";

        const prevElo = storedElo;
        const currentElo = matchData.new_ratings[loggedInUid];
        const eloChange = currentElo - prevElo;
        const totalMoves = moveCount;
        const timeElapsed = liveDurationEl.innerText;
        const reasonText = matchData.forfeit ? "Opponent Forfeited // Arena Dominance Confirmed" : "Match Concluded by Server.";

        let title, systemText, desc, classTheme;
        
        if (resultType === 'victory') {
            classTheme = 'theme-victory';
            title = matchData.forfeit ? 'VICTORY (FORFEIT)' : 'VICTORY';
            systemText = 'System_Link_Stable';
            desc = 'Performance rating exceeds regional average.';
        } else if (resultType === 'defeat') {
            classTheme = 'theme-defeat';
            title = 'DEFEAT';
            systemText = 'System_Link_Degraded';
            desc = 'Rating adjustment applied based on opponent difficulty offset.';
        } else {
            classTheme = 'theme-draw';
            title = 'DRAW';
            systemText = 'System_Link_Stable';
            desc = 'Rating adjusted based on performance equalization factors.';
        }

        // Apply theme 
        overlay.className = `result-overlay ${classTheme}`; 
        
        // Inject Backend Text
        document.getElementById('result-title').innerText = title;
        document.getElementById('result-subtitle').innerText = reasonText;
        document.getElementById('result-system-text').innerText = systemText;
        
        // Inject Backend ELO Math
        document.getElementById('res-prev-elo').innerText = prevElo;
        document.getElementById('res-curr-elo').innerText = currentElo;
        document.getElementById('res-elo-badge').innerText = eloChange > 0 ? `+${eloChange}` : eloChange;
        document.getElementById('res-elo-desc').innerText = desc;

        // Inject Match Stats
        document.getElementById('res-total-moves').innerText = totalMoves;
        document.getElementById('res-time-elapsed').innerText = timeElapsed;

        // Build Final Logs
        const finalLogsBox = document.getElementById('res-final-logs');
        finalLogsBox.innerHTML = ''; 
        const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" });
        
        finalLogsBox.innerHTML += `
            <div class="res-log-line"><span class="res-log-time">[${time}]</span> <span class="res-log-text">Match commenced. Handshake verified.</span></div>
            <div class="res-log-line"><span class="res-log-time">[${time}]</span> <span class="res-log-text">${totalMoves} tactical executions recorded.</span></div>
            <div class="res-log-line"><span class="res-log-time">[${time}]</span> <span class="res-log-bold">MATCH_TERMINATED: ${title}</span></div>
        `;

        // Save new ELO locally so the Lobby shows the correct number immediately
        sessionStorage.setItem("arena_auth_elo", currentElo.toString());
    }

    // Resign Match Logic
    document.getElementById('btn-resign').addEventListener('click', () => {
        if (gameActive && confirm("Are you sure you want to resign? This will count as a loss.")) {
            gameSocket.send(JSON.stringify({ type: "resign" }));
        }
    });

    // White Action Buttons Logic (Rematch functionality is completely removed)
    document.getElementById('btn-return-lobby').addEventListener('click', () => { window.location.href = "lobby_command_center.html"; });
    document.getElementById('btn-view-leaderboard').addEventListener('click', () => { window.location.href = "leaderboard.html"; });

});