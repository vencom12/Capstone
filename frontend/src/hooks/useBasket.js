import { useState, useCallback, useEffect } from 'react';

const BASKET_KEY = 'stitch_basket';

export function useBasket() {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(BASKET_KEY) || '[]');
    } catch { return []; }
  });

  // Sync to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem(BASKET_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((product, quantity = 1) => {
    setItems(prev => {
      const existing = prev.find(b => b.name === product.name);
      if (existing) {
        return prev.map(b =>
          b.name === product.name
            ? { ...b, quantity: b.quantity + parseInt(quantity) }
            : b
        );
      }
      return [...prev, { ...product, quantity: parseInt(quantity), id: Date.now() }];
    });
  }, []);

  const updateQuantity = useCallback((id, change) => {
    setItems(prev => {
      const updated = prev.map(b =>
        b.id.toString() === id.toString()
          ? { ...b, quantity: b.quantity + change }
          : b
      );
      return updated.filter(b => b.quantity > 0);
    });
  }, []);

  const removeItem = useCallback((id) => {
    setItems(prev => prev.filter(item => item.id.toString() !== id.toString()));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const total = items.reduce((sum, item) => sum + (parseFloat(item.price) * (item.quantity || 1)), 0);
  const count = items.length;

  return { items, count, total, addItem, updateQuantity, removeItem, clear };
}
