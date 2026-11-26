function (event, funcs) {
    // Surge XT panel for MOD UI. Parameters are LV2 patch parameters (written with patch_set).
    var BASE = 'https://surge-synthesizer.github.io/lv2/surge-xt:';
    var PATCHES = /*__PATCHES__*/[];          // [[category, name], ...] in plugin order
    var PATCH_PARAM = BASE + 'surgext-mod-patch';
    var MACRO_BI_PARAM = BASE + 'surgext-mod-macro-bipolar';   // bit n set = macro n+1 is bipolar
    var ORANGE = '#ff9f2e';

    function secs(x) { return Math.pow(2, -8 + 13 * x); }
    function fmtTime(x) {
        if (x < 0.002) return '0 ms';   // Surge's shortest envelope time is 2^-8 s = 3.9 ms; shown as 0
        var s = secs(x);
        return s < 1 ? (s * 1000).toFixed(s < 0.01 ? 1 : 0) + ' ms' : s.toFixed(s < 10 ? 2 : 1) + ' s';
    }
    function hz(x) { return 440 * Math.pow(2, (-60 + 130 * x) / 12); }
    function fmtHz(x) { var f = hz(x); return f < 1000 ? f.toFixed(0) + ' Hz' : (f / 1000).toFixed(2) + ' kHz'; }
    function fmtPct(x) { return (x * 100).toFixed(0) + '%'; }
    function fmtDb(x) { var v = (x * 2 - 1) * 48; return (v > 0 ? '+' : '') + v.toFixed(1) + ' dB'; }
    function fmtBi(x) { var v = (x * 2 - 1) * 100; return (v > 0 ? '+' : '') + v.toFixed(0) + '%'; }

    function fmtSt7(x) { var v = (x * 2 - 1) * 7; return (v > 0 ? '+' : '') + v.toFixed(2) + ' st'; }
    function fmtDb12(x) { var v = (x * 2 - 1) * 12; return (v > 0 ? '+' : '') + v.toFixed(1) + ' dB'; }
    function fmtVel(x) { return ((x - 1) * 48).toFixed(1) + ' dB'; }
    function fmtHp(x) { var f = 440 * Math.pow(2, (-72 + 87 * x) / 12); return f < 1000 ? f.toFixed(0) + ' Hz' : (f / 1000).toFixed(2) + ' kHz'; }
    function fmtBend(x) { return Math.round(x * 24) + ' st'; }
    var NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    function noteName(i) { return NOTES[i % 12] + (Math.floor(i / 12) - 1); }

    // lists taken from Surge (filter types as [enum index, name, group], waveshapers, play modes ...)
    var FILTERS = [[0,"Off",""],[1,"LP 12 dB","Lowpass"],[2,"LP 24 dB","Lowpass"],[3,"LP Legacy Ladder","Lowpass"],[10,"LP Vintage Ladder","Lowpass"],[13,"LP K35","Lowpass"],[15,"LP Diode Ladder","Lowpass"],[11,"LP OB-Xd 12 dB","Lowpass"],[12,"LP OB-Xd 24 dB","Lowpass"],[16,"LP Cutoff Warp","Lowpass"],[28,"LP Res Warp","Lowpass"],[6,"BP 12 dB","Bandpass"],[23,"BP 24 dB","Bandpass"],[22,"BP OB-Xd 12 dB","Bandpass"],[19,"BP Cutoff Warp","Bandpass"],[31,"BP Res Warp","Bandpass"],[4,"HP 12 dB","Highpass"],[5,"HP 24 dB","Highpass"],[14,"HP K35","Highpass"],[20,"HP OB-Xd 12 dB","Highpass"],[17,"HP Cutoff Warp","Highpass"],[29,"HP Res Warp","Highpass"],[7,"N 12 dB","Notch"],[24,"N 24 dB","Notch"],[21,"N OB-Xd 12 dB","Notch"],[18,"N Cutoff Warp","Notch"],[30,"N Res Warp","Notch"],[34,"MULTI Fast SVF","Multi"],[33,"MULTI Tri-pole","Multi"],[35,"MULTI Xpander","Multi"],[26,"FX Allpass","Effect"],[27,"FX Cutoff Warp AP","Effect"],[32,"FX Res Warp AP","Effect"],[8,"FX Comb +","Effect"],[25,"FX Comb -","Effect"],[9,"FX Sample & Hold","Effect"]], NFILT = 36;
    var WS = ["Off","Soft","Hard","Asymmetric","Sine","Digital","Soft Harmonic 2","Soft Harmonic 3","Soft Harmonic 4","Soft Harmonic 5","Full Wave","Half Wave Positive","Half Wave Negative","Soft Rectifier","Single Fold","Double Fold","West Coast Fold","Additive 1+2","Additive 1+3","Additive 1+4","Additive 1+5","Additive 12345","Additive Saw 3","Additive Square 3","Fuzz","Fuzz Soft Clip","Heavy Fuzz","Fuzz Center","Fuzz Soft Edge","Sin+x","Sin 2x + x","Sin 3x + x","Sin 7x + x","Sin 10x + x","2 Cycle","7 Cycle","10 Cycle","2 Cycle Bound","7 Cycle Bound","10 Cycle Bound","Medium","OJD","Soft Single Fold","Linear Fold","Sine Fold"];
    var PLAYMODES = ['Poly', 'Mono', 'Mono (Single Trigger)', 'Mono (Fingered Portamento)', 'Mono (Single Trigger & Fingered Portamento)', 'Latch (Monophonic)'];
    var FCONFIG = ['Serial 1', 'Serial 2', 'Serial 3', 'Dual 1', 'Dual 2', 'Stereo', 'Ring', 'Wide'];
    var ROUTES = ['F1', 'Both', 'F2'];

    // Every control: key -> [parameter, label, type, options]
    //   type k = knob, h = horizontal slider, v = vertical fader, t = toggle button, s = drop-down list,
    //   n = stepper (- value +), o = octave buttons, r = route button (F1 / Both / F2)
    //   options: fmt (value text), def (normalized default), bi (bipolar display),
    //            min/max (integer parameters: normalized = (i - min) / (max - min)), list (names for s / n)
    var KNOBS = {
        oct:     ['a_octave',        'Octave',     'o', {min: -3, max: 3, def: 3 / 6}],
        pitch:   ['a_pitch',         'Pitch',      'h', {fmt: fmtSt7, def: 0.5, bi: 1}],
        porta:   ['a_portamento',    'Portamento', 'h', {fmt: fmtPct, def: 0}],
        bend_dn: ['a_pbrange_dn',    'Bend down',  'h', {fmt: fmtBend, def: 2 / 24, min: 0, max: 24}],
        bend_up: ['a_pbrange_up',    'Bend up',    'h', {fmt: fmtBend, def: 2 / 24, min: 0, max: 24}],
        playmode:['a_polymode',      'Play mode',  's', {list: PLAYMODES, min: 0, max: 5, def: 0}],
        drift:   ['a_drift',         'Osc drift',  'h', {fmt: fmtPct, def: 0}],
        noisecol:['a_noisecol',      'Noise color','h', {fmt: fmtBi, def: 0.5, bi: 1}],

        f1_type: ['a_filter1_type',  'Filter 1',   's', {filter: 1, def: 1 / 35}],
        f2_type: ['a_filter2_type',  'Filter 2',   's', {filter: 1, def: 0}],
        f1_sub:  ['a_filter1_subtype','Sub',       'n', {min: 0, max: 15, def: 0, pre: 'Sub '}],
        f2_sub:  ['a_filter2_subtype','Sub',       'n', {min: 0, max: 15, def: 0, pre: 'Sub '}],
        cutoff:  ['a_filter1_cutoff','Cutoff',     'h', {fmt: fmtHz, def: 0.5}],
        res:     ['a_filter1_resonance','Resonance','h', {fmt: fmtPct, def: 0}],
        cutoff2: ['a_filter2_cutoff','Cutoff',     'h', {fmt: fmtHz, def: 0.5}],
        res2:    ['a_filter2_resonance','Resonance','h', {fmt: fmtPct, def: 0}],
        fconfig: ['a_fb_config',     'Config',     's', {list: FCONFIG, min: 0, max: 7, def: 0}],
        fbal:    ['a_f_balance',     'Filter balance','h', {fmt: fmtBi, def: 0.5, bi: 1}],
        f2off:   ['a_f2_cf_is_offset','Offset',    't', {def: 0}],
        f2link:  ['a_f2_link_resonance','Link',    't', {def: 0}],
        hp:      ['a_lowcut',        'HP',         'h', {fmt: fmtHp, def: 0}],
        kroot:   ['a_ktrkroot',      'Root key',   'n', {min: 0, max: 127, def: 60 / 127, text: noteName}],
        kt1:     ['a_filter1_keytrack','F1',       'h', {fmt: fmtBi, def: 0.5, bi: 1}],
        kt2:     ['a_filter2_keytrack','F2',       'h', {fmt: fmtBi, def: 0.5, bi: 1}],
        wstype:  ['a_ws_type',       'Waveshaper', 's', {list: WS, min: 0, max: WS.length - 1, def: 0}],
        wsdrive: ['a_ws_drive',      'Drive',      'h', {fmt: fmtDb12, def: 0.5, bi: 1}],

        o1:      ['a_level_o1',      '1',          'v', {fmt: fmtPct, def: 0.8}],
        o2:      ['a_level_o2',      '2',          'v', {fmt: fmtPct, def: 0}],
        o3:      ['a_level_o3',      '3',          'v', {fmt: fmtPct, def: 0}],
        r12:     ['a_level_ring12',  '1x2',        'v', {fmt: fmtPct, def: 0}],
        r23:     ['a_level_ring23',  '2x3',        'v', {fmt: fmtPct, def: 0}],
        noise:   ['a_level_noise',   'N',          'v', {fmt: fmtPct, def: 0}],
        pfg:     ['a_level_pfg',     'Gain',       'v', {fmt: fmtDb, def: 0.5, bi: 1}],

        aeg_a:   ['a_env1_attack',   'A',          'v', {fmt: fmtTime, def: 0.5}],
        aeg_d:   ['a_env1_decay',    'D',          'v', {fmt: fmtTime, def: 0.5}],
        aeg_s:   ['a_env1_sustain',  'S',          'v', {fmt: fmtPct, def: 0.5}],
        aeg_r:   ['a_env1_release',  'R',          'v', {fmt: fmtTime, def: 0.5}],
        aeg_mode:['a_env1_mode',     'Digital',    't', {def: 0, names: ['Digital', 'Analog']}],
        vel:     ['a_vca_velsense',  'Vel',        'v', {fmt: fmtVel, def: 1}],
        gain:    ['a_vca_level',     'Gain',       'v', {fmt: fmtDb, def: 0.5, bi: 1}],
        feg_a:   ['a_env2_attack',   'A',          'v', {fmt: fmtTime, def: 0.5}],
        feg_d:   ['a_env2_decay',    'D',          'v', {fmt: fmtTime, def: 0.5}],
        feg_s:   ['a_env2_sustain',  'S',          'v', {fmt: fmtPct, def: 0.5}],
        feg_r:   ['a_env2_release',  'R',          'v', {fmt: fmtTime, def: 0.5}],
        feg_mode:['a_env2_mode',     'Digital',    't', {def: 0, names: ['Digital', 'Analog']}],
        envmod:  ['a_filter1_envmod','F1',         'v', {fmt: fmtBi, def: 0.5, bi: 1}],
        envmod2: ['a_filter2_envmod','F2',         'v', {fmt: fmtBi, def: 0.5, bi: 1}],

        a_vol:   ['a_volume',        'Volume',     'v', {fmt: fmtPct, def: 0.8}],
        pan:     ['a_pan',           'Pan',        'v', {fmt: fmtBi, def: 0.5, bi: 1}],
        width:   ['a_pan2',          'Width',      'v', {fmt: fmtBi, def: 0.5, bi: 1}],
        fx1:     ['a_send_fx_1',     'FX 1',       'v', {fmt: fmtPct, def: 0}],
        fx2:     ['a_send_fx_2',     'FX 2',       'v', {fmt: fmtPct, def: 0}],
        g_vol:   ['volume',          'Master',     'v', {fmt: fmtPct, def: 0.8}]
    };
    ['o1', 'o2', 'o3', 'ring12', 'ring23', 'noise'].forEach(function (n, i) {
        var key = ['o1', 'o2', 'o3', 'r12', 'r23', 'noise'][i];
        KNOBS['mute_' + key]  = ['a_mute_' + n,  'M', 't', {def: 0}];
        KNOBS['solo_' + key]  = ['a_solo_' + n,  'S', 't', {def: 0}];
        KNOBS['route_' + key] = ['a_route_' + n, '',  'r', {min: 0, max: 2, def: 0.5}];
    });
    for (var m = 0; m < 8; m++) { KNOBS['m' + m] = ['macro_' + m, 'M' + (m + 1), 'k', {fmt: fmtPct, def: 0}]; }

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

    var BLUE = '#35b6ff';
    // Envelope graph. mods = null: plain curve (orange, 0..1). mods = [{amt, color}, ...]: the same envelope
    // drawn once per filter, scaled by that filter's envelope amount (-1..+1) around a centre line.
    function drawEnv(cv, g, mods) {
        var c = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 6;
        c.clearRect(0, 0, W, H);
        var a = g('a'), d = g('d'), s = g('s'), r = g('r');
        var wa = 0.06 + a * 0.30, wd = 0.06 + d * 0.30, wh = 0.16, wr = 0.06 + r * 0.30;
        var tot = wa + wd + wh + wr, sx = (W - 2 * pad) / tot;
        var x0 = pad, x1 = x0 + wa * sx, x2 = x1 + wd * sx, x3 = x2 + wh * sx, x4 = x3 + wr * sx;
        function ease(t) { return 1 - (1 - t) * (1 - t); }
        var pts = [[x0, 0]], i, t;      // [x, envelope value 0..1]
        for (i = 1; i <= 24; i++) { t = i / 24; pts.push([x0 + (x1 - x0) * t, ease(t)]); }
        for (i = 1; i <= 24; i++) { t = i / 24; pts.push([x1 + (x2 - x1) * t, s + (1 - s) * (1 - t) * (1 - t)]); }
        pts.push([x3, s]);
        for (i = 1; i <= 24; i++) { t = i / 24; pts.push([x3 + (x4 - x3) * t, s * (1 - t) * (1 - t)]); }
        pts.push([x4, 0]);
        var base, top, list;
        if (mods) { base = H / 2; top = pad + 2; list = mods; }
        else { base = H - pad; top = pad + 2; list = [{ amt: 1, color: ORANGE }]; }
        c.strokeStyle = '#3a4350'; c.lineWidth = 1; c.setLineDash([3, 3]);
        [x1, x2, x3].forEach(function (x) { c.beginPath(); c.moveTo(x, pad); c.lineTo(x, H - pad); c.stroke(); });
        if (mods) { c.beginPath(); c.moveTo(pad, base); c.lineTo(W - pad, base); c.stroke(); }
        c.setLineDash([]);
        list.forEach(function (m) {
            c.beginPath();
            pts.forEach(function (p, k) { var y = base - (base - top) * p[1] * m.amt; if (k === 0) c.moveTo(p[0], y); else c.lineTo(p[0], y); });
            c.strokeStyle = m.color; c.lineWidth = 2; c.stroke();
            if (!mods) { c.lineTo(x0, base); c.fillStyle = 'rgba(255,159,46,0.18)'; c.fill(); }
        });
        if (mods) {
            c.font = '10px sans-serif'; c.textBaseline = 'top';
            c.fillStyle = ORANGE; c.fillText('F1', W - 44, 3);
            c.fillStyle = BLUE; c.fillText('F2', W - 24, 3);
        }
    }

    // Frequency response of one filter from its type, cutoff and resonance (a schematic, not Surge's exact curve)
    function filterKind(enumIdx) {
        for (var i = 0; i < FILTERS.length; i++) {
            if (FILTERS[i][0] === enumIdx) return { name: FILTERS[i][1], group: FILTERS[i][2] };
        }
        return { name: 'Off', group: '' };
    }
    function drawFilters(cv, K) {
        var c = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 6, dbMin = -48, dbMax = 24;
        c.clearRect(0, 0, W, H);
        function yOf(db) { return pad + (H - 2 * pad) * (1 - (Math.max(dbMin, Math.min(dbMax, db)) - dbMin) / (dbMax - dbMin)); }
        c.strokeStyle = '#2a3038'; c.lineWidth = 1; c.setLineDash([3, 3]);
        [-24, 0, 12].forEach(function (db) { c.beginPath(); c.moveTo(pad, yOf(db)); c.lineTo(W - pad, yOf(db)); c.stroke(); });
        [100, 1000, 10000].forEach(function (f) { var x = pad + (W - 2 * pad) * Math.log(f / 20) / Math.log(1000); c.beginPath(); c.moveTo(x, pad); c.lineTo(x, H - pad); c.stroke(); });
        c.setLineDash([]);
        [[K.f1_type, K.cutoff, K.res, ORANGE], [K.f2_type, K.cutoff2, K.res2, BLUE]].forEach(function (f) {
            var kind = filterKind(Math.round(f[0].v * (NFILT - 1)));
            if (kind.group === '' || kind.group === 'Effect') return;     // off / comb / sample & hold: no curve
            var steep = /24/.test(kind.name), fc = hz(f[1].v), q = 0.707 + f[2].v * 9;
            c.beginPath();
            for (var i = 0; i <= 200; i++) {
                var fr = 20 * Math.pow(1000, i / 200), u = fr / fc;
                var den = Math.sqrt(Math.pow(1 - u * u, 2) + Math.pow(u / q, 2)), mag;
                if (kind.group === 'Highpass') mag = u * u / den;
                else if (kind.group === 'Bandpass') mag = (u / q) / den;
                else if (kind.group === 'Notch') mag = Math.abs(1 - u * u) / den;
                else if (kind.group === 'Allpass') mag = 1;
                else mag = 1 / den;
                if (steep) mag = Math.pow(mag, 2);
                var x = pad + (W - 2 * pad) * i / 200, y = yOf(20 * Math.log(Math.max(mag, 1e-6)) / Math.LN10);
                if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
            }
            c.strokeStyle = f[3]; c.lineWidth = 2; c.stroke();
        });
    }

    function build(d) {
        var icon = d.icon, root = icon.find('.sx-root')[0];
        var h = '<div class="sx-top"><input class="sx-search" type="text" placeholder="Search patches&hellip;" spellcheck="false" autocomplete="off">' +
            '<button class="sx-prev">&#9664;</button>' +
            '<select class="sx-cat"></select>' +
            '<select class="sx-pat"></select>' +
            '<button class="sx-next">&#9654;</button>' +
            '<button class="sx-saveas" title="Save the current sound as a preset">Save as&hellip;</button>' +
            '<div class="sx-namebox"><div class="sx-name">-</div><div class="sx-sub"></div></div></div>' +
            '<div class="sx-body">' +
            '<div class="sx-r sx-r1">' +
              '<div class="sx-card sx-c-scene"><h4>Scene</h4>' +
                '<div class="sx-line"><span class="sx-c" data-c="oct"></span><span class="sx-c" data-c="pitch"></span><span class="sx-c" data-c="porta"></span></div>' +
                '<div class="sx-line"><span class="sx-c" data-c="bend_dn"></span><span class="sx-c" data-c="bend_up"></span><span class="sx-c" data-c="playmode"></span></div>' +
                '<div class="sx-line"><span class="sx-c" data-c="drift"></span><span class="sx-c" data-c="noisecol"></span></div>' +
                '<div class="sx-line"><span class="sx-c" data-c="wstype"></span><span class="sx-c" data-c="wsdrive"></span></div></div>' +
              '<div class="sx-card sx-c-filt"><h4>Filters</h4>' +
                '<div class="sx-line"><span class="sx-c" data-c="f1_type"></span><span class="sx-c" data-c="f1_sub"></span><span class="sx-c" data-c="cutoff"></span><span class="sx-c" data-c="res"></span><span class="sx-c" data-c="kt1"></span></div>' +
                '<div class="sx-line"><span class="sx-c" data-c="f2_type"></span><span class="sx-c" data-c="f2_sub"></span><span class="sx-c" data-c="cutoff2"></span><span class="sx-c" data-c="res2"></span><span class="sx-c" data-c="kt2"></span></div>' +
                '<div class="sx-line"><span class="sx-c" data-c="fconfig"></span><span class="sx-c" data-c="fbal"></span><span class="sx-c" data-c="f2off"></span><span class="sx-c" data-c="f2link"></span><span class="sx-c" data-c="hp"></span><span class="sx-c" data-c="kroot"></span></div>' +
                '<canvas class="sx-graph sx-g-flt" width="700" height="64"></canvas></div>' +
            '</div>' +
            '<div class="sx-r sx-r2">' +
              '<div class="sx-card sx-c-mix"><h4>Mixer</h4><div class="sx-mixrow">' +
                ['o1', 'o2', 'o3', 'r12', 'r23', 'noise'].map(function (n) {
                    return '<div class="sx-ch"><span class="sx-c" data-c="' + n + '"></span><div class="sx-ms"><span class="sx-c" data-c="mute_' + n + '"></span><span class="sx-c" data-c="solo_' + n + '"></span></div><span class="sx-c" data-c="route_' + n + '"></span></div>';
                }).join('') +
                '<div class="sx-ch"><span class="sx-c" data-c="pfg"></span></div></div></div>' +
              '<div class="sx-card sx-c-eg"><h4>Filter EG</h4><canvas class="sx-graph sx-g-feg" width="300" height="60"></canvas>' +
                '<div class="sx-faders"><span class="sx-c" data-c="feg_a"></span><span class="sx-c" data-c="feg_d"></span><span class="sx-c" data-c="feg_s"></span><span class="sx-c" data-c="feg_r"></span><span class="sx-sp"></span><span class="sx-c" data-c="envmod"></span><span class="sx-c" data-c="envmod2"></span></div>' +
                '<span class="sx-c" data-c="feg_mode"></span></div>' +
              '<div class="sx-card sx-c-eg"><h4>Amp EG</h4><canvas class="sx-graph sx-g-aeg" width="300" height="60"></canvas>' +
                '<div class="sx-faders"><span class="sx-c" data-c="aeg_a"></span><span class="sx-c" data-c="aeg_d"></span><span class="sx-c" data-c="aeg_s"></span><span class="sx-c" data-c="aeg_r"></span><span class="sx-sp"></span><span class="sx-c" data-c="vel"></span><span class="sx-c" data-c="gain"></span></div>' +
                '<span class="sx-c" data-c="aeg_mode"></span></div>' +
              '<div class="sx-card sx-c-out"><h4>Scene output</h4><div class="sx-faders"><span class="sx-c" data-c="a_vol"></span><span class="sx-c" data-c="pan"></span><span class="sx-c" data-c="width"></span><span class="sx-c" data-c="fx1"></span><span class="sx-c" data-c="fx2"></span><span class="sx-sp"></span><span class="sx-c" data-c="g_vol"></span></div></div>' +
            '</div>' +
            '<div class="sx-r sx-r3"><div class="sx-card sx-c-mac"><h4>Macros</h4><div class="sx-line">' +
                [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return '<span class="sx-c" data-c="m' + i + '"></span>'; }).join('') +
            '</div></div></div></div>' +
            '<button class="sx-x11" title="Open the Surge XT editor window as a web page (VNC) on this PC; edits there are copied to this plugin">GUI &#8599;</button>' +
            '<div class="sx-modal" hidden><div class="sx-dialog"><div class="sx-dlg-title">Save preset as</div>' +
              '<input class="sx-name-in" type="text" maxlength="60" spellcheck="false">' +
              '<div class="sx-hint"></div>' +
              '<div class="sx-dlg-btns"><button class="sx-cancel">Cancel</button><button class="sx-ok">Save</button></div></div></div>';
        root.innerHTML = h;
        d.root = root; d.knobs = {};
        $(root).find('.sx-c').each(function () {
            var key = this.getAttribute('data-c'), def = KNOBS[key];
            if (def) makeCtl(d, key, def, this);
        });
        var $cat = $(root).find('.sx-cat'), $pat = $(root).find('.sx-pat');
        $cat.on('change', function () {
            var c = $cat.val(), first = -1;
            d.items.forEach(function (it, i) { if (first < 0 && it.cat === c) first = i; });
            if (first >= 0) choose(d, first);
        });
        $pat.on('change', function () { var v = parseInt($pat.val(), 10); if (v < 0) return; $search.val(''); choose(d, v); });
        // type to filter: all words must occur in "category name"; results replace the patch list
        var $search = $(root).find('.sx-search');
        function runSearch() {
            var words = $search.val().toLowerCase().split(/\s+/).filter(Boolean);
            if (!words.length) { renderLists(d); return; }
            var hits = [], total = 0;
            d.items.forEach(function (it, i) {
                var hay = (it.cat + ' ' + it.name).toLowerCase();
                if (words.every(function (w) { return hay.indexOf(w) >= 0; })) { total++; if (hits.length < 300) hits.push(i); }
            });
            d.hits = hits;
            $pat.html('<option value="-1">' + total + ' match' + (total === 1 ? '' : 'es') + (total > 300 ? ' (showing 300)' : '') + '</option>' +
                hits.map(function (i) { return '<option value="' + i + '">' + esc(d.items[i].name + '  \u00b7  ' + d.items[i].cat) + '</option>'; }).join(''));
            $pat.val(hits.length ? String(hits[0]) : '-1');
        }
        $search.on('input', runSearch)
            .on('keydown', function (e) {
                e.stopPropagation();
                if (e.key === 'Enter' && d.hits && d.hits.length && $search.val()) { var p = d.hits[0]; $search.val(''); choose(d, parseInt($pat.val(), 10) >= 0 ? parseInt($pat.val(), 10) : p); }
                else if (e.key === 'Escape') { $search.val(''); renderLists(d); }
            })
            .on('keyup keypress', function (e) { e.stopPropagation(); });
        $(root).find('.sx-prev').on('click', function () { choose(d, (d.pos - 1 + d.items.length) % d.items.length); });
        $(root).find('.sx-next').on('click', function () { choose(d, (d.pos + 1) % d.items.length); });
        wirePresets(d);
        wireX11(d);
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

    // one list for everything: saved presets first ("My presets"), then the factory patches
    function keyOf(it) { return it.kind === 'f' ? 'f:' + it.idx : 'u:' + it.uri; }

    function buildItems(d, keepKey) {
        var items = [];
        d.mine.forEach(function (m) { items.push({ kind: 'u', uri: m.uri, cat: 'My presets', name: m.name }); });
        PATCHES.forEach(function (p, i) { items.push({ kind: 'f', idx: i, cat: p[0], name: p[1], macros: p[2] }); });
        d.items = items;
        if (keepKey !== undefined) {
            d.pos = 0;
            items.forEach(function (it, i) { if (keyOf(it) === keepKey) d.pos = i; });
        }
    }

    function esc(s) { return $('<div>').text(s).html().replace(/"/g, '&quot;'); }

    function renderLists(d) {
        var cur = d.items[d.pos], cats = [], seen = {}, html = '';
        d.items.forEach(function (it) { if (!seen[it.cat]) { seen[it.cat] = 1; cats.push(it.cat); } });
        var $cat = $(d.root).find('.sx-cat'), $pat = $(d.root).find('.sx-pat');
        $cat.html(cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join(''));
        if (!cur) { $pat.html(''); return; }
        $cat.val(cur.cat);
        d.items.forEach(function (it, i) { if (it.cat === cur.cat) html += '<option value="' + i + '">' + esc(it.name) + '</option>'; });
        $pat.html(html);
        $pat.val(String(d.pos));
    }

    function status(d, msg) {
        // messages replace the small line under the patch name for a few seconds
        d.root.querySelector('.sx-sub').textContent = msg;
        clearTimeout(d.statusTimer);
        d.statusTimer = setTimeout(function () { showPatch(d); }, 4000);
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
        var it = d.items[d.pos];
        return it ? it.name : 'Surge XT';
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
                buildItems(d, 'u:' + existing.uri);
                showPatch(d);
                status(d, 'Saved "' + name + '"');
            },
            error: function () { status(d, 'Saving failed'); }
        });
    }

    function loadSaved(d, item) {
        showPatch(d);
        $.ajax({
            url: '/effect/preset/load/' + d.instance, data: { uri: item.uri }, dataType: 'json', cache: false,
            success: function () {
                showPatch(d);
                status(d, 'Loaded "' + item.name + '"');
                refreshAll(d);
            },
            error: function () { status(d, 'Loading failed'); }
        });
    }

    function wirePresets(d) {
        var $r = $(d.root);
        $r.find('.sx-saveas').on('click', function () { openSaveDialog(d); });
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

    // "GUI" switch: asks the helper on the pi-Stomp (port 8765) to start the plugin GUI on a virtual
    // screen and opens it as a web page (noVNC). Click again to stop it.
    function wireX11(d) {
        var $b = $(d.root).find('.sx-x11'), base = 'http://' + location.hostname + ':8765';
        function call(path, cb) {
            try {
                var x = new XMLHttpRequest();
                x.open('GET', base + path, true);
                x.timeout = 20000;
                x.onload = function () { var r = {}; try { r = JSON.parse(x.responseText); } catch (e) {} cb(r); };
                x.onerror = x.ontimeout = function () { cb(null); };
                x.send();
            } catch (e) { cb(null); }
        }
        function show(running) {
            d.x11 = running;
            $b.toggleClass('on', !!running).html(running ? 'GUI on &#9632;' : 'GUI &#8599;');
        }
        call('/status', function (r) { if (r) show(r.running); });
        $b.on('click', function () {
            if (d.x11) { call('/stop', function (r) { show(r ? r.running : false); status(d, 'GUI stopped'); }); return; }
            // open the tab right away (popup blockers allow it only inside the click); fill in the address later
            var w = window.open('', '_blank');
            status(d, 'Starting GUI...');
            call('/start', function (r) {
                if (r && r.running) {
                    show(true);
                    if (w) { w.location = r.url; } else { status(d, 'Open ' + r.url); }
                    status(d, 'GUI running - opened in a new tab');
                } else {
                    if (w) w.close();
                    show(false);
                    status(d, r ? (r.error || 'GUI failed to start') : 'X11 helper not running on the pi-Stomp (deploy with --x11)');
                }
            });
        });
    }

    // macros that are bipolar in Surge run from -100% to +100%, the others from 0 to 100%
    function applyMacroModes(d) {
        var mask = Math.round((d.values[MACRO_BI_PARAM] || 0) * 255);
        for (var m = 0; m < 8; m++) {
            var k = d.knobs && d.knobs['m' + m];
            if (!k) continue;
            var bi = (mask & (1 << m)) !== 0;
            if (k.bi !== bi) { k.bi = bi; k.fmt = bi ? fmtBi : fmtPct; setKnob(d, k, k.v, false); }
        }
    }

    // normalized value <-> integer parameter value
    function toIdx(k, v) { return Math.round(k.min + v * (k.max - k.min)); }
    function toNorm(k, i) { return k.max > k.min ? (i - k.min) / (k.max - k.min) : 0; }

    function makeCtl(d, key, def, host) {
        var o = def[3], type = def[2], uri = BASE + def[0], el = document.createElement('div');
        var k = { key: key, uri: uri, type: type, el: el, fmt: o.fmt || fmtPct, bi: !!o.bi, def: o.def || 0,
                  min: o.min, max: o.max, v: d.values[uri] };
        if (k.v === undefined) k.v = k.def;
        d.knobs[key] = k;
        el.className = 'sx-w sx-w-' + type + (/^(envmod2|kt2|res2|cutoff2|f2_type|f2_sub)$/.test(key) ? ' sx-f2' : '');
        host.appendChild(el);
        function commit(nv) { setKnob(d, k, Math.max(0, Math.min(1, nv)), true); }
        var drag = null;
        if (type === 'k') {
            el.innerHTML = '<canvas width="104" height="104"></canvas><div class="sx-val"></div><div class="sx-label">' + def[1] + '</div>';
            k.cv = el.querySelector('canvas'); k.txt = el.querySelector('.sx-val');
            el.addEventListener('pointerdown', function (e) { drag = { y: e.clientY, v: k.v }; el.setPointerCapture(e.pointerId); e.preventDefault(); });
            el.addEventListener('pointermove', function (e) { if (drag) commit(drag.v + (drag.y - e.clientY) / (e.shiftKey ? 800 : 200)); });
            el.addEventListener('pointerup', function () { drag = null; });
            el.addEventListener('dblclick', function () { commit(k.bi ? 0.5 : k.def); });
            k.draw = function () { drawKnob(k.cv, k.v, k.bi); k.txt.textContent = k.fmt(k.v); };
        } else if (type === 'h' || type === 'v') {
            el.innerHTML = '<div class="sx-label">' + def[1] + '</div><div class="sx-track"><div class="sx-fill"></div><div class="sx-thumb"></div></div><div class="sx-val"></div>';
            if (type === 'h') { el.innerHTML = '<div class="sx-hh"><span class="sx-label">' + def[1] + '</span><span class="sx-val"></span></div><div class="sx-track"><div class="sx-fill"></div><div class="sx-thumb"></div></div>'; }
            var tr = el.querySelector('.sx-track'), fill = el.querySelector('.sx-fill'), th = el.querySelector('.sx-thumb'), tx = el.querySelector('.sx-val');
            var tfmt = type === 'v' ? function (x) { return k.fmt(x).replace(' dB', ''); } : k.fmt;
            function setFromEvent(e) {
                var r = tr.getBoundingClientRect(), f = type === 'h' ? (e.clientX - r.left) / r.width : 1 - (e.clientY - r.top) / r.height;
                var nv = Math.max(0, Math.min(1, f));
                if (k.min !== undefined) nv = toNorm(k, toIdx(k, nv));
                commit(nv);
            }
            tr.addEventListener('pointerdown', function (e) { drag = true; tr.setPointerCapture(e.pointerId); setFromEvent(e); e.preventDefault(); });
            tr.addEventListener('pointermove', function (e) { if (drag) setFromEvent(e); });
            tr.addEventListener('pointerup', function () { drag = null; });
            el.addEventListener('dblclick', function () { commit(k.def); });
            k.draw = function () {
                var v = k.v, a = k.bi ? Math.min(v, 0.5) : 0, b = k.bi ? Math.max(v, 0.5) : v;
                if (type === 'h') { fill.style.left = (a * 100) + '%'; fill.style.width = ((b - a) * 100) + '%'; th.style.left = (v * 100) + '%'; }
                else { fill.style.bottom = (a * 100) + '%'; fill.style.height = ((b - a) * 100) + '%'; th.style.bottom = (v * 100) + '%'; }
                tx.textContent = tfmt(v);
            };
        } else if (type === 't') {
            var names = o.names;
            el.innerHTML = '<button class="sx-tog">' + def[1] + '</button>';
            var bt = el.firstChild;
            bt.addEventListener('click', function () { commit(k.v > 0.5 ? 0 : 1); });
            k.draw = function () { bt.classList.toggle('on', k.v > 0.5); if (names) bt.textContent = names[k.v > 0.5 ? 1 : 0].toUpperCase(); };
        } else if (type === 'r') {
            el.innerHTML = '<button class="sx-route"></button>';
            var rb = el.firstChild;
            rb.addEventListener('click', function () { commit(toNorm(k, (toIdx(k, k.v) + 1) % 3)); });
            k.draw = function () { rb.textContent = ROUTES[toIdx(k, k.v)] || ''; };
        } else if (type === 'o') {
            var h = '';
            for (var i = -3; i <= 3; i++) h += '<button data-i="' + i + '">' + (i > 0 ? '+' + i : i) + '</button>';
            el.innerHTML = '<div class="sx-label">Octave</div><div class="sx-octs">' + h + '</div>';
            $(el).find('button').on('click', function () { commit(toNorm(k, parseInt(this.getAttribute('data-i'), 10))); });
            k.draw = function () { var cur = toIdx(k, k.v); $(el).find('button').each(function () { $(this).toggleClass('on', parseInt(this.getAttribute('data-i'), 10) === cur); }); };
        } else if (type === 'n') {
            el.innerHTML = '<div class="sx-label">' + def[1] + '</div><div class="sx-step"><button>&minus;</button><span></span><button>+</button></div>';
            var bs = el.querySelectorAll('button'), sp = el.querySelector('span');
            function stepBy(n) { var i = Math.max(k.min, Math.min(k.max, toIdx(k, k.v) + n)); commit(toNorm(k, i)); }
            bs[0].addEventListener('click', function () { stepBy(-1); });
            bs[1].addEventListener('click', function () { stepBy(1); });
            k.draw = function () { var i = toIdx(k, k.v); sp.textContent = (o.pre || '') + (o.text ? o.text(i) : i); };
        } else if (type === 's') {
            var sel = document.createElement('select'), opts = '';
            if (o.filter) {
                // 36 filter types, grouped; the value is Surge's own filter type number
                var groups = {}, order = [];
                FILTERS.forEach(function (f) { var g = f[2] || 'Off'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(f); });
                order.forEach(function (g) {
                    var items = groups[g].map(function (f) { return '<option value="' + f[0] + '">' + esc(f[1]) + '</option>'; }).join('');
                    opts += g === 'Off' ? items : '<optgroup label="' + esc(g) + '">' + items + '</optgroup>';
                });
                k.toNorm = function (i) { return i / (NFILT - 1); };
                k.toIdx = function (v) { return Math.round(v * (NFILT - 1)); };
            } else {
                o.list.forEach(function (n, i) { opts += '<option value="' + i + '">' + esc(n) + '</option>'; });
                k.toNorm = function (i) { return toNorm(k, i); };
                k.toIdx = function (v) { return toIdx(k, v); };
            }
            sel.innerHTML = opts;
            el.appendChild(sel);
            sel.addEventListener('change', function () { commit(k.toNorm(parseInt(sel.value, 10))); });
            k.draw = function () { sel.value = String(k.toIdx(k.v)); };
        }
    }

    function setKnob(d, k, v, send) {
        if (send) k.local = Date.now();
        k.v = v;
        k.draw();
        if (send) sendLimited(d, k.uri, v);
        redrawGraphs(d);
    }

    function choose(d, pos) {
        var it = d.items[pos];
        if (!it) return;
        d.pos = pos;
        if (it.kind === 'f') {
            var v = PATCHES.length > 1 ? it.idx / (PATCHES.length - 1) : 0;
            d.values[PATCH_PARAM] = v;
            funcs.patch_set(PATCH_PARAM, 'f', v);
            showPatch(d);
            refreshAll(d);
        } else {
            loadSaved(d, it);
        }
    }

    function showPatch(d) {
        var root = d.root;
        if (!root) return;
        var it = d.items[d.pos];
        if (!it) { root.querySelector('.sx-name').textContent = 'Surge XT'; return; }
        root.querySelector('.sx-name').textContent = it.name;
        root.querySelector('.sx-sub').textContent = (it.kind === 'u' ? 'My presets' : it.cat) + '  (' + (d.pos + 1) + '/' + d.items.length + ')';
        renderLists(d);
        // macro names as stored in the patch (factory and 3rd party patches); "M1".. when unnamed
        for (var m = 0; m < 8; m++) {
            var k = d.knobs && d.knobs['m' + m];
            if (!k) continue;
            var nm = it.macros && it.macros[m] && it.macros[m] !== '-' ? it.macros[m] : 'M' + (m + 1);
            k.el.querySelector('.sx-label').textContent = nm;
            k.el.title = nm;
        }
    }

    function redrawGraphs(d) {
        if (!d.knobs) return;
        var K = d.knobs, root = d.root;
        function g(pre) { return function (x) { return K[pre + '_' + x].v; }; }
        drawEnv(root.querySelector('.sx-g-aeg'), g('aeg'));
        drawEnv(root.querySelector('.sx-g-feg'), g('feg'));
        var fc = root.querySelector('.sx-g-flt'); if (fc) drawFilters(fc, K);
    }

    var d = event.data;
    if (event.type === 'start') {
        d.icon = event.icon; d.pending = {}; d.timer = null; d.values = {}; d.pos = 0;
        d.instance = event.icon.attr('mod-instance') || '';
        d.mine = readSavedPresets(d, event.settings);
        (event.parameters || []).forEach(function (p) { d.values[p.uri] = p.value; });
        var fidx = 0;
        if (d.values[PATCH_PARAM] !== undefined && PATCHES.length > 1) {
            fidx = Math.round(d.values[PATCH_PARAM] * (PATCHES.length - 1));
        }
        buildItems(d, 'f:' + fidx);
        build(d);
        applyMacroModes(d);
    } else if (event.type === 'change' && event.uri && d.knobs) {
        if (event.uri === PATCH_PARAM) {
            // a saved preset is the current sound: its own state wins over the stored patch number
            var cur = d.items[d.pos];
            if (PATCHES.length > 1 && !(cur && cur.kind === 'u')) {
                var k = 'f:' + Math.round(event.value * (PATCHES.length - 1));
                d.items.forEach(function (it, i) { if (keyOf(it) === k) d.pos = i; });
                showPatch(d);
            }
            return;
        }
        if (event.uri === MACRO_BI_PARAM) { d.values[MACRO_BI_PARAM] = event.value; applyMacroModes(d); return; }
        for (var key in d.knobs) {
            if (d.knobs[key].uri === event.uri) { if (d.knobs[key].local && Date.now() - d.knobs[key].local < 1500) break; setKnob(d, d.knobs[key], event.value, false); break; }
        }
    }
}
