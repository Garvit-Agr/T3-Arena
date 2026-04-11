// mapping elo brackets to tier names
function check_rank(elo) {
    if (elo >= 2800) return "Grandmaster";
    if (elo >= 2666) return "Master III";
    if (elo >= 2533) return "Master II";
    if (elo >= 2400) return "Master I";
    if (elo >= 2300) return "Diamond III";
    if (elo >= 2200) return "Diamond II";
    if (elo >= 2100) return "Diamond I";
    if (elo >= 2000) return "Platinum III";
    if (elo >= 1900) return "Platinum II";
    if (elo >= 1800) return "Platinum I";
    if (elo >= 1700) return "Gold III";
    if (elo >= 1600) return "Gold II";
    if (elo >= 1500) return "Gold I";
    if (elo >= 1400) return "Silver III";
    if (elo >= 1300) return "Silver II";
    if (elo >= 1200) return "Silver I";
    if (elo >= 800)  return "Bronze III";
    if (elo >= 400)  return "Bronze II";
    return "Bronze I";
}

// secure destruction of session logic
// async function handle_logout(e) {
//     e.preventDefault();
//     const my_uid = sessionStorage.getItem("arena_auth_uid"); 
//     try {
//         await fetch('http://localhost:5001/logout', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ uid: my_uid }),
//             credentials: 'include'
//         });
//     } catch (_) {}
//     sessionStorage.clear();
//     window.location.href = 'login.html';
// }

