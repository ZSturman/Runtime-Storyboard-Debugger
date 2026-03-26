import express from 'express';
import { createOrder } from './services/order-service';

const app = express();
app.use(express.json());

app.post('/orders', (req, res) => {
  const { items, notify } = req.body;
  const result = createOrder(items, notify);

  if (result.success) {
    res.status(201).json(result);
  } else {
    res.status(400).json(result);
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;

// Start server if run directly
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Order API running on http://localhost:${PORT}`);
  });
}
