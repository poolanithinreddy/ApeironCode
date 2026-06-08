import {add} from './index.js';

if (add(2, 2) !== 4) {
  throw new Error('add should add numbers');
}

console.log('ok');
