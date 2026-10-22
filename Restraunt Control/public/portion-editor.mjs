const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function portionEditorHTML() {
  return `<section class="portion-editor" aria-label="Portion sizes"><label class="portion-toggle"><input type="checkbox" data-portion-toggle> <strong>Offer portion sizes</strong></label><p class="muted">Rename any size, set its price, add a new size or remove one. Changes stay private until saved. Existing orders keep their original names and prices.</p><div data-portion-controls><div data-portion-rows></div><button type="button" data-portion-add>+ Add size</button><p class="muted portion-help">Up to 20 sizes. Renaming preserves existing size IDs and stock links. For stock-tracked dishes, set stock for new sizes before selling.</p></div><p data-portion-single class="muted" hidden>Portion sizes are off. This dish uses its base price.</p><p data-portion-error class="danger" role="alert" hidden></p></section>`;
}
export function mountPortionEditor(root, initial = []) {
  const toggle = root.querySelector('[data-portion-toggle]');
  const rows = root.querySelector('[data-portion-rows]');
  const add = root.querySelector('[data-portion-add]');
  let sizes = initial.map(s => ({...s}));
  const sync = () => {
    root.querySelector('[data-portion-controls]').hidden = !toggle.checked;
    root.querySelector('[data-portion-single]').hidden = toggle.checked;
    for (const el of rows.querySelectorAll('input')) el.disabled = !toggle.checked;
    add.disabled = sizes.length >= 20;
  };
  const render = () => {
    rows.innerHTML = sizes.map((s,n) => `<div class="portion-size-row"><label>Size name<input data-size-label="${n}" aria-label="Size ${n+1} name" maxlength="40" value="${esc(s.label)}" placeholder="e.g. Regular" required></label><label>Price<input data-size-price="${n}" aria-label="Size ${n+1} price" type="number" min="0" step="0.01" value="${esc(s.price)}" required></label><button type="button" data-size-remove="${n}" aria-label="Remove size ${n+1}">Remove</button></div>`).join('');
    sync();
  };
  toggle.checked = sizes.length > 0;
  toggle.addEventListener('change', sync);
  rows.addEventListener('input', e => {
    if (e.target.hasAttribute('data-size-label')) sizes[+e.target.dataset.sizeLabel].label = e.target.value;
    if (e.target.hasAttribute('data-size-price')) sizes[+e.target.dataset.sizePrice].price = e.target.value;
  });
  rows.addEventListener('click', e => {
    const b = e.target.closest('[data-size-remove]');
    if (!b) return;
    sizes.splice(+b.dataset.sizeRemove, 1); render(); add.focus();
  });
  add.addEventListener('click', () => {
    if (sizes.length >= 20) return;
    sizes.push({id: crypto.randomUUID(), label:'', price:''}); render();
    rows.querySelector(`[data-size-label="${sizes.length-1}"]`).focus();
  });
  render();
  return {read() {
    const error = root.querySelector('[data-portion-error]'); error.hidden = true;
    const fail = message => {error.textContent = message; error.hidden = false; throw Error(message);};
    if (!toggle.checked) return [];
    if (!sizes.length) fail('Add at least one size, or turn off Offer portion sizes.');
    const seen = new Set();
    return sizes.map(s => {
      const label = s.label.trim(), price = Number(s.price);
      if (!label || label.length > 40) fail('Enter a size name of 1–40 characters.');
      if (seen.has(label.toLowerCase())) fail('Each size needs a unique name.');
      seen.add(label.toLowerCase());
      if (s.price === '' || !Number.isFinite(price) || price < 0 || price > 1e9) fail('Enter a valid non-negative price for every size.');
      return {id:s.id,label,price:Math.round(price*100)/100};
    });
  }};
}
