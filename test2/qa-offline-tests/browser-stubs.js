/* The least amount of browser the offline code needs, so it can be driven from Node. */
global.navigator = global.navigator || {}; if (!('onLine' in global.navigator)) Object.defineProperty(global.navigator, 'onLine', { value: true, writable: true, configurable: true });
global.document = { hidden: false, addEventListener() {} };
global.addEventListener = () => {};
global.indexedDB = undefined;
