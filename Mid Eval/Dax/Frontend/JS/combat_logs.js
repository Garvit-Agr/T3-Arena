document.addEventListener('DOMContentLoaded', () => {

    const auth_user = sessionStorage.getItem("arena_auth_user");
    const auth_uid  = sessionStorage.getItem("arena_auth_uid");

    if (!auth_user || !auth_uid) {
        window.location.replace("login.html");
        return;
    }

    const stored_elo = parseInt(sessionStorage.getItem("arena_auth_elo") || "0");
    document.getElementById('op-name').innerText = auth_user.replaceAll('_', ' ').toUpperCase();
    document.getElementById('hdr-initials').innerText = get_initials(auth_user);
    
    if (stored_elo) {
        document.getElementById('op-elo').innerText = `${stored_elo.toLocaleString()} ELO`;
        document.getElementById('hdr-elo').innerText = `${stored_elo.toLocaleString()} ELO`;
        document.getElementById('hdr-rank').innerText = get_rank(stored_elo);
    }

    const sidebar = document.getElementById('sidebar');
    const mn_cnt = document.getElementById('main-content');
    document.getElementById('side-tog').addEventListener('click', () => {
        if (window.innerWidth >= 768) {
            sidebar.classList.toggle('sidebar-hidden');
            mn_cnt.classList.toggle('canvas-expanded');
        } else {
            sidebar.classList.toggle('sidebar-visible');
        }
    });

    // Logout
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

    const logs_cnt = document.getElementById('logs-cnt');
    const tmpl_log = document.getElementById('tmpl-log');
    const tmpl_empty = document.getElementById('tmpl-none');

    const stat_total = document.getElementById('stat-total-matches');
    const stat_wr = document.getElementById('stat-winrate');
    const stat_wl = document.getElementById('stat-wl-ratio');
    const stat_nem = document.getElementById('stat-nemesis');
    const stat_net = document.getElementById('stat-net-elo');
    const wgt_score = document.getElementById('wgt-score');

    const btn_prev = document.getElementById('btn-prev');
    const btn_next = document.getElementById('btn-next');
    const pg_info = document.getElementById('pg-info');
    const pg_ind = document.getElementById('pg-ind');

    let match_data = [];
    let filtered = [];
    let cur_flt = 'all'; 
    let src_qry = '';
    
    let cur_pg = 1;
    const per_pg = 10;

    // Search box
    document.getElementById('log-src').addEventListener('input', (e) => {
        src_qry = e.target.value.toLowerCase();
        apply_filters();
    });

    const flt_all = document.getElementById('flt-all');
    const flt_wins = document.getElementById('flt-wins');
    const flt_losses = document.getElementById('flt-losses');

    // Swap active class on filter buttons
    function set_active_flt(btn) {
        flt_all.classList.remove('active');
        flt_wins.classList.remove('active');
        flt_losses.classList.remove('active');
        btn.classList.add('active');
    }

    flt_all.addEventListener('click', () => {
        cur_flt = 'all';
        set_active_flt(flt_all);
        apply_filters();
    });

    flt_wins.addEventListener('click', () => {
        cur_flt = 'win';
        set_active_flt(flt_wins);
        apply_filters();
    });

    flt_losses.addEventListener('click', () => {
        cur_flt = 'loss';
        set_active_flt(flt_losses);
        apply_filters();
    });

    // Pagination
    btn_next.addEventListener('click', () => {
        const tot_pgs = Math.ceil(filtered.length / per_pg);
        if (cur_pg < tot_pgs) { cur_pg++; render_logs(); }
    });
    
    btn_prev.addEventListener('click', () => {
        if (cur_pg > 1) { cur_pg--; render_logs(); }
    });

    // Get initials from name
    function get_initials(name) {
        if (!name) return "??";
        const parts = name.trim().split(/[_\s]+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    // Format timestamp to readable date
    function fmt_date(str) {
        const d = new Date(str);
        const day = d.getDate().toString().padStart(2, '0');
        const month = d.toLocaleString('default', { month: 'short' }).toUpperCase();
        return `${day} ${month} ${d.getFullYear()}`;
    }

    // Get rank label from elo
    function get_rank(elo) {
        if (elo >= 2800) return "Grandmaster";
        if (elo >= 2000) return "Platinum I";
        if (elo >= 1500) return "Gold I";
        if (elo >= 1200) return "Silver I";
        return "Bronze I";
    }

    // Pull match history from backend
    async function fetch_logs() {
        try {
            const res = await fetch(`http://localhost:5001/api/match-history/${auth_uid}`, { credentials: 'include' });
            const data = await res.json();

            if (data.matches) {
                const svr_uid = data.current_user_id;

                match_data = data.matches.map(m => {
                    const is_win = m.winner_uid === svr_uid;
                    const is_draw = m.winner_uid === null && !m.forfeit;

                    return {
                        timestamp: m.played_at, 
                        result: is_draw ? 'draw' : (is_win ? 'win' : 'loss'),
                        opp_name: (m.player1_uid === svr_uid ? m.p2_name : m.p1_name) || "Unknown",
                        opp_rank: "OPPONENT", 
                        elo_chg: m.player1_uid === svr_uid 
                            ? (m.player1_elo_after - m.player1_elo_before) 
                            : (m.player2_elo_after - m.player2_elo_before)
                    };
                });
                
                calc_stats(match_data);
                apply_filters();
            }
        } catch (err) {
            console.error('Failed to load logs:', err);
        }
    }

    // Apply search and filter, then render
    function apply_filters() {
        filtered = match_data.filter(m => {
            const passes_flt = (cur_flt === 'all') || (m.result === cur_flt);
            const passes_src = m.opp_name.toLowerCase().includes(src_qry);
            return passes_flt && passes_src;
        });
        cur_pg = 1; 
        render_logs();
    }

    // Calculate summary stats from match array
    function calc_stats(matches) {
        if (!matches || matches.length === 0) return;

        let wins = 0, losses = 0, net_elo = 0;
        
        matches.forEach(m => {
            if (m.result === 'win') wins++;
            else losses++;
            net_elo += m.elo_chg;
        });

        const total = wins + losses;
        const wr = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";

        stat_total.innerText = total;
        stat_wr.innerText = wr;
        stat_wl.innerText = `${wins} W / ${losses} L`;
        stat_net.innerText = net_elo > 0 ? `+${net_elo}` : net_elo;
        wgt_score.innerText = (wins * 150) + (net_elo * 2);

        // Find most-faced opponent
        if (total > 0) {
            const opp_counts = {};
            matches.forEach(m => {
                opp_counts[m.opp_name] = (opp_counts[m.opp_name] || 0) + 1;
            });
            const nemesis = Object.keys(opp_counts).reduce((a, b) => opp_counts[a] > opp_counts[b] ? a : b);
            stat_nem.innerText = nemesis.toUpperCase();
        }
    }

    // Render paginated match log entries
    function render_logs() {
        logs_cnt.innerHTML = ''; 

        const total = filtered.length;
        const tot_pgs = Math.max(1, Math.ceil(total / per_pg));
        
        const st = (cur_pg - 1) * per_pg;
        const ed = Math.min(st + per_pg, total);
        const pg_data = filtered.slice(st, ed);

        pg_info.innerText = `Showing ${total > 0 ? st + 1 : 0} to ${ed} of ${total} records`;
        pg_ind.innerText = `Page ${cur_pg.toString().padStart(2, '0')} / ${tot_pgs.toString().padStart(2, '0')}`;
        btn_prev.disabled = cur_pg === 1;
        btn_next.disabled = cur_pg === tot_pgs;

        if (pg_data.length === 0) {
            logs_cnt.appendChild(tmpl_empty.content.cloneNode(true));
            return;
        }

        const frag = document.createDocumentFragment();

        pg_data.forEach(m => {
            const cln = tmpl_log.content.cloneNode(true);
            const entry = cln.querySelector('.log-entry');
            const res_txt = cln.querySelector('.js-result-text');
            const score_el = cln.querySelector('.js-score-change');

            // Set win/loss/draw styles
            if (m.result === 'win') {
                entry.classList.add('is-win');
                res_txt.innerText = 'VICTORY';
                score_el.innerText = `+${m.elo_chg}`;
            } else if (m.result === 'draw') {
                entry.classList.add('is-draw');
                res_txt.innerText = 'DRAW';
                score_el.innerText = m.elo_chg > 0 ? `+${m.elo_chg}` : m.elo_chg;
            } else {
                entry.classList.add('is-loss');
                res_txt.innerText = 'DEFEAT';
                score_el.innerText = m.elo_chg;
            }

            cln.querySelector('.js-date').innerText = fmt_date(m.timestamp);
            cln.querySelector('.js-avatar').innerText = get_initials(m.opp_name);
            cln.querySelector('.js-name').innerText = m.opp_name;
            cln.querySelector('.js-rank').innerText = `${m.opp_rank} RANKING`;

            frag.appendChild(cln);
        });

        logs_cnt.appendChild(frag);
    }

    fetch_logs();

    // Keep user online via websocket
    function prep_socket() {
        const lb_sock = new WebSocket(`ws://localhost:5001/ws/lobby/${auth_uid}`);

        lb_sock.onmessage = (e) => {
            const dt = JSON.parse(e.data);
            
            if (dt.type === "challenge_received") {
                const accept = confirm(`Incoming challenge from OPERATOR ${dt.from_uid}!\n\nAccept?`);
                lb_sock.send(JSON.stringify({ type: "challenge_response", from_uid: dt.from_uid, accepted: accept }));
            }

            if (dt.type === "challenge_declined") {
                alert("Challenge declined by the opponent.");
            }

            if (dt.type === "match_start") {
                window.location.href = `match_arena.html?room=${dt.room_id}&symbol=${dt.symbol}`;
            }
        };

        lb_sock.onclose = () => { setTimeout(prep_socket, 2000); };
    }

    prep_socket();
});