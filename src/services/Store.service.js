const httpStatus = require('http-status');
const { subMonths } = require('date-fns');

const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');

// Get Store by ID
const getStoreById = async (id) => {
  const store = await prisma.store.findUnique({
    where: { id },
    include: {
      branch: true,
    },
  });
  return store;
};

// Get Store by Name
const getStoreByName = async (name) => {
  const store = await prisma.store.findFirst({
    where: { name },
  });
  return store;
};
const getAllStore = async () => {
  const store = await prisma.store.findMany();

  return {
    store,
    count: store.length,
  };
};
// Get all Stores
const getAllStores = async (userId, filter = {}) => {
  // Get the user with their accessible stores
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      stores: { select: { id: true } },
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // If user is admin, return all stores
  if (user.admin) {
    const stores = await prisma.store.findMany({
      where: filter,
      orderBy: {
        name: 'asc',
      },
      include: {
        branch: true,
      },
    });

    return {
      stores,
      count: stores.length,
    };
  }

  // Regular user: filter by accessible stores
  const accessibleStoreIds = user.stores.map((store) => store.id);

  // If user has no stores, return empty array
  if (accessibleStoreIds.length === 0) {
    return {
      stores: [],
      count: 0,
    };
  }

  const stores = await prisma.store.findMany({
    where: {
      ...filter,
      id: { in: accessibleStoreIds }, // Filter by accessible stores
    },
    orderBy: {
      name: 'asc',
    },
    include: {
      branch: true,
    },
  });

  return {
    stores,
    count: stores.length,
  };
};

// Create Store
const createStore = async (storeBody) => {
  // Check if store with same name already exists
  if (await getStoreByName(storeBody.name)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Store name already taken');
  }

  // Validate branch exists
  const branchExists = await prisma.branch.findUnique({
    where: { id: storeBody.branchId },
  });
  if (!branchExists) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch not found');
  }

  const store = await prisma.store.create({
    data: storeBody,
    include: {
      branch: true,
    },
  });
  return store;
};

// Update Store
const updateStore = async (id, updateBody) => {
  const existingStore = await getStoreById(id);
  if (!existingStore) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Store not found');
  }

  // Check if name is being updated to an existing store name
  if (updateBody.name && updateBody.name !== existingStore.name) {
    if (await getStoreByName(updateBody.name)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Store name already taken');
    }
  }

  // Validate branch exists if being updated
  if (updateBody.branchId) {
    const branchExists = await prisma.branch.findUnique({
      where: { id: updateBody.branchId },
    });
    if (!branchExists) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Branch not found');
    }
  }

  const updatedStore = await prisma.store.update({
    where: { id },
    data: updateBody,
    include: {
      branch: true,
    },
  });

  return updatedStore;
};

// Delete Store
const deleteStore = async (id) => {
  const existingStore = await getStoreById(id);
  if (!existingStore) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Store not found');
  }

  await prisma.store.delete({
    where: { id },
  });

  return { message: 'Store deleted successfully' };
};

