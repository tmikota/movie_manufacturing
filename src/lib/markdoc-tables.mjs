// Keystatic's editor saves tables in Markdoc syntax:
//
//   {% table %}
//   - Header A
//   - Header B
//   ---
//   - Cell 1
//   - Cell 2
//   {% /table %}
//
// The site renders essays as plain Markdown, which reads that as a paragraph,
// some bullet lists and horizontal rules. This Sätteri hast plugin finds the
// {% table %} ... {% /table %} run at the top level of an essay and rebuilds
// it as a <table>: each list is a row, each list item a cell, and the first
// row is the header.
//
// A table whose first cell is empty starts "{% table %}" then a bare "-",
// which Markdown reads as a heading underline. That heading is accepted as the
// opening tag, and the swallowed empty cell is put back.
const OPEN = '{% table %}';
const CLOSE = /\s*\{%\s*\/table\s*%\}\s*$/;

const isWhitespace = (n) => n.type === 'text' && !n.value.trim();

// Plain copies of the nodes, so they can be placed in the new table.
const copy = (node) => JSON.parse(JSON.stringify(node));

// Drop a trailing "{% /table %}" that Markdown folded into the last cell.
function stripClose(node) {
  if (node.type === 'text') {
    if (!CLOSE.test(node.value)) return false;
    node.value = node.value.replace(CLOSE, '');
    return true;
  }
  const kids = node.children ?? [];
  for (let i = kids.length - 1; i >= 0; i--) {
    if (isWhitespace(kids[i])) continue;
    return stripClose(kids[i]);
  }
  return false;
}

// A list item's content, with a lone <p> unwrapped so cells aren't padded.
function cellContent(li) {
  const kids = li.children.filter((n) => !isWhitespace(n));
  if (kids.length === 1 && kids[0].type === 'element' && kids[0].tagName === 'p') {
    return kids[0].children;
  }
  return kids;
}

const el = (tagName, children) => ({ type: 'element', tagName, properties: {}, children });

function buildTable(lists) {
  const rows = lists.map((ul) =>
    ul.children
      .filter((n) => n.type === 'element' && n.tagName === 'li')
      .map(cellContent),
  );
  const [head, ...body] = rows;
  return el('div', [
    el('table', [
      el('thead', [el('tr', head.map((c) => el('th', c)))]),
      el('tbody', body.map((r) => el('tr', r.map((c) => el('td', c))))),
    ]),
  ]);
}

export const markdocTables = {
  name: 'markdoc-tables',
  after(root, ctx) {
    const kids = root.children;
    for (let i = 0; i < kids.length; i++) {
      const start = kids[i];
      if (start.type !== 'element' || !['p', 'h2'].includes(start.tagName)) continue;
      if (ctx.textContent(start).trim() !== OPEN) continue;
      const emptyFirstCell = start.tagName === 'h2';

      const run = [];
      const lists = [];
      let closed = false;
      for (let j = i + 1; j < kids.length && !closed; j++) {
        const n = kids[j];
        run.push(n);
        if (isWhitespace(n)) continue;
        if (n.type === 'element' && n.tagName === 'hr') continue;
        if (n.type === 'element' && n.tagName === 'p' && CLOSE.test(ctx.textContent(n)) &&
            ctx.textContent(n).trim().startsWith('{%')) {
          closed = true;
        } else if (n.type === 'element' && n.tagName === 'ul') {
          const ul = copy(n);
          lists.push(ul);
          closed = stripClose(ul);
        } else {
          break; // Not a table we understand; leave the markup alone.
        }
      }
      if (!closed || !lists.length) continue;
      if (emptyFirstCell) lists[0].children.unshift(el('li', []));

      const table = buildTable(lists);
      table.properties = { className: ['table-wrap'] };
      ctx.replaceNode(start, table);
      for (const n of run) ctx.removeNode(n);
      i += run.length;
    }
  },
};
