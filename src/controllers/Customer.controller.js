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
  console.log('📝 Request query:', req.query);
  console.log('🔍 Search parameter:', req.query.search);
  console.log('🌐 Request URL:', req.originalUrl);
  console.log('📊 Request method:', req.method);
  console.log('🔑 Request headers:', req.headers);
  
  const { search = '' } = req.query;
  const searchString = typeof search === 'string' ? search : '';

  console.log('📋 Processed search string:', searchString);

  try {
    console.log('📞 Calling customerService.getCustomersWithFallback...');
    const result = await customerService.getCustomersWithFallback(searchString);
    
    console.log('✅ Service returned:', {
      success: result.success,
      count: result.count || 0,
      isSearchResults: result.isSearchResults,
      isTopCustomers: result.isTopCustomers,
      isDefaultCustomers: result.isDefaultCustomers
    });

    res.status(httpStatus.OK).send({
      success: true,
      ...result,
    });
  } catch (serviceError) {
    console.error('❌ Error in customer service:', serviceError.message);
    console.error('Service error stack:', serviceError.stack);
    
    res.status(httpStatus.INTERNAL_SERVER_ERROR).send({
      success: false,
      error: 'Failed to fetch customers',
      message: serviceError.message
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
