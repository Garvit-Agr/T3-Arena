// battle_log.js

document.addEventListener('DOMContentLoaded', () => {

    // 1. Auth Guard & Setup
    const loggedInUser = sessionStorage.getItem("arena_auth_user");
    const loggedInUid  = sessionStorage.getItem("arena_auth_uid");

    // if (!loggedInUser || !loggedInUid) {
    //     window.location.replace("login.html");
    //     return;
    // }

    const storedElo = parseInt(sessionStorage.getItem("arena_auth_elo") || "0");
    document.getElementById('op-name').innerText = loggedInUser.replaceAll('_', ' ').toUpperCase();
    document.getElementById('hdr-initials').innerText = getInitials(loggedInUser);
    
    if (storedElo) {
        document.getElementById('op-elo').innerText = `${storedElo.toLocaleString()} ELO`;
        document.getElementById('hdr-elo').innerText = `${storedElo.toLocaleString()} ELO`;
        document.getElementById('hdr-rank').innerText = getRankName(storedElo);
    }

    // Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        if (window.innerWidth >= 768) {
            sidebar.classList.toggle('sidebar-hidden');
            mainContent.classList.toggle('canvas-expanded');
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
                body: JSON.stringify({ uid: loggedInUid }),
                credentials: 'include'
            });
        } catch (_) {}
        sessionStorage.clear();
        window.location.href = 'login.html';
    });

    // 2. DOM Elements
    const logsContainer = document.getElementById('match-logs-container');
    const templateLog   = document.getElementById('template-log-entry');
    const templateEmpty = document.getElementById('template-empty-state');

    const statTotalMatches = document.getElementById('stat-total-matches');
    const statWinrate      = document.getElementById('stat-winrate');
    const statWLRatio      = document.getElementById('stat-wl-ratio');
    const statNemesis      = document.getElementById('stat-nemesis');
    const statNetElo       = document.getElementById('stat-net-elo');
    const widgetCombatScore= document.getElementById('widget-combat-score');

    // Pagination DOM
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const pgInfo = document.getElementById('pg-info');
    const pgInd = document.getElementById('pg-ind');

    // 3. State Management
    let globalMatchData = [];
    let currentFilteredData = [];
    let currentFilter = 'all'; // can be 'all', 'win', 'loss'
    let searchQuery = '';
    
    // Pagination state
    let currentPage = 1;
    const ITEMS_PER_PAGE = 10;

    // Search Bar Listener
    document.getElementById('log-search').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        applyFiltersAndRender();
    });

    // Filter Buttons Listener
    const btnFilterAll = document.getElementById('btn-filter-all');
    const btnFilterWins = document.getElementById('btn-filter-wins');
    const btnFilterLosses = document.getElementById('btn-filter-losses');

    function updateActiveFilterButton(activeBtn) {
        btnFilterAll.classList.remove('active');
        btnFilterWins.classList.remove('active');
        btnFilterLosses.classList.remove('active');
        activeBtn.classList.add('active');
    }

    btnFilterAll.addEventListener('click', () => {
        currentFilter = 'all';
        updateActiveFilterButton(btnFilterAll);
        applyFiltersAndRender();
    });

    btnFilterWins.addEventListener('click', () => {
        currentFilter = 'win';
        updateActiveFilterButton(btnFilterWins);
        applyFiltersAndRender();
    });

    btnFilterLosses.addEventListener('click', () => {
        currentFilter = 'loss';
        updateActiveFilterButton(btnFilterLosses);
        applyFiltersAndRender();
    });

    // Pagination Listeners
    btnNext.addEventListener('click', () => {
        const totalPages = Math.ceil(currentFilteredData.length / ITEMS_PER_PAGE);
        if (currentPage < totalPages) {
            currentPage++;
            renderLogs();
        }
    });
    
    btnPrev.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderLogs();
        }
    });

    // 4. Helper Functions
    function getInitials(name) {
        if (!name) return "??";
        const parts = name.trim().split(/[_\s]+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    function formatDate(dateString) {
        const d = new Date(dateString);
        const day = d.getDate().toString().padStart(2, '0');
        const month = d.toLocaleString('default', { month: 'short' }).toUpperCase();
        const year = d.getFullYear();
        return `${day} ${month} ${year}`;
    }

    function getRankName(elo) {
        if (elo >= 2800) return "Grandmaster";
        if (elo >= 2000) return "Platinum I";
        if (elo >= 1500) return "Gold I";
        if (elo >= 1200) return "Silver I";
        return "Bronze I";
    }

    // 5. Fetch Data
    async function fetchCombatLogs() {
        try {
            const response = await fetch('http://localhost:5001/api/history', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch logs');

            const data = await response.json();
            globalMatchData = data.history || [];

            renderStats(globalMatchData);
            applyFiltersAndRender();

        } catch (error) {
            console.warn("Backend not responding. Showing empty state.");
            globalMatchData = [];
            renderStats([]);
            applyFiltersAndRender();
        }
    }

    // 6. Filtering Logic
    function applyFiltersAndRender() {
        currentFilteredData = globalMatchData.filter(match => {
            // 1. Check Win/Loss Filter
            const passesFilter = (currentFilter === 'all') || (match.result === currentFilter);
            // 2. Check Search Bar
            const passesSearch = match.opponent_name.toLowerCase().includes(searchQuery);
            
            return passesFilter && passesSearch;
        });

        // Reset to page 1 whenever a filter or search changes
        currentPage = 1; 
        renderLogs();
    }

    // 7. Calculate Top Stats (Always uses full globalMatchData)
    function renderStats(matches) {
        if (!matches || matches.length === 0) return;

        let wins = 0;
        let losses = 0;
        let netElo = 0;
        
        matches.forEach(match => {
            if (match.result === 'win') wins++;
            else losses++;
            netElo += match.elo_change;
        });

        const total = wins + losses;
        const winrate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";

        statTotalMatches.innerText = total;
        statWinrate.innerText = winrate;
        statWLRatio.innerText = `${wins} W / ${losses} L`;
        statNetElo.innerText = netElo > 0 ? `+${netElo}` : netElo;
        widgetCombatScore.innerText = (wins * 150) + (netElo * 2);

        if (total > 0) {
            const opponentCounts = {};
            matches.forEach(m => {
                opponentCounts[m.opponent_name] = (opponentCounts[m.opponent_name] || 0) + 1;
            });
            const nemesisName = Object.keys(opponentCounts).reduce((a, b) => opponentCounts[a] > opponentCounts[b] ? a : b);
            statNemesis.innerText = nemesisName.toUpperCase();
        }
    }

    // 8. Draw the Table with Pagination
    function renderLogs() {
        logsContainer.innerHTML = ''; 

        const total = currentFilteredData.length;
        const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
        
        // Calculate slicing indices for pagination
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, total);
        const pageData = currentFilteredData.slice(startIdx, endIdx);

        // Update Pagination UI
        pgInfo.innerText = `Showing ${total > 0 ? startIdx + 1 : 0} to ${endIdx} of ${total} records`;
        pgInd.innerText = `Page ${currentPage.toString().padStart(2, '0')} / ${totalPages.toString().padStart(2, '0')}`;
        btnPrev.disabled = currentPage === 1;
        btnNext.disabled = currentPage === totalPages;

        // Draw empty state if no matches pass the filter
        if (pageData.length === 0) {
            const emptyClone = templateEmpty.content.cloneNode(true);
            logsContainer.appendChild(emptyClone);
            return;
        }

        const fragment = document.createDocumentFragment();

        // Loop through only the current page of data
        pageData.forEach(match => {
            const isWin = match.result === 'win';
            const logClone = templateLog.content.cloneNode(true);
            const entryWrapper = logClone.querySelector('.log-entry');

            entryWrapper.classList.add(isWin ? 'is-win' : 'is-loss');

            logClone.querySelector('.js-date').innerText = formatDate(match.timestamp);
            logClone.querySelector('.js-result-text').innerText = isWin ? 'VICTORY' : 'DEFEAT';
            logClone.querySelector('.js-avatar').innerText = getInitials(match.opponent_name);
            logClone.querySelector('.js-name').innerText = match.opponent_name;
            logClone.querySelector('.js-rank').innerText = `${match.opponent_rank} RANKING`;
            logClone.querySelector('.js-score-change').innerText = isWin ? `+${match.elo_change}` : match.elo_change;

            fragment.appendChild(logClone);
        });

        logsContainer.appendChild(fragment);
    }

    // Fetch data to kick off the page
    fetchCombatLogs();
});