import {formatName} from './index.js';

if (formatName(' Ada ') !== 'Ada') {
  throw new Error('formatName should trim whitespace');
}

console.log('ok');
