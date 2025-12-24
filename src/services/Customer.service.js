const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');

// Customer Services

const getCustomerById = async (id) => {
  return prisma.customer.findUnique({ where: { id } });
};

const getCustomerByEmail = async (email) => {
  return prisma.customer.findFirst({ where: { email } });
};

// ✅ Get customer by either phone1 or phone2
const getCustomerByPhone = async (phone) => {
  return prisma.customer.findFirst({
    where: {
      OR: [{ phone1: phone }, { phone2: phone }],
    },
  });
};

const getCustomerByTin = async (tinNumber) => {
  return prisma.customer.findFirst({ where: { tinNumber } });
};

const getAllCustomers = async (filter = {}) => {
  const customers = await prisma.customer.findMany({
    where: filter,
    orderBy: { name: 'asc' }, // ✅ updated since "first_name" is mapped to `name`
  });

  return { customers, count: customers.length };
};

const createCustomer = async (customerBody) => {
  // Check if customer with same email already exists
  if (customerBody.email && (await getCustomerByEmail(customerBody.email))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  // Check if customer with same phone1 already exists
  if (customerBody.phone1 && (await getCustomerByPhone(customerBody.phone1))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Phone1 already taken');
  }

  // Check if customer with same phone2 already exists
  if (customerBody.phone2 && (await getCustomerByPhone(customerBody.phone2))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Phone2 already taken');
  }

  // Check if customer with same TIN already exists
  if (
    customerBody.tinNumber &&
    (await getCustomerByTin(customerBody.tinNumber))
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'TIN already registered');
  }

  return prisma.customer.create({ data: customerBody });
};

const updateCustomer = async (id, updateBody) => {
  const existingCustomer = await getCustomerById(id);
  if (!existingCustomer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }

  // Validate email uniqueness
  if (updateBody.email && updateBody.email !== existingCustomer.email) {
    if (await getCustomerByEmail(updateBody.email)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
    }
  }

  // Validate phone1 uniqueness
  if (updateBody.phone1 && updateBody.phone1 !== existingCustomer.phone1) {
    if (await getCustomerByPhone(updateBody.phone1)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Phone1 already taken');
    }
  }

  // Validate phone2 uniqueness
  if (updateBody.phone2 && updateBody.phone2 !== existingCustomer.phone2) {
    if (await getCustomerByPhone(updateBody.phone2)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Phone2 already taken');
    }
  }

  // Validate TIN uniqueness
  if (
    updateBody.tinNumber &&
    updateBody.tinNumber !== existingCustomer.tinNumber
  ) {
    if (await getCustomerByTin(updateBody.tinNumber)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'TIN already registered');
    }
  }

  return prisma.customer.update({
    where: { id },
    data: updateBody,
  });
};
const getCustomersWithFallback = async (search = '') => {
  console.log('getCustomersWithFallback called with search:', search);
  
  // If searching, return search results
  if (search.trim()) {
    console.log('Performing search for:', search);
    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
          { phone1: { contains: search } },
          { phone2: { contains: search } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 50,
    });

    console.log('Search results count:', customers.length);
    
    return {
      customers,
      count: customers.length,
      isSearchResults: true,
    };
  }

  // Try to get top customers by sales
  try {
    console.log('Attempting to fetch top customers...');
    const topCustomers = await prisma.$queryRaw`
      SELECT c.*
      FROM customers c
      LEFT JOIN sells s ON c._id = s.customerId
      GROUP BY c._id
      ORDER BY COALESCE(SUM(s.grandTotal), 0) DESC
      LIMIT 10
    `;

    console.log('Raw topCustomers query result:', topCustomers);
    console.log('Type of topCustomers:', typeof topCustomers);
    console.log('Is array?', Array.isArray(topCustomers));
    
    if (topCustomers && Array.isArray(topCustomers) && topCustomers.length > 0) {
      console.log('Top customers found:', topCustomers.length);
      console.log('First top customer sample:', JSON.stringify(topCustomers[0], null, 2));
      
      // IMPORTANT: Raw query returns objects with field names matching DB columns
      // We need to map them to match the Prisma model field names
      const mappedCustomers = topCustomers.map(customer => {
        console.log('Raw customer fields:', Object.keys(customer));
        return {
          id: customer._id || customer.id,
          name: customer.name,
          companyName: customer.companyName,
          phone1: customer.phone1,
          phone2: customer.phone2,
          tinNumber: customer.tinNumber,
          address: customer.address,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
        };
      });

      console.log('Mapped customers:', mappedCustomers.length);

      return {
        customers: mappedCustomers,
        count: mappedCustomers.length,
        isTopCustomers: true,
      };
    } else {
      console.log('No top customers found or empty result');
    }
  } catch (error) {
    console.log('Error fetching top customers:', error.message);
    console.log('Error stack:', error.stack);
  }

  // Fallback: get first 10 customers alphabetically
  console.log('Falling back to default customers...');
  const defaultCustomers = await prisma.customer.findMany({
    orderBy: { name: 'asc' },
    take: 10,
  });

  console.log('Default customers count:', defaultCustomers.length);
  
  return {
    customers: defaultCustomers,
    count: defaultCustomers.length,
    isDefaultCustomers: true,
  };
};
const deleteCustomer = async (id) => {
  const existingCustomer = await getCustomerById(id);
  if (!existingCustomer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }

  await prisma.customer.delete({ where: { id } });
  return { message: 'Customer deleted successfully' };
}; // Supplier Services

