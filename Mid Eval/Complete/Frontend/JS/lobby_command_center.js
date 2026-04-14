let lobbySocket = null;
let global_players = [];

window.showModal = function(modalId) {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('hidden');
    
    document.querySelectorAll('.custom-modal').forEach(m => m.classList.add('hidden'));
    
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
};

window.hideModal = function() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');
};

window.showCustomAlert = function(title, message, isChallengeWaiting = false, targetUid = null) {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
        const titleEl = document.getElementById('alert-title');
        const msgEl = document.getElementById('alert-message');
        if (titleEl) titleEl.innerHTML = title;
        if (msgEl) msgEl.innerHTML = message;

        const dismissBtn = document.querySelector('#modal-alert .btn-modal-decline');
        if (dismissBtn) {
            dismissBtn.onclick = function() {
                if (isChallengeWaiting && targetUid && lobbySocket && lobbySocket.readyState === WebSocket.OPEN) {
                    lobbySocket.send(JSON.stringify({
                        type: "cancel_challenge",
                        target_uid: targetUid
                    }));
                }
                window.hideModal();
            };
        }
        window.showModal('modal-alert');
    }
};

window.issueChallenge = function(targetUid) {
    const auth_uid = sessionStorage.getItem("arena_auth_uid");
    if (String(targetUid) === String(auth_uid)) return;
    
    if (lobbySocket && lobbySocket.readyState === WebSocket.OPEN) {
        lobbySocket.send(JSON.stringify({
            type: "challenge",
            target_uid: String(targetUid)
        }));
        
        const target = global_players.find(p => String(p.uid) === String(targetUid));
        const t_name = target && target.name ? target.name.toUpperCase() : `OPERATOR ${targetUid}`;
        window.showCustomAlert("CHALLENGE DEPLOYED", `WAITING FOR ${t_name} TO RESPOND...`, true, String(targetUid));
    } else {
        alert("NETWORK ERROR: Socket disconnected. Please refresh.");
    }
};

