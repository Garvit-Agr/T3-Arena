let lb_sock = null;
let gbl_players = [];

// Modal helpers
window.showModal = function(modalId) {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.remove('hidden');
    
    document.querySelectorAll('.custom-modal').forEach(m => m.classList.add('hidden'));
    
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
};

window.hideModal = function() {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.add('hidden');
};

window.showCustomAlert = function(title, msg, isWaiting = false, tgUid = null) {
    const overlay = document.getElementById('overlay');
    if (overlay) {
        document.getElementById('alert-title').innerHTML = title;
        document.getElementById('alert-message').innerHTML = msg;

        const dis_btn = document.querySelector('#modal-alert .btn-modal-decline');
        if (dis_btn) {
            dis_btn.onclick = function() {
                if (isWaiting && tgUid && lb_sock && lb_sock.readyState === WebSocket.OPEN) {
                    lb_sock.send(JSON.stringify({ type: "cancel_challenge", target_uid: tgUid }));
                }
                window.hideModal();
            };
        }
        window.showModal('modal-alert');
    }
};

// Send challenge to target player
window.issueChallenge = function(targetUid) {
    const auth_uid = sessionStorage.getItem("arena_auth_uid");
    if (String(targetUid) === String(auth_uid)) return;
    
    if (lb_sock && lb_sock.readyState === WebSocket.OPEN) {
        lb_sock.send(JSON.stringify({ type: "challenge", target_uid: String(targetUid) }));
        
        const target = gbl_players.find(p => String(p.uid) === String(targetUid));
        const t_name = target && target.name ? target.name.toUpperCase() : `OPERATOR ${targetUid}`;
        window.showCustomAlert("CHALLENGE DEPLOYED", `WAITING FOR ${t_name} TO RESPOND...`, true, String(targetUid));
    } else {
        alert("Socket disconnected. Please refresh.");
    }
};

