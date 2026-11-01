/* Generazione del PDF per il cliente (jsPDF + jspdf-autotable). Nessuna formula nel documento. */

// Intestazione facoltativa: quando vorrai nome, contatti o logo, compila queste righe.
// logo = immagine PNG o JPEG come "data URL" (es. 'data:image/png;base64,...')
const INTESTAZIONE = { nome: '', contatti: '', logo: '' };

const PdfDieta = (() => {
  const GG = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  const GGS = GG.map(g => g.slice(0, 3));
  const TIPI = { on: 'Giorno ON', off: 'Giorno OFF', refeed: 'Refeed', normo: 'Normale', iper: 'Iper', ipo: 'Ipo' };
  const FASI = { reset: 'Reset metabolico', cut: 'Dimagrimento', bulk: 'Massa', mantenimento: 'Mantenimento', diet_break: 'Diet break', ricomposizione: 'Ricomposizione' };
  const ACC = [31, 111, 92], INK = [29, 42, 40], MUT = [102, 115, 111], LINE = [221, 227, 223], SOFT = [241, 245, 243];

  const n = (v, d = 0) => v == null || isNaN(v) ? '-' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: d });
  const dt = iso => new Date(iso + 'T00:00:00').toLocaleDateString('it-IT');
  const addDays = (iso, k) => new Date(Date.parse(iso) + k * 864e5).toISOString().slice(0, 10);

  // Elenco delle opzioni di una portata: una per riga, con giorni e regola tra parentesi
  function righe(items) {
    const g = new Map();
    items.forEach(i => {
      const e = g.get(i.nome) || { giorni: [], tutti: false, regola: i.regola };
      if (i.giorno) e.giorni.push(i.giorno); else e.tutti = true;
      g.set(i.nome, e);
    });
    return [...g].map(([nome, e]) => {
      const p = [];
      if (!e.tutti && e.giorni.length) p.push([...new Set(e.giorni)].sort((a, b) => a - b).map(x => GGS[x - 1]).join(', '));
      if (e.regola) p.push(e.regola);
      return '• ' + nome + (p.length ? ` (${p.join('; ')})` : '');
    }).join('\n');
  }

  // d = { cliente:{nome,cognome,eta,altezza}, dieta:{titolo,data,note,risultati,parametri}, giorni, fasi, pasti }
  function crea(jsPDF, d) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 15;
    const c = d.cliente, di = d.dieta, r = di.risultati || {}, p = di.parametri || {};
    const nomeCompleto = `${c.nome} ${c.cognome}`;
    let y = M;

    const colore = a => doc.setTextColor(a[0], a[1], a[2]);
    const need = h => { if (y + h > H - 20) { doc.addPage(); y = M; } };
    const h2 = t => {
      need(20);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); colore(ACC);
      doc.text(t, M, y + 5); y += 8;
      doc.setDrawColor(...LINE); doc.line(M, y, W - M, y); y += 3;
    };
    const tab = o => {
      doc.autoTable({
        startY: y, margin: { left: M, right: M, bottom: 20 }, theme: 'grid', rowPageBreak: 'avoid',
        styles: { font: 'helvetica', fontSize: 10, textColor: INK, lineColor: LINE, lineWidth: 0.2, cellPadding: 2.2 },
        headStyles: { fillColor: SOFT, textColor: MUT, fontStyle: 'bold', fontSize: 9 }, ...o
      });
      y = doc.lastAutoTable.finalY + 6;
    };
    const testo = (t, size = 10, col = INK, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); colore(col);
      const l = doc.splitTextToSize(t, W - 2 * M);
      need(l.length * size * 0.45 + 2);
      doc.text(l, M, y + 4); y += l.length * size * 0.45 + 2;
    };

    /* Intestazione */
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); colore(ACC);
    doc.text('Piano alimentare', M, y + 8);
    const I = INTESTAZIONE;
    if (I.logo) { const ip = doc.getImageProperties(I.logo), h = 14, w = h * ip.width / ip.height; doc.addImage(I.logo, ip.fileType, W - M - w, M, w, h); }
    else if (I.nome) {
      doc.setFontSize(11); doc.text(I.nome, W - M, y + 5, { align: 'right' });
      if (I.contatti) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); colore(MUT); doc.text(doc.splitTextToSize(I.contatti, 70), W - M, y + 10, { align: 'right' }); }
    }
    y += 15;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); colore(INK); doc.text(nomeCompleto, M, y + 4); y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); colore(MUT);
    doc.text(`${di.titolo || ''}   -   ${dt(di.data)}`, M, y + 3); y += 8;

    const dati = [c.eta != null && `Età ${c.eta} anni`, c.altezza && `Altezza ${n(c.altezza)} cm`, p.peso && `Peso ${n(p.peso, 1)} kg`, p.bf != null && `Grasso corporeo ${n(p.bf, 1)} %`].filter(Boolean);
    if (dati.length) { testo(dati.join('     '), 10, MUT); y += 2; }

    /* Obiettivo giornaliero */
    const varied = (d.giorni || []).length > 0 && new Set(d.giorni.map(g => g.kcal + '/' + g.carb)).size > 1;
    h2('Obiettivo giornaliero');
    tab({
      head: [['Calorie', 'Proteine', 'Carboidrati', 'Grassi']],
      body: [[`${n(r.kcal)} kcal`, `${n(r.pro)} g`, `${n(r.carb)} g`, `${n(r.fat)} g`]],
      styles: { font: 'helvetica', fontSize: 13, fontStyle: 'bold', halign: 'center', textColor: INK, lineColor: LINE, lineWidth: 0.2, cellPadding: 3 },
      headStyles: { fillColor: SOFT, textColor: MUT, fontStyle: 'bold', fontSize: 9, halign: 'center' }
    });
    y -= 3;
    if (varied) testo('Sono valori di riferimento: durante la settimana calorie e carboidrati variano come indicato nella tabella seguente.', 9, MUT);
    const a = r.acqua, f = r.fibre;
    if (a) testo(`Acqua: ${a.min === a.max ? n(a.min, 1) : n(a.min, 1) + '-' + n(a.max, 1)} litri al giorno`, 10);
    if (f) testo(`Fibre: ${f.min}-${f.max} g al giorno (consigliati circa ${f.sug} g)`, 10);
    y += 3;

    /* Settimana */
    if (varied) {
      h2('La tua settimana');
      tab({
        head: [['Giorno', 'Tipo', 'Calorie', 'Proteine', 'Carboidrati', 'Grassi']],
        body: d.giorni.map(g => [GG[g.giorno - 1], TIPI[g.tipo] || '', `${n(g.kcal)} kcal`, `${n(g.pro)} g`, `${n(g.carb)} g`, `${n(g.fat)} g`])
      });
    }

    /* Timeline */
    if ((d.fasi || []).length) {
      h2('Piano nel tempo');
      tab({
        head: [['Fase', 'Dal', 'Al', 'Durata', 'Note']],
        body: d.fasi.map(x => [FASI[x.tipo] || x.tipo, dt(x.inizio), dt(addDays(x.inizio, x.settimane * 7 - 1)), `${x.settimane} settimane`, x.note || ''])
      });
    }

    /* Pasti */
    if ((d.pasti || []).length) {
      need(55);   // il titolo non deve restare solo in fondo alla pagina
      h2('I tuoi pasti');
      d.pasti.forEach(m => {
        const rows = m.portate.map(po => [po, righe(m.items.filter(i => i.portata === po))]).filter(x => x[1]);
        need(8 + 18);
        const q = (Number(m.percentuale) || 0) / 100;
        doc.setFillColor(...ACC); doc.rect(M, y, W - 2 * M, 8, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
        doc.text(m.nome, M + 3, y + 5.5);
        if (r.kcal && q) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
          doc.text(`circa ${n(r.kcal * q)} kcal   P ${n(r.pro * q)} g   C ${n(r.carb * q)} g   G ${n(r.fat * q)} g`, W - M - 3, y + 5.4, { align: 'right' });
        }
        y += 8;
        if (!rows.length) { testo('Nessuna opzione indicata.', 9, MUT); y += 2; return; }
        tab({
          body: rows, showHead: 'never',
          columnStyles: { 0: { cellWidth: 34, fontStyle: 'bold', textColor: MUT }, 1: { cellWidth: 'auto' } }
        });
      });
    }

    /* Note */
    if (di.note) { h2('Note'); testo(di.note, 10); }

    /* Piè di pagina */
    const N = doc.getNumberOfPages();
    for (let i = 1; i <= N; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); colore(MUT);
      doc.text(`${nomeCompleto}  -  ${di.titolo || ''}`, M, H - 8);
      doc.text(`Pagina ${i} di ${N}`, W - M, H - 8, { align: 'right' });
    }
    return doc;
  }

  return { crea };
})();
if (typeof module !== 'undefined') module.exports = PdfDieta;
