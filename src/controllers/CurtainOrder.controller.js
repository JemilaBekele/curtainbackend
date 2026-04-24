const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { curtainService } = require('../services'); // Assuming you'll name it curtainService
const ApiError = require('../utils/ApiError');

// Create Curtain Order
const createCurtainOrder = catchAsync(async (req, res) => {
  const createdById = req.user?.id; // Get user ID from authenticated request
  const curtainOrder = await curtainService.createCurtainOrder(
    req.body,
    createdById,
  );

  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Curtain order created successfully',
    curtainOrder,
  });
});

// Get Curtain Order by ID getthikthinCurtainOrderById,getshatterCurtainOrderById
const getthikthinCurtainOrderById = catchAsync(async (req, res) => {
  const curtainOrder = await curtainService.getthikthinCurtainOrderById(
    req.params.id,
  );

  if (!curtainOrder) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Curtain order not found');
  }

  res.status(httpStatus.OK).send({
    success: true,
    curtainOrder,
  });
});
const getshatterCurtainOrderById = catchAsync(async (req, res) => {
  const curtainOrder = await curtainService.getshatterCurtainOrderById(
    req.params.id,
  );

  if (!curtainOrder) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Curtain order not found');
  }

  res.status(httpStatus.OK).send({
    success: true,
    curtainOrder,
  });
});
const getPendingCurtainOrdersController = catchAsync(async (req, res) => {
  const curtainOrders = await curtainService.getPendingCurtainOrders();

  if (!curtainOrders || curtainOrders.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No pending curtain orders found');
  }

  res.status(httpStatus.OK).send({
    success: true,
    curtainOrders,
  });
});

const getCurtainOrder = catchAsync(async (req, res) => {
  const curtainOrder = await curtainService.getCurtainOrderById(req.params.id);

  if (!curtainOrder) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Curtain order not found');
  }

  res.status(httpStatus.OK).send({
    success: true,
    curtainOrder,
  });
});
const createCurtainMeasurement = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const { measurements, shopId } = req.body; // ADDED: shopId from request body
  const createdById = req.user?.id;

  if (!orderId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order ID is required');
  }

  if (!Array.isArray(measurements) || measurements.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Measurements must be a non-empty array',
    );
  }

  // Pass shopId to the service
  const createdMeasurements = await curtainService.createCurtainMeasurement(
    orderId,
    measurements,
    createdById,
    shopId, // ADDED: pass shopId to service
  );

  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Curtain measurements created successfully',
    measurements: createdMeasurements,
  });
});

/**
 * Update curtain measurements by order ID
 * (handles create, update, and delete internally) createsecondCurtainMeasurement,
  updatesecondCurtainOrderShop,
 */
const updateCurtainOrderShop = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const { measurements, shopId } = req.body;
  if (!orderId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order ID is required');
  }

  const result = await curtainService.updateCurtainOrderShop(
    orderId,
    measurements,
    shopId,
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Curtain measurements updated successfully',
    result,
  });
});

// Get all Curtain Orders
const getCurtainOrders = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    customerId,
    movementTypeId,
    isSiteMeasured,
    startDate,
    endDate,
    includeItems = false,
  } = req.query;

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    search,
    customerId,
    movementTypeId,
    isSiteMeasured: (() => {
      if (isSiteMeasured === 'true') return true;
      if (isSiteMeasured === 'false') return false;
      return undefined;
    })(),
    startDate,
    endDate,
    includeItems: includeItems === 'true',
  };

  const result = await curtainService.getAllCurtainOrders(options);

  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});

// Update Curtain Order
const updateCurtainOrder = catchAsync(async (req, res) => {
  const curtainOrder = await curtainService.updateCurtainOrder(
    req.params.id,
    req.body,
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Curtain order updated successfully',
    curtainOrder,
  });
});

// Delete Curtain Order
const deleteCurtainOrder = catchAsync(async (req, res) => {
  await curtainService.deleteCurtainOrder(req.params.id);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Curtain order deleted successfully',
  });
});
const deleteCurtainMeasurement = catchAsync(async (req, res) => {
  await curtainService.deleteCurtainMeasurement(req.params.id);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Curtain measurement deleted successfully',
  });
});

// Get Curtain Orders by Customer ID
const getCurtainOrdersByCustomer = catchAsync(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const { customerId } = req.params;

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const result = await curtainService.getCurtainOrdersByCustomerId(
    customerId,
    options,
  );

  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});

// Get Curtain Orders by Created By (User ID)
const getCurtainOrdersByCreator = catchAsync(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const { userId } = req.params;

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const result = await curtainService.getCurtainOrdersByCreatedBy(
    userId,
    options,
  );

  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});

// Get My Curtain Orders (orders created by current user)
const getMyCurtainOrders = catchAsync(async (req, res) => {
  const userId = req.user?.id;
  const { page = 1, limit = 10 } = req.query;

  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const result = await curtainService.getCurtainOrdersByCreatedBy(
    userId,
    options,
  );

  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});

