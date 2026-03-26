export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  discount: number;
  finalTotal: number;
  status: 'pending' | 'confirmed' | 'failed';
  notify: boolean;
  timestamp: number;
}

export interface OrderResult {
  success: boolean;
  order?: Order;
  error?: string;
}

export interface InventoryUpdate {
  itemName: string;
  quantityRemoved: number;
  remainingStock: number;
}

export interface NotificationResult {
  sent: boolean;
  channel: string;
  recipient: string;
}
