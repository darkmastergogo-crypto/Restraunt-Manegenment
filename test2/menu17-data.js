/* Customer menu v17: 20 layouts ("architectures"), 40 menu themes, editable words and switches.
   Shared by the customer menu (menu17.js) and the staff Menu design screen. Data only. */
(function () {
'use strict';
const T = (id, name, dark, bg, card, ink, sub, line, soft, accent, onAccent, head, body, radius, extra = {}) =>
  ({ id, name, dark, bg, card, ink, sub, line, soft, accent, onAccent, head, body, radius, ...extra });
const THEMES = [
  T('tomato', 'Tomato', 0, '#ffffff', '#ffffff', '#1c1c1c', '#696969', '#ececec', '#f4f4f4', '#e23744', '#ffffff', 'Inter', 'Inter', 16),
  T('saffron', 'Saffron', 0, '#ffffff', '#ffffff', '#1f1f1f', '#686b78', '#e9e9eb', '#f2f2f3', '#fc8019', '#ffffff', 'Plus Jakarta Sans', 'Plus Jakarta Sans', 16),
  T('basil', 'Basil', 0, '#fbfdfb', '#ffffff', '#14231b', '#5e6b63', '#e3ece6', '#eef5f0', '#1a9c5b', '#ffffff', 'Manrope', 'Manrope', 16),
  T('ocean', 'Ocean', 0, '#f7fafd', '#ffffff', '#0f1d2c', '#5b6b7c', '#e1e8f0', '#edf2f8', '#0e74d8', '#ffffff', 'Sora', 'Inter', 14),
  T('berry', 'Berry', 0, '#fff8fb', '#ffffff', '#2a0f1d', '#7a5a68', '#f3e1ea', '#fbeef4', '#c2185b', '#ffffff', 'Poppins', 'Poppins', 18),
  T('grape', 'Grape', 0, '#faf8ff', '#ffffff', '#1d1430', '#6b6080', '#e8e2f5', '#f1edfb', '#6d28d9', '#ffffff', 'Outfit', 'Outfit', 18),
  T('cocoa', 'Cocoa', 0, '#fbf7f2', '#fffdfa', '#2b1d14', '#7a6656', '#ece2d6', '#f4ece2', '#7b4b2a', '#ffffff', 'Lora', 'Manrope', 14),
  T('butter', 'Butter', 0, '#fffbea', '#ffffff', '#2a2210', '#776c4f', '#f1e8c7', '#fbf3d5', '#d97706', '#ffffff', 'Fredoka', 'Nunito', 20),
  T('mint', 'Mint', 0, '#f2fbf7', '#ffffff', '#0f2a20', '#567066', '#d9efe5', '#e6f6ef', '#0f9d76', '#ffffff', 'Outfit', 'Inter', 18),
  T('sky', 'Sky', 0, '#f3f8ff', '#ffffff', '#0d1b33', '#56657f', '#dbe6f7', '#e8f0fd', '#2563eb', '#ffffff', 'Plus Jakarta Sans', 'Inter', 16),
  T('blush', 'Blush', 0, '#fff5f5', '#ffffff', '#2d1215', '#7d5f62', '#f6dfe1', '#fdeced', '#e11d48', '#ffffff', 'DM Serif Display', 'Inter', 18),
  T('lavender', 'Lavender', 0, '#f7f5ff', '#ffffff', '#1c1733', '#68628a', '#e4e0f7', '#efecfd', '#7c3aed', '#ffffff', 'Sora', 'Manrope', 20),
  T('sand', 'Sand', 0, '#faf6ef', '#fffdf8', '#2b241a', '#7a6e5c', '#ebe2d2', '#f3ecdf', '#b45309', '#ffffff', 'Fraunces', 'Manrope', 14),
  T('paper', 'Paper menu', 0, '#f7f4ee', '#fbf9f5', '#1f1d1a', '#6e675d', '#ddd5c7', '#efe9de', '#8b1e1e', '#ffffff', 'Playfair Display', 'Lora', 6),
  T('clay', 'Clay', 0, '#fdf6f0', '#ffffff', '#2e1a10', '#7c6255', '#f1e0d3', '#f8ebe1', '#c2410c', '#ffffff', 'Bricolage Grotesque', 'Manrope', 16),
  T('olive', 'Olive', 0, '#f9faf2', '#ffffff', '#1f2410', '#676d55', '#e5e8d4', '#eff1e3', '#4d7c0f', '#ffffff', 'Fraunces', 'Inter', 14),
  T('teal', 'Teal', 0, '#f2fbfa', '#ffffff', '#0b2523', '#55706d', '#d6ece9', '#e4f4f2', '#0f766e', '#ffffff', 'Manrope', 'Manrope', 16),
  T('coral', 'Coral', 0, '#fff7f5', '#ffffff', '#2d1410', '#7e6159', '#f6e0da', '#fdece7', '#f2543d', '#ffffff', 'Poppins', 'Inter', 18),
  T('citrus', 'Citrus', 0, '#fbfdf2', '#ffffff', '#1c230c', '#646c50', '#e6ecd0', '#f1f5de', '#65a30d', '#ffffff', 'Outfit', 'Outfit', 18),
  T('slate', 'Slate', 0, '#f5f7fa', '#ffffff', '#111827', '#5f6b7a', '#e3e7ed', '#eef1f5', '#334155', '#ffffff', 'Inter', 'Inter', 12),
  T('mono', 'Black & white', 0, '#ffffff', '#ffffff', '#0a0a0a', '#5c5c5c', '#e6e6e6', '#f2f2f2', '#0a0a0a', '#ffffff', 'Space Grotesk', 'Space Grotesk', 4),
  T('candy', 'Candy', 0, '#fff0f7', '#ffffff', '#2e0f20', '#80607a', '#f8d9ea', '#fde6f2', '#ec4899', '#ffffff', 'Fredoka', 'Nunito', 24),
  T('matcha', 'Matcha', 0, '#f4f7ee', '#fdfef9', '#1b2412', '#646d58', '#e1e8d4', '#ebf0e0', '#5a7d2a', '#ffffff', 'Outfit', 'Manrope', 16),
  T('royal', 'Royal', 0, '#f8f6f1', '#fffdf9', '#14182b', '#626578', '#e6e0d2', '#f0ece2', '#1e3a8a', '#ffffff', 'Playfair Display', 'Manrope', 10, { tag: '#a07a1f' }),
  T('peach', 'Peach', 0, '#fff4ec', '#ffffff', '#2f1a0e', '#806554', '#f6e0cf', '#fdebdd', '#ea580c', '#ffffff', 'Poppins', 'Poppins', 20),
  T('banana', 'Banana leaf', 0, '#f6fbf3', '#ffffff', '#10230f', '#5b6c59', '#dcebd6', '#e9f4e5', '#166534', '#ffffff', 'Fraunces', 'Nunito', 16, { tag: '#b8860b' }),
  T('midnight', 'Midnight', 1, '#0f1115', '#181b21', '#f3f4f6', '#a0a6b1', '#2a2e36', '#20242b', '#ef4f5f', '#ffffff', 'Inter', 'Inter', 16),
  T('noir', 'Charcoal gold', 1, '#121212', '#1c1c1c', '#f5f1e8', '#b3aa98', '#2e2b26', '#24221e', '#d4a64a', '#1a1408', 'Playfair Display', 'Manrope', 12),
  T('neon', 'Neon', 1, '#0b0b14', '#14142a', '#eef0ff', '#9da0c4', '#272849', '#1b1c38', '#22d3ee', '#04161b', 'Space Grotesk', 'Space Grotesk', 14),
  T('forest', 'Forest night', 1, '#0f1a14', '#16241c', '#ecf5ef', '#9cb2a5', '#24382c', '#1c2e24', '#34d399', '#052016', 'Fraunces', 'Inter', 16),
  T('espresso', 'Espresso', 1, '#1b1410', '#251b15', '#f6ede4', '#bba795', '#3a2c22', '#2f231b', '#e0a96d', '#22160c', 'Fraunces', 'Manrope', 14),
  T('wine', 'Wine', 1, '#1a0f14', '#26151d', '#f9eaf0', '#c19aac', '#3d2230', '#311b26', '#f0457f', '#ffffff', 'DM Serif Display', 'Inter', 14),
  T('chalk', 'Chalkboard', 1, '#1f2a24', '#26332c', '#f1f5f2', '#b5c4ba', '#3a4a41', '#2f3d35', '#fbbf24', '#1f1606', 'Caveat', 'Nunito', 10),
  T('inkblue', 'Ink blue', 1, '#0b1324', '#121c33', '#eaf0ff', '#9aa8c7', '#24304d', '#1a2540', '#60a5fa', '#06142b', 'Sora', 'Inter', 16),
  T('amber', 'Amber night', 1, '#17120a', '#211a0f', '#fbf3e3', '#c2b08f', '#3a2e19', '#2c2314', '#f59e0b', '#1d1302', 'Bricolage Grotesque', 'Manrope', 16),
  T('plum', 'Plum', 1, '#160f1f', '#21162e', '#f4ecff', '#b3a2c8', '#372650', '#2a1d3d', '#c084fc', '#1c0b2e', 'Outfit', 'Outfit', 20),
  T('smoke', 'Smokehouse', 1, '#1a1b1e', '#232428', '#f4f4f5', '#a7a8ae', '#36373d', '#2b2c31', '#f97316', '#ffffff', 'Oswald', 'Inter', 8),
  T('lagoon', 'Lagoon', 1, '#071a1f', '#0d252c', '#e6fbf8', '#93b9b4', '#1a3a40', '#123037', '#2dd4bf', '#03201c', 'Manrope', 'Manrope', 18),
  T('onyx', 'Onyx', 1, '#000000', '#0f0f0f', '#ffffff', '#a3a3a3', '#262626', '#1a1a1a', '#ffffff', '#000000', 'Space Grotesk', 'Inter', 6),
  T('crimson', 'Crimson', 1, '#140b0b', '#1f1212', '#fbecec', '#c4a0a0', '#3b2222', '#2e1919', '#ef4444', '#ffffff', 'Oswald', 'Inter', 10)
];

/* Layout parts: hero, info, nav, group, item, cols. Each architecture is a full combination. */
const A = (id, name, note, hero, info, nav, group, item, cols = 1, extra = {}) => ({ id, name, note, hero, info, nav, group, item, cols, ...extra });
const ARCHS = [
  A('classic', 'Classic feed', 'Photo slider, info card, folding categories, dish rows with photo on the right.', 'carousel', 'sheet', 'pill', 'accordion', 'row'),
  A('swift', 'Swift', 'Banner on top, sticky category tabs, dish rows.', 'banner', 'inline', 'chips', 'sections', 'row'),
  A('photoleft', 'Photo left', 'Dish photo on the left, details on the right.', 'carousel', 'sheet', 'chips', 'sections', 'rowLeft'),
  A('grid', 'Grid cards', 'Two dishes per row with big photos.', 'banner', 'inline', 'chips', 'sections', 'card', 2),
  A('bigphoto', 'Big pictures', 'One large photo card per dish.', 'carousel', 'sheet', 'chips', 'sections', 'wide'),
  A('printed', 'Printed menu', 'Text-only menu with dotted price lines, like a paper menu.', 'cover', 'none', 'pill', 'sections', 'text', 1, { center: true }),
  A('tabs', 'One category at a time', 'Tabs at the top show one category at a time.', 'compact', 'inline', 'tabs', 'tabs', 'row'),
  A('rail', 'Side rail', 'Categories down the left side, dishes on the right.', 'compact', 'inline', 'rail', 'sections', 'thumb'),
  A('shelves', 'Shelves', 'Each category is a row you swipe sideways.', 'carousel', 'sheet', 'pill', 'shelves', 'card'),
  A('tiles', 'Category tiles', 'Picture tiles for categories, tap one to see its dishes.', 'banner', 'inline', 'tiles', 'tabs', 'row'),
  A('magazine', 'Magazine', 'Full-width food photos with the name on the picture.', 'cover', 'sheet', 'chips', 'sections', 'story'),
  A('bento', 'Bento', 'First dish of each category big, the rest in a grid.', 'split', 'inline', 'chips', 'sections', 'bento', 2),
  A('quick', 'Quick order', 'No banner, compact rows, fastest to order.', 'none', 'inline', 'chips', 'sections', 'text'),
  A('thumbs', 'Round thumbnails', 'Small round photos, slim rows.', 'banner', 'inline', 'chips', 'sections', 'thumb'),
  A('spotlight', 'Spotlight', 'Best sellers slider on top, then dish rows.', 'carousel', 'sheet', 'chips', 'sections', 'row', 1, { spot: true }),
  A('split', 'Split hero', 'Words and photo side by side, two-column cards.', 'split', 'inline', 'chips', 'sections', 'card', 2),
  A('book', 'Menu book', 'Every category folded; open the one you want.', 'cover', 'sheet', 'pill', 'accordion', 'rowLeft', 1, { folded: true }),
  A('minitiles', 'Mini tiles', 'Three small tiles per row.', 'compact', 'inline', 'chips', 'sections', 'tile', 3),
  A('gallery', 'Gallery', 'Photo-first cards in two columns.', 'carousel', 'sheet', 'chips', 'sections', 'gallery', 2),
  A('fine', 'Fine dining', 'Centred, elegant, descriptions first.', 'cover', 'none', 'chips', 'sections', 'fine', 1, { center: true })
];
const PARTS = {
  hero: [['carousel', 'Photo slider'], ['banner', 'Rounded banner'], ['split', 'Words + photo'], ['cover', 'Tall cover'], ['compact', 'Name bar'], ['none', 'No banner']],
  info: [['sheet', 'Card over the photo'], ['inline', 'Simple card'], ['none', 'Hidden']],
  nav: [['pill', 'Floating Menu button'], ['chips', 'Sticky category tabs'], ['rail', 'Side rail'], ['tiles', 'Category tiles'], ['tabs', 'Tabs (one at a time)']],
  group: [['sections', 'All categories'], ['accordion', 'Folding categories'], ['shelves', 'Swipe rows'], ['tabs', 'One category at a time']],
  item: [['row', 'Row, photo right'], ['rowLeft', 'Row, photo left'], ['card', 'Card'], ['wide', 'Big photo'], ['text', 'Text only'], ['tile', 'Small tile'], ['story', 'Photo with name on it'], ['thumb', 'Round thumbnail'], ['bento', 'Bento'], ['gallery', 'Gallery'], ['fine', 'Fine dining']],
  cols: [['1', '1 column'], ['2', '2 columns'], ['3', '3 columns']]
};
const FONTS = {
  'Inter': 'Inter:wght@400;500;600;700;800', 'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@400;500;600;700;800', 'Manrope': 'Manrope:wght@400;500;600;700;800',
  'Sora': 'Sora:wght@400;500;600;700', 'Poppins': 'Poppins:wght@400;500;600;700;800', 'Outfit': 'Outfit:wght@400;500;600;700;800', 'Lora': 'Lora:wght@400;500;600;700',
  'Fredoka': 'Fredoka:wght@400;500;600;700', 'Nunito': 'Nunito:wght@400;600;700;800', 'DM Serif Display': 'DM+Serif+Display', 'Fraunces': 'Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700',
  'Playfair Display': 'Playfair+Display:wght@500;600;700;800', 'Bricolage Grotesque': 'Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800',
  'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700', 'Caveat': 'Caveat:wght@600;700', 'Oswald': 'Oswald:wght@500;600;700'
};
const TEXTS = [
  ['Dishes', [
    ['add', 'ADD'], ['customisable', 'customisable'], ['more', 'more'], ['soldOut', 'Sold out'], ['onlyLeft', 'Only {n} left'], ['from', 'from'],
    ['bestseller', 'Bestseller'], ['recommended', 'Chef’s special'], ['dishes', '{n} dishes'], ['oneDish', '1 dish']]],
  ['Top of the menu', [
    ['search', 'Search for dishes'], ['table', 'Table'], ['tagline', ''], ['location', ''], ['time', ''], ['chip', ''], ['rating', ''], ['ratingCount', ''],
    ['aboutTitle', 'About us'], ['about', '']]],
  ['Filters & categories', [
    ['filters', 'Filters'], ['veg', 'Veg'], ['nonveg', 'Non-veg'], ['saved', 'Saved'], ['menuPill', 'Menu'], ['menuTitle', 'Menu'], ['spotTitle', 'Best sellers'],
    ['sortTitle', 'Sort by'], ['sortDefault', 'Recommended'], ['sortLow', 'Price: low to high'], ['sortHigh', 'Price: high to low'], ['apply', 'Apply'], ['clear', 'Clear all'],
    ['results', 'Results for “{q}”'], ['noResults', 'No dishes match your filters.']]],
  ['Dish details', [
    ['quantity', 'Quantity'], ['required', 'Required'], ['selectOne', 'Select any 1 option'], ['cookingTitle', 'Add a cooking request (optional)'],
    ['cookingHint', 'We’ll try our best to follow your request.'], ['cookingPlaceholder', 'e.g. Don’t make it too spicy'], ['addItem', 'Add item'], ['save', 'Save'], ['share', 'Share']]],
  ['Buttons & cart', [
    ['callWaiter', 'Call waiter'], ['requestSong', 'Request song'], ['viewCart', 'View cart'], ['itemAdded', '{n} item added'], ['itemsAdded', '{n} items added'], ['yourOrders', 'Your orders']]],
  ['Offers', [
    ['offersLine', 'Get up to {amount} off'], ['offersCount', '{n} offers'], ['offerCount1', '1 offer'], ['offersTitle', 'Offers for you'],
    ['instaTitle', 'Follow us on Instagram'], ['instaSub', 'Follow {handle} and get {amount} off this order.'], ['instaBtn', 'Follow'], ['instaConfirm', 'I followed {handle}'],
    ['reviewTitle', 'Rate us 5★ on Google'], ['reviewSub', 'Post a 5-star Google review and get {amount} off this order.'], ['reviewBtn', 'Write review'], ['reviewConfirm', 'I posted my 5-star review'],
    ['applyOffer', 'Apply'], ['applied', 'Applied'], ['remove', 'Remove'], ['offerDiscount', 'Offer discount'], ['offerOne', 'One offer per order.'], ['offerBoth', 'You can use both offers together.'],
    ['offerCheck', 'Please show it to the staff when your food is served.'], ['offerMin', 'Order {amount} or more to use this offer.'], ['offerUsed', 'Offer already used on this phone today.']]]
];
const TEXT_DEFAULTS = Object.fromEntries(TEXTS.flatMap(([, rows]) => rows));
const TEXT_LABELS = {
  add: 'Add button', customisable: 'Under the add button for dishes with portions', more: 'Read more link', soldOut: 'Sold out', onlyLeft: 'Low stock ({n} = number left)', from: 'Before the lowest portion price',
  bestseller: 'Best seller tag', recommended: 'Recommended tag', dishes: 'Dish count ({n})', oneDish: 'Dish count for one',
  search: 'Search box', table: 'Table word', tagline: 'Line under the name', location: 'Address / area line', time: 'Timing line (e.g. Serving in 15–20 min)', chip: 'Small badge (e.g. Pure veg kitchen)',
  rating: 'Rating number (e.g. 4.4)', ratingCount: 'Ratings count (e.g. 1.2K+ ratings)', aboutTitle: 'Info sheet title', about: 'Info sheet words (opening hours, address, phone…)',
  filters: 'Filters button', veg: 'Veg filter', nonveg: 'Non-veg filter', saved: 'Saved dishes filter', menuPill: 'Floating menu button', menuTitle: 'Category list title', spotTitle: 'Best sellers slider title',
  sortTitle: 'Sort title', sortDefault: 'Default order', sortLow: 'Low to high', sortHigh: 'High to low', apply: 'Apply button', clear: 'Clear button', results: 'Search title ({q})', noResults: 'Nothing found',
  quantity: 'Portion card title', required: 'Required tag', selectOne: 'Portion hint', cookingTitle: 'Cooking request title', cookingHint: 'Cooking request hint', cookingPlaceholder: 'Cooking request example',
  addItem: 'Add item button', save: 'Save (bookmark)', share: 'Share',
  callWaiter: 'Call waiter button', requestSong: 'Request song button', viewCart: 'Cart bar button', itemAdded: 'Cart bar, one item', itemsAdded: 'Cart bar, many items ({n})', yourOrders: 'Your orders',
  offersLine: 'Offer strip ({amount})', offersCount: 'Offer count ({n})', offerCount1: 'Offer count for one', offersTitle: 'Offers sheet title',
  instaTitle: 'Instagram offer title', instaSub: 'Instagram offer words ({handle}, {amount})', instaBtn: 'Instagram button', instaConfirm: 'Instagram tick box ({handle})',
  reviewTitle: 'Google review offer title', reviewSub: 'Google review offer words ({amount})', reviewBtn: 'Google review button', reviewConfirm: 'Google review tick box',
  applyOffer: 'Apply offer', applied: 'Applied', remove: 'Remove offer', offerDiscount: 'Discount row on the bill', offerOne: 'Rule: one offer', offerBoth: 'Rule: both offers', offerCheck: 'Note about showing proof', offerMin: 'Order too small for the offer ({amount})', offerUsed: 'Already used'
};
const SHOW = [
  ['hero', 'Banner / photo slider', true], ['info', 'Restaurant info card', true], ['rating', 'Rating badge', true], ['offers', 'Offer strip and offers in the cart', true],
  ['search', 'Search', true], ['filters', 'Filter chips (Veg, Non-veg…)', true], ['menuPill', 'Floating Menu button', true], ['photos', 'Dish photos', true],
  ['desc', 'Dish descriptions', true], ['tags', 'Best seller / recommended tags', true], ['vegMark', 'Veg / non-veg mark', true], ['bookmark', 'Save (bookmark) button', true],
  ['share', 'Share button', true], ['customisable', '“customisable” under ADD', true], ['cooking', 'Cooking request in dish details', true], ['counts', 'Dish count next to categories', true],
  ['catPhotos', 'Category photos', true], ['waiter', 'Call waiter button', true], ['song', 'Request song button', true], ['orders', 'Your orders button', true]
];
const SHOW_DEFAULTS = Object.fromEntries(SHOW.map(([k, , v]) => [k, v]));
const OFFER_DEFAULTS = { mode: 'one', insta: { on: false, handle: '', amount: 20 }, review: { on: false, url: '', amount: 50 } };
function offers(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const amt = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 && n <= 10000 ? n : d; };
  const handle = String(o.insta?.handle || '').trim().replace(/^@+/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30);
  let url = String(o.review?.url || '').trim(); try { const u = new URL(url); if (u.protocol !== 'https:') url = ''; } catch { url = ''; }
  return { mode: o.mode === 'both' ? 'both' : 'one',
    insta: { on: o.insta?.on === true && !!handle, handle, amount: amt(o.insta?.amount, 20) },
    review: { on: o.review?.on === true && !!url, url, amount: amt(o.review?.amount, 50) } };
}
window.M17Data = Object.freeze({ THEMES, ARCHS, PARTS, FONTS, TEXTS, TEXT_DEFAULTS, TEXT_LABELS, SHOW, SHOW_DEFAULTS, OFFER_DEFAULTS, offers });
})();