const getAllStockLedgers = async ({ startDate, endDate } = {}) => {
  const whereClause = {};
  const threeMonthsAgo = subMonths(new Date(), 12); // Default time range

  // Convert string dates to Date objects if they exist
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  // Build the date filter
  if (startDateObj && endDateObj) {
    whereClause.movementDate = {
      gte: startDateObj,
      lte: endDateObj,
    };
  } else if (startDateObj) {
    whereClause.movementDate = {
      gte: startDateObj,
      lte: new Date(),
    };
  } else if (endDateObj) {
    whereClause.movementDate = {
      gte: threeMonthsAgo,
      lte: endDateObj,
    };
  } else {
    whereClause.movementDate = {
      gte: threeMonthsAgo,
    };
  }

  const stockLedgers = await prisma.stockLedger.findMany({
    where: whereClause,
    orderBy: { movementDate: 'desc' },
    include: {
      batch: {
        select: {
          batchNumber: true,
          product: {
            select: {
              name: true,
              productCode: true, // Changed from 'code' to 'productCode'
            },
          },
        },
      },
      unitOfMeasure: true, // ✅ Added unit of measure

      store: {
        select: {
          name: true,
        },
      },
      shop: {
        select: {
          name: true,
        },
      },
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return {
    stockLedgers,
    count: stockLedgers.length,
  };
};
const getAllShopStocks = async ({ startDate, endDate } = {}) => {
  const whereClause = {};

  // Add filters if provided
  const threeMonthsAgo = subMonths(new Date(), 12); // Default time range

  // Convert string dates to Date objects if they exist
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  // Build the date filter using createdAt instead of movementDate
  if (startDateObj && endDateObj) {
    whereClause.createdAt = {
      gte: startDateObj,
      lte: endDateObj,
    };
  } else if (startDateObj) {
    whereClause.createdAt = {
      gte: startDateObj,
      lte: new Date(),
    };
  } else if (endDateObj) {
    whereClause.createdAt = {
      gte: threeMonthsAgo,
      lte: endDateObj,
    };
  } else {
    whereClause.createdAt = {
      gte: threeMonthsAgo,
    };
  }

  const shopStocks = await prisma.shopStock.findMany({
    where: whereClause,
    orderBy: { updatedAt: 'desc' },
    include: {
      shop: {
        select: {
          name: true,
        },
      },
      unitOfMeasure: true, // ✅ Added unit of measure
      batch: {
        select: {
          batchNumber: true,

          product: {
            select: {
              name: true,
              category: true,
            },
          },
        },
      },
    },
  });
  return {
    shopStocks,
    count: shopStocks.length,
  };
};
const getAllStoresStocks = async ({ startDate, endDate } = {}) => {
  const whereClause = {};
  const oneYearAgo = subMonths(new Date(), 12); // Default time range

  // Convert string dates to Date objects if they exist
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  // Build the date filter
  if (startDateObj && endDateObj) {
    whereClause.createdAt = {
      gte: startDateObj,
      lte: endDateObj,
    };
  } else if (startDateObj) {
    whereClause.createdAt = {
      gte: startDateObj,
      lte: new Date(),
    };
  } else if (endDateObj) {
    whereClause.createdAt = {
      gte: oneYearAgo,
      lte: endDateObj,
    };
  } else {
    whereClause.createdAt = {
      gte: oneYearAgo,
    };
  }

  const storeStocks = await prisma.storeStock.findMany({
    where: {
      store: whereClause, // Apply date filter to the store's creation date
    },
    orderBy: { createdAt: 'desc' },
    include: {
      store: {
        include: {
          branch: {
            select: {
              name: true,
              id: true,
            },
          },
        },
      },
      batch: {
        select: {
          batchNumber: true,
          product: {
            select: {
              name: true,
              id: true,
              productCode: true,
            },
          },
        },
      },
      unitOfMeasure: true, // ✅ Added unit of measure
    },
  });

  // Transform the data to match your table columns
  const transformedData = storeStocks.map((stock) => ({
    id: stock.id,
    unitOfMeasure: stock.unitOfMeasure,
    quantity: stock.quantity,
    status: stock.status,
    createdAt: stock.createdAt,
    batch: {
      batchNumber: stock.batch.batchNumber,
      product: {
        name: stock.batch.product.name,
        id: stock.batch.product.id,
        productCode: stock.batch.product.productCode,
      },
    },
    store: {
      name: stock.store.name,
      id: stock.store.id,
    },
    branch: {
      name: stock.store.branch.name,
      id: stock.store.branch.id,
    },
  }));

  return {
    storeStocks: transformedData,
    count: storeStocks.length,
  };
};
module.exports = {
  getAllStore,
  getStoreById,
  getStoreByName,
  getAllStores,
  createStore,
  updateStore,
  deleteStore,
  getAllStockLedgers,
  getAllShopStocks,
  getAllStoresStocks,
};