document.addEventListener('DOMContentLoaded', () => {

    const auth_user = sessionStorage.getItem("arena_auth_user");
    const auth_uid  = sessionStorage.getItem("arena_auth_uid");

    if (!auth_user || !auth_uid) {
        window.location.replace("login.html");
        return;
    }

    const src_input  = document.getElementById('player-search');
    const mob_src_input = document.getElementById('mobile-search-input');
    const srt_sel   = document.getElementById('sort-select');
    const ply_grid   = document.getElementById('player-grid');
    const btn_flt_all = document.getElementById('btn-filter-all');
    const btn_flt_gm  = document.getElementById('btn-filter-gm');
    const sidebar      = document.getElementById('sidebar');
    const side_tog     = document.getElementById('sidebar-toggle');
    const mn_cnt       = document.getElementById('main-content');
    const online_count = document.getElementById('online-count');
    
    let cur_flt = 'all';
    let is_match_running = false;

    prep_headers();

    side_tog.addEventListener('click', () => {
        if (is_match_running) {
            window.showCustomAlert("SYSTEM LOCKED", "MATCH CURRENTLY IN PROGRESS.");
            return;
        }
        if (window.innerWidth >= 768) {
            sidebar.classList.toggle('sidebar-hidden');
            mn_cnt.classList.toggle('canvas-expanded');
        } else {
            sidebar.classList.toggle('sidebar-visible');
        }
    });

    btn_flt_all.addEventListener('click', () => {
        cur_flt = 'all';
        btn_flt_all.classList.add('active');
        btn_flt_gm.classList.remove('active');
        draw_grid();
    });

    btn_flt_gm.addEventListener('click', () => {
        cur_flt = 'gm';
        btn_flt_gm.classList.add('active');
        btn_flt_all.classList.remove('active');
        draw_grid();
    });

    src_input.addEventListener('input', draw_grid);
    srt_sel.addEventListener('change', draw_grid);

    if (mob_src_input) {
        mob_src_input.addEventListener('input', (e) => {
            src_input.value = e.target.value;
            draw_grid();
        });
    }

    // THE DISCONNECT BUTTON LOGIC
    document.getElementById('btn-logout').addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await fetch('http://localhost:5001/logout', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: auth_uid }), credentials: 'include'
            });
        } catch (_) {}
        sessionStorage.clear();
        window.location.href = 'login.html';
    });

    function get_initials(name) {
        if (!name) return "??";
        const parts = name.trim().split(/[_\s]+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    function check_rank(elo) {
        if (elo >= 2800) return { name: "GRANDMASTER",  cls: "rank-gm" };
        if (elo >= 2000) return { name: "PLATINUM I", cls: "rank-platinum" };
        if (elo >= 1500) return { name: "GOLD I",       cls: "rank-gold" };
        if (elo >= 1200) return { name: "SILVER I",     cls: "rank-silver" };
        return { name: "BRONZE I", cls: "rank-bronze" };
    }

    function prep_headers(currentElo = null) {
        const eloToUse = currentElo || sessionStorage.getItem("arena_auth_elo");
        const rnks = check_rank(parseInt(eloToUse || "0"));

        document.getElementById('hdr-initials').textContent = get_initials(auth_user);
        document.getElementById('op-name').textContent = auth_user.replaceAll('_', ' ').toUpperCase();
        
        if (eloToUse) {
            document.getElementById('op-elo').textContent = `${eloToUse} ELO`;
            document.getElementById('hdr-elo').textContent = `${eloToUse} ELO`;
            document.getElementById('hdr-rank').textContent = rnks.name;
            sessionStorage.setItem("arena_auth_elo", eloToUse);
        }
    }

    function ping_data() {
        const cacheBuster = Date.now();
        fetch(`http://localhost:5001/api/players?t=${cacheBuster}`, { credentials: 'include', cache: 'no-store' })
            .then(res => res.json())
            .then(dt => {
                global_players = dt.players || [];
                const me = global_players.find(p => String(p.uid) === String(auth_uid));
                if (me) prep_headers(me.elo_rating); 
                draw_grid();
            })
            .catch(er => console.warn("API unavailable:", er));
    }

    function draw_grid() {
        const qry = src_input.value.toLowerCase();
        const tmpl = document.getElementById('tmpl-card');

        let rslt = global_players.filter(p => p.name.toLowerCase().includes(qry));
        if (cur_flt === 'gm') rslt = rslt.filter(p => p.elo_rating >= 2800);

        if (online_count) {
            const live = global_players.filter(p => p.status === 'online' || p.status === 'fighting').length;
            online_count.textContent = `${live} ONLINE`;
        }

        const wt = { "online": 1, "fighting": 2, "offline": 3 };
        const srt_md = srt_sel.value;
        
        rslt.sort((a, b) => {
            const is_me_a = (String(a.uid) === String(auth_uid));
            const is_me_b = (String(b.uid) === String(auth_uid));
            if (is_me_a && !is_me_b) return -1;
            if (!is_me_a && is_me_b) return 1;

            const wa = wt[a.status] || 3;
            const wb = wt[b.status] || 3;
            if (wa !== wb) { return wa - wb; }

            switch (srt_md) {
                case 'elo-desc':  return b.elo_rating - a.elo_rating;
                case 'elo-asc':   return a.elo_rating - b.elo_rating;
                case 'win-desc':  return b.winrate - a.winrate;
                case 'win-asc':   return a.winrate - b.winrate;
                default:          return 0;
            }
        });

        ply_grid.innerHTML = '';
        if (rslt.length === 0) {
            const et = document.getElementById('tmpl-empty');
            ply_grid.appendChild(et.content.cloneNode(true));
            return;
        }

        rslt.forEach(p => {
            const cln = tmpl.content.cloneNode(true);
            const card_wrap = cln.querySelector('.player-card');
            const p_rnk = check_rank(p.elo_rating);
            const is_me = (String(p.uid) === String(auth_uid));

            cln.querySelector('.js-initials').textContent = get_initials(p.name);
            cln.querySelector('.js-rank').textContent = p_rnk.name;
            cln.querySelector('.js-rank').classList.add(p_rnk.cls);
            cln.querySelector('.js-elo').textContent = `${p.elo_rating} ELO`;
            cln.querySelector('.js-winrate').textContent = `WR: ${p.winrate}%`;
            cln.querySelector('.js-name').textContent = p.name;
            cln.querySelector('.js-uid').textContent = p.uid;

            const btn_icn = cln.querySelector('.js-btn-icn');
            const bt_txt = cln.querySelector('.js-btn-text');
            const sts_txt = cln.querySelector('.js-status-text');
            const action_btn = cln.querySelector('.js-btn');

            if (p.status === "fighting") {
                card_wrap.classList.add('state-fighting');
                sts_txt.textContent = "FIGHTING";
                btn_icn.style.display = "none";
                bt_txt.textContent = "MATCH IN PROGRESS";
                action_btn.disabled = true;
            } else if (p.status === "online") {
                if (is_me) {
                    card_wrap.classList.add('state-online-me');
                    sts_txt.textContent = "YOU — ONLINE";
                    btn_icn.style.display = "none";
                    bt_txt.textContent = "THIS IS YOU";
                    action_btn.disabled = true;
                } else {
                    card_wrap.classList.add('state-online');
                    sts_txt.textContent = "ONLINE";
                    btn_icn.textContent = "swords";
                    bt_txt.textContent = "CHALLENGE";
                    
                    action_btn.disabled = false;
                    action_btn.onclick = function(e) {
                        e.preventDefault();
                        window.issueChallenge(p.uid);
                    };
                }
            } else {
                card_wrap.classList.add('state-offline');
                sts_txt.textContent = "OFFLINE";
                cln.querySelector('.static-dot').style.display = "none";
                btn_icn.style.display = "none";
                bt_txt.textContent = "UNAVAILABLE";
                action_btn.disabled = true;
            }

            ply_grid.appendChild(cln);
        });
    }

    // ==========================================
    // AUTO-RECONNECTING WEBSOCKET
    // ==========================================
    function connectLobbySocket() {
        lobbySocket = new WebSocket(`ws://localhost:5001/ws/lobby/${auth_uid}`);

        lobbySocket.onopen = () => {
            console.log("Live lobby connected.");
            ping_data(); 
        };

        lobbySocket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "presence" || data.type === "game_over") {
                ping_data(); 
            }

            if (data.type === "challenge_received") {
                const overlay = document.getElementById('modal-overlay');
                const challenger = global_players.find(p => String(p.uid) === String(data.from_uid));
                const c_name = challenger ? challenger.name.toUpperCase() : `OPERATOR ${data.from_uid}`;
                const c_elo = challenger ? challenger.elo_rating : "???";
                const c_wr = challenger ? challenger.winrate : "???";

                if (overlay) {
                    const titleEl = document.getElementById('inc-challenger-title');
                    if (titleEl) titleEl.textContent = `INCOMING CHALLENGE FROM ${c_name}`;
                    const nEl = document.getElementById('inc-name');
                    if (nEl) nEl.textContent = c_name;
                    const eloEl = document.getElementById('inc-elo');
                    if (eloEl) eloEl.textContent = `${c_elo} ELO`;
                    const wrEl = document.getElementById('inc-wr');
                    if (wrEl) wrEl.textContent = `${c_wr}%`;
                    const initEl = document.getElementById('inc-initials');
                    if (initEl) initEl.textContent = get_initials(c_name);
                    
                    window.showModal('modal-incoming');

                    document.getElementById('btn-accept-challenge').onclick = () => {
                        lobbySocket.send(JSON.stringify({ type: "challenge_response", from_uid: data.from_uid, accepted: true }));
                        window.showCustomAlert("SYSTEM UPDATE", "MATCH ACCEPTED.<br>STANDBY FOR ARENA ROUTING...");
                    };
                    
                    document.getElementById('btn-decline-challenge').onclick = () => {
                        lobbySocket.send(JSON.stringify({ type: "challenge_response", from_uid: data.from_uid, accepted: false }));
                        window.hideModal();
                    };
                } else {
                    const accept = confirm(`INCOMING CHALLENGE FROM ${c_name}!\n\nAccept match?`);
                    lobbySocket.send(JSON.stringify({ type: "challenge_response", from_uid: data.from_uid, accepted: accept }));
                }
            }

            if (data.type === "challenge_declined") {
                const titleEl = document.getElementById('alert-title');
                const msgEl = document.getElementById('alert-message');
                if (titleEl && msgEl) {
                    titleEl.innerHTML = "CHALLENGE DECLINED";
                    msgEl.innerHTML = "THE TARGET OPERATOR REJECTED YOUR MATCH.";
                }
                setTimeout(() => window.hideModal(), 4000);
            }

            if (data.type === "challenge_cancelled") {
                window.hideModal();
            }

            if (data.type === "match_start") {
                window.location.href = `match_arena.html?room=${data.room_id}&symbol=${data.symbol}`;
            }
        };

        lobbySocket.onclose = () => {
            console.warn("Lobby socket dropped. Reconnecting in 2 seconds...");
            setTimeout(connectLobbySocket, 2000);
        };
    }

    // INITIALIZATION
    ping_data();
    connectLobbySocket();
    
    // FALLBACK: Force sync every 5 seconds so background tabs never desync the grid
    setInterval(ping_data, 5000);

    // =================================================================================
    // THE INSTANT WAKE-UP FIX: Bypasses browser tab sleeping to guarantee perfect sync
    // =================================================================================
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            ping_data();
        }
    });
    window.addEventListener("focus", ping_data);

});