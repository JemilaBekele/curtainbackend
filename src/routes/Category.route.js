const express = require('express');

const router = express.Router();
const { categoryController } = require('../controllers');
const auth = require('../middlewares/auth');
const checkPermission = require('../middlewares/permission.middleware');

// Category Routes
router.post(
  '/api/categories',
  auth,
  checkPermission('CREATE_CATEGORY'),
  categoryController.createCategory,
);

router.get(
  '/api/categories/:id',
  auth,
  //   checkPermission('VIEW_CATEGORY'),
  categoryController.getCategory,
);

router.get(
  '/api/categories',
  //   checkPermission('VIEW_CATEGORY'),
  categoryController.getCategories,
);

router.put(
  '/api/categories/:id',
  auth,
  checkPermission('UPDATE_CATEGORY'),
  categoryController.updateCategory,
);

router.delete(
  '/api/categories/:id',
  auth,
  checkPermission('DELETE_CATEGORY'),
  categoryController.deleteCategory,
);

router.post(
  '/api/colours',
  auth,
  checkPermission('CREATE_COLOUR'),
  categoryController.createColour,
);

// Get all Colours
router.get(
  '/api/colours',
  // checkPermission('VIEW_COLOUR'),
  categoryController.getColours,
);

// Get Colour by ID
router.get(
  '/api/colours/:id',
  auth,
  // checkPermission('VIEW_COLOUR'),
  categoryController.getColour,
);

// Update Colour
router.patch(
  '/api/colours/:id',
  auth,
  checkPermission('UPDATE_COLOUR'),
  categoryController.updateColour,
);

// Delete Colour
router.delete(
  '/api/colours/:id',
  auth,
  checkPermission('DELETE_COLOUR'),
  categoryController.deleteColour,
);
module.exports = router;
