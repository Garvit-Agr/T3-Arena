document.addEventListener('DOMContentLoaded', () => {

    // early exit guard if session is missing standard credentials
    const auth_user = sessionStorage.getItem("arena_auth_user");
    const auth_uid  = sessionStorage.getItem("arena_auth_uid");

    // if (!auth_user || !auth_uid) {
    //     console.warn("security violation detected. bouncing to login.");
    //     window.location.replace("login.html");
    //     return;
    // }

    // ui binding nodes mapping into js space
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
    let global_players = [];

    // init user stats before any bulk queries
    prep_headers();

    // attach standard interactions
    side_tog.addEventListener('click', () => {
        if (is_match_running) {
            alert("system locked: match currently in progress.");
            return;
        }
        
        // desktop vs mobile drawer handling
        if (window.innerWidth >= 768) {
            sidebar.classList.toggle('sidebar-hidden');
            mn_cnt.classList.toggle('canvas-expanded');
        } else {
            sidebar.classList.toggle('sidebar-visible');
        }
    });

    // filter button binds swapping visual active states
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
    document.getElementById('btn-logout').addEventListener('click', handle_logout);

    // mirror mobile search to main logic
    if (mob_src_input) {
        mob_src_input.addEventListener('input', (e) => {
            src_input.value = e.target.value;
            draw_grid();
        });
    }

    // calculates letters to stamp onto player avatar circles
    function get_initials(name) {
        if (!name) return "??";
        const parts = name.trim().split(/[_\s]+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    // rating tier lookup map based on elo threshold brackets
    function check_rank(elo) {
        if (elo >= 2800) return { name: "GRANDMASTER",  cls: "rank-gm" };
        if (elo >= 2666) return { name: "MASTER III",   cls: "rank-master" };
        if (elo >= 2533) return { name: "MASTER II",    cls: "rank-master" };
        if (elo >= 2400) return { name: "MASTER I",     cls: "rank-master" };
        if (elo >= 2300) return { name: "DIAMOND III",  cls: "rank-diamond" };
        if (elo >= 2200) return { name: "DIAMOND II",   cls: "rank-diamond" };
        if (elo >= 2100) return { name: "DIAMOND I",    cls: "rank-diamond" };
        if (elo >= 2000) return { name: "PLATINUM III", cls: "rank-platinum" };
        if (elo >= 1900) return { name: "PLATINUM II",  cls: "rank-platinum" };
        if (elo >= 1800) return { name: "PLATINUM I",   cls: "rank-platinum" };
        if (elo >= 1700) return { name: "GOLD III",     cls: "rank-gold" };
        if (elo >= 1600) return { name: "GOLD II",      cls: "rank-gold" };
        if (elo >= 1500) return { name: "GOLD I",       cls: "rank-gold" };
        if (elo >= 1400) return { name: "SILVER III",   cls: "rank-silver" };
        if (elo >= 1300) return { name: "SILVER II",    cls: "rank-silver" };
        if (elo >= 1200) return { name: "SILVER I",     cls: "rank-silver" };
        if (elo >= 800)  return { name: "BRONZE III",   cls: "rank-bronze" };
        if (elo >= 400)  return { name: "BRONZE II",    cls: "rank-bronze" };
        return                  { name: "BRONZE I",     cls: "rank-bronze" };
    }

    // injects session data visually into the upper top UI
    function prep_headers() {
        const auth_elo = sessionStorage.getItem("arena_auth_elo");
        const rnks = check_rank(parseInt(auth_elo || "0"));

        document.getElementById('hdr-initials').textContent = get_initials(auth_user);
        document.getElementById('op-name').textContent = auth_user.replaceAll('_', ' ').toUpperCase();
        
        if (auth_elo) {
            document.getElementById('op-elo').textContent = `${auth_elo} ELO`;
            document.getElementById('hdr-elo').textContent = `${auth_elo} ELO`;
            document.getElementById('hdr-rank').textContent = rnks.name;
        }
    }

    // pings backend api periodically to gather updated competitor profiles
    function ping_data() {
        fetch('http://localhost:5001/api/players', { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error(`server crash code: ${res.status}`);
                return res.json();
            })
            .then(dt => {
                global_players = dt.players || [];
                draw_grid();
            })
            .catch(er => {
                console.warn("api pipe unavailable:", er);
                global_players = [];
                draw_grid();
            });
    }

    // reconstructs the html dom table reflecting latest sorted and filtered data objects
    function draw_grid() {
        const qry = src_input.value.toLowerCase();
        const tmpl = document.getElementById('tmpl-card');

        let rslt = global_players.filter(p =>
            p.name.toLowerCase().includes(qry)
        );

        if (cur_flt === 'gm') {
            rslt = rslt.filter(p => p.elo_rating >= 2800);
        }

        // tally up active targets to display in main viewport label
        if (online_count) {
            const live = global_players.filter(p => p.status === 'online' || p.status === 'fighting').length;
            online_count.textContent = `${live} ONLINE`;
        }

        const wt = { "online": 1, "fighting": 2, "offline": 3 };
        const srt_md = srt_sel.value;
        
        // custom sorting putting current player on top always, then handling the selected criteria
        rslt.sort((a, b) => {
            const is_me_a = (a.uid === auth_uid);
            const is_me_b = (b.uid === auth_uid);
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
                case 'name-asc':  return a.name.localeCompare(b.name);
                case 'name-desc': return b.name.localeCompare(a.name);
                default:          return 0;
            }
        });

        // wipe existing grid entirely before stamp cycle
        ply_grid.innerHTML = '';

        if (rslt.length === 0) {
            const et = document.getElementById('tmpl-empty');
            ply_grid.appendChild(et.content.cloneNode(true));
            return;
        }

        // stamp each player card individually modifying template bindings
        rslt.forEach(p => {
            const cln = tmpl.content.cloneNode(true);
            const card_wrap = cln.querySelector('.player-card');
            const p_rnk = check_rank(p.elo_rating);
            const is_me = (p.uid === auth_uid);

            cln.querySelector('.js-initials').textContent = get_initials(p.name);
            cln.querySelector('.js-rank').textContent = p_rnk.name;
            cln.querySelector('.js-rank').classList.add(p_rnk.cls);
            cln.querySelector('.js-elo').textContent = `${p.elo_rating} ELO`;
            cln.querySelector('.js-winrate').textContent = `WR: ${p.winrate}%`;
            cln.querySelector('.js-name').textContent = p.name;
            cln.querySelector('.js-uid').textContent = p.uid;

            // map visual button elements
            const btn_icn = cln.querySelector('.js-btn-icn');
            const bt_txt = cln.querySelector('.js-btn-text');
            const sts_txt = cln.querySelector('.js-status-text');

            // lock visually depending on if they are in combat, user, or available
            if (p.status === "fighting") {
                card_wrap.classList.add('state-fighting');
                sts_txt.textContent = "FIGHTING";
                btn_icn.style.display = "none";
                bt_txt.textContent = "MATCH IN PROGRESS";
                cln.querySelector('.js-btn').disabled = true;

            } else if (p.status === "online") {
                if (is_me) {
                    card_wrap.classList.add('state-online-me');
                    sts_txt.textContent = "YOU — ONLINE";
                    btn_icn.style.display = "none";
                    bt_txt.textContent = "THIS IS YOU";
                    cln.querySelector('.js-btn').disabled = true;
                } else {
                    card_wrap.classList.add('state-online');
                    sts_txt.textContent = "ONLINE";
                    btn_icn.textContent = "swords";
                    bt_txt.textContent = "CHALLENGE";
                }
            } else {
                card_wrap.classList.add('state-offline');
                sts_txt.textContent = "OFFLINE";
                cln.querySelector('.static-dot').style.display = "none";
                btn_icn.style.display = "none";
                bt_txt.textContent = "UNAVAILABLE";
                cln.querySelector('.js-btn').disabled = true;
            }

            ply_grid.appendChild(cln);
        });
    }

    // kick off infinite api loop
    ping_data();
    setInterval(ping_data, 5000);
});

// executes secure logout wiping session arrays and informing backend
async function handle_logout(e) {
    if(e) e.preventDefault();
    const my_uid = sessionStorage.getItem("arena_auth_uid"); 
    try {
        await fetch('http://localhost:5001/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: my_uid }),
            credentials: 'include'
        });
    } catch (_) {}
    
    sessionStorage.clear();
    window.location.href = 'login.html';
}

// track valid link clicks to avoid ghost logout when just navigating app
let is_nav = false;
document.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
        is_nav = true; 
    }
});

// fires a stealth api call backwards as tab crashes or closes
window.addEventListener('beforeunload', () => {
    if (is_nav) return; 

    const my_uid = sessionStorage.getItem("arena_auth_uid");
    if (my_uid) {
        fetch('http://localhost:5001/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: my_uid }),
            keepalive: true 
        }).catch(() => {}); 
    }
});