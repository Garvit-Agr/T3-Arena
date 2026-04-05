// leaderboard.js

document.addEventListener('DOMContentLoaded', () => {

    // ── Sidebar toggle ────────────────────────────────────────────────────
    const sidebar      = document.getElementById('sidebar');
    const sidebarToggle= document.getElementById('sidebar-toggle');
    const mainCanvas   = document.getElementById('main-canvas');

    sidebarToggle.addEventListener('click', () => {
        if (window.innerWidth >= 768) {
            sidebar.classList.toggle('sidebar-hidden');
            mainCanvas.classList.toggle('canvas-expanded');
        } else {
            sidebar.classList.toggle('sidebar-visible');
        }
    });

    // ── State ─────────────────────────────────────────────────────────────
    const leaderboardBody = document.getElementById('leaderboard-body');
    const btnPrev         = document.getElementById('btn-prev');
    const btnNext         = document.getElementById('btn-next');
    const pageIndicator   = document.getElementById('page-indicator');
    const paginationInfo  = document.getElementById('pagination-info');
    const btnFilterLive   = document.getElementById('btn-filter-live');
    const btnFilterGlobal = document.getElementById('btn-filter-global');

    // Show logged-in user's name in sidebar
    const loggedInUser = sessionStorage.getItem("arena_auth_user");
    const loggedInUid  = sessionStorage.getItem("arena_auth_uid");
    const nameDisplay  = document.getElementById('operator-name-display');
    if (nameDisplay && loggedInUser) {
        nameDisplay.innerText = loggedInUser.replaceAll('_', ' ').toUpperCase();
    }

    const PLAYERS_PER_PAGE = 10;
    let currentPage   = 1;
    let currentFilter = 'global';
    let globalLeaderboardData = [];

    // ── Filter button classes ─────────────────────────────────────────────
    const activeClass   = "px-4 py-2 bg-primary text-[#002e6a] text-xs font-headline font-bold tracking-widest uppercase rounded shadow-[0_0_15px_rgba(173,198,255,0.2)] transition-colors";
    const inactiveClass = "px-4 py-2 bg-surface-container text-on-surface-variant text-xs font-headline font-bold tracking-widest uppercase border border-outline-variant/20 rounded hover:bg-surface-bright transition-colors";

    btnFilterLive.addEventListener('click', () => {
        currentFilter = 'live';
        currentPage   = 1;
        btnFilterLive.className   = activeClass;
        btnFilterGlobal.className = inactiveClass;
        renderTable();
    });

    btnFilterGlobal.addEventListener('click', () => {
        currentFilter = 'global';
        currentPage   = 1;
        btnFilterGlobal.className = activeClass;
        btnFilterLive.className   = inactiveClass;
        renderTable();
    });

    // ── Fetch from backend ────────────────────────────────────────────────
    function fetchLeaderboard() {
        // FIX: point to the real backend endpoint on port 5001
        fetch('http://localhost:5001/api/leaderboard', { credentials: 'include' })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                globalLeaderboardData = data.players || [];
                renderPodium(globalLeaderboardData);
                renderTable();
            })
            .catch(err => {
                console.warn("Leaderboard fetch failed:", err);
                globalLeaderboardData = [];
                renderTable();
            });
    }

    // ── Render table ──────────────────────────────────────────────────────
    function renderTable() {
        let filtered = globalLeaderboardData;
        if (currentFilter === 'live') {
            filtered = globalLeaderboardData.filter(p =>
                p.status === 'online' || p.status === 'fighting'
            );
        }

        const total      = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / PLAYERS_PER_PAGE));
        const startIdx   = (currentPage - 1) * PLAYERS_PER_PAGE;
        const endIdx     = Math.min(startIdx + PLAYERS_PER_PAGE, total);
        const pageData   = filtered.slice(startIdx, endIdx);

        paginationInfo.innerText = `SHOWING ${total > 0 ? startIdx + 1 : 0} TO ${endIdx} OF ${total} ACTIVE RECORDS`;
        pageIndicator.innerText  = `PAGE ${currentPage.toString().padStart(2,'0')} / ${totalPages.toString().padStart(2,'0')}`;
        btnPrev.disabled = currentPage === 1;
        btnNext.disabled = currentPage === totalPages;

        leaderboardBody.innerHTML = '';

        if (pageData.length === 0) {
            leaderboardBody.innerHTML = `
                <tr><td colspan="5" class="text-center py-8 text-on-surface-variant/50 font-label tracking-widest">
                    NO OPERATORS FOUND
                </td></tr>`;
            return;
        }

        pageData.forEach(player => {
            const isMe = player.uid === loggedInUid;

            let statusHTML = '';
            if (player.status === 'online') {
                statusHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(78,222,163,0.6)]"></span>`;
            } else if (player.status === 'fighting') {
                statusHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-[#ff5451] animate-ping"></span>`;
            } else {
                statusHTML = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-on-surface-variant/30"></span>`;
            }

            const rowClass  = isMe
                ? "bg-primary/5 border-l-4 border-primary hover:bg-primary/10 transition-colors"
                : "hover:bg-surface-bright/20 transition-colors";
            const rankColor = player.rank <= 3 ? "text-primary" : "text-on-surface-variant";
            const initials  = player.name.substring(0, 2).toUpperCase();

            leaderboardBody.insertAdjacentHTML('beforeend', `
                <tr class="${rowClass}" id="status-cell-${player.uid}">
                    <td class="px-6 py-5 font-headline font-black ${rankColor} italic text-lg">
                        ${player.rank.toString().padStart(2, '0')}
                    </td>
                    <td class="px-6 py-5">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-on-surface-variant text-xs font-bold">${initials}</div>
                            <div>
                                <span class="font-headline font-bold text-sm ${isMe ? 'text-primary' : ''}">
                                    ${player.name} ${isMe ? '<span class="text-[10px] text-primary/60">(YOU)</span>' : ''}
                                </span>
                                <p class="font-label text-[10px] text-on-surface-variant/40 tracking-widest">${player.uid}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-5 text-center">${statusHTML}</td>
                    <td class="px-6 py-5 text-right font-mono-data ${isMe ? 'font-black text-primary' : 'font-bold text-on-surface'}">
                        ${player.elo_rating}
                    </td>
                    <td class="px-6 py-5 text-right font-mono-data ${isMe ? 'text-primary/80' : 'text-on-surface/80'}">
                        ${player.winrate}%
                    </td>
                </tr>
            `);
        });
    }

    // ── Pagination ────────────────────────────────────────────────────────
    btnNext.addEventListener('click', () => {
        const filtered   = currentFilter === 'live'
            ? globalLeaderboardData.filter(p => p.status === 'online' || p.status === 'fighting')
            : globalLeaderboardData;
        const totalPages = Math.ceil(filtered.length / PLAYERS_PER_PAGE);
        if (currentPage < totalPages) { currentPage++; renderTable(); }
    });

    btnPrev.addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; renderTable(); }
    });

    // Initial load + refresh every 10 seconds
    fetchLeaderboard();
    setInterval(fetchLeaderboard, 10000);
});


