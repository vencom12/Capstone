const fs = require('fs');
const p = 'frontend/src/app/dashboard/page.tsx';
const raw = fs.readFileSync(p, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const L = raw.split(/\r?\n/);

// Safety checks on anchors
if (!L[334].includes('grid grid-cols-2') || L[393].trim() !== '</div>' || L[394].trim() !== ')}') {
  console.error('Anchor mismatch, aborting'); process.exit(1);
}

const repl = [
  '              <OrderList',
  '                orders={filteredOrders}',
  "                onTrack={(ord) => { setSelectedOrder(ord); setOrderDetailsTab('tracking'); setIsOrderDetailsOpen(true); }}",
  "                onDetails={(ord) => { setSelectedOrder(ord); setOrderDetailsTab('summary'); setIsOrderDetailsOpen(true); }}",
  '                onReorder={handleReorder}',
  '              />',
];
L.splice(334, 60, ...repl);                                  // lines 335-394
L.splice(230, 0, "              onViewAll={() => setActiveTab('tracking')}"); // after line 230
L.splice(20, 0, "import OrderList from '@/components/dashboard/OrderList';");   // after line 20
fs.writeFileSync(p, L.join(eol));
console.log('done');
