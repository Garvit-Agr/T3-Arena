// match_arena.js

document.addEventListener('DOMContentLoaded', () => {

    // 1. Auth Guard (Lockdown mode)
    const loggedInUser = sessionStorage.getItem("arena_auth_user");
    const loggedInUid  = sessionStorage.getItem("arena_auth_uid");

    if (!loggedInUser || !loggedInUid) {
        // window.location.replace("login.html");
        // return; // Uncomment in production
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
    let isMyTurn = false; // Will be updated by server
    let gameActive = true;
    let boardState = ["", "", "", "", "", "", "", "", ""]; 
    
    let moveCount = 0;
    let matchStartTime = Date.now();
    let lastTurnTime = Date.now();
    let totalThinkTime = 0;
    let timerInterval;

    // -------------------------------------------------------------
    // BACKEND: MATCH INITIALIZATION
    // Fetch opponent data when the page loads
    // -------------------------------------------------------------
    async function initializeMatch() {
        try {
            // Your friend will provide this API route
            let response = await fetch('http://localhost:5001/api/match_init');
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

    function showToast() {
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

    // -------------------------------------------------------------
    // BACKEND: SENDING MOVES
    // -------------------------------------------------------------
    cells.forEach(cell => {
        cell.addEventListener('click', async (e) => {
            if (!gameActive) return;
            const index = e.target.getAttribute('data-index');

            if (boardState[index] !== "") return;
            if (!isMyTurn) { showToast(); return; }

            // 1. Optimistic UI update (Feels instantly responsive)
            boardState[index] = "X";
            e.target.innerHTML = `<span class="material-symbols-outlined mark-x">close</span>`;
            addLog(`Move: YOU (X) -> Sector [${index}]`);
            updateLiveAnalytics();
            setTurnUI(false);

            // 2. Send move to Python Backend
            try {
                await fetch('http://localhost:5001/api/make_move', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cell_index: index, player: "X" })
                });
            } catch(error) {
                console.error("Failed to send move to server", error);
            }
        });
    });

    // -------------------------------------------------------------
    // BACKEND: SERVER POLLING LOOP (Checks for opponent moves)
    // -------------------------------------------------------------
    setInterval(async () => {
        if (!gameActive) return;
        
        try {
            let response = await fetch('http://localhost:5001/api/game_status');
            let backendData = await response.json();
            
            // 1. Check if game is over
            if (backendData.game_status === "game_over") {
                showEndScreen(backendData);
                return;
            }

            // 2. Check if opponent made a move 
            // (Assumes backend sends array like: ["X", "O", "", "", ...])
            if (backendData.board && JSON.stringify(backendData.board) !== JSON.stringify(boardState)) {
                updateBoardFromBackend(backendData.board);
            }
            
            // 3. Update Turn Indicator
            if (backendData.current_turn === loggedInUser && !isMyTurn) {
                setTurnUI(true);
            }
            
        } catch(e) {
            // Silently fail if backend is unreachable during dev so it doesn't spam errors
        }
    }, 1000);

    // Updates HTML board if opponent moved
    function updateBoardFromBackend(newBoard) {
        newBoard.forEach((mark, index) => {
            if (boardState[index] !== mark) {
                boardState[index] = mark;
                if (mark === "O") {
                    cells[index].innerHTML = `<span class="material-symbols-outlined mark-o">radio_button_unchecked</span>`;
                    addLog(`Move: OPPONENT (O) -> Sector [${index}]`);
                    updateLiveAnalytics();
                } else if (mark === "X") {
                    cells[index].innerHTML = `<span class="material-symbols-outlined mark-x">close</span>`;
                }
            }
        });
    }

    // =========================================================================
    // END OF MATCH LOGIC (DYNAMIC - POWERED BY BACKEND JSON)
    // =========================================================================

    const overlay = document.getElementById('match-result-overlay');
    
    // Expects JSON from backend containing real ELO math and results
    function showEndScreen(matchData) {
        if (!gameActive) return; 
        gameActive = false; 
        clearInterval(timerInterval); 

        // Extract real data sent by Python server
        const resultType = matchData.result; // 'victory', 'defeat', or 'draw'
        const prevElo = matchData.previous_elo || storedElo;
        const currentElo = matchData.new_elo || prevElo;
        const eloChange = matchData.elo_change || 0;
        const totalMoves = matchData.total_moves || moveCount;
        const timeElapsed = matchData.time_elapsed || liveDurationEl.innerText;
        const reasonText = matchData.reason || "Match Concluded by Server.";

        let title, systemText, desc, classTheme;
        
        if (resultType === 'victory') {
            classTheme = 'theme-victory';
            title = 'VICTORY';
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

    // Buttons Send Backend Requests Instead of Faking It Now
    document.getElementById('btn-resign').addEventListener('click', async () => {
        try { await fetch('http://localhost:5001/api/resign', { method: 'POST' }); } catch(e) {}
    });

    document.getElementById('btn-offer-draw').addEventListener('click', async () => {
        try { await fetch('http://localhost:5001/api/offer_draw', { method: 'POST' }); } catch(e) {}
    });

    // Overlay Navigation Links
    document.getElementById('btn-return-lobby').addEventListener('click', () => { window.location.href = "lobby_command_center.html"; });
    document.getElementById('btn-view-leaderboard').addEventListener('click', () => { window.location.href = "leaderboard.html"; });
    document.getElementById('btn-rematch').addEventListener('click', () => { window.location.reload(); });

});