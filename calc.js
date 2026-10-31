/* Motore di calcolo: formule dal documento (nessun accesso a pagina o database) */
const Calc = (() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const n1 = v => v.toFixed(1).replace('.', ',');

  // Metabolismo basale (kcal/giorno). p: {sesso, eta, altezza (cm), peso (kg)}
  const BMR = {
    mifflin: { nome: 'Mifflin-St Jeor', corto: 'Mifflin',
      f: p => 10 * p.peso + 6.25 * p.altezza - 5 * p.eta + (p.sesso === 'M' ? 5 : -161) },
    harris: { nome: 'Harris-Benedict', corto: 'Harris-Benedict',
      f: p => p.sesso === 'M'
        ? 66.5 + 13.75 * p.peso + 5.003 * p.altezza - 6.775 * p.eta
        : 655.1 + 9.563 * p.peso + 1.85 * p.altezza - 1.16 * p.eta },
    met: { nome: 'Equivalente metabolico (MET)', corto: 'MET',
      f: p => (p.sesso === 'M' ? 1 : 0.9) * p.peso * (p.eta > 40 ? 23 : 24) },
    rapida: { nome: 'Rapida sul peso', corto: 'Rapida',
      f: p => p.peso * (p.sesso === 'M' ? 33 : 31) }   // punto medio di 32-34 (uomo) e 30-32 (donna)
  };

  // Livelli di attività: coefficiente McDonald (medio della fascia) e moltiplicatore sul basale
  const ATT = {
    sed: { nome: 'Sedentario', mc: 10.5, mult: 1.2 },
    mod: { nome: 'Moderata (circa 3 allenamenti a settimana)', mc: 12.5, mult: 1.55 },
    int: { nome: 'Intensa (allenamenti quotidiani)', mc: 18.5, mult: 1.75 }
  };

  // Fabbisogno totale (TDEE)
  const TDEE = {
    mcdonald: { nome: 'Lyle McDonald (peso × 2,2 × coefficiente)', f: p => p.peso * 2.2 * ATT[p.att].mc },
    mb_att: { nome: 'Metabolismo basale × fattore di attività', f: (p, mb) => mb * ATT[p.att].mult },
    altezza: { nome: 'Altezza² (per sovrappeso e obesi)', f: p => Math.pow(p.altezza / 100, 2) * (p.sesso === 'M' ? 725 : 625) }
  };

  const FASI = {
    reset: { nome: 'Reset metabolico' },
    cut: { nome: 'Dimagrimento (cut)' },
    bulk: { nome: 'Massa (bulk)' },
    mant: { nome: 'Mantenimento' }
  };

  // Slider per fase: [chiave, etichetta, unità, min, max, default, passo]
  function sliders(fase, sesso) {
    const M = sesso === 'M';
    return {
      reset: [['kcalkg', 'Calorie per kg di peso', 'kcal/kg', M ? 31 : 28, M ? 37 : 34, M ? 32.5 : 29.5, 0.5],
              ['pro', 'Proteine', 'g/kg', 0.9, 1.8, 1.2, 0.1], ['fat', 'Grassi', 'g/kg', 0.7, 1.0, 0.8, 0.05]],
      cut:   [['pct', 'Deficit', '%', 10, 20, 15, 1],
              ['pro', 'Proteine', 'g/kg', 1.7, 2.5, 2.1, 0.1], ['fat', 'Grassi', 'g/kg', 0.4, 0.7, 0.55, 0.05]],
      bulk:  [['pct', 'Surplus', '%', 10, 15, 12.5, 0.5],
              ['pro', 'Proteine', 'g/kg', 0.9, 1.8, 1.2, 0.1], ['fat', 'Grassi', 'g/kg', 0.7, 1.0, 0.8, 0.05]],
      mant:  [['pro', 'Proteine', 'g/kg', 1.4, 2.0, 1.7, 0.1], ['fat', 'Grassi', 'g/kg', 0.7, 1.0, 0.8, 0.05]]
    }[fase];
  }

  // p: {sesso, eta, altezza, peso, bf, kcalAtt, att, mb, tdee}   v: valori degli slider
  function calcola(p, fase, v) {
    const mbAll = Object.fromEntries(Object.entries(BMR).map(([k, o]) => [k, o.f(p)]));
    const mb = mbAll[p.mb];
    const tdee = TDEE[p.tdee].f(p, mb);

    // Check metabolico
    const soglia = p.sesso === 'M' ? 31 : 28;
    const kgAtt = p.kcalAtt ? p.kcalAtt / p.peso : null;
    const sotto = kgAtt == null ? null : kgAtt < soglia;
    const check = sotto == null ? 'Non verificato: mancano le kcal che il cliente assume oggi.'
      : sotto ? `Assume ${n1(kgAtt)} kcal/kg, sotto la soglia di ${soglia}. Indicato il reset metabolico.`
              : `Assume ${n1(kgAtt)} kcal/kg, sopra la soglia di ${soglia}. Si può passare all'obiettivo.`;

    // Calorie obiettivo
    let kcal = fase === 'reset' ? p.peso * v.kcalkg
      : fase === 'cut' ? tdee * (1 - v.pct / 100)
      : fase === 'bulk' ? tdee * (1 + v.pct / 100) : tdee;
    kcal = Math.round(kcal);

    // Macro: proteine e grassi per kg, carboidrati per differenza
    const pro = Math.round(v.pro * p.peso), fat = Math.round(v.fat * p.peso);
    const carb = Math.round((kcal - pro * 4 - fat * 9) / 4);
    const quota = { pro: Math.round(pro * 4 / kcal * 100), carb: Math.round(carb * 4 / kcal * 100), fat: Math.round(fat * 9 / kcal * 100) };

    const { acqua, fibre } = acquaFibre(p.peso, kcal, fase === 'cut');

    // Piano del reset: +40-60 kcal ogni 7-14 giorni
    let reset = null;
    if (fase === 'reset' && p.kcalAtt && kcal > p.kcalAtt) {
      const diff = kcal - p.kcalAtt;
      reset = { diff, settimane: [Math.ceil(diff / 60), Math.ceil(diff / 40) * 2] };
    }

    // Ritmo di perdita (deficit giornaliero × 7 giorni / 7 kcal per g di grasso)
    let ritmo = null;
    if (fase === 'cut') { const kg = (tdee - kcal) / 1000; ritmo = { kg, pct: kg / p.peso * 100 }; }

    const avvisi = [];
    if (kcal < 1200) avvisi.push('Il totale è sotto le 1200 kcal: il documento indica di non scendere mai sotto questo limite.');
    if (fase === 'cut' && tdee - kcal > 1000) avvisi.push('Il deficit supera le 1000 kcal al giorno, il massimo indicato nel documento.');
    if (ritmo && ritmo.pct > 1) avvisi.push('La perdita stimata supera l\'1% del peso a settimana: c\'è rischio di perdere massa magra.');
    if (fat < 30) avvisi.push('I grassi sono sotto i 30 g: il documento indica un minimo assoluto di 25-30 g al giorno.');
    if (carb < 0) avvisi.push('Proteine e grassi superano le calorie disponibili: riduci gli slider.');
    if (fase === 'reset' && carb >= 0 && carb / p.peso < 4) avvisi.push(`Nel reset il documento indica almeno 4 g/kg di carboidrati (ora ${n1(carb / p.peso)}).`);
    if (sotto && fase !== 'reset') avvisi.push('Il cliente è sotto la soglia calorica: il documento consiglia di fare prima il reset metabolico.');
    if (sotto === false && fase === 'reset') avvisi.push('Il cliente è già sopra la soglia: il reset potrebbe non servire.');
    if (p.bf != null && p.bf > (p.sesso === 'M' ? 16 : 26) && fase !== 'reset')
      avvisi.push('Il grasso corporeo è alto: per questi casi il documento consiglia di calcolare i macro sulla massa magra (non ancora disponibile in questa versione).');

    return { mbAll, mb, tdee, kcal, pro, carb, fat, quota, kgAtt, sotto, soglia, check, acqua, fibre, reset, ritmo, avvisi };
  }

  function acquaFibre(peso, kcal, cut) {
    return {
      acqua: { min: kcal * (cut ? 1.5 : 1) / 1000, max: kcal * (cut ? 2 : 1) / 1000, f2: peso / 10 * 0.28 },
      fibre: { min: 25, max: 38, sug: Math.round(clamp(20 * kcal / 1000, 25, 38)) }
    };
  }

  /* ---------- Settimana ---------- */
  const GIORNI_TIPI = {
    iso: { normo: 'Normale', refeed: 'Refeed' },
    onoff: { on: 'ON', off: 'OFF', refeed: 'Refeed' },
    ricomp: { iper: 'Iper', ipo: 'Ipo', normo: 'Normo' }
  };
  // Lun-Dom. ON/OFF: schema 4:3. Ricomposizione: 2 iper, 3 ipo, 2 normo
  const GIORNI_DEF = {
    iso: Array(7).fill('normo'),
    onoff: ['on', 'on', 'off', 'on', 'on', 'off', 'off'],
    ricomp: ['iper', 'ipo', 'normo', 'iper', 'ipo', 'normo', 'ipo']
  };
  // Slider aggiuntivi: taglio dei giorni OFF e refeed (aumento carboidrati per somatotipo)
  function slidersExtra(mode, days, soma) {
    const s = [];
    if (mode === 'onoff') s.push(['offpct', 'Taglio nei giorni OFF', '%', 10, 25, 10, 1]);
    if (days.includes('refeed')) s.push(
      ['rfpct', 'Aumento carboidrati nel refeed', '%', 50, 100, { ecto: 100, meso: 75, endo: 50 }[soma] || 75, 5],
      ['rffat', 'Grassi nel refeed', 'g', 10, 15, 12, 1]);
    return s;
  }
  const SLIDERS_RICOMP = [
    ['pro', 'Proteine', 'g/kg massa magra', 2.2, 3.2, 2.7, 0.1],
    ['iperpct', 'Giorni iper', '%', 5, 10, 7.5, 0.5],
    ['ipopct', 'Giorni ipo', '%', 15, 20, 17.5, 0.5]
  ];

  const mk = (tipo, kcal, pro, fat) => {
    const K = Math.round(kcal), P = Math.round(pro), F = Math.round(fat);
    return { tipo, kcal: K, pro: P, fat: F, carb: Math.round((K - P * 4 - F * 9) / 4) };
  };

  // o = risultato di calcola(); days = 7 tipi (lun-dom); v = slider
  function settimana(p, o, mode, days, v) {
    const avvisi = [];
    const lbm = p.bf != null ? p.peso * (1 - p.bf / 100) : null;
    const nOn = days.filter(d => d === 'on').length, nOff = days.filter(d => d === 'off').length;
    let on = o.kcal, off = o.kcal;
    if (mode === 'onoff') {
      if (!nOn) avvisi.push('Serve almeno un giorno ON per ridistribuire le calorie.');
      else if (nOff) { const taglio = o.kcal * v.offpct / 100; off = o.kcal - taglio; on = o.kcal + taglio * nOff / nOn; }
    }
    const maint = Math.max(0, (o.tdee - o.pro * 4 - o.fat * 9) / 4);   // carboidrati a mantenimento
    const giorni = days.map(t => {
      if (t === 'on') return mk('on', on, o.pro, o.fat);
      if (t === 'off') return mk('off', off, o.pro, o.fat);
      if (t === 'refeed') {
        const pro = Math.round(lbm ? 2.2 * lbm : o.pro), fat = Math.round(v.rffat), carb = Math.round(maint * (1 + v.rfpct / 100));
        return { tipo: 'refeed', pro, fat, carb, kcal: pro * 4 + carb * 4 + fat * 9 };
      }
      return mk('normo', o.kcal, o.pro, o.fat);
    });
    const totale = giorni.reduce((s, g) => s + g.kcal, 0), media = totale / 7;
    const nRef = days.filter(d => d === 'refeed').length;
    if (giorni.some(g => g.carb < 0)) avvisi.push('In alcuni giorni i carboidrati risultano negativi: riduci il taglio dei giorni OFF.');
    if (nRef) avvisi.push(`Il refeed aggiunge calorie: la media settimanale è ${Math.round(media)} kcal (piano base ${o.kcal}).`);
    if (nRef && lbm == null) avvisi.push('Senza il % di grasso, le proteine del refeed seguono il piano e non i 2,2 g/kg di massa magra.');
    return { giorni, totale, media, avvisi };
  }

  // Ricomposizione corporea: macro sulla massa magra, fabbisogno di mantenimento come base
  function ricomp(p, b, v, days) {
    if (p.bf == null) return { errore: 'Per la ricomposizione serve il % di grasso, perché i macro si calcolano sulla massa magra.' };
    const lbm = p.peso * (1 - p.bf / 100), pro = v.pro * lbm, fat = 1.0 * lbm;
    const kc = { iper: b.tdee * (1 + v.iperpct / 100), ipo: b.tdee * (1 - v.ipopct / 100), normo: b.tdee };
    const giorni = days.map(t => mk(t, kc[t], pro, fat));
    const media = giorni.reduce((s, g) => s + g.kcal, 0) / 7;
    const avg = k => giorni.reduce((s, g) => s + g[k], 0) / 7;
    const periwo = (p.bf > (p.sesso === 'M' ? 16 : 26) ? [0.5, 0.8] : [1.0, 1.5]).map(x => Math.round(x * lbm));
    const n = t => days.filter(d => d === t).length;
    const avvisi = [];
    if (n('iper') !== 2 || n('ipo') !== 3 || n('normo') !== 2) avvisi.push('Il documento prevede 2 giorni iper, 3 giorni ipo e 2 normo.');
    if (giorni.some(g => g.carb < 0)) avvisi.push('In alcuni giorni i carboidrati risultano negativi: riduci proteine o taglio dei giorni ipo.');
    if (giorni.some(g => g.kcal < 1200)) avvisi.push('Un giorno scende sotto le 1200 kcal, il minimo indicato nel documento.');
    if (b.sotto) avvisi.push('Il cliente è sotto la soglia calorica: il documento consiglia di fare prima il reset metabolico.');
    return { lbm, giorni, totale: media * 7, media, medie: { kcal: media, pro: avg('pro'), carb: avg('carb'), fat: avg('fat') }, periwo, avvisi };
  }

  return { BMR, ATT, TDEE, FASI, sliders, slidersExtra, SLIDERS_RICOMP, GIORNI_TIPI, GIORNI_DEF, calcola, settimana, ricomp, acquaFibre };
})();
if (typeof module !== 'undefined') module.exports = Calc;