// Search Curtain Orders by criteria
const searchCurtainOrders = catchAsync(async (req, res) => {
  const curtainOrders = await curtainService.getCurtainOrderByCriteria(
    req.query,
  );

  let curtainOrdersArray;
  let count;
  if (Array.isArray(curtainOrders)) {
    curtainOrdersArray = curtainOrders;
    count = curtainOrders.length;
  } else if (curtainOrders) {
    curtainOrdersArray = [curtainOrders];
    count = 1;
  } else {
    curtainOrdersArray = [];
    count = 0;
  }

  res.status(httpStatus.OK).send({
    success: true,
    curtainOrders: curtainOrdersArray,
    count,
  });
});
const createsecondCurtainMeasurement = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const { measurements, shopId } = req.body; // ADDED: shopId from request body
  const createdById = req.user?.id;

  if (!orderId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order ID is required');
  }

  if (!Array.isArray(measurements) || measurements.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Measurements must be a non-empty array',
    );
  }

  // Pass shopId to the service createsecondCurtainMeasurement,updatesecondCurtainOrderShop
  const createdMeasurements =
    await curtainService.createsecondCurtainMeasurement(
      orderId,
      measurements,
      createdById,
      shopId, // ADDED: pass shopId to service
    );

  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Curtain measurements created successfully',
    measurements: createdMeasurements,
  });
});

/**
 * Update curtain measurements by order ID
 * (handles create, update, and delete internally) createsecondCurtainMeasurement,
  updatesecondCurtainOrderShop,
 */
const updatesecondCurtainOrderShop = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const { measurements, shopId } = req.body;
  if (!orderId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order ID is required');
  }

  const result = await curtainService.updatesecondCurtainOrderShop(
    orderId,
    measurements,
    shopId,
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Curtain measurements updated successfully',
    result,
  });
});
const updateCurtainOrderPaymentController = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const paymentData = req.body;
  const updatedById = req.user?.id || null;
  const amount = paymentData.totalPaid;

  const updatedOrder = await curtainService.updateCurtainOrderPayment(
    orderId,
    amount,
    updatedById,
  );

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Curtain order payment updated successfully',
    data: updatedOrder,
  });
});

/**
 * Update curtain order status
 * PATCH /api/curtain/orders/:orderId/status
 */
const updateCurtainOrderStatusController = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const statusData = req.body;
  const updatedById = req.user?.id || null;

  const updatedOrder = await curtainService.updateCurtainOrderStatus(
    orderId,
    statusData,
    updatedById,
  );

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Curtain order status updated successfully',
    data: updatedOrder,
  });
});
const updateCurtainOrderDeliveryDeadlineController = catchAsync(
  async (req, res) => {
    const { orderId } = req.params;
    const { deliveryDeadline } = req.body;
    const updatedById = req.user?.id || null;

    // Validate required field
    if (!deliveryDeadline) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Delivery deadline is required',
      );
    }

    const updatedOrder =
      await curtainService.updateCurtainOrderDeliveryDeadline(
        orderId,
        deliveryDeadline,
        updatedById,
      );

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Delivery deadline updated successfully',
      data: updatedOrder,
    });
  },
);
const getWorkerPaymentReportController = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;

  // Filters can come from query or body
  const filters = req.body?.filters || {};

  const userId = req.user?.id || null;

  // Validate required fields
  if (!startDate || !endDate) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Start date and end date are required',
    );
  }

  const report = await curtainService.getWorkerPaymentReport(
    startDate,
    endDate,
    filters,
    userId,
  );

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Worker payment report generated successfully',
    data: report,
  });
});
const markWorkerAsPaidController = catchAsync(async (req, res) => {
  const { measurementId } = req.params;
  const { workerType } = req.body; // 'THIN' or 'THICK'
  const paidById = req.user?.id || null;

  // Validate required fields
  if (!measurementId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Measurement ID is required');
  }

  if (!workerType) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Worker type is required (THIN or THICK)',
    );
  }

  const updatedMeasurement = await curtainService.markWorkerAsPaid(
    measurementId,
    workerType,
    paidById,
  );

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Worker marked as paid successfully',
    data: updatedMeasurement,
  });
});

module.exports = {
  getPendingCurtainOrdersController,
  markWorkerAsPaidController,
  getWorkerPaymentReportController,
  updateCurtainOrderPaymentController,
  updateCurtainOrderStatusController,
  createCurtainOrder,
  getCurtainOrder,
  getthikthinCurtainOrderById,
  getshatterCurtainOrderById,
  getCurtainOrders,
  updateCurtainOrder,
  deleteCurtainOrder,
  deleteCurtainMeasurement,
  getCurtainOrdersByCustomer,
  getCurtainOrdersByCreator,
  getMyCurtainOrders,
  searchCurtainOrders,
  updateCurtainOrderShop,
  createCurtainMeasurement,
  createsecondCurtainMeasurement,
  updatesecondCurtainOrderShop,
  updateCurtainOrderDeliveryDeadlineController,
};
