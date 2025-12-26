const httpStatus = require('http-status');
const { subMonths } = require('date-fns');

const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');

const getProductBatchById = async (batchId) => {
  if (!batchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Batch ID is required');
  }

  const productBatch = await prisma.productBatch.findUnique({
    where: { id: batchId },
    include: {
      product: {},
      StockLedger: {
        orderBy: {
          movementDate: 'desc',
        },
        take: 10,
      },
      StoreStock: true,
    },
  });

  if (!productBatch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product batch not found');
  }

  return productBatch;
};

const getAllProductBatches = async ({ startDate, endDate } = {}) => {
  const whereClause = {};
  const twelveMonthsAgo = subMonths(new Date(), 12); // Default to last 12 months

  // Convert string dates to Date objects if they exist
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  // Filter by createdAt (batch creation date)
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
      gte: twelveMonthsAgo,
      lte: endDateObj,
    };
  } else {
    whereClause.createdAt = {
      gte: twelveMonthsAgo,
    };
  }

  const productBatches = await prisma.productBatch.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      product: {
        select: {
          name: true,
          productCode: true,
        },
      },
      store: {
        select: {
          name: true,
        },
      },
      StoreStock: true,
      ShopStock: true,
    },
  });

  return {
    productBatches,
    count: productBatches.length,
  };
};
const getProductBatches = async (productId, shopId) => {
  const productBatches = await prisma.productBatch.findMany({
    where: {
      productId,
      ShopStock: {
        some: {
          shopId,
          quantity: {
            gt: 0, // Stock not zero
          },
          status: 'Available', // Only available stock
          batch: {
            expiryDate: {
              gt: new Date(), // Not expired (expiry date greater than current date)
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      product: {
        select: {
          name: true,
          productCode: true,
          unitOfMeasure: true,
          sellPrice: true,
        },
      },
      ShopStock: {
        where: {
          shopId,
          quantity: { gt: 0 },
          status: 'Available',
        },
        include: {
          unitOfMeasure: true,
        },
      },
    },
  });

  return {
    productBatches,
    count: productBatches.length,
  };
};

const deleteProductBatch = async (batchId, userId) => {
  if (!batchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Batch ID is required');
  }

  // Check if batch exists and get current stock
  const existingBatch = await prisma.productBatch.findUnique({
    where: { id: batchId },
    include: {
      StoreStock: true,
    },
  });

  if (!existingBatch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product batch not found');
  }

  // Check if batch has any stock transactions or is referenced elsewhere
  const hasTransactions = await prisma.stockLedger.count({
    where: { batchId },
  });

  if (hasTransactions > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot delete batch with existing stock transactions',
    );
  }

  // Use transaction to ensure all related data is deleted
  return prisma.$transaction(async (tx) => {
    // Delete additional prices

    // Delete store stock entries
    await tx.storeStock.deleteMany({
      where: { batchId },
    });

    // Delete the batch
    const deletedBatch = await tx.productBatch.delete({
      where: { id: batchId },
    });

    // Create audit log entry
    await tx.auditLog.create({
      data: {
        action: 'DELETE',
        entity: 'ProductBatch',
        entityId: batchId,
        userId,
        details: `Deleted batch ${deletedBatch.batchNumber} with stock: ${deletedBatch.stock}`,
      },
    });

    return deletedBatch;
  });
};
const getProductBatchByBatchNumber = async (batchNumber) => {
  const batch = await prisma.productBatch.findFirst({
    where: {
      batchNumber,
    },
  });
  return !!batch;
};
const createProductBatchWithAdditionalPrices = async (productBatchBody) => {
  // Check if product batch with same batch number already exists
  if (await getProductBatchByBatchNumber(productBatchBody.batchNumber)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Batch number already exists');
  }

  // Optional: Validate that the product exists
  const product = await prisma.product.findUnique({
    where: {
      id: productBatchBody.productId,
    },
  });

  if (!product) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Product does not exist');
  }

  // Format the expiryDate if provided and create a copy without additionalPrices
  const { ...batchData } = productBatchBody;

  const formattedData = {
    ...batchData,
    expiryDate: batchData.expiryDate
      ? new Date(batchData.expiryDate).toISOString()
      : undefined,
  };

  // Create product batch with additional prices
  const productBatch = await prisma.productBatch.create({
    data: {
      ...formattedData,
      // Include additional prices if provided - use AdditionalPrice instead of additionalPrices
    },
  });

  return productBatch;
};

const updateProductBatchWithAdditionalPrices = async (batchId, updateBody) => {
  // Check if product batch exists
  const existingBatch = await prisma.productBatch.findUnique({
    where: { id: batchId },
  });

  if (!existingBatch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product batch not found');
  }

  // Separate additionalPrices from the rest of the update data
  const { ...batchData } = updateBody;

  // Format the expiryDate if provided
  const formattedData = {
    ...batchData,
    expiryDate: batchData.expiryDate
      ? new Date(batchData.expiryDate).toISOString()
      : undefined,
  };

  // Handle additional prices update

  const updatedBatch = await prisma.productBatch.update({
    where: { id: batchId },
    data: {
      ...formattedData,
    },
  });

  return updatedBatch;
};

// Get product by store ID and stock ID
const getProductByStoreStock = async (storeId) => {
  try {
    console.time('getProductByStoreStock');
    console.log(`Fetching store stocks for storeId: ${storeId}`);
    
    const storeStocks = await prisma.storeStock.findMany({
      where: {
        storeId,
      },
      include: {
        batch: {
          include: {
            product: {
              include: {
                category: true,
                subCategory: true,
                unitOfMeasure: true, // Include unit of measure
              },
            },
          },
        },
        store: true,
        unitOfMeasure: true, // Include the unit of measure from store stock
      },
    });

    console.log(`Found ${storeStocks.length} store stocks`);
    
    if (!storeStocks || storeStocks.length === 0) {
      throw new Error(`No store stocks found for storeId: ${storeId}`);
    }

    // Debug each stock to check for missing relations
    const validStocks = storeStocks.filter(stock => {
      if (!stock.batch) {
        console.error(`StoreStock ${stock.id} has no batch`);
        return false;
      }
      if (!stock.batch.product) {
        console.error(`StoreStock ${stock.id}, Batch ${stock.batch.id} has no product`);
        return false;
      }
      return true;
    });

    console.log(`Valid stocks: ${validStocks.length}, Invalid: ${storeStocks.length - validStocks.length}`);

    // Return enriched data with all necessary information
    const result = validStocks.map((storeStock) => {
      const product = storeStock.batch.product;
      
      return {
        id: storeStock.id,
        storeId: storeStock.storeId,
        batchId: storeStock.batchId,
        quantity: storeStock.quantity,
        status: storeStock.status,
        createdAt: storeStock.createdAt,
        updatedAt: storeStock.updatedAt,
        
        // Store information
        store: {
          id: storeStock.store.id,
          name: storeStock.store.name,
          branchId: storeStock.store.branchId,
        },
        
        // Batch information
        batch: {
          id: storeStock.batch.id,
          batchNumber: storeStock.batch.batchNumber,
          expiryDate: storeStock.batch.expiryDate,
          price: storeStock.batch.price,
        },
        
        // Product information with all details
        product: {
          id: product.id,
          productCode: product.productCode,
          name: product.name,
          generic: product.generic,
          description: product.description,
          sellPrice: product.sellPrice,
          imageUrl: product.imageUrl,
          isActive: product.isActive,
          
          // Category and subcategory
          category: product.category,
          subCategory: product.subCategory,
          
          // Unit of measure information from product
          unitOfMeasure: product.unitOfMeasure,
        },
        
        // Unit of measure specific to this stock entry
        unitOfMeasure: storeStock.unitOfMeasure,
        
        // Helper fields for frontend
        availableQuantity: storeStock.quantity, // Original quantity
        conversionFactor: storeStock.unitOfMeasure?.conversionFactor || 1,
      };
    });

    console.timeEnd('getProductByStoreStock');
    return result;

  } catch (error) {
    console.error('Error in getProductByStoreStock:', error);
    throw error;
  }
};

const getProductByShopStock = async (shopId) => {
  try {
    console.time('getProductByShopStock');
    console.log(`Fetching shop stocks for shopId: ${shopId}`);
    
    const shopStocks = await prisma.shopStock.findMany({
      where: {
        shopId,
      },
      include: {
        batch: {
          include: {
            product: {
              include: {
                category: true,
                subCategory: true,
                unitOfMeasure: true, // Include unit of measure
              },
            },
          },
        },
        shop: true,
        unitOfMeasure: true, // Include the unit of measure from shop stock
      },
    });

    console.log(`Found ${shopStocks.length} shop stocks`);
    
    if (!shopStocks || shopStocks.length === 0) {
      throw new Error(`No shop stocks found for shopId: ${shopId}`);
    }

    // Debug each stock
    const validStocks = shopStocks.filter(stock => {
      if (!stock.batch) {
        console.error(`ShopStock ${stock.id} has no batch`);
        return false;
      }
      if (!stock.batch.product) {
        console.error(`ShopStock ${stock.id}, Batch ${stock.batch.id} has no product`);
        return false;
      }
      return true;
    });

    console.log(`Valid stocks: ${validStocks.length}, Invalid: ${shopStocks.length - validStocks.length}`);

    // Return enriched data with all necessary information
    const result = validStocks.map((shopStock) => {
      const product = shopStock.batch.product;
      
      return {
        id: shopStock.id,
        shopId: shopStock.shopId,
        batchId: shopStock.batchId,
        quantity: shopStock.quantity,
        status: shopStock.status,
        createdAt: shopStock.createdAt,
        updatedAt: shopStock.updatedAt,
        
        // Shop information
        shop: {
          id: shopStock.shop.id,
          name: shopStock.shop.name,
          branchId: shopStock.shop.branchId,
        },
        
        // Batch information
        batch: {
          id: shopStock.batch.id,
          batchNumber: shopStock.batch.batchNumber,
          expiryDate: shopStock.batch.expiryDate,
          price: shopStock.batch.price,
        },
        
        // Product information with all details
        product: {
          id: product.id,
          productCode: product.productCode,
          name: product.name,
          generic: product.generic,
          description: product.description,
          sellPrice: product.sellPrice,
          imageUrl: product.imageUrl,
          isActive: product.isActive,
          
          // Category and subcategory
          category: product.category,
          subCategory: product.subCategory,
          
          // Unit of measure information from product
          unitOfMeasure: product.unitOfMeasure,
        },
        
        // Unit of measure specific to this stock entry
        unitOfMeasure: shopStock.unitOfMeasure,
        
        // Helper fields for frontend
        availableQuantity: shopStock.quantity, // Original quantity
        conversionFactor: shopStock.unitOfMeasure?.conversionFactor || 1,
      };
    });

    console.timeEnd('getProductByShopStock');
    return result;

  } catch (error) {
    console.error('Error in getProductByShopStock:', error);
    throw error;
  }
};
const getProductInfoByBatchId = async (batchId) => {
  const batch = await prisma.productBatch.findUnique({
    where: { id: batchId },
    select: {
      product: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!batch || !batch.product) return null;

  return { id: batch.product.id, name: batch.product.name };
};

module.exports = {
  getProductBatchById,
  getAllProductBatches,
  deleteProductBatch,
  createProductBatchWithAdditionalPrices,
  updateProductBatchWithAdditionalPrices,
  getProductByStoreStock,
  getProductByShopStock,
  getProductInfoByBatchId,
  getProductBatches,
};
