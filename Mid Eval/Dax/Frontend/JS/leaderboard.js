let gbl_data = [];
let lobbySocket = null;

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
                    lobbySocket.send(JSON.stringify({ type: "cancel_challenge", target_uid: targetUid }));
                }
                window.hideModal();
            };
        }
        window.showModal('modal-alert');
    } else {
        alert(title + "\n" + message);
    }
};

function check_rank(elo) {
    if (elo >= 3000) return "Grandmaster";
    if (elo >= 2800) return "Platinum III";
    if (elo >= 2600) return "Platinum II";
    if (elo >= 2400) return "Platinum I";
    if (elo >= 2200) return "Gold III";
    if (elo >= 2000) return "Gold II";
    if (elo >= 1800) return "Gold I";
    if (elo >= 1600) return "Silver III";
    if (elo >= 1400) return "Silver II";
    if (elo >= 1200) return "Silver I";
    if (elo >= 800)  return "Bronze III";
    if (elo >= 400)  return "Bronze II";
    return "Bronze I";
}

document.addEventListener('DOMContentLoaded', () => {

    const auth_user = sessionStorage.getItem("arena_auth_user");
    const auth_uid  = sessionStorage.getItem("arena_auth_uid");

    if (!auth_user || !auth_uid) {
        window.location.replace("login.html");
        return;
    }

    const cur_elo = parseInt(sessionStorage.getItem("arena_auth_elo") || "0");
    if (cur_elo) {
        document.getElementById('hdr-elo').innerText = `${cur_elo.toLocaleString()} ELO`;
        document.getElementById('hdr-rank').innerText = check_rank(cur_elo);
    }

    const sidebar      = document.getElementById('sidebar');
    const side_tog     = document.getElementById('sidebar-toggle');
    const mn_cnt       = document.getElementById('main-content');
    const ldb_body     = document.getElementById('ldb-body');
    const btn_prev     = document.getElementById('btn-prev');
    const btn_next     = document.getElementById('btn-next');
    const pg_ind       = document.getElementById('pg-ind');
    const pg_info      = document.getElementById('pg-info');
    const btn_flt_live = document.getElementById('btn-flt-live');
    const btn_flt_glob = document.getElementById('btn-flt-global');
    
    const tmpl_row     = document.getElementById('tmpl-row');
    const tmpl_pod     = document.getElementById('tmpl-podium');

    const op_name    = document.getElementById('op-name');
    const op_elo     = document.getElementById('op-elo');
    const hdr_inits  = document.getElementById('hdr-initials');

    const items_per_pg = 10;
    let cur_pg      = 1;
    let cur_flt     = 'global';

    function rank_data(dt) {
        dt.sort((a, b) => {
            if (b.elo_rating !== a.elo_rating) return b.elo_rating - a.elo_rating;
            if (b.winrate !== a.winrate) return b.winrate - a.winrate; 
            return a.name.localeCompare(b.name);
        });
        dt.forEach((p, i) => { p.rank = i + 1; });
        return dt;
    }

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

    function get_initials(nm) {
        if (!nm) return "??";
        const parts = nm.trim().split(/[_\s]+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return nm.substring(0, 2).toUpperCase();
    }

    if (op_name && auth_user) op_name.innerText = auth_user.replaceAll('_', ' ').toUpperCase();
    if (hdr_inits && auth_user) hdr_inits.innerText = get_initials(auth_user);

    side_tog.addEventListener('click', () => {
        if (window.innerWidth >= 768) {
            sidebar.classList.toggle('sidebar-hidden');
            mn_cnt.classList.toggle('canvas-expanded');
        } else {
            sidebar.classList.toggle('sidebar-visible');
        }
    });

    btn_flt_live.addEventListener('click', () => {
        cur_flt = 'live'; cur_pg = 1;
        btn_flt_live.classList.add('active-filter');
        btn_flt_glob.classList.remove('active-filter');
        draw_table();
    });

    btn_flt_glob.addEventListener('click', () => {
        cur_flt = 'global'; cur_pg = 1;
        btn_flt_glob.classList.add('active-filter');
        btn_flt_live.classList.remove('active-filter');
        draw_table();
    });

    function ping_data() {
        const cacheBuster = Date.now();
        fetch(`http://localhost:5001/api/leaderboard?t=${cacheBuster}`, { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                gbl_data = rank_data(data.players || []);
                const my_dt = gbl_data.find(p => String(p.uid) === String(auth_uid));
                if (my_dt) {
                    if (op_elo) op_elo.innerText = `${my_dt.elo_rating} ELO`;
                    const hd_elo = document.getElementById('hdr-elo');
                    const hd_rnk = document.getElementById('hdr-rank');
                    if (hd_elo) hd_elo.innerText = `${my_dt.elo_rating.toLocaleString()} ELO`;
                    if (hd_rnk) hd_rnk.innerText = check_rank(my_dt.elo_rating);
                }
                draw_table();
            })
            .catch(err => { gbl_data = []; draw_table(); });
    }

    function draw_table() {
        let rslt = cur_flt === 'live' ? gbl_data.filter(p => p.status === 'online' || p.status === 'fighting') : gbl_data;
        draw_podium(rslt);

        const tot = rslt.length;
        const tot_pgs = Math.max(1, Math.ceil(tot / items_per_pg));
        const st_idx = (cur_pg - 1) * items_per_pg;
        const ed_idx = Math.min(st_idx + items_per_pg, tot);
        const pg_data = rslt.slice(st_idx, ed_idx);

        pg_info.innerText = `SHOWING ${tot > 0 ? st_idx + 1 : 0} TO ${ed_idx} OF ${tot} ACTIVE RECORDS`;
        pg_ind.innerText  = `PAGE ${cur_pg.toString().padStart(2,'0')} / ${tot_pgs.toString().padStart(2,'0')}`;
        btn_prev.disabled = cur_pg === 1;
        btn_next.disabled = cur_pg === tot_pgs;

        ldb_body.innerHTML = '';
        if (pg_data.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="5" class="table-empty">NO OPERATORS FOUND</td>`;
            ldb_body.appendChild(tr);
            return;
        }

        const frag = document.createDocumentFragment();
        pg_data.forEach(p => {
            const is_me = String(p.uid) === String(auth_uid);
            const r_cln = tmpl_row.content.cloneNode(true);
            const tr = r_cln.querySelector('tr');

            if (is_me) tr.classList.add('is-me');

            const rn_cell = r_cln.querySelector('.rank-cell');
            rn_cell.textContent = p.rank.toString().padStart(2, '0');
            if (p.rank <= 3) rn_cell.classList.add('rank-top-3');

            r_cln.querySelector('.player-avatar').textContent = get_initials(p.name);
            const nm_el = r_cln.querySelector('.player-name');
            nm_el.textContent = p.name;
            if (is_me) nm_el.classList.add('highlight');
            if (is_me) r_cln.querySelector('.player-me-tag').classList.remove('hidden');

            r_cln.querySelector('.player-uid').textContent = p.uid;
            const dt = r_cln.querySelector('.table-dot');
            if (p.status === 'online') dt.classList.add('online');
            else if (p.status === 'fighting') dt.classList.add('fighting');
            else dt.remove(); 

            const el_cl = r_cln.querySelector('.elo-cell');
            el_cl.textContent = p.elo_rating;
            if (is_me) el_cl.classList.add('highlight');

            const wr_cl = r_cln.querySelector('.winrate-cell');
            wr_cl.textContent = p.winrate + '%';
            if (is_me) wr_cl.classList.add('highlight');

            frag.appendChild(r_cln);
        });
        ldb_body.appendChild(frag);
    }

    function draw_podium(plyrs) {
        const pod = document.getElementById('podium');
        if (!pod) return;

        const tp3 = plyrs.slice(0, 3);
        if (tp3.length === 0) { pod.innerHTML = `<div class="loading-state">NO DATA YET</div>`; return; }

        pod.innerHTML = '';
        const chnks = [
            { p_obj: tp3[1], cg: { pos: "02", cls: "rank-2" } },
            { p_obj: tp3[0], cg: { pos: "01", cls: "rank-1" } },
            { p_obj: tp3[2], cg: { pos: "03", cls: "rank-3" } },
        ];

        const p_frag = document.createDocumentFragment();
        chnks.forEach(({ p_obj, cg }) => {
            if (!p_obj) return;
            const p_cln = tmpl_pod.content.cloneNode(true);
            const crd = p_cln.querySelector('.podium-card');
            
            crd.classList.add(cg.cls);
            p_cln.querySelector('.podium-bg-num').textContent = cg.pos;
            p_cln.querySelector('.podium-avatar').textContent = get_initials(p_obj.name);
            p_cln.querySelector('.podium-badge').textContent = check_rank(p_obj.elo_rating);
            p_cln.querySelector('.podium-name').textContent = p_obj.name;
            p_cln.querySelector('.podium-uid').textContent = p_obj.uid;
            p_cln.querySelector('.elo').textContent = p_obj.elo_rating.toLocaleString();
            p_cln.querySelector('.winrate').textContent = p_obj.winrate + '%';

            p_frag.appendChild(p_cln);
        });
        pod.appendChild(p_frag);
    }

    btn_next.addEventListener('click', () => {
        const rslt = cur_flt === 'live' ? gbl_data.filter(p => p.status === 'online' || p.status === 'fighting') : gbl_data;
        const tot = Math.ceil(rslt.length / items_per_pg);
        if (cur_pg < tot) { cur_pg++; draw_table(); }
    });
    btn_prev.addEventListener('click', () => { if (cur_pg > 1) { cur_pg--; draw_table(); } });

    function connectLobbySocket() {
        lobbySocket = new WebSocket(`ws://localhost:5001/ws/lobby/${auth_uid}`);
        
        lobbySocket.onopen = () => { ping_data(); };

        lobbySocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "presence" || data.type === "game_over") {
                ping_data(); 
            }
            
            if (data.type === "challenge_received") {
                const overlay = document.getElementById('modal-overlay');
                const challenger = gbl_data.find(p => String(p.uid) === String(data.from_uid));
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
                setTimeout(() => window.hideModal(), 1500); 
            }

            if (data.type === "challenge_cancelled") {
                window.hideModal();
            }

            if (data.type === "match_start") {
                window.location.href = `match_arena.html?room=${data.room_id}&symbol=${data.symbol}`;
            }
        };

        lobbySocket.onclose = () => {
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