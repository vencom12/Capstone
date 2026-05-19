const fetch = require('node-fetch');

async function main() {
  const res = await fetch('http://localhost:5001/api/products');
  const products = await res.json();
  console.log("API Products:");
  products.forEach(p => {
    console.log(`- Name: ${p.name}, Count: ${p.count}, Reserved: ${p.reservedCount}`);
  });
}

main().catch(console.error);
