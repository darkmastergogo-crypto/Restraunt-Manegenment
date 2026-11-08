/* Resolve CSV categories against the same list used by category management. */
'use strict';
const CsvCategories = (() => {
  function normalize(value) {
    const trimmed = (value || '').trim();
    return [...trimmed].slice(0, 60).join('').trimEnd() || 'No Category';
  }

  function match(name, categories) {
    return categories.includes(name) ? name : categories.find(c => c.toLowerCase() === name.toLowerCase());
  }

  async function ensure(rpc, requested) {
    const names = new Map();
    let added = 0;
    if (!requested.length) return { names, added };

    const args = { p_action: 'list', p_name: null, p_new_name: null, p_replacement: null };
    const getNames = result => result.categories.map(c => c.name);
    let categories = getNames(await rpc('restaurant_categories66', args, true));
    for (const value of new Set(requested)) {
      const name = normalize(value);
      let existing = match(name, categories);
      if (!existing) {
        const result = await rpc('restaurant_categories66', { ...args, p_action: 'add', p_name: name }, true);
        categories = getNames(result);
        existing = match(name, categories);
        if (!existing) throw Error(`Could not create category “${name}”.`);
        added++;
      }
      names.set(value, existing);
    }
    return { names, added };
  }

  return { normalize, match, ensure };
})();
