/* ============================================================
   Minimal dependency-free .xlsx writer
   Produces a real Excel workbook (Office Open XML) with:
   styles (bold, fills, borders), number/date formats,
   column widths, merged cells, multiple sheets.
   ============================================================ */
(function (global) {
  "use strict";

  /* ---------- CRC32 + STORED zip ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }
  function zipStore(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const now = dosDateTime(new Date());
    for (const [name, content] of files) {
      const nameB = enc.encode(name);
      const data = typeof content === "string" ? enc.encode(content) : content;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, now.time, true); lh.setUint16(12, now.date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameB, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, now.time, true);
      ch.setUint16(14, now.date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true); ch.setUint16(28, nameB.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true);
      ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      offset += 30 + nameB.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true);
    const out = new Uint8Array(offset + cdSize + 22);
    let p = 0;
    for (const part of [...parts, ...central, new Uint8Array(eocd.buffer)]) { out.set(part, p); p += part.length; }
    return out;
  }

  /* ---------- Helpers ---------- */
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function colName(n) { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function excelDate(d) {
    const local = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
    return local / 86400000 + 25569;
  }

  /* ---------- Workbook ---------- */
  /*
    sheet = {
      name: "Sheet1",
      cols: [ {wch: 10}, ... ],
      merges: [ "A1:G1" ],
      rows: [ [ cell, cell, ... ], ... ]
    }
    cell = value | { v: value, s: styleIndex, z: numFmt }
    styles registered through wb.style({ bold, fill, color, numFmt, align, border, size })
  */
  function Workbook() {
    this.sheets = [];
    this.numFmts = [];      // custom number formats, id starts at 164
    this.fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ["<border/>", '<border><left style="thin"><color rgb="FFD9D9D9"/></left><right style="thin"><color rgb="FFD9D9D9"/></right><top style="thin"><color rgb="FFD9D9D9"/></top><bottom style="thin"><color rgb="FFD9D9D9"/></bottom></border>'];
    this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'];
  }
  Workbook.prototype.numFmt = function (code) {
    let i = this.numFmts.indexOf(code);
    if (i < 0) { this.numFmts.push(code); i = this.numFmts.length - 1; }
    return 164 + i;
  };
  Workbook.prototype.style = function (o) {
    o = o || {};
    let fontId = 0;
    if (o.bold || o.color || o.size) {
      this.fonts.push(`<font>${o.bold ? "<b/>" : ""}<sz val="${o.size || 11}"/>${o.color ? `<color rgb="FF${o.color}"/>` : ""}<name val="Calibri"/></font>`);
      fontId = this.fonts.length - 1;
    }
    let fillId = 0;
    if (o.fill) {
      this.fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${o.fill}"/><bgColor indexed="64"/></patternFill></fill>`);
      fillId = this.fills.length - 1;
    }
    const borderId = o.border ? 1 : 0;
    const numFmtId = o.numFmt ? this.numFmt(o.numFmt) : 0;
    const align = o.align ? `<alignment horizontal="${o.align}" vertical="center"/>` : "";
    this.xfs.push(`<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align}</xf>`);
    return this.xfs.length - 1;
  };
  Workbook.prototype.addSheet = function (sheet) { this.sheets.push(sheet); return this; };

  Workbook.prototype._sheetXml = function (sheet) {
    let rowsXml = "";
    sheet.rows.forEach((row, r) => {
      let cells = "";
      row.forEach((cell, c) => {
        if (cell === null || cell === undefined) return;
        const ref = colName(c) + (r + 1);
        const isObj = typeof cell === "object" && !(cell instanceof Date);
        const v = isObj ? cell.v : cell;
        const s = isObj && cell.s ? ` s="${cell.s}"` : "";
        if (v === null || v === undefined || v === "") { if (s) cells += `<c r="${ref}"${s}/>`; return; }
        if (v instanceof Date) cells += `<c r="${ref}"${s}><v>${excelDate(v)}</v></c>`;
        else if (typeof v === "number") cells += `<c r="${ref}"${s}><v>${v}</v></c>`;
        else if (typeof v === "boolean") cells += `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
        else cells += `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      });
      const ht = sheet.rowHeights && sheet.rowHeights[r] ? ` ht="${sheet.rowHeights[r]}" customHeight="1"` : "";
      rowsXml += `<row r="${r + 1}"${ht}>${cells}</row>`;
    });
    const cols = sheet.cols && sheet.cols.length
      ? `<cols>${sheet.cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.wch || 10}" customWidth="1"/>`).join("")}</cols>` : "";
    const merges = sheet.merges && sheet.merges.length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
    const freeze = sheet.freezeRow
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}${cols}<sheetData>${rowsXml}</sheetData>${merges}</worksheet>`;
  };

  Workbook.prototype._stylesXml = function () {
    const nf = this.numFmts.length
      ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((c, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(c)}"/>`).join("")}</numFmts>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${nf}<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts><fills count="${this.fills.length}">${this.fills.join("")}</fills><borders count="${this.borders.length}">${this.borders.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  };

  Workbook.prototype.toBlob = function () {
    const files = [];
    const n = this.sheets.length;
    files.push(["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${this.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`]);
    files.push(["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`]);
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    files.push(["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Trip Finance</dc:title><dc:creator>Trip Finance Tracker</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`]);
    files.push(["docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Trip Finance Tracker</Application></Properties>`]);
    files.push(["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${this.sheets.map((s, i) => `<sheet name="${esc(s.name || "Sheet" + (i + 1))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`]);
    files.push(["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
    files.push(["xl/styles.xml", this._stylesXml()]);
    this.sheets.forEach((s, i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, this._sheetXml(s)]));
    return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  };

  Workbook.prototype.download = function (filename) {
    const blob = this.toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  };

  global.MiniXLSX = { Workbook };
})(window);
