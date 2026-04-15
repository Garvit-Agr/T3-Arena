let lb_sock = null;
let plyrs = [];

// Overlay and modal handlers
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

// Custom alert generator
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

// Send a match challenge to another user
window.issueChallenge = function(tgUid) {
    const auth_uid = sessionStorage.getItem("arena_auth_uid");
    if (String(tgUid) === String(auth_uid)) return;
    
    if (lb_sock && lb_sock.readyState === WebSocket.OPEN) {
        lb_sock.send(JSON.stringify({ type: "challenge", target_uid: String(tgUid) }));
        
        const target = plyrs.find(p => String(p.uid) === String(tgUid));
        const t_name = target && target.name ? target.name.toUpperCase() : `OPERATOR ${tgUid}`;
        window.showCustomAlert("CHALLENGE DEPLOYED", `WAITING FOR ${t_name} TO RESPOND...`, true, String(tgUid));
    } else {
        alert("Network issue. Please refresh the page.");
    }
};

document.addEventListener('DOMContentLoaded', () => {

    const auth_user = sessionStorage.getItem("arena_auth_user");
    const auth_uid  = sessionStorage.getItem("arena_auth_uid");

    // Redirect if no active session
    if (!auth_user || !auth_uid) {
        window.location.replace("login.html");
        return;
    }

    // Get UI elements
    // Get UI elements
    const src_in = document.getElementById('src-in');
    const mob_src_in = document.getElementById('mob-src-in');
    const srt_sel = document.getElementById('srt-sel');
    const ply_grid = document.getElementById('grid');
    const flt_all = document.getElementById('flt-all');
    const flt_gm = document.getElementById('flt-gm');
    const sidebar = document.getElementById('sidebar');
    const side_tog = document.getElementById('side-tog');
    const mn_cnt = document.getElementById('main-content');
    const onl_cnt = document.getElementById('onl-cnt');
    
    let cur_flt = 'all';
    let is_match_running = false;

    prep_headers();

    // Toggle sidebar
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

    // Filters
    flt_all.addEventListener('click', () => {
        cur_flt = 'all';
        flt_all.classList.add('active');
        flt_gm.classList.remove('active');
        render_grid();
    });

    flt_gm.addEventListener('click', () => {
        cur_flt = 'gm';
        flt_gm.classList.add('active');
        flt_all.classList.remove('active');
        render_grid();
    });

    // Search and sort triggers
    src_in.addEventListener('input', render_grid);
    srt_sel.addEventListener('change', render_grid);

    if (mob_src_in) {
        mob_src_in.addEventListener('input', (e) => {
            src_in.value = e.target.value;
            render_grid();
        });
    }

    // Handle user logout
    document.getElementById('btn-logout').addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await fetch('http://localhost:5001/logout', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: auth_uid }), 
                credentials: 'include'
            });
        } catch (_) {}
        sessionStorage.clear();
        window.location.href = 'login.html';
    });

    // Helper to get initials (e.g. John Doe -> JD)
    function get_initials(name) {
        if (!name) return "??";
        const parts = name.trim().split(/[_\s]+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    // Get rank info based on elo
    function get_rank(elo) {
        if (elo >= 3000) return { name: "GRANDMASTER", cls: "rank-gm" };
        if (elo >= 2400) return { name: "PLATINUM", cls: "rank-platinum" };
        if (elo >= 1800) return { name: "GOLD", cls: "rank-gold" };
        if (elo >= 1200) return { name: "SILVER", cls: "rank-silver" };
        return { name: "BRONZE", cls: "rank-bronze" };
    }

    // Assign stats to dashboard header
    function prep_headers(cur_elo = null) {
        const eloToUse = cur_elo || sessionStorage.getItem("arena_auth_elo");
        const rnk = get_rank(parseInt(eloToUse || "0"));

        document.getElementById('hdr-initials').textContent = get_initials(auth_user);
        document.getElementById('op-name').textContent = auth_user.replaceAll('_', ' ').toUpperCase();
        
        if (eloToUse) {
            document.getElementById('op-elo').textContent = `${eloToUse} ELO`;
            document.getElementById('hdr-elo').textContent = `${eloToUse} ELO`;
            document.getElementById('hdr-rank').textContent = rnk.name;
            sessionStorage.setItem("arena_auth_elo", eloToUse);
        }
    }

    // Fetch players globally
    function fetch_data() {
        fetch(`http://localhost:5001/api/players?t=${Date.now()}`, { credentials: 'include', cache: 'no-store' })
            .then(res => res.json())
            .then(dt => {
                plyrs = dt.players || [];
                const me = plyrs.find(p => String(p.uid) === String(auth_uid));
                if (me) prep_headers(me.elo_rating); 
                render_grid();
            })
            .catch(er => console.warn("API offline:", er));
    }

    // Draw the main player grid
    function render_grid() {
        const qry = src_in.value.toLowerCase();
        const tmpl = document.getElementById('tmpl-card');

        let rslt = plyrs.filter(p => p.name.toLowerCase().includes(qry));
        if (cur_flt === 'gm') rslt = rslt.filter(p => p.elo_rating >= 2800);

        if (onl_cnt) {
            const live = plyrs.filter(p => p.status === 'online' || p.status === 'fighting').length;
            onl_cnt.textContent = `${live} ONLINE`;
        }

        const wt = { "online": 1, "fighting": 2, "offline": 3 };
        const srt_md = srt_sel.value;
        
        // Sort players based on status & selection
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
            const empty_tmpl = document.getElementById('tmpl-none');
            ply_grid.appendChild(empty_tmpl.content.cloneNode(true));
            return;
        }

        rslt.forEach(p => {
            const cln = tmpl.content.cloneNode(true);
            const card_wrap = cln.querySelector('.player-card');
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

    // Set up auto-reconnecting websocket
    function prep_socket() {
        lb_sock = new WebSocket(`ws://localhost:5001/ws/lobby/${auth_uid}`);

        lb_sock.onopen = () => {
            console.log("Connected to game lobby");
            fetch_data(); 
        };

        lb_sock.onmessage = (e) => {
            const dt = JSON.parse(e.data);

            if (dt.type === "presence" || dt.type === "game_over") {
                fetch_data(); 
            }

            if (dt.type === "challenge_received") {
                const overlay = document.getElementById('overlay');
                const chlg = plyrs.find(p => String(p.uid) === String(dt.from_uid));
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
                    const accept = confirm(`Incoming match from ${c_name}!\n\nAccept?`);
                    lb_sock.send(JSON.stringify({ type: "challenge_response", from_uid: dt.from_uid, accepted: accept }));
                }
            }

            if (dt.type === "challenge_declined") {
                window.showCustomAlert("CHALLENGE DECLINED", "THE TARGET OPERATOR REJECTED YOUR MATCH.");
                setTimeout(() => window.hideModal(), 4000);
            }

            if (dt.type === "challenge_cancelled") window.hideModal();
            if (dt.type === "match_start") window.location.href = `match_arena.html?room=${dt.room_id}&symbol=${dt.symbol}`;
        };

        // Try to reconnect if dropped
        lb_sock.onclose = () => {
            console.warn("Connection lost. Reconnecting...");
            setTimeout(prep_socket, 2000);
        };
    }

    // First load
    fetch_data();
    prep_socket();
    
    // Refresh periodically if hidden
    setInterval(fetch_data, 5000);

    // Refresh immediately on focus
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") fetch_data();
    });
    window.addEventListener("focus", fetch_data);

});