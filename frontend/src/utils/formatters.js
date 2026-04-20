export function formatOrderDesign(order) {
  if (order.items && order.items.length > 0) {
    return order.items.map(i => `${i.name}${i.quantity > 1 ? ' ×' + i.quantity : ''}`).join(', ');
  }
  return order.design || 'Custom Design';
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatCurrency(amount) {
  return `$${parseFloat(amount || 0).toFixed(2)}`;
}
