function (event, funcs) {
    // Surge XT panel for MOD UI. Parameters are LV2 patch parameters (written with patch_set).
    var BASE = 'https://surge-synthesizer.github.io/lv2/surge-xt:';
    var PATCHES = /*__PATCHES__*/[];          // [[category, name], ...] in plugin order
    var PATCH_PARAM = BASE + 'surgext-mod-patch';
    var ORANGE = '#ff9f2e';

    function secs(x) { return Math.pow(2, -8 + 13 * x); }
    function fmtTime(x) {
        var s = secs(x);
        return s < 1 ? (s * 1000).toFixed(s < 0.01 ? 1 : 0) + ' ms' : s.toFixed(s < 10 ? 2 : 1) + ' s';
    }
    function hz(x) { return 440 * Math.pow(2, (-60 + 130 * x) / 12); }
    function fmtHz(x) { var f = hz(x); return f < 1000 ? f.toFixed(0) + ' Hz' : (f / 1000).toFixed(2) + ' kHz'; }
    function fmtPct(x) { return (x * 100).toFixed(0) + '%'; }
    function fmtBi(x) { var v = (x * 2 - 1) * 100; return (v > 0 ? '+' : '') + v.toFixed(0) + '%'; }

    // id, label, formatter, default shown before the host reports a value
    var KNOBS = {
        cutoff:  ['a_filter1_cutoff',    'Cutoff',  fmtHz,   0.5],
        res:     ['a_filter1_resonance', 'Reso',    fmtPct,  0.0],
        envmod:  ['a_filter1_envmod',    'Env amt', fmtBi,   0.5],
        a_vol:   ['a_volume',            'Level',   fmtPct,  0.8],
        g_vol:   ['volume',              'Master',  fmtPct,  0.8],
        o1:      ['a_level_o1',          'Osc 1',   fmtPct,  0.8],
        o2:      ['a_level_o2',          'Osc 2',   fmtPct,  0.0],
        o3:      ['a_level_o3',          'Osc 3',   fmtPct,  0.0]
    };
    ['a', 'd', 's', 'r'].forEach(function (k, i) {
        var nm = ['Attack', 'Decay', 'Sustain', 'Release'][i];
        var fm = k === 's' ? fmtPct : fmtTime;
        KNOBS['aeg_' + k] = ['a_env1_' + {a:'attack', d:'decay', s:'sustain', r:'release'}[k], nm, fm, 0.5];
        KNOBS['feg_' + k] = ['a_env2_' + {a:'attack', d:'decay', s:'sustain', r:'release'}[k], nm, fm, 0.5];
    });
    for (var m = 0; m < 8; m++) { KNOBS['m' + m] = ['macro_' + m, 'M' + (m + 1), fmtPct, 0.0]; }

    function sendLimited(d, uri, v) {
        d.pending[uri] = v;
        if (d.timer) return;
        d.timer = setTimeout(function () {
            d.timer = null;
            for (var u in d.pending) { funcs.patch_set(u, 'f', d.pending[u]); }
            d.pending = {};
        }, 40);
    }

    function drawKnob(cv, v, bipolar) {
        var c = cv.getContext('2d'), w = cv.width, h = cv.height, r = w / 2 - 5;
        c.clearRect(0, 0, w, h);
        var a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, av = a0 + (a1 - a0) * v;
        c.lineWidth = 5; c.lineCap = 'round';
        c.strokeStyle = '#303844'; c.beginPath(); c.arc(w / 2, h / 2, r, a0, a1); c.stroke();
        c.strokeStyle = ORANGE; c.beginPath();
        if (bipolar) { c.arc(w / 2, h / 2, r, Math.min(av, Math.PI * 1.5), Math.max(av, Math.PI * 1.5)); }
        else { c.arc(w / 2, h / 2, r, a0, av); }
        c.stroke();
        c.strokeStyle = '#e9edf3'; c.lineWidth = 3; c.beginPath();
        c.moveTo(w / 2 + Math.cos(av) * (r - 14), h / 2 + Math.sin(av) * (r - 14));
        c.lineTo(w / 2 + Math.cos(av) * (r - 3), h / 2 + Math.sin(av) * (r - 3));
        c.stroke();
    }

    function drawEnv(cv, g) {
        var c = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 6;
        c.clearRect(0, 0, W, H);
        var a = g('a'), d = g('d'), s = g('s'), r = g('r');
        var wa = 0.06 + a * 0.30, wd = 0.06 + d * 0.30, wh = 0.16, wr = 0.06 + r * 0.30;
        var tot = wa + wd + wh + wr, sx = (W - 2 * pad) / tot, base = H - pad, top = pad + 2;
        var x0 = pad, x1 = x0 + wa * sx, x2 = x1 + wd * sx, x3 = x2 + wh * sx, x4 = x3 + wr * sx;
        var ys = base - (base - top) * s;
        function ease(t) { return 1 - (1 - t) * (1 - t); }
        c.beginPath(); c.moveTo(x0, base);
        var i, t;
        for (i = 1; i <= 24; i++) { t = i / 24; c.lineTo(x0 + (x1 - x0) * t, base - (base - top) * ease(t)); }
        for (i = 1; i <= 24; i++) { t = i / 24; c.lineTo(x1 + (x2 - x1) * t, ys + (top - ys) * (1 - t) * (1 - t)); }
        c.lineTo(x3, ys);
        for (i = 1; i <= 24; i++) { t = i / 24; c.lineTo(x3 + (x4 - x3) * t, base - (base - ys) * (1 - t) * (1 - t)); }
        c.lineTo(x4, base);
        c.strokeStyle = ORANGE; c.lineWidth = 2; c.stroke();
        c.lineTo(x0, base); c.fillStyle = 'rgba(255,159,46,0.18)'; c.fill();
        c.strokeStyle = '#3a4350'; c.lineWidth = 1; c.setLineDash([3, 3]);
        [x1, x2, x3].forEach(function (x) { c.beginPath(); c.moveTo(x, top); c.lineTo(x, base); c.stroke(); });
        c.setLineDash([]);
    }

    function drawFilter(cv, cut, res) {
        var c = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 6;
        c.clearRect(0, 0, W, H);
        var fc = hz(cut), q = 0.707 + res * 9, dbMin = -48, dbMax = 24;
        c.beginPath();
        for (var i = 0; i <= 160; i++) {
            var f = 20 * Math.pow(1000, i / 160), u = f / fc;
            var mag = 1 / Math.sqrt(Math.pow(1 - u * u, 2) + Math.pow(u / q, 2));
            var db = Math.max(dbMin, Math.min(dbMax, 20 * Math.log(mag) / Math.LN10));
            var x = pad + (W - 2 * pad) * i / 160, y = pad + (H - 2 * pad) * (1 - (db - dbMin) / (dbMax - dbMin));
            if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.strokeStyle = ORANGE; c.lineWidth = 2; c.stroke();
        c.lineTo(W - pad, H - pad); c.lineTo(pad, H - pad); c.fillStyle = 'rgba(255,159,46,0.18)'; c.fill();
    }

    function build(d) {
        var icon = d.icon, root = icon.find('.sx-root')[0];
        var cats = [], seen = {};
        PATCHES.forEach(function (p) { if (!seen[p[0]]) { seen[p[0]] = 1; cats.push(p[0]); } });
        var h = '<div class="sx-top"><span class="sx-title">SURGE XT</span>' +
            '<button class="sx-prev">&#9664;</button>' +
            '<select class="sx-cat">' + cats.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>' +
            '<select class="sx-pat"></select>' +
            '<button class="sx-next">&#9654;</button>' +
            '<div class="sx-namebox"><div class="sx-name">-</div><div class="sx-sub"></div></div></div>' +
            '<div class="sx-body">' +
            '<div class="sx-col" style="width:300px">' +
              '<div class="sx-card"><h4>Amp envelope</h4><canvas class="sx-graph sx-g-aeg" width="560" height="140"></canvas><div class="sx-row" data-k="aeg_a,aeg_d,aeg_s,aeg_r"></div></div>' +
              '<div class="sx-card"><h4>Filter envelope</h4><canvas class="sx-graph sx-g-feg" width="560" height="140"></canvas><div class="sx-row" data-k="feg_a,feg_d,feg_s,feg_r"></div></div>' +
            '</div>' +
            '<div class="sx-col" style="width:300px">' +
              '<div class="sx-card"><h4>Filter (schematic)</h4><canvas class="sx-graph sx-g-flt" width="560" height="140"></canvas><div class="sx-row" data-k="cutoff,res,envmod"></div></div>' +
              '<div class="sx-card"><h4>Mixer / Output</h4><div class="sx-row" data-k="o1,o2,o3"></div><div class="sx-row" data-k="a_vol,g_vol"></div></div>' +
            '</div>' +
            '<div class="sx-col" style="flex:1">' +
              '<div class="sx-card"><h4>Macros</h4><div class="sx-row" data-k="m0,m1,m2,m3"></div><div class="sx-row" data-k="m4,m5,m6,m7"></div></div>' +
              '<div class="sx-card"><h4>My presets</h4><select class="sx-mine"></select>' +
                '<div class="sx-btnrow"><button class="sx-saveas">Save as&hellip;</button></div><div class="sx-status"></div></div>' +
            '</div></div>' +
            '<div class="sx-modal" hidden><div class="sx-dialog"><div class="sx-dlg-title">Save preset as</div>' +
              '<input class="sx-name-in" type="text" maxlength="60" spellcheck="false">' +
              '<div class="sx-hint"></div>' +
              '<div class="sx-dlg-btns"><button class="sx-cancel">Cancel</button><button class="sx-ok">Save</button></div></div></div>';
        root.innerHTML = h;
        d.root = root; d.knobs = {};
        $(root).find('.sx-row').each(function () {
            var row = this;
            this.getAttribute('data-k').split(',').forEach(function (key) {
                var def = KNOBS[key], el = document.createElement('div');
                el.className = 'sx-knob';
                el.innerHTML = '<canvas width="104" height="104"></canvas><div class="sx-val"></div><div class="sx-label">' + def[1] + '</div>';
                row.appendChild(el);
                var k = { key: key, uri: BASE + def[0], fmt: def[2], v: d.values[BASE + def[0]], el: el,
                          cv: el.querySelector('canvas'), txt: el.querySelector('.sx-val'), bi: key === 'envmod' };
                if (k.v === undefined) k.v = def[3];
                d.knobs[key] = k;
                var drag = null;
                el.addEventListener('pointerdown', function (e) { drag = { y: e.clientY, v: k.v }; el.setPointerCapture(e.pointerId); e.preventDefault(); });
                el.addEventListener('pointermove', function (e) {
                    if (!drag) return;
                    var nv = Math.max(0, Math.min(1, drag.v + (drag.y - e.clientY) / (e.shiftKey ? 800 : 200)));
                    setKnob(d, k, nv, true);
                });
                el.addEventListener('pointerup', function () { drag = null; });
                el.addEventListener('dblclick', function () { setKnob(d, k, def[3], true); });
            });
        });
        var $cat = $(root).find('.sx-cat'), $pat = $(root).find('.sx-pat');
        function fillPatches(cat, keepIdx) {
            var html = '';
            PATCHES.forEach(function (p, i) { if (p[0] === cat) html += '<option value="' + i + '">' + p[1] + '</option>'; });
            $pat.html(html);
            if (keepIdx !== undefined) $pat.val(String(keepIdx));
        }
        d.fillPatches = fillPatches;
        $cat.on('change', function () { fillPatches($cat.val()); var f = $pat.find('option').first().val(); if (f !== undefined) choose(d, parseInt(f, 10)); });
        $pat.on('change', function () { choose(d, parseInt($pat.val(), 10)); });
        $(root).find('.sx-prev').on('click', function () { choose(d, (d.patchIdx - 1 + PATCHES.length) % PATCHES.length); });
        $(root).find('.sx-next').on('click', function () { choose(d, (d.patchIdx + 1) % PATCHES.length); });
        wirePresets(d);
        Object.keys(d.knobs).forEach(function (key) { setKnob(d, d.knobs[key], d.knobs[key].v, false); });
        showPatch(d);
        redrawGraphs(d);
    }

    // ---- saved presets (MOD's own preset system: saves the complete Surge state) ----
    function readSavedPresets(d, settings) {
        var list = [];
        try {
            settings.find('.mod-preset-user [mod-role=enumeration-option]').each(function () {
                var el = $(this), uri = el.attr('mod-uri');
                if (uri) list.push({ uri: uri, path: el.attr('mod-path') || '', name: $.trim(el.text()) });
            });
        } catch (e) { }
        return list;
    }

    function status(d, msg) {
        var el = d.root.querySelector('.sx-status');
        el.textContent = msg;
        clearTimeout(d.statusTimer);
        d.statusTimer = setTimeout(function () { el.textContent = ''; }, 4000);
    }

    function refreshMine(d, selectUri) {
        var sel = $(d.root).find('.sx-mine'), html = '<option value="">- saved presets (' + d.mine.length + ') -</option>';
        d.mine.forEach(function (m) {
            html += '<option value="' + $('<div>').text(m.uri).html().replace(/"/g, '&quot;') + '">' + $('<div>').text(m.name).html() + '</option>';
        });
        sel.html(html);
        sel.val(selectUri || '');
    }

    function refreshAll(d) {
        // ask the host for every value again, e.g. after a preset or patch was loaded
        [350, 1200].forEach(function (ms) {
            setTimeout(function () {
                Object.keys(d.knobs).forEach(function (k) { funcs.patch_get(d.knobs[k].uri); });
            }, ms);
        });
    }

    function currentName(d) {
        if (d.userName) return d.userName;
        var p = PATCHES[d.patchIdx];
        return p ? p[1] : 'Surge XT';
    }

    function openSaveDialog(d) {
        var modal = d.root.querySelector('.sx-modal'), input = modal.querySelector('.sx-name-in');
        input.value = currentName(d);
        updateHint(d);
        modal.hidden = false;
        input.focus();
        input.select();
    }

    function updateHint(d) {
        var modal = d.root.querySelector('.sx-modal'), name = $.trim(modal.querySelector('.sx-name-in').value);
        var exists = d.mine.some(function (m) { return m.name === name; });
        modal.querySelector('.sx-hint').textContent = !name ? 'Give the preset a name' :
            (exists ? 'A preset with this name exists - it will be replaced' : '');
        modal.querySelector('.sx-ok').disabled = !name;
    }

    function doSave(d) {
        var modal = d.root.querySelector('.sx-modal'), name = $.trim(modal.querySelector('.sx-name-in').value);
        if (!name) return;
        modal.hidden = true;
        var existing = null;
        d.mine.forEach(function (m) { if (m.name === name && m.path) existing = m; });
        var url, data;
        if (existing) {
            url = '/effect/preset/save_replace/' + d.instance;
            data = { uri: existing.uri, bundle: existing.path, name: name };
        } else {
            url = '/effect/preset/save_new/' + d.instance;
            data = { name: name };
        }
        $.ajax({
            url: url, data: data, dataType: 'json', cache: false,
            success: function (resp) {
                if (!resp || !resp.ok) { status(d, 'Saving failed'); return; }
                if (existing) { existing.uri = resp.uri; existing.path = resp.bundle; }
                else { existing = { uri: resp.uri, path: resp.bundle, name: name }; d.mine.push(existing); }
                d.userName = name;
                refreshMine(d, existing.uri);
                showPatch(d);
                status(d, 'Saved "' + name + '"');
            },
            error: function () { status(d, 'Saving failed'); }
        });
    }

    function loadSaved(d, uri) {
        var item = null;
        d.mine.forEach(function (m) { if (m.uri === uri) item = m; });
        if (!item) return;
        $.ajax({
            url: '/effect/preset/load/' + d.instance, data: { uri: uri }, dataType: 'json', cache: false,
            success: function () {
                d.userName = item.name;
                showPatch(d);
                status(d, 'Loaded "' + item.name + '"');
                refreshAll(d);
            },
            error: function () { status(d, 'Loading failed'); }
        });
    }

    function wirePresets(d) {
        var $r = $(d.root);
        refreshMine(d, '');
        $r.find('.sx-saveas').on('click', function () { openSaveDialog(d); });
        $r.find('.sx-mine').on('change', function () { var v = $(this).val(); if (v) loadSaved(d, v); });
        $r.find('.sx-cancel').on('click', function () { d.root.querySelector('.sx-modal').hidden = true; });
        $r.find('.sx-ok').on('click', function () { doSave(d); });
        $r.find('.sx-name-in').on('input', function () { updateHint(d); })
            .on('keydown', function (e) {
                e.stopPropagation();
                if (e.key === 'Enter') { doSave(d); }
                else if (e.key === 'Escape') { d.root.querySelector('.sx-modal').hidden = true; }
            })
            .on('keyup keypress', function (e) { e.stopPropagation(); });
    }

    function setKnob(d, k, v, send) {
        k.v = v;
        drawKnob(k.cv, v, k.bi);
        k.txt.textContent = k.fmt(v);
        if (send) sendLimited(d, k.uri, v);
        redrawGraphs(d);
    }

    function choose(d, idx) {
        if (!PATCHES.length) return;
        d.patchIdx = idx;
        var v = PATCHES.length > 1 ? idx / (PATCHES.length - 1) : 0;
        d.values[PATCH_PARAM] = v;
        funcs.patch_set(PATCH_PARAM, 'f', v);
        d.userName = null;
        showPatch(d);
        refreshAll(d);
    }

    function showPatch(d) {
        var root = d.root;
        if (!root) return;
        if (d.userName) {
            root.querySelector('.sx-name').textContent = d.userName;
            root.querySelector('.sx-sub').textContent = 'My preset';
            return;
        }
        var p = PATCHES[d.patchIdx];
        if (!p) { root.querySelector('.sx-name').textContent = 'Surge XT'; return; }
        root.querySelector('.sx-name').textContent = p[1];
        root.querySelector('.sx-sub').textContent = p[0] + '  (' + (d.patchIdx + 1) + '/' + PATCHES.length + ')  last selected factory patch';
        $(root).find('.sx-cat').val(p[0]);
        d.fillPatches(p[0], d.patchIdx);
    }

    function redrawGraphs(d) {
        if (!d.knobs) return;
        var K = d.knobs, root = d.root;
        function g(pre) { return function (x) { return K[pre + '_' + x].v; }; }
        drawEnv(root.querySelector('.sx-g-aeg'), g('aeg'));
        drawEnv(root.querySelector('.sx-g-feg'), g('feg'));
        drawFilter(root.querySelector('.sx-g-flt'), K.cutoff.v, K.res.v);
    }

    var d = event.data;
    if (event.type === 'start') {
        d.icon = event.icon; d.pending = {}; d.timer = null; d.values = {}; d.patchIdx = 0; d.userName = null;
        d.instance = event.icon.attr('mod-instance') || '';
        d.mine = readSavedPresets(d, event.settings);
        (event.parameters || []).forEach(function (p) { d.values[p.uri] = p.value; });
        if (d.values[PATCH_PARAM] !== undefined && PATCHES.length > 1) {
            d.patchIdx = Math.round(d.values[PATCH_PARAM] * (PATCHES.length - 1));
        }
        build(d);
    } else if (event.type === 'change' && event.uri && d.knobs) {
        if (event.uri === PATCH_PARAM) {
            if (PATCHES.length > 1) { d.patchIdx = Math.round(event.value * (PATCHES.length - 1)); showPatch(d); }
            return;
        }
        for (var key in d.knobs) {
            if (d.knobs[key].uri === event.uri) { setKnob(d, d.knobs[key], event.value, false); break; }
        }
    }
}