const getSupplierById = async (id) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
  });
  return supplier;
};

const getSupplierByName = async (name) => {
  const supplier = await prisma.supplier.findFirst({
    where: { name },
  });
  return supplier;
};

const getSupplierByEmail = async (email) => {
  const supplier = await prisma.supplier.findFirst({
    where: { email },
  });
  return supplier;
};

const getSupplierByPhone = async (phone) => {
  const supplier = await prisma.supplier.findFirst({
    where: { phone },
  });
  return supplier;
};

const getSupplierByTin = async (tinNumber) => {
  const supplier = await prisma.supplier.findFirst({
    where: { tinNumber },
  });
  return supplier;
};

const getAllSuppliers = async (filter = {}) => {
  const suppliers = await prisma.supplier.findMany({
    where: filter,
    orderBy: {
      name: 'asc',
    },
  });

  return {
    suppliers,
    count: suppliers.length,
  };
};

const createSupplier = async (supplierBody) => {
  // Check if supplier with same name already exists
  if (await getSupplierByName(supplierBody.name)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Supplier name already taken');
  }

  // Check if supplier with same email already exists
  if (supplierBody.email && (await getSupplierByEmail(supplierBody.email))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  // Check if supplier with same phone already exists
  if (supplierBody.phone && (await getSupplierByPhone(supplierBody.phone))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Phone already taken');
  }

  // Check if supplier with same tinNumber already exists - FIXED
  if (
    supplierBody.tinNumber &&
    (await getSupplierByTin(supplierBody.tinNumber))
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'TIN already registered');
  }

  const supplier = await prisma.supplier.create({
    data: supplierBody,
  });
  return supplier;
};

const updateSupplier = async (id, updateBody) => {
  const existingSupplier = await getSupplierById(id);
  if (!existingSupplier) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
  }

  // Check if name is being updated to an existing name
  if (updateBody.name && updateBody.name !== existingSupplier.name) {
    if (await getSupplierByName(updateBody.name)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Supplier name already taken');
    }
  }

  // Check if email is being updated to an existing email
  if (updateBody.email && updateBody.email !== existingSupplier.email) {
    if (await getSupplierByEmail(updateBody.email)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
    }
  }

  // Check if phone is being updated to an existing phone
  if (updateBody.phone && updateBody.phone !== existingSupplier.phone) {
    if (await getSupplierByPhone(updateBody.phone)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Phone already taken');
    }
  }

  // Check if TIN is being updated to an existing TIN
  if (updateBody.tin && updateBody.tin !== existingSupplier.tin) {
    if (await getSupplierByTin(updateBody.tin)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'TIN already registered');
    }
  }

  const updatedSupplier = await prisma.supplier.update({
    where: { id },
    data: updateBody,
  });

  return updatedSupplier;
};

const deleteSupplier = async (id) => {
  const existingSupplier = await getSupplierById(id);
  if (!existingSupplier) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
  }

  await prisma.supplier.delete({
    where: { id },
  });

  return { message: 'Supplier deleted successfully' };
};

module.exports = {
  // Customer exports
  getCustomersWithFallback,
  getCustomerById,
  getCustomerByEmail,
  getCustomerByPhone,
  getCustomerByTin,
  getAllCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,

  // Supplier exports
  getSupplierById,
  getSupplierByName,
  getSupplierByEmail,
  getSupplierByPhone,
  getSupplierByTin,
  getAllSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};
