document.addEventListener('DOMContentLoaded', () => {

    // Auth check
    const auth_user = sessionStorage.getItem("arena_auth_user");
    const auth_uid  = sessionStorage.getItem("arena_auth_uid");

    if (!auth_user || !auth_uid) {
        window.location.replace("login.html");
        return; 
    }

    // Pull room info from URL
    const params = new URLSearchParams(window.location.search);
    const room_id = params.get('room');
    const my_sym = params.get('symbol');

    if (!room_id || !my_sym) {
        alert("Invalid match route. Heading back to lobby.");
        window.location.href = "lobby_command_center.html";
        return;
    }

    // Fill in local player info
    const stored_elo = parseInt(sessionStorage.getItem("arena_auth_elo") || "1450");
    const safe_user = auth_user || "OPERATOR_01";
    document.querySelector('.js-my-name').innerText = safe_user.replaceAll('_', ' ').toUpperCase();
    document.querySelector('.js-my-elo').innerHTML = `${stored_elo.toLocaleString()} <span class="elo-label">ELO</span>`;
    
    // Get initials from name
    function get_initials(name) {
        if (!name) return "??";
        const parts = name.trim().split(/[_\s]+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    const my_inits = get_initials(safe_user);
    document.querySelector('.js-my-initials').innerText = my_inits;
    document.getElementById('hdr-initials').innerText = my_inits;
    document.getElementById('hdr-elo').innerText = `${stored_elo.toLocaleString()} ELO`;

    // DOM refs
    const cells = document.querySelectorAll('.cell');
    const toast = document.getElementById('toast-cnt');
    const turn_ind = document.getElementById('turn-ind');
    const turn_txt = document.getElementById('turn-txt');
    const log_body = document.getElementById('log-body');
    
    const dur_el = document.getElementById('live-dur');
    const moves_txt = document.getElementById('live-moves-txt');
    const moves_bar = document.getElementById('live-moves-bar');
    const resp_time = document.getElementById('live-resp');

    // Match state
    let is_my_turn = false; 
    let game_on = true;
    let board = ["", "", "", "", "", "", "", "", ""]; 
    
    let move_cnt = 0;
    let start_time = Date.now();
    let last_turn = Date.now();
    let total_think = 0;
    let timer_iv;

    // Fetch opponent data from backend
    async function init_match() {
        try {
            let res = await fetch(`http://localhost:5001/api/match_init/${room_id}/${auth_uid}`);
            let dt = await res.json();
            
            document.getElementById('opp-name').innerText = dt.opponent_name;
            document.getElementById('opp-elo').innerText = dt.opponent_elo;
            document.getElementById('opp-initials').innerText = get_initials(dt.opponent_name);
            document.getElementById('opp-wr').innerText = dt.opponent_winrate + '%';
            document.getElementById('opp-region').innerText = dt.opponent_region;
            
            document.getElementById('my-wr').innerText = dt.my_winrate + '%';
            document.getElementById('my-streak').innerText = dt.my_streak;
            
        } catch(e) {
            console.warn("Waiting for backend...");
        }
    }
    init_match();

    // Live match timer
    function tick_duration() {
        if (!game_on) return;
        const elapsed = Math.floor((Date.now() - start_time) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        dur_el.innerText = `${mins}:${secs}`;
    }
    timer_iv = setInterval(tick_duration, 1000);

    // Append a line to the combat log panel
    function add_log(text) {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" });
        const line = document.createElement('div');
        line.className = 'log-line';
        line.innerHTML = `<span class="log-time">${time}</span> <span class="log-text">${text}</span>`;
        log_body.appendChild(line);
        log_body.scrollTop = log_body.scrollHeight; 
    }
    
    add_log("SYSTEM: Handshake complete.");
    add_log("ARENA: Awaiting server sync.");

    // Brief warning popup
    function show_toast(msg = "ACCESS DENIED: NOT YOUR TURN") {
        document.getElementById('toast-msg').innerText = msg;
        toast.classList.remove('hidden');
        setTimeout(() => { toast.classList.add('hidden'); }, 2500); 
    }

    // Toggle turn indicator
    function set_turn(my_turn) {
        is_my_turn = my_turn;
        if (my_turn) {
            turn_ind.classList.remove('opponent-turn');
            turn_txt.innerText = "YOUR TURN";
        } else {
            turn_ind.classList.add('opponent-turn');
            turn_txt.innerText = "OPPONENT COMPUTING...";
        }
    }

    // Update the moves bar and response time
    function update_analytics() {
        move_cnt++;
        moves_txt.innerText = `${move_cnt} / 9`;
        moves_bar.style.width = `${(move_cnt / 9) * 100}%`;

        const think_ms = (Date.now() - last_turn) / 1000;
        total_think += think_ms;
        resp_time.innerText = `${(total_think / move_cnt).toFixed(1)}s`;

        last_turn = Date.now();
    }

    // Connect to game websocket
    const gs = new WebSocket(`ws://localhost:5001/ws/game/${room_id}/${auth_uid}`);

    gs.onopen = () => { add_log("ARENA: Server sync established."); };

    gs.onmessage = (e) => {
        const dt = JSON.parse(e.data);

        // Board state from server
        if (dt.type === "board_state" || dt.type === "board_update") {
            sync_board(dt.board);
            set_turn(dt.turn === my_sym);
            
            if (dt.last_move) {
                const who = dt.last_move.uid === auth_uid ? "YOU" : "OPPONENT";
                const sector = (dt.last_move.row * 3) + dt.last_move.col;
                add_log(`Move: ${who} -> Sector [${sector}]`);
            }
        }

        // Server rejected the move
        if (dt.type === "move_rejected") {
            show_toast(dt.reason.toUpperCase());
        }

        // Game over
        if (dt.type === "game_over") {
            show_result(dt);
        }

        // Draw offer from opponent
        if (dt.type === "draw_offered") {
            if (confirm("Opponent offered a draw. Accept?")) {
                gs.send(JSON.stringify({ type: "accept_draw" }));
            } else {
                gs.send(JSON.stringify({ type: "reject_draw" }));
            }
        }
        if (dt.type === "draw_rejected") {
            add_log("SYSTEM: Opponent rejected draw.");
            show_toast("DRAW REJECTED");
        }
    };

    gs.onclose = () => {
        if (game_on) add_log("SYSTEM ERROR: Connection lost.");
    };

    // Reads server's 2D board and updates our flat HTML grid
    function sync_board(srv_board) {
        let new_moves = 0;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const idx = (r * 3) + c;
                const mark = srv_board[r][c];
                
                if (mark !== "") new_moves++;

                // Only update cells that changed
                if (board[idx] !== mark) {
                    board[idx] = mark;
                    const el = cells[idx];
                    if (mark === "X") {
                        el.innerHTML = `<span class="material-symbols-outlined mark-x">close</span>`;
                    } else if (mark === "O") {
                        el.innerHTML = `<span class="material-symbols-outlined mark-o">radio_button_unchecked</span>`;
                    }
                }
            }
        }
        
        if (new_moves > move_cnt) update_analytics();
    }

    // Send move on cell click
    cells.forEach(cell => {
        cell.addEventListener('click', (e) => {
            if (!game_on) return;
            const idx = parseInt(e.currentTarget.getAttribute('data-index'));

            if (board[idx] !== "") return;
            if (!is_my_turn) { show_toast("ACCESS DENIED: NOT YOUR TURN"); return; }

            // Convert flat index to row/col for backend
            gs.send(JSON.stringify({
                type: "move",
                row: Math.floor(idx / 3),
                col: idx % 3
            }));
        });
    });

    // End screen
    const overlay = document.getElementById('result-overlay');
    
    function show_result(match_dt) {
        if (!game_on) return; 
        game_on = false; 
        clearInterval(timer_iv); 

        // Figure out result type
        let result = "draw";
        if (match_dt.winner === my_sym) result = "victory";
        else if (match_dt.winner && match_dt.winner !== "DRAW") result = "defeat";

        const prev_elo = stored_elo;
        const cur_elo = match_dt.new_ratings[auth_uid];
        const elo_chg = cur_elo - prev_elo;
        const total_moves = move_cnt;
        const time_str = dur_el.innerText;
        const reason = match_dt.forfeit ? "Opponent Forfeited // Arena Dominance Confirmed" : "Match Concluded by Server.";

        let title, sys_txt, desc, theme;
        
        if (result === 'victory') {
            theme = 'theme-victory';
            title = match_dt.forfeit ? 'VICTORY (FORFEIT)' : 'VICTORY';
            sys_txt = 'System_Link_Stable';
            desc = 'Performance rating exceeds regional average.';
        } else if (result === 'defeat') {
            theme = 'theme-defeat';
            title = 'DEFEAT';
            sys_txt = 'System_Link_Degraded';
            desc = 'Rating adjusted based on opponent difficulty offset.';
        } else {
            theme = 'theme-draw';
            title = 'DRAW';
            sys_txt = 'System_Link_Stable';
            desc = 'Rating adjusted based on performance equalization.';
        }

        // Swap theme class on overlay
        overlay.className = `result-overlay ${theme}`; 
        
        // Fill result screen data
        document.getElementById('res-title').innerText = title;
        document.getElementById('res-subtitle').innerText = reason;
        document.getElementById('res-sys-txt').innerText = sys_txt;
        
        document.getElementById('res-prev-elo').innerText = prev_elo;
        document.getElementById('res-curr-elo').innerText = cur_elo;
        document.getElementById('res-elo-badge').innerText = elo_chg > 0 ? `+${elo_chg}` : elo_chg;
        document.getElementById('res-elo-desc').innerText = desc;

        document.getElementById('res-moves').innerText = total_moves;
        document.getElementById('res-time').innerText = time_str;

        // Build final log entries
        const logs_box = document.getElementById('res-logs');
        logs_box.innerHTML = ''; 
        const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" });
        
        logs_box.innerHTML += `
            <div class="res-log-line"><span class="res-log-time">[${time}]</span> <span class="res-log-text">Match commenced. Handshake verified.</span></div>
            <div class="res-log-line"><span class="res-log-time">[${time}]</span> <span class="res-log-text">${total_moves} tactical executions recorded.</span></div>
            <div class="res-log-line"><span class="res-log-time">[${time}]</span> <span class="res-log-bold">MATCH_TERMINATED: ${title}</span></div>
        `;

        // Persist new elo so lobby shows correct value
        sessionStorage.setItem("arena_auth_elo", cur_elo.toString());
    }

    // Resign button
    document.getElementById('btn-resign').addEventListener('click', () => {
        if (game_on && confirm("Resign? This counts as a loss.")) {
            gs.send(JSON.stringify({ type: "resign" }));
        }
    });

    // Draw offer button
    document.getElementById('btn-draw').addEventListener('click', () => {
        if (game_on) {
            gs.send(JSON.stringify({ type: "offer_draw" }));
            add_log("SYSTEM: Draw offer sent.");
        }
    });

    // Result screen navigation
    document.getElementById('btn-lobby').addEventListener('click', () => { window.location.href = "lobby_command_center.html"; });
    document.getElementById('btn-ldb').addEventListener('click', () => { window.location.href = "leaderboard.html"; });
    document.getElementById('btn-rematch').addEventListener('click', () => { window.location.href = "lobby_command_center.html"; });

});