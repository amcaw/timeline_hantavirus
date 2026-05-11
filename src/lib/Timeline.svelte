<script>
    import { onMount } from 'svelte';
    import { initPym, sendHeight } from './pym.js';
    import headerWebp from './assets/header.webp';
    import headerJpg from './assets/header.jpg';

    const headerBgStyle = `background-image: url('${headerJpg}'); background-image: image-set(url('${headerWebp}') type('image/webp'), url('${headerJpg}') type('image/jpeg'));`;

    initPym();

    const CSV_URL = import.meta.env.VITE_TIMELINE_CSV_URL;

    // Stats and Meta tabs live in the same published spreadsheet — swap the
    // gid query param so we only need one secret. If a different doc is ever
    // used, derived URLs fall back to undefined and their UI hides.
    const STATS_GID = '1860557328';
    const META_GID = '1579613166';
    const RECAP_GID = '1724016172';
    function withGid(url, gid) {
        if (!url) return null;
        return url.replace(/([?&])gid=\d+/, `$1gid=${gid}`);
    }
    const STATS_CSV_URL = withGid(CSV_URL, STATS_GID);
    const META_CSV_URL = withGid(CSV_URL, META_GID);
    const RECAP_CSV_URL = withGid(CSV_URL, RECAP_GID);

    let events = $state([]);
    let stats = $state([]);
    let lastUpdated = $state('');
    let recap = $state('');
    let loading = $state(true);
    let error = $state(null);
    let openCards = $state(new Set());

    const ALL_TYPES = ['departure', 'death', 'case', 'discovery', 'action'];
    const TYPE_LABELS = {
        departure: 'Embarquement / Navigation',
        death: 'Décès',
        case: 'Cas confirmés / suspects',
        discovery: 'Identification souche',
        action: 'Actions / Évacuation'
    };

    let activeTypes = $state(new Set(ALL_TYPES));
    let sortOrder = $state('recent'); // 'chrono' | 'recent'
    let showAll = $state(false);
    const INITIAL_LIMIT = 10;
    const PREVIEW_COUNT = 2; // how many faded "next events" peek behind the button

    function toggleType(type) {
        const next = new Set(activeTypes);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        activeTypes = next;
        setTimeout(() => sendHeight(), 60);
    }

    function setSort(order) {
        sortOrder = order;
        setTimeout(() => sendHeight(), 60);
    }

    function toggleShowAll() {
        showAll = !showAll;
        setTimeout(() => sendHeight(), 60);
    }

    function parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length === 0) return [];
        const headers = parseCSVLine(lines[0]);
        return lines.slice(1).map(line => {
            const values = parseCSVLine(line);
            const obj = {};
            headers.forEach((h, i) => {
                obj[h.trim()] = (values[i] || '').trim();
            });
            return obj;
        });
    }

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (ch === '"') {
                    inQuotes = false;
                } else {
                    current += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    result.push(current);
                    current = '';
                } else {
                    current += ch;
                }
            }
        }
        result.push(current);
        return result;
    }

    const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const MONTHS_FR_SHORT = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];

    function parseDate(str) {
        if (!str) return null;
        const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) return null;
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        if (month < 1 || month > 12) return null;
        return { day, month, year };
    }

    function dayLabel(day) {
        return day === 1 ? '1<sup>er</sup>' : String(day);
    }

    function buildDateDisplay(start, end) {
        if (!start) return { day: '', month: '' };
        if (!end) {
            return { day: dayLabel(start.day), month: MONTHS_FR[start.month - 1] };
        }
        if (start.month === end.month && start.year === end.year) {
            return { day: `${start.day}-${end.day}`, month: MONTHS_FR[start.month - 1] };
        }
        return {
            day: `${start.day} ${MONTHS_FR_SHORT[start.month - 1]} - ${end.day} ${MONTHS_FR_SHORT[end.month - 1]}`,
            month: ''
        };
    }

    let groupedEvents = $derived.by(() => {
        const filtered = events.filter(ev => {
            const t = (ev.Type || '').toLowerCase();
            return activeTypes.has(t);
        });

        const enrichedList = filtered.map((ev, csvIndex) => {
            const start = parseDate(ev.Start_date);
            const end = parseDate(ev.End_date);
            const display = buildDateDisplay(start, end);
            const sortKey = start ? start.year * 10000 + start.month * 100 + start.day : 0;
            return {
                ...ev,
                _start: start,
                _sortKey: sortKey,
                _csvIndex: csvIndex,
                _dayDisplay: display.day,
                _monthDisplay: display.month
            };
        });

        // Same-date events: in 'recent' mode the *last* CSV row should be
        // on top (newest entry wins), in 'chrono' it stays in CSV order.
        enrichedList.sort((a, b) => {
            if (a._sortKey !== b._sortKey) {
                return sortOrder === 'recent' ? b._sortKey - a._sortKey : a._sortKey - b._sortKey;
            }
            return sortOrder === 'recent' ? b._csvIndex - a._csvIndex : a._csvIndex - b._csvIndex;
        });

        const visibleCount = showAll ? enrichedList.length : Math.min(enrichedList.length, INITIAL_LIMIT + PREVIEW_COUNT);
        const visibleList = enrichedList.slice(0, visibleCount);

        const groups = [];
        let currentLabel = null;
        let currentList = null;
        for (let idx = 0; idx < visibleList.length; idx++) {
            const ev = visibleList[idx];
            const label = ev._start ? `${MONTHS_FR[ev._start.month - 1]} ${ev._start.year}` : '';
            // Mark preview events (the faded "peek" rows behind the button).
            // Only when collapsed AND past the initial limit.
            ev._previewRank = !showAll && idx >= INITIAL_LIMIT ? idx - INITIAL_LIMIT + 1 : 0;
            if (label !== currentLabel) {
                currentLabel = label;
                currentList = [];
                groups.push({ label, items: currentList });
            }
            currentList.push(ev);
        }
        return { groups, total: enrichedList.length, visible: visibleList.length };
    });

    async function fetchCSV(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return parseCSV(await res.text());
    }

    onMount(async () => {
        try {
            const [eventsRows, statsRows, metaRows, recapRows] = await Promise.all([
                fetchCSV(CSV_URL),
                STATS_CSV_URL ? fetchCSV(STATS_CSV_URL) : Promise.resolve([]),
                META_CSV_URL ? fetchCSV(META_CSV_URL) : Promise.resolve([]),
                RECAP_CSV_URL ? fetchCSV(RECAP_CSV_URL) : Promise.resolve([])
            ]);
            events = eventsRows;
            stats = statsRows;
            const updatedRow = metaRows.find(r => (r.Key || '').toLowerCase() === 'last_updated');
            if (updatedRow) lastUpdated = updatedRow.Value || '';
            const recapRow = recapRows.find(r => r.Le_Recap);
            if (recapRow) recap = recapRow.Le_Recap;
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
            sendHeight();
        }
    });

    function toggleCard(key) {
        const next = new Set(openCards);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        openCards = next;
        setTimeout(() => sendHeight(), 60);
    }

    function dotClass(type) {
        const t = (type || '').toLowerCase();
        if (t === 'death') return 'dot-death';
        if (t === 'case') return 'dot-case';
        if (t === 'departure') return 'dot-departure';
        if (t === 'action') return 'dot-action';
        if (t === 'discovery') return 'dot-discovery';
        return '';
    }

    function tagClass(type) {
        const t = (type || '').toLowerCase();
        if (t === 'death') return 'tag-death';
        if (t === 'case') return 'tag-case';
        if (t === 'departure') return 'tag-departure';
        if (t === 'action') return 'tag-action';
        if (t === 'discovery') return 'tag-discovery';
        return '';
    }