// ── Podium renderer (top 3 from real data) ────────────────────────────────
function renderPodium(players) {
    const podium = document.getElementById('podium');
    if (!podium) return;

    const top3 = players.slice(0, 3);
    if (top3.length === 0) {
        podium.innerHTML = `<div class="col-span-full text-center py-8 text-on-surface-variant/40 font-label tracking-widest text-sm">NO DATA YET</div>`;
        return;
    }

    // order: 2nd | 1st | 3rd  (podium layout)
    const order = [top3[1], top3[0], top3[2]].filter(Boolean);
    const configs = [
        { pos: "02", border: "border-slate-400/30", numColor: "text-slate-400/10", eloColor: "text-slate-300", rankBadgeColor: "text-[#ffeb3b]", scale: "" },
        { pos: "01", border: "border-primary/50",   numColor: "text-primary/10",   eloColor: "text-primary",   rankBadgeColor: "text-[#ffeb3b]", scale: "md:scale-105 z-10" },
        { pos: "03", border: "border-amber-700/30", numColor: "text-amber-700/10", eloColor: "text-amber-500", rankBadgeColor: "text-[#e040fb]", scale: "" },
    ];

    // map player index back to display order
    const displayOrder = top3.length >= 2
        ? [top3[1] ? 1 : null, 0, top3[2] ? 2 : null].filter(i => i !== null)
        : [0];

    podium.innerHTML = '';

    // always render: 2nd (order-2), 1st (order-1), 3rd (order-3) if they exist
    const slots = [
        { player: top3[1], cfg: configs[0], order: "order-2 md:order-1" },
        { player: top3[0], cfg: configs[1], order: "order-1 md:order-2" },
        { player: top3[2], cfg: configs[2], order: "order-3 md:order-3" },
    ];

    slots.forEach(({ player, cfg, order: ord }) => {
        if (!player) return;
        podium.insertAdjacentHTML('beforeend', `
            <div class="${ord} bg-surface-container-low ${cfg.border} border-b-2 p-6 rounded-lg relative overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.3)] ${cfg.scale}">
                <div class="absolute -right-4 -top-4 ${cfg.numColor} text-8xl font-black font-headline italic">${cfg.pos}</div>
                <div class="flex items-center gap-4 mb-4">
                    <div class="w-16 h-16 rounded-full border-2 border-outline-variant bg-surface-container flex items-center justify-center">
                        <span class="material-symbols-outlined text-3xl text-on-surface-variant/60">person</span>
                    </div>
                    <div>
                        <span class="text-[10px] font-headline font-bold ${cfg.rankBadgeColor} tracking-[0.3em] uppercase mb-1 block">${player.rank <= 1 ? 'World_Apex' : 'Grandmaster'}</span>
                        <h3 class="text-xl font-black font-headline text-on-surface">${player.name}</h3>
                        <p class="text-[10px] text-on-surface-variant/40 font-label tracking-widest">${player.uid}</p>
                    </div>
                </div>
                <div class="flex justify-between items-end">
                    <div>
                        <p class="text-[10px] text-on-surface-variant font-mono-data">ELO_RATING</p>
                        <p class="text-2xl font-black font-headline ${cfg.eloColor} tracking-tighter">${player.elo_rating.toLocaleString()}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-on-surface-variant font-mono-data">WIN_RATE</p>
                        <p class="text-lg font-bold font-mono-data text-on-surface">${player.winrate}%</p>
                    </div>
                </div>
            </div>
        `);
    });
}