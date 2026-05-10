document.addEventListener('DOMContentLoaded', () => {

    const auth_user = sessionStorage.getItem("arena_auth_user");
    const auth_uid  = sessionStorage.getItem("arena_auth_uid");

    if (!auth_user || !auth_uid) {
        window.location.replace("login.html");
        return; 
    }

    // Pull room + symbol from URL
    const params = new URLSearchParams(window.location.search);
    const room_id = params.get('room');
    const my_sym = params.get('symbol');

    if (!room_id || !my_sym) {
        alert("Invalid match routing. Returning to lobby.");
        window.location.href = "lobby_command_center.html";
        return;
    }

    const stored_elo = parseInt(sessionStorage.getItem("arena_auth_elo") || "1450");
    const safe_user = auth_user || "OPERATOR_01";
    document.querySelector('.js-my-name').innerText = safe_user.replaceAll('_', ' ').toUpperCase();
    document.querySelector('.js-my-elo').innerHTML = `${stored_elo.toLocaleString()} <span class="elo-label">ELO</span>`;
    
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
    
    const live_dur = document.getElementById('live-dur');
    const live_moves_txt = document.getElementById('live-moves-txt');
    const live_moves_bar = document.getElementById('live-moves-bar');
    const live_resp = document.getElementById('live-resp');

    // Match state
    let is_my_turn = false; 
    let game_on = true;
    let board = ["", "", "", "", "", "", "", "", ""]; 
    
    let move_cnt = 0;
    let match_start = Date.now();
    let last_turn = Date.now();
    let total_think = 0;
    let timer_iv;

    // Resignation modal
    function show_modal(id) {
        document.getElementById('overlay').classList.remove('hidden');
        document.querySelectorAll('.custom-modal').forEach(m => m.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
    }

    function hide_modal() {
        document.getElementById('overlay').classList.add('hidden');
    }

    // Fetch opponent data from backend
    async function init_match() {
        try {
            const api = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:7860' 
    : 'https://pranaymehtta2007-arena-dbi.hf.space';

            let res = await fetch(`${api}/api/match_init/${room_id}/${auth_uid}`, {
                method: 'GET',
                headers: {
                    'ngrok-skip-browser-warning': 'true',
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (!res.ok) throw new Error("Match init failed."); 
            let data = await res.json();
            if (data.error) throw new Error(data.error); 

            document.getElementById('opp-name').innerText = data.opponent_name;
            document.getElementById('opp-elo').innerText = data.opponent_elo;
            document.getElementById('opp-initials').innerText = get_initials(data.opponent_name);
            document.getElementById('opp-wr').innerText = data.opponent_winrate + '%';
            document.getElementById('opp-region').innerText = data.opponent_region;
            
            document.getElementById('my-wr').innerText = data.my_winrate + '%';
            document.getElementById('my-streak').innerText = data.my_streak;
            
        } catch(e) {
            console.warn("Backend not available for init:", e);
        }
    }
    init_match();

    // Live match timer
    function update_timer() {
        if (!game_on) return;
        const elapsed = Math.floor((Date.now() - match_start) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        live_dur.innerText = `${mins}:${secs}`;
    }
    timer_iv = setInterval(update_timer, 1000);

    function add_log(text) {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" });
        const ln = document.createElement('div');
        ln.className = 'log-line';
        ln.innerHTML = `<span class="log-time">${time}</span> <span class="log-text">${text}</span>`;
        log_body.appendChild(ln);
        log_body.scrollTop = log_body.scrollHeight; 
    }
    
    add_log("SYSTEM: Handshake complete.");
    add_log("ARENA: Awaiting server synchronization.");

    function show_toast(msg = "ACCESS DENIED: NOT YOUR TURN") {
        document.getElementById('toast-msg').innerText = msg;
        toast.classList.remove('hidden');
        setTimeout(() => { toast.classList.add('hidden'); }, 2500); 
    }

    function set_turn(myTurn) {
        is_my_turn = myTurn;
        if (myTurn) {
            turn_ind.classList.remove('opponent-turn');
            turn_txt.innerText = "YOUR TURN";
        } else {
            turn_ind.classList.add('opponent-turn');
            turn_txt.innerText = "OPPONENT COMPUTING...";
        }
    }

    function update_analytics() {
        move_cnt++;
        live_moves_txt.innerText = `${move_cnt} / 9`;
        live_moves_bar.style.width = `${(move_cnt / 9) * 100}%`;

        const think_time = (Date.now() - last_turn) / 1000;
        total_think += think_time;
        live_resp.innerText = `${(total_think / move_cnt).toFixed(1)}s`;

        last_turn = Date.now();
    }

    // Websocket connection
    const ws_proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws_host = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
    ? 'localhost:7860' 
    : 'pranaymehtta2007-arena-dbi.hf.space';

    const gs = new WebSocket(`${ws_proto}//${ws_host}/ws/game/${room_id}/${auth_uid}`);

    gs.onopen = () => { add_log("ARENA: Server synchronization established."); };

    gs.onmessage = (e) => {
        const dt = JSON.parse(e.data);

        if (dt.type === "board_state" || dt.type === "board_update") {
            sync_board(dt.board);
            set_turn(dt.turn === my_sym);
            
            if (dt.last_move) {
                const who = dt.last_move.uid === auth_uid ? "YOU" : "OPPONENT";
                const sector = (dt.last_move.row * 3) + dt.last_move.col;
                add_log(`Move: ${who} -> Sector [${sector}]`);
            }
        }

        if (dt.type === "move_rejected") {
            show_toast(dt.reason.toUpperCase());
        }

        if (dt.type === "game_over") {
            show_end(dt);
        }
    };

    gs.onclose = () => {
        if (game_on) add_log("SYSTEM ERROR: Connection to Arena lost.");
    };

    // Apply backend board state to UI
    function sync_board(backend) {
        let new_moves = 0;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const idx = (r * 3) + c;
                const mark = backend[r][c];
                
                if (mark !== "") new_moves++;

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

    // Send move over websocket
    cells.forEach(cell => {
        cell.addEventListener('click', (e) => {
            if (!game_on) return;
            const idx = parseInt(e.currentTarget.getAttribute('data-index'));

            if (board[idx] !== "") return;
            if (!is_my_turn) { show_toast("ACCESS DENIED: NOT YOUR TURN"); return; }

            gs.send(JSON.stringify({
                type: "move",
                row: Math.floor(idx / 3),
                col: idx % 3
            }));
        });
    });

    // End screen
    const res_overlay = document.getElementById('res-overlay');
    
    function show_end(match_dt) {
        if (!game_on) return; 
        game_on = false; 
        clearInterval(timer_iv); 

        let result = "draw";
        if (match_dt.winner === my_sym) result = "victory";
        else if (match_dt.winner && match_dt.winner !== "DRAW") result = "defeat";

        const prev_elo = stored_elo;
        const cur_elo = match_dt.new_ratings[auth_uid];
        const elo_chg = cur_elo - prev_elo;
        const total_moves = move_cnt;
        const time_str = live_dur.innerText;
        const reason = match_dt.forfeit ? "Opponent Forfeited // Arena Dominance Confirmed" : "Match Concluded by Server.";

        let title, sys_txt, desc, cls_theme;
        
        if (result === 'victory') {
            cls_theme = 'theme-victory';
            title = match_dt.forfeit ? 'VICTORY (FORFEIT)' : 'VICTORY';
            sys_txt = 'System_Link_Stable';
            desc = 'Performance rating exceeds regional average.';
        } else if (result === 'defeat') {
            cls_theme = 'theme-defeat';
            title = 'DEFEAT';
            sys_txt = 'System_Link_Degraded';
            desc = 'Rating adjustment applied based on opponent difficulty offset.';
        } else {
            cls_theme = 'theme-draw';
            title = 'DRAW';
            sys_txt = 'System_Link_Stable';
            desc = 'Rating adjusted based on performance equalization factors.';
        }

        res_overlay.className = `result-overlay ${cls_theme}`; 
        
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

        sessionStorage.setItem("arena_auth_elo", cur_elo.toString());
    }

    // Resign button + modal
    document.getElementById('btn-resign').addEventListener('click', () => {
        if (game_on) show_modal('modal-confirm');
    });

    document.getElementById('btn-confirm-resign').addEventListener('click', () => {
        if (game_on) {
            gs.send(JSON.stringify({ type: "resign" }));
            hide_modal();
        }
    });

    document.getElementById('btn-cancel-resign').addEventListener('click', () => { hide_modal(); });

    // Post-match nav buttons
    document.getElementById('btn-lobby').addEventListener('click', () => { window.location.href = "lobby_command_center.html"; });
    document.getElementById('btn-ldb').addEventListener('click', () => { window.location.href = "leaderboard.html"; });

});