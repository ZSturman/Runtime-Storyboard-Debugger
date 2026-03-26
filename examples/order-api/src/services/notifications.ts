import type { NotificationResult, Order } from '../types';

/**
 * Sends an async email notification about order confirmation.
 * Simulates a delayed async operation (like an email service).
 */
export function sendOrderConfirmation(order: Order): Promise<NotificationResult> {
  return new Promise((resolve) => {
    // Simulate async delay (email service, message queue, etc.)
    setTimeout(() => {
      console.log(`Email sent: Order ${order.id} confirmed, total: $${order.finalTotal}`);
      resolve({
        sent: true,
        channel: 'email',
        recipient: 'customer@example.com',
      });
    }, 50);
  });
}

/**
 * Fires off a notification without waiting — true async handoff.
 */
export function scheduleNotification(order: Order): void {
  // This is a fire-and-forget async operation.
  // The main flow does NOT await this — it continues immediately.
  sendOrderConfirmation(order).then((result) => {
    console.log(`Notification delivered via ${result.channel} to ${result.recipient}`);
  });
}