</script>

<div id="my-timeline-container">
    <div class="tl-wrap">
        <div class="tl-header">
            <div class="tl-header-bg" style={headerBgStyle}></div>
            <div class="tl-header-content">
                <h1 class="tl-title">Hantavirus sur le <em>Hondius</em> : Comment le virus s'est transmis d'humain à humain</h1>
            </div>
        </div>

        {#if stats.length > 0}
            <div class="tl-stats">
                {#each stats as s, i}
                    <div class="tl-stat-item {i === stats.length - 1 ? 'item-red' : ''}">
                        <span class="tl-stat-val">{s.Total || ''}</span>
                        <span class="tl-stat-lab">{s.Label || ''}</span>
                    </div>
                {/each}
            </div>
        {/if}

        {#if recap}
            <p class="tl-recap">{@html recap}</p>
        {/if}

        <div class="tl-controls">
            <div class="tl-control-row">
                <span class="tl-control-label">Filtrer les catégories&nbsp;:</span>
                <div class="tl-legend">
                    {#each ALL_TYPES as t}
                        <button
                            type="button"
                            class="tl-leg-item {activeTypes.has(t) ? 'active' : 'inactive'}"
                            onclick={() => toggleType(t)}
                            aria-pressed={activeTypes.has(t)}
                        >
                            <div class="tl-dot {dotClass(t)}"></div>
                            {TYPE_LABELS[t]}
                        </button>
                    {/each}
                </div>
            </div>
            <div class="tl-control-row">
                <span class="tl-control-label">Trier&nbsp;:</span>
                <div class="tl-sort">
                    <button
                        type="button"
                        class="tl-sort-btn {sortOrder === 'chrono' ? 'active' : ''}"
                        onclick={() => setSort('chrono')}
                        aria-pressed={sortOrder === 'chrono'}
                    >Chronologique</button>
                    <button
                        type="button"
                        class="tl-sort-btn {sortOrder === 'recent' ? 'active' : ''}"
                        onclick={() => setSort('recent')}
                        aria-pressed={sortOrder === 'recent'}
                    >Le plus récent en premier</button>
                </div>
            </div>
        </div>

        {#if loading}
            <div class="tl-loader">
                <div class="tl-loader-dots"><span></span><span></span><span></span></div>
                <p>Chargement de la timeline</p>
            </div>
        {:else if error}
            <p class="tl-state-msg error">Erreur : {error}</p>
        {:else if groupedEvents.total === 0}
            <p class="tl-state-msg">Aucun événement à afficher. Activez au moins une catégorie ci-dessus.</p>
        {:else}
            <p class="tl-hint">
                <span class="tl-hint-desktop">Cliquez sur un événement pour en savoir plus.</span>
                <span class="tl-hint-touch">Touchez un événement pour en savoir plus.</span>
            </p>
            <div class="tl-body {!showAll && groupedEvents.total > INITIAL_LIMIT ? 'tl-body-collapsed' : ''}">
                <div class="tl-timeline">
                    {#each groupedEvents.groups as group}
                        {#if group.label}
                            <div class="tl-month">
                                <span class="tl-month-label">{group.label}</span>
                                <div class="tl-month-line"></div>
                            </div>
                        {/if}
                        {#each group.items as ev, i (ev.Title + '|' + ev.Start_date + '|' + i)}
                            {@const key = ev.Title + '|' + ev.Start_date}
                            {@const open = openCards.has(key)}
                            <div class="tl-event {ev._previewRank ? 'tl-event-preview tl-event-preview-' + ev._previewRank : ''}">
                                <div class="tl-event-date {!ev._monthDisplay ? 'tl-event-date-wide' : ''}">
                                    <span class="date-day">{@html ev._dayDisplay}</span>
                                    {#if ev._monthDisplay}
                                        <span class="date-month">{ev._monthDisplay}</span>
                                    {/if}
                                </div>
                                <div class="tl-event-node">
                                    <div class="tl-dot {dotClass(ev.Type)}"></div>
                                </div>
                                <div class="tl-event-content">
                                    <div class="tl-connector"></div>
                                    <div
                                        class="tl-card {open ? 'open' : ''}"
                                        onclick={() => toggleCard(key)}
                                        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCard(key); } }}
                                        role="button"
                                        tabindex="0"
                                    >
                                        <div class="tl-card-top">
                                            <div class="tl-card-title">{ev.Title || ''}</div>
                                            <div class="tl-card-right">
                                                {#if ev.Tag_label}
                                                    <span class="tl-tag {tagClass(ev.Type)}">{ev.Tag_label}</span>
                                                {/if}
                                                <span class="tl-toggle">{open ? '−' : '+'}</span>
                                            </div>
                                        </div>
                                        <div class="tl-card-body">
                                            {#if ev.Image_url}
                                                <figure class="tl-event-image">
                                                    <img class="tl-event-image-img" src={ev.Image_url} alt={ev.Title || ''} loading="lazy" />
                                                    {#if ev.Image_caption}
                                                        <figcaption class="tl-event-image-caption">{ev.Image_caption}</figcaption>
                                                    {/if}
                                                </figure>
                                            {/if}
                                            {@html ev.Body || ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {/each}
                </div>
                {#if groupedEvents.total > INITIAL_LIMIT}
                    <div class="tl-show-more {!showAll ? 'tl-show-more-overlay' : ''}">
                        <button type="button" class="tl-show-more-btn" onclick={toggleShowAll}>
                            {#if showAll}
                                Voir seulement les {INITIAL_LIMIT} premiers
                            {:else}
                                Voir tous les événements ({groupedEvents.total})
                            {/if}
                        </button>
                    </div>
                {/if}
            </div>
        {/if}

        <div class="tl-footer">
            <span>Sources : OMS · Min. Santé (Argentine, SA)</span>
            {#if lastUpdated}
                <span>Dernière mise à jour : {lastUpdated}</span>
            {/if}
        </div>
    </div>
</div>
