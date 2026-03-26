export interface DiscountResult {
  applied: boolean;
  discountAmount: number;
  reason: string;
}

const DISCOUNT_THRESHOLD = 100;
const DISCOUNT_RATE = 0.1; // 10%

export function calculateDiscount(total: number): DiscountResult {
  if (total > DISCOUNT_THRESHOLD) {
    const discountAmount = Math.round(total * DISCOUNT_RATE * 100) / 100;
    return {
      applied: true,
      discountAmount,
      reason: `10% discount applied: order total $${total} exceeds $${DISCOUNT_THRESHOLD} threshold`,
    };
  }

  return {
    applied: false,
    discountAmount: 0,
    reason: `No discount: order total $${total} is below $${DISCOUNT_THRESHOLD} threshold`,
  };
}
