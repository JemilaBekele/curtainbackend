const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { customerService } = require('../services');
const ApiError = require('../utils/ApiError');

// Customer Controllers

const createCustomer = catchAsync(async (req, res) => {
  const customer = await customerService.createCustomer(req.body);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Customer created successfully',
    customer,
  });
});

const getCustomer = catchAsync(async (req, res) => {
  const customer = await customerService.getCustomerById(req.params.id);
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  res.status(httpStatus.OK).send({
    success: true,
    customer,
  });
});

const getCustomers = catchAsync(async (req, res) => {
  const result = await customerService.getAllCustomers();
  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});
const getCustomersWithFallback = catchAsync(async (req, res) => {
  console.log('🎯 getCustomersWithFallback controller called');
  console.log('📝 Request query:', JSON.stringify(req.query, null, 2));
  console.log('🔍 Search parameter:', req.query.search);
  console.log('🌐 Full URL:', req.protocol + '://' + req.get('host') + req.originalUrl);
  console.log('📊 Request method:', req.method);
  console.log('📍 Request path:', req.path);
  console.log('🔑 Request headers:', JSON.stringify(req.headers, null, 2));
  
  const { search = '' } = req.query;
  const searchString = typeof search === 'string' ? search : '';

  console.log('📋 Processed search string:', searchString);
  console.log('🔧 Calling customerService.getCustomersWithFallback with:', searchString);

  try {
    console.time('⏱️ Service call duration');
    const result = await customerService.getCustomersWithFallback(searchString);
    console.timeEnd('⏱️ Service call duration');
    
    console.log('✅ Service returned successfully');
    console.log('📊 Result stats:', {
      success: result.success,
      count: result.count || 0,
      isSearchResults: result.isSearchResults || false,
      isTopCustomers: result.isTopCustomers || false,
      isDefaultCustomers: result.isDefaultCustomers || false,
      firstCustomer: result.customers?.[0] || 'No customers'
    });

    res.status(httpStatus.OK).send({
      success: true,
      ...result,
    });
    
    console.log('📤 Response sent successfully');
  } catch (serviceError) {
    console.error('❌ Error in customer service:', serviceError.message);
    console.error('📝 Service error details:', {
      name: serviceError.name,
      message: serviceError.message,
      stack: serviceError.stack
    });
    
    res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
      success: false,
      error: 'Failed to fetch customers',
      message: serviceError.message,
      details: process.env.NODE_ENV === 'development' ? serviceError.stack : undefined
    });
  }
});

const updateCustomer = catchAsync(async (req, res) => {
  const customer = await customerService.updateCustomer(
    req.params.id,
    req.body,
  );
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Customer updated successfully',
    customer,
  });
});

const deleteCustomer = catchAsync(async (req, res) => {
  await customerService.deleteCustomer(req.params.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Customer deleted successfully',
  });
});

// Supplier Controllers

const createSupplier = catchAsync(async (req, res) => {
  const supplier = await customerService.createSupplier(req.body);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Supplier created successfully',
    supplier,
  });
});

const getSupplier = catchAsync(async (req, res) => {
  const supplier = await customerService.getSupplierById(req.params.id);
  if (!supplier) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
  }
  res.status(httpStatus.OK).send({
    success: true,
    supplier,
  });
});

const getSuppliers = catchAsync(async (req, res) => {
  const result = await customerService.getAllSuppliers();
  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});

const updateSupplier = catchAsync(async (req, res) => {
  const supplier = await customerService.updateSupplier(
    req.params.id,
    req.body,
  );
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Supplier updated successfully',
    supplier,
  });
});

const deleteSupplier = catchAsync(async (req, res) => {
  await customerService.deleteSupplier(req.params.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Supplier deleted successfully',
  });
});

module.exports = {
  // Customer exports
  createCustomer,
  getCustomer,
  getCustomers,
  updateCustomer,
  deleteCustomer,
  getCustomersWithFallback,
  // Supplier exports
  createSupplier,
  getSupplier,
  getSuppliers,
  updateSupplier,
  deleteSupplier,
};
