import { renderWithPool } from '../../dist/d2/pool-client.js';
const options = JSON.parse(process.argv[2]);
const prefix = process.argv[3];
const values = await Promise.all(Array.from({ length: 4 }, (_, index) => {
  const key = `${prefix}-${index}`;
  return renderWithPool(key, { source: `slow-${key}`, salt: key }, options);
}));
console.log(JSON.stringify(values));