document.addEventListener('DOMContentLoaded', () => {

    const auth_user = sessionStorage.getItem("arena_auth_user");
    const auth_uid  = sessionStorage.getItem("arena_auth_uid");

    if (!auth_user || !auth_uid) {
        window.location.replace("login.html");
        return;
    }

    const src_input  = document.getElementById('player-src');
    const mob_src    = document.getElementById('mob-src');
    const srt_sel    = document.getElementById('sort-sel');
    const ply_grid   = document.getElementById('player-grid');
    const flt_all    = document.getElementById('flt-all');
    const flt_gm     = document.getElementById('flt-gm');
    const sidebar    = document.getElementById('sidebar');
    const side_tog   = document.getElementById('side-tog');
    const mn_cnt     = document.getElementById('main-content');
    const online_cnt = document.getElementById('online-count');
    
    let cur_flt = 'all';
    let match_running = false;

    fill_headers();

    // Toggle sidebar
    side_tog.addEventListener('click', () => {
        if (match_running) {
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

    // Filter buttons
    flt_all.addEventListener('click', () => {
        cur_flt = 'all';
        flt_all.classList.add('active');
        flt_gm.classList.remove('active');
        draw_grid();
    });

    flt_gm.addEventListener('click', () => {
        cur_flt = 'gm';
        flt_gm.classList.add('active');
        flt_all.classList.remove('active');
        draw_grid();
    });

    src_input.addEventListener('input', draw_grid);
    srt_sel.addEventListener('change', draw_grid);

    if (mob_src) {
        mob_src.addEventListener('input', (e) => {
            src_input.value = e.target.value;
            draw_grid();
        });
    }

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const api = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:7860' 
    : 'https://pranaymehtta2007-arena-dbi.hf.space';
            await fetch(`${api}/logout`, {
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

    // Rank from elo (returns name + css class)
    function get_rank(elo) {
        if (elo >= 3000) return { name: "GRANDMASTER",  cls: "rank-gm" };
        if (elo >= 2800) return { name: "PLATINUM III", cls: "rank-platinum" };
        if (elo >= 2600) return { name: "PLATINUM II", cls: "rank-platinum" };
        if (elo >= 2400) return { name: "PLATINUM I", cls: "rank-platinum" };
        if (elo >= 2200) return { name: "GOLD III",       cls: "rank-gold" };
        if (elo >= 2000) return { name: "GOLD II",       cls: "rank-gold" };
        if (elo >= 1800) return { name: "GOLD I",       cls: "rank-gold" };
        if (elo >= 1600) return { name: "SILVER III",     cls: "rank-silver" };
        if (elo >= 1400) return { name: "SILVER II",     cls: "rank-silver" };
        if (elo >= 1200) return { name: "SILVER I",     cls: "rank-silver" };
        if (elo >= 800) return { name: "BRONZE III",     cls: "rank-silver" };
        if (elo >= 400) return { name: "BRONZE II",     cls: "rank-silver" };
        return { name: "BRONZE I", cls: "rank-bronze" };
    }

    // Fill header and sidebar with user info
    function fill_headers(curElo = null) {
        const elo_val = curElo || sessionStorage.getItem("arena_auth_elo");
        const rnk = get_rank(parseInt(elo_val || "0"));

        document.getElementById('hdr-initials').textContent = get_initials(auth_user);
        document.getElementById('op-name').textContent = auth_user.replaceAll('_', ' ').toUpperCase();
        
        if (elo_val) {
            document.getElementById('op-elo').textContent = `${elo_val} ELO`;
            document.getElementById('hdr-elo').textContent = `${elo_val} ELO`;
            document.getElementById('hdr-rank').textContent = rnk.name;
            sessionStorage.setItem("arena_auth_elo", elo_val);
        }
    }

    // Fetch player list from API
    function fetch_data() {
        const api = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:7860' : 'https://pranaymehtta2007-arena-dbi.hf.space';
        fetch(`${api}/api/players?t=${Date.now()}`, { credentials: 'include', cache: 'no-store' })
            .then(res => res.json())
            .then(dt => {
                gbl_players = dt.players || [];
                const me = gbl_players.find(p => String(p.uid) === String(auth_uid));
                if (me) fill_headers(me.elo_rating); 
                draw_grid();
            })
            .catch(er => console.warn("API unavailable:", er));
    }

    // Render player card grid
    function draw_grid() {
        const qry = src_input.value.toLowerCase();
        const tmpl = document.getElementById('tmpl-card');

        let rslt = gbl_players.filter(p => p.name.toLowerCase().includes(qry));
        if (cur_flt === 'gm') rslt = rslt.filter(p => p.elo_rating >= 2800);

        if (online_cnt) {
            const live = gbl_players.filter(p => p.status === 'online' || p.status === 'fighting').length;
            online_cnt.textContent = `${live} ONLINE`;
        }

        // Sort: me first, then by status, then by selected sort
        const wt = { "online": 1, "fighting": 2, "offline": 3 };
        const srt_md = srt_sel.value;
        
        rslt.sort((a, b) => {
            const me_a = (String(a.uid) === String(auth_uid));
            const me_b = (String(b.uid) === String(auth_uid));
            if (me_a && !me_b) return -1;
            if (!me_a && me_b) return 1;

            const wa = wt[a.status] || 3;
            const wb = wt[b.status] || 3;
            if (wa !== wb) return wa - wb;

            switch (srt_md) {
                case 'elo-desc':  return b.elo_rating - a.elo_rating;
                case 'elo-asc':   return a.elo_rating - b.elo_rating;
                case 'name-asc':  return a.name.localeCompare(b.name);
                case 'name-desc': return b.name.localeCompare(a.name);
                default:          return 0;
            }
        });

        ply_grid.innerHTML = '';
        if (rslt.length === 0) {
            ply_grid.appendChild(document.getElementById('tmpl-empty').content.cloneNode(true));
            return;
        }

        rslt.forEach(p => {
            const cln = tmpl.content.cloneNode(true);
            const card = cln.querySelector('.player-card');
            const p_rnk = get_rank(p.elo_rating);
            const is_me = (String(p.uid) === String(auth_uid));

            cln.querySelector('.js-initials').textContent = get_initials(p.name);
            cln.querySelector('.js-rank').textContent = p_rnk.name;
            cln.querySelector('.js-rank').classList.add(p_rnk.cls);
            cln.querySelector('.js-elo').textContent = `${p.elo_rating} ELO`;
            cln.querySelector('.js-winrate').textContent = `WR: ${p.winrate}%`;
            cln.querySelector('.js-name').textContent = p.name;
            cln.querySelector('.js-uid').textContent = p.uid;

            const btn_icn = cln.querySelector('.js-btn-icn');
            const btn_txt = cln.querySelector('.js-btn-text');
            const sts_txt = cln.querySelector('.js-status-text');
            const act_btn = cln.querySelector('.js-btn');

            if (p.status === "fighting") {
                card.classList.add('state-fighting');
                sts_txt.textContent = "FIGHTING";
                btn_icn.style.display = "none";
                btn_txt.textContent = "MATCH IN PROGRESS";
                act_btn.disabled = true;
            } else if (p.status === "online") {
                if (is_me) {
                    card.classList.add('state-online-me');
                    sts_txt.textContent = "YOU — ONLINE";
                    btn_icn.style.display = "none";
                    btn_txt.textContent = "THIS IS YOU";
                    act_btn.disabled = true;
                } else {
                    card.classList.add('state-online');
                    sts_txt.textContent = "ONLINE";
                    btn_icn.textContent = "swords";
                    btn_txt.textContent = "CHALLENGE";
                    act_btn.disabled = false;
                    act_btn.onclick = function(e) {
                        e.preventDefault();
                        window.issueChallenge(p.uid);
                    };
                }
            } else {
                card.classList.add('state-offline');
                sts_txt.textContent = "OFFLINE";
                cln.querySelector('.static-dot').style.display = "none";
                btn_icn.style.display = "none";
                btn_txt.textContent = "UNAVAILABLE";
                act_btn.disabled = true;
            }

            ply_grid.appendChild(cln);
        });
    }

    // Auto-reconnecting websocket
    function prep_socket() {
        const ws_proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws_host = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
    ? 'localhost:7860' 
    : 'pranaymehtta2007-arena-dbi.hf.space';
        lb_sock = new WebSocket(`${ws_proto}//${ws_host}/ws/lobby/${auth_uid}`);

        lb_sock.onopen = () => { fetch_data(); };

        lb_sock.onmessage = (e) => {
            const dt = JSON.parse(e.data);

            if (dt.type === "presence" || dt.type === "game_over") {
                fetch_data(); 
            }

            if (dt.type === "challenge_received") {
                const overlay = document.getElementById('overlay');
                const chlg = gbl_players.find(p => String(p.uid) === String(dt.from_uid));
                const c_name = chlg ? chlg.name.toUpperCase() : `OPERATOR ${dt.from_uid}`;
                const c_elo = chlg ? chlg.elo_rating : "???";
                const c_wr = chlg ? chlg.winrate : "???";

                if (overlay) {
                    document.getElementById('chlg-title').textContent = `INCOMING CHALLENGE FROM ${c_name}`;
                    document.getElementById('inc-name').textContent = c_name;
                    document.getElementById('inc-elo').textContent = `${c_elo} ELO`;
                    document.getElementById('inc-wr').textContent = `${c_wr}%`;
                    document.getElementById('inc-initials').textContent = get_initials(c_name);
                    
                    window.showModal('modal-inc');

                    document.getElementById('btn-accept').onclick = () => {
                        lb_sock.send(JSON.stringify({ type: "challenge_response", from_uid: dt.from_uid, accepted: true }));
                        window.showCustomAlert("SYSTEM UPDATE", "MATCH ACCEPTED.<br>STANDBY FOR ARENA ROUTING...");
                    };
                    document.getElementById('btn-decline').onclick = () => {
                        lb_sock.send(JSON.stringify({ type: "challenge_response", from_uid: dt.from_uid, accepted: false }));
                        window.hideModal();
                    };
                } else {
                    const accept = confirm(`Incoming challenge from ${c_name}!\n\nAccept?`);
                    lb_sock.send(JSON.stringify({ type: "challenge_response", from_uid: dt.from_uid, accepted: accept }));
                }
            }

            if (dt.type === "challenge_declined") {
                document.getElementById('alert-title').innerHTML = "CHALLENGE DECLINED";
                document.getElementById('alert-message').innerHTML = "THE TARGET OPERATOR REJECTED YOUR MATCH.";
                setTimeout(() => window.hideModal(), 4000);
            }

            if (dt.type === "challenge_cancelled") window.hideModal();
            if (dt.type === "match_start") window.location.href = `match_arena.html?room=${dt.room_id}&symbol=${dt.symbol}`;
        };

        lb_sock.onclose = () => { setTimeout(prep_socket, 2000); };
    }

    // Init
    fetch_data();
    prep_socket();
    
    // Keep data fresh
    setInterval(fetch_data, 5000);

    // Sync when user comes back to tab
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") fetch_data();
    });
    window.addEventListener("focus", fetch_data);

});