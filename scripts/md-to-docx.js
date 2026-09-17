/**
 * 把 docs/功能说明.md 转成可打印的 Word 版介绍书。
 * Markdown 是唯一源文件，生成结果放在 docs/generated/，不提交到 Git。
 * 用法：npm install --no-save docx && node scripts/md-to-docx.js
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType, VerticalAlign
} = require('docx');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', '功能说明.md');
const OUT_DIR = path.join(ROOT, 'docs', 'generated');
const OUT = path.join(OUT_DIR, '菇事云管家-功能介绍书.docx');

// US Letter（12240×15840 DXA）左右各 1 英寸边距后的正文宽度
const CONTENT_WIDTH = 9360;
const FONT = 'Microsoft YaHei';

/** 把行内 **加粗** 与 `代码` 转成对应的 TextRun */
function inlineRuns(text) {
  const runs = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) runs.push(new TextRun(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith('**')) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    } else {
      runs.push(new TextRun({ text: token.slice(1, -1), font: 'Consolas', color: 'B02A37' }));
    }
    last = match.index + token.length;
  }
  if (last < text.length) runs.push(new TextRun(text.slice(last)));
  return runs.length ? runs : [new TextRun(text)];
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'BFD3C6' };
const CELL_BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };

/** 表格：首行做表头（浅绿底、加粗），其余为数据行 */
function buildTable(rows) {
  const header = rows[0];
  const body = rows.slice(1);
  const colCount = header.length;
  const colWidth = Math.floor(CONTENT_WIDTH / colCount);

  const headerRow = new TableRow({
    tableHeader: true,
    children: header.map((cell) => new TableCell({
      borders: CELL_BORDERS,
      width: { size: colWidth, type: WidthType.DXA },
      shading: { fill: 'E7F4EA', type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: cell, bold: true })] })]
    }))
  });

  const bodyRows = body.map((cells) => new TableRow({
    children: header.map((_, index) => new TableCell({
      borders: CELL_BORDERS,
      width: { size: colWidth, type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: inlineRuns(cells[index] || '') })]
    }))
  }));

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: new Array(colCount).fill(colWidth),
    rows: [headerRow, ...bodyRows]
  });
}

/** 解析 Markdown → docx 子元素 */
function parse(markdown) {
  const lines = markdown.split(/\r?\n/);
  const children = [];
  let index = 0;

  while (index < lines.length) {
    const raw = lines[index];
    const line = raw.trim();

    if (!line || line === '---') { index += 1; continue; }

    // 表格
    if (line.startsWith('|')) {
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        const cells = splitRow(lines[index]);
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) rows.push(cells);
        index += 1;
      }
      if (rows.length) children.push(buildTable(rows), new Paragraph({ spacing: { after: 120 }, children: [] }));
      continue;
    }

    // 标题
    if (line.startsWith('#')) {
      const level = (line.match(/^#+/) || ['#'])[0].length;
      const text = line.replace(/^#+\s*/, '');
      if (level === 1) {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 240 },
          children: [new TextRun({ text, bold: true, size: 44, color: '174F39' })]
        }));
      } else {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 320, after: 160 },
          children: [new TextRun({ text, bold: true, size: 30, color: '1F6A4A' })]
        }));
      }
      index += 1;
      continue;
    }

    // 引用
    if (line.startsWith('>')) {
      children.push(new Paragraph({
        indent: { left: 360 },
        spacing: { before: 120, after: 120 },
        children: [new TextRun({ text: line.replace(/^>\s*/, ''), italics: true, color: '53685C' })]
      }));
      index += 1;
      continue;
    }

    // 有序列表
    if (/^\d+\.\s/.test(line)) {
      children.push(new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: inlineRuns(line.replace(/^\d+\.\s*/, ''))
      }));
      index += 1;
      continue;
    }

    // 无序列表（含两级缩进）
    const bullet = line.match(/^(\s*)-\s+(.*)$/);
    if (bullet) {
      const level = Math.min(bullet[1].length >= 2 ? 1 : 0, 1);
      children.push(new Paragraph({
        numbering: { reference: 'bullets', level },
        spacing: { after: 80 },
        children: inlineRuns(bullet[2])
      }));
      index += 1;
      continue;
    }

    // 普通段落
    children.push(new Paragraph({
      spacing: { after: 140 },
      children: inlineRuns(line)
    }));
    index += 1;
  }

  return children;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

const markdown = fs.readFileSync(SRC, 'utf8');
const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: 320 } } } }
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 260 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 900, hanging: 260 } } } }
        ]
      },
      {
        reference: 'steps',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 260 } } } }]
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: parse(markdown)
  }]
});

Packer.toBuffer(doc).then((buffer) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, buffer);
  console.log('已生成 ' + path.basename(OUT) + '，' + (buffer.length / 1024).toFixed(1) + ' KB');
});
