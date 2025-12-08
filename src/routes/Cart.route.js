const express = require('express');

const router = express.Router();
const { cartController } = require('../controllers');
const auth = require('../middlewares/auth');
// const checkPermission = require('../middlewares/permission.middleware');

// CartRoutes

// Get all carts (with optional filtering)
router.get(
  '/api/carts',
  auth,
  // checkPermission('VIEW_CART'),
  cartController.getCarts,
);
router.put(
  '/api/carts/assign/customer/:cartId',
  cartController.assignCustomerToCart,
);
// Get current user's cart
router.get(
  '/api/carts/my-cart',
  auth,
  // checkPermission('VIEW_CART'),
  cartController.getCartByUserId,
);

// Create or update cart
router.post(
  '/api/carts',
  auth,
  // checkPermission('CREATE_CART'),
  cartController.createOrUpdateCart,
);

// Get cart by ID
router.get(
  '/api/carts/:id',
  auth,
  // checkPermission('VIEW_CART'),
  cartController.getCart,
);

// Get cart by ID with user filtering
router.get(
  '/api/carts/:id/user-filtered',
  auth,
  // checkPermission('VIEW_CART'),
  cartController.getCartByUser,
);

// Delete cart
router.delete(
  '/api/carts/:id',
  auth,
  // checkPermission('DELETE_CART'),
  cartController.deleteCart,
);

// Cart Items Routes

// Add item to cart
router.post(
  '/api/carts/:cartId/items',
  auth,
  // checkPermission('UPDATE_CART'),
  cartController.addItemToCart,
);

// Update cart item
router.put(
  '/api/carts/items/:cartItemId',
  auth,
  // checkPermission('UPDATE_CART'),
  cartController.updateCartItem,
);

// Remove item from cart
router.delete(
  '/api/carts/items/:cartItemId',
  auth,
  // checkPermission('UPDATE_CART'),
  cartController.removeItemFromCart,
);

// Cart Operations Routes

// Checkout cart convertOrderToCart
router.post(
  '/api/carts/:cartId/checkout',
  auth,
  // checkPermission('CHECKOUT_CART'),
  cartController.checkoutCart,
);
router.post(
  '/api/carts/convert/:sellId/OrderToCart',
  auth,
  // checkPermission('CHECKOUT_CART'),
  cartController.convertOrderToCart,
);

// Clear cart (remove all items)
router.delete(
  '/api/carts/:cartId/clear',
  auth,
  // checkPermission('UPDATE_CART'),
  cartController.clearCart,
);

// Waitlist routes
router.post('/api/waitlists', auth, cartController.addToWaitlist);
router.get('/api/waitlists/my-waitlists', auth, cartController.getMyWaitlists);
router.delete(
  '/api/waitlists/:waitlistItemId',
  auth,
  cartController.removeItemFromWaitlist,
);
router.delete(
  '/api/waitlists/cart/:cartId/clear',
  auth,
  cartController.clearWaitlist,
);
router.post(
  '/api/waitlists/:customerId/convert-to-cart',
  auth,
  cartController.convertCustomerWaitlistToCart,
);
router.get('/api/waitlists', auth, cartController.getAllWaitlists); // admin only
router.get('/api/waitlists/:waitlistId', auth, cartController.getWaitlist);
router.get(
  '/api/carts/:cartId/waitlists',
  auth,
  cartController.getCartWaitlists,
);
module.exports = router;
