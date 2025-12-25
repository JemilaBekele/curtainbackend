const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { storeService } = require('../services');
const ApiError = require('../utils/ApiError');

// Create Store
const createStore = catchAsync(async (req, res) => {
  const store = await storeService.createStore(req.body);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Store created successfully',
    store,
  });
});

// Get Store by ID
const getStore = catchAsync(async (req, res) => {
  const store = await storeService.getStoreById(req.params.id);
  if (!store) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Store not found');
  }
  res.status(httpStatus.OK).send({
    success: true,
    store,
  });
});

// Get all Stores
const getStores = catchAsync(async (req, res) => {
  const userId = req.user.id; // ✅ extract userId

  const result = await storeService.getAllStores(userId);
  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});
const getAllStore = catchAsync(async (req, res) => {
  const result = await storeService.getAllStore();
  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});

// Update Store
const updateStore = catchAsync(async (req, res) => {
  const store = await storeService.updateStore(req.params.id, req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Store updated successfully',
    store,
  });
});

// Delete Store
const deleteStore = catchAsync(async (req, res) => {
  await storeService.deleteStore(req.params.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Store deleted successfully',
  });
});
const getAllStockLedgers = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;

  const result = await storeService.getAllStockLedgers({
    startDate,
    endDate,
  });
  res.status(httpStatus.OK).send(result); // { stockLedgers, count }
});

const getAllShopStocks = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;

  const result = await storeService.getAllShopStocks({
    startDate,
    endDate,
  });
  res.status(httpStatus.OK).send(result); // { shopStocks, count }
});

const getAllStoresStocks = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;

  const result = await storeService.getAllStoresStocks({
    startDate,
    endDate,
  });
  res.status(httpStatus.OK).send(result); // { stores, count }
});

module.exports = {
  createStore,
  getStore,
  getStores,
  updateStore,
  deleteStore,
  getAllStockLedgers,
  getAllShopStocks,
  getAllStoresStocks,
  getAllStore,
};