document.addEventListener('DOMContentLoaded', () => {

    // auth check bounce if parameters missing
    const auth_user = sessionStorage.getItem("arena_auth_user");
    const auth_uid  = sessionStorage.getItem("arena_auth_uid");

    // if (!auth_user || !auth_uid) {
    //     window.location.replace("login.html");
    //     return;
    // }

    // inject session baseline stats
    const cur_elo = parseInt(sessionStorage.getItem("arena_auth_elo") || "0");
    if (cur_elo) {
        document.getElementById('hdr-elo').innerText = `${cur_elo.toLocaleString()} ELO`;
        document.getElementById('hdr-rank').innerText = check_rank(cur_elo);
    }

    // ui mapping nodes
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
    const btn_logout   = document.getElementById('btn-logout');
    
    // pulling dom template fragments
    const tmpl_row     = document.getElementById('tmpl-row');
    const tmpl_pod     = document.getElementById('tmpl-podium');

    const op_name    = document.getElementById('op-name');
    const op_elo     = document.getElementById('op-elo');
    const hdr_inits  = document.getElementById('hdr-initials');

    // states
    const items_per_pg = 10;
    let cur_pg      = 1;
    let cur_flt     = 'global';
    let gbl_data    = [];

    // core sorting mechanic pushing highest elos to the tip
    function rank_data(dt) {
        dt.sort((a, b) => {
            if (b.elo_rating !== a.elo_rating) {
                return b.elo_rating - a.elo_rating;
            }
            if (b.winrate !== a.winrate) {
                return b.winrate - a.winrate; 
            }
            return a.name.localeCompare(b.name);
        });

        // sequential rank stamping
        dt.forEach((p, i) => {
            p.rank = i + 1;
        });

        return dt;
    }

    if (btn_logout) btn_logout.addEventListener('click', handle_logout);

    // split tag calculations
    function get_initials(nm) {
        if (!nm) return "??";
        const parts = nm.trim().split(/[_\s]+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return nm.substring(0, 2).toUpperCase();
    }

    // load out string arrays immediately
    if (op_name && auth_user) op_name.innerText = auth_user.replaceAll('_', ' ').toUpperCase();
    if (hdr_inits && auth_user) hdr_inits.innerText = get_initials(auth_user);

    // mobile side toggler
    side_tog.addEventListener('click', () => {
        if (window.innerWidth >= 768) {
            sidebar.classList.toggle('sidebar-hidden');
            mn_cnt.classList.toggle('canvas-expanded');
        } else {
            sidebar.classList.toggle('sidebar-visible');
        }
    });

    // ui active states
    btn_flt_live.addEventListener('click', () => {
        cur_flt = 'live'; 
        cur_pg = 1;
        btn_flt_live.classList.add('active-filter');
        btn_flt_glob.classList.remove('active-filter');
        draw_table();
    });

    btn_flt_glob.addEventListener('click', () => {
        cur_flt = 'global'; 
        cur_pg = 1;
        btn_flt_glob.classList.add('active-filter');
        btn_flt_live.classList.remove('active-filter');
        draw_table();
    });

    // query backend pipe
    function ping_data() {
        fetch('http://localhost:5001/api/leaderboard', { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error(`http error! status: ${res.status}`);
                return res.json();
            })
            .then(data => {
                const raw = data.players || [];
                gbl_data = rank_data(raw);

                const my_dt = gbl_data.find(p => p.uid === auth_uid);
                if (my_dt) {
                    if (op_elo) op_elo.innerText = `${my_dt.elo_rating} ELO`;
                    
                    const hd_elo = document.getElementById('hdr-elo');
                    const hd_rnk = document.getElementById('hdr-rank');
                    if (hd_elo) hd_elo.innerText = `${my_dt.elo_rating.toLocaleString()} ELO`;
                    if (hd_rnk) hd_rnk.innerText = check_rank(my_dt.elo_rating);
                }
                
                draw_table();
            })
            .catch(err => {
                console.error("fetch failed totally:", err);
                gbl_data = [];
                draw_table();
            });
    }

    // construct raw table nodes slicing via pagination limits
    function draw_table() {
        let rslt = cur_flt === 'live' 
            ? gbl_data.filter(p => p.status === 'online' || p.status === 'fighting') 
            : gbl_data;

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
            const is_me = p.uid === auth_uid;
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

            if (is_me) {
                r_cln.querySelector('.player-me-tag').classList.remove('hidden');
            }

            r_cln.querySelector('.player-uid').textContent = p.uid;

            const dt = r_cln.querySelector('.table-dot');
            if (p.status === 'online') {
                dt.classList.add('online');
            } else if (p.status === 'fighting') {
                dt.classList.add('fighting');
            } else {
                dt.remove(); 
            }

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

    // explicitly render the topmost global contenders into the visual podium blocks
    function draw_podium(plyrs) {
        const pod = document.getElementById('podium');
        if (!pod) return;

        const tp3 = plyrs.slice(0, 3);
        if (tp3.length === 0) {
            pod.innerHTML = `<div class="loading-state">NO DATA YET</div>`;
            return;
        }

        const cfg_map = [
            { pos: "02", cls: "rank-2" },
            { pos: "01", cls: "rank-1" },
            { pos: "03", cls: "rank-3" },
        ];

        pod.innerHTML = '';
        const chnks = [
            { p_obj: tp3[1], cg: cfg_map[0] },
            { p_obj: tp3[0], cg: cfg_map[1] },
            { p_obj: tp3[2], cg: cfg_map[2] },
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

    // pagination event binds
    btn_next.addEventListener('click', () => {
        const rslt = cur_flt === 'live' ? gbl_data.filter(p => p.status === 'online' || p.status === 'fighting') : gbl_data;
        const tot = Math.ceil(rslt.length / items_per_pg);
        if (cur_pg < tot) { cur_pg++; draw_table(); }
    });
    
    btn_prev.addEventListener('click', () => { 
        if (cur_pg > 1) { cur_pg--; draw_table(); } 
    });

    ping_data();
});

// safety listener blocking stale sessions
let is_nav = false;
document.addEventListener('click', (e) => { if (e.target.closest('a')) is_nav = true; });

// backchannel pulse before window crash
window.addEventListener('beforeunload', () => {
    if (is_nav) return;
    const auth_uid = sessionStorage.getItem("arena_auth_uid");
    if (auth_uid) {
        fetch('http://localhost:5001/logout', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: auth_uid }), keepalive: true 
        }).catch(() => {});
    }
});