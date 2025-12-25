// routes/sell.routes.js
const express = require('express');

const router = express.Router();
const { sellController } = require('../controllers');
const auth = require('../middlewares/auth');
const checkPermission = require('../middlewares/permission.middleware');

// Create a sell
router.post(
  '/api/sells',
  auth,
  checkPermission('CREATE'),
  sellController.createSell,
);
router.get(
  '/api/sells/user/based',
  auth,
  // checkPermission('VIEW_SHOP'),
  sellController.getAllSellsuser,
);

// Get a sell by ID
router.get(
  '/api/sells/:id',
  auth,
  // checkPermission('VIEW_SELL'),
  sellController.getSell,
);

router.patch(
  '/api/sells/With/Lock/:id',
  auth,
  checkPermission('VIEW_SELL'),
  sellController.unlockSell,
);

router.get('/api/sells/:id/user/based', auth, sellController.getSellByIdByuser);

// Get all sells
router.get(
  '/api/sells',
  auth,
  checkPermission('VIEW_ALL_SELLS'),
  sellController.getSells,
);

router.get('/api/sells/store/getAll', auth, sellController.getAllSellsForStore);

// Update a sell
router.put(
  '/api/sells/:id',
  auth,
  checkPermission('UPDATE_SELL'),
  sellController.updateSell,
);

// Delete a sell
router.delete(
  '/api/sells/:id',
  auth,
  checkPermission('DELETE_SELL'),
  sellController.deleteSell,
);

// ✅ Complete Sale Delivery
router.patch(
  '/api/sells/deliver/all/:id',
  auth,
  checkPermission('DELIVER_ALL_SALE_ITEMS'),
  sellController.deliverAllSaleItems,
);

router.patch(
  '/api/sells/deliver/:id',
  auth,
  checkPermission('COMPLETE_SALE_DELIVERY'),
  sellController.completeSaleDelivery,
);

router.patch(
  '/api/sells/partial/deliver/:id',
  auth,
  checkPermission('PARTIAL_SALE_DELIVERY'),
  sellController.partialSaleDelivery,
);

// ✅ Update Sale Status
router.patch(
  '/api/sells/:id/status',
  auth,
  checkPermission('UPDATE_SELL_STATUS'),
  sellController.updateSaleStatus,
);

// ✅ Update Payment Status
router.patch(
  '/api/sells/:id/payment-status',
  auth,
  checkPermission('UPDATE_PAYMENT_STATUS'),
  sellController.updatePaymentStatus,
);

// ✅ Cancel Sale
router.patch(
  '/api/sells/:id/cancel',
  auth,
  checkPermission('CANCEL_SELL'),
  sellController.cancelSale,
);

module.exports = router;
