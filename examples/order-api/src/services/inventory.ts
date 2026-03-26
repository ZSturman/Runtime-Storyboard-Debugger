import type { OrderItem, InventoryUpdate } from '../types';

// In-memory stock for demo purposes
const stock: Record<string, number> = {
  'Widget': 100,
  'Premium Widget': 50,
  'Gadget': 75,
  'Super Gadget': 25,
};

export function updateInventory(items: OrderItem[]): InventoryUpdate[] {
  const updates: InventoryUpdate[] = [];

  for (const item of items) {
    const currentStock = stock[item.name] ?? 0;
    const newStock = Math.max(0, currentStock - item.quantity);
    stock[item.name] = newStock;

    updates.push({
      itemName: item.name,
      quantityRemoved: item.quantity,
      remainingStock: newStock,
    });

    console.log(`Inventory updated: ${item.name} stock ${currentStock} → ${newStock}`);
  }

  return updates;
}

export function getStock(itemName: string): number {
  return stock[itemName] ?? 0;
}

export function resetStock(): void {
  stock['Widget'] = 100;
  stock['Premium Widget'] = 50;
  stock['Gadget'] = 75;
  stock['Super Gadget'] = 25;
}
