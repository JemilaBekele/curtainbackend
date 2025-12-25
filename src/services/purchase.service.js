const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');

// Get Purchase by ID
const getPurchaseById = async (id) => {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      store: true,
      createdBy: true,
      updatedBy: true,
      items: {
        include: {
          product: true,
          batch: true,
          unitOfMeasure: true, // ✅ Added unit of measure
        },
      },
    },
  });
  return purchase;
};

// Get Purchase by invoice number
const getPurchaseByInvoiceNo = async (invoiceNo) => {
  const purchase = await prisma.purchase.findFirst({
    where: { invoiceNo },
  });
  return purchase;
};

// Get all Purchases
const getAllPurchases = async (filter = {}) => {
  const { supplierId, storeId, paymentStatus, startDate, endDate, search } =
    filter;

  const where = {};

  if (supplierId) {
    where.supplierId = supplierId;
  }

  if (storeId) {
    where.storeId = storeId;
  }

  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }

  if (startDate || endDate) {
    where.purchaseDate = {};
    if (startDate) {
      where.purchaseDate.gte = new Date(startDate);
    }
    if (endDate) {
      where.purchaseDate.lte = new Date(endDate);
    }
  }

  if (search) {
    where.OR = [
      { invoiceNo: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ];
  }

  const purchases = await prisma.purchase.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      supplier: true,
      store: true,
      _count: {
        select: { items: true },
      },
    },
  });

  return {
    purchases,
    count: purchases.length,
  };
};

// Create Purchase
const createPurchase = async (purchaseBody, userId) => {
  // Check if invoice number already exists
  if (await getPurchaseByInvoiceNo(purchaseBody.invoiceNo)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice number already taken');
  }

  // Parse items if it's a string
  const { items: itemsString, ...restPurchaseBody } = purchaseBody;
  const items =
    typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Purchase must have at least one item',
    );
  }

  // Validate individual item properties
  items.forEach((item, index) => {
    if (!item.productId || !item.batchId || !item.unitOfMeasureId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${
          index + 1
        } is missing required fields (productId, batchId, or unitOfMeasureId)`,
      );
    }
    if (item.quantity <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid quantity`,
      );
    }
    if (item.unitPrice < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid unit price`,
      );
    }
  });

  // Recalculate totalPrice for security
  const validatedItems = items.map((item) => ({
    ...item,
    totalPrice: item.quantity * item.unitPrice,
  }));

  // Convert purchaseDate to DateTime object
  const purchaseDate = new Date(restPurchaseBody.purchaseDate);
  // Replace global isNaN with Number.isNaN
  if (Number.isNaN(purchaseDate.getTime())) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid purchase date');
  }

  // Calculate totals (removed totalQuantity as per schema)
  const totalProducts = validatedItems.length;
  const subTotal = validatedItems.reduce(
    (sum, item) => sum + item.totalPrice,
    0,
  );
  const grandTotal = subTotal; // You might add taxes/discounts here later

  // Create the purchase transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create the purchase
    const purchase = await tx.purchase.create({
      data: {
        ...restPurchaseBody,
        purchaseDate,
        totalProducts,
        subTotal,
        grandTotal,
        createdById: userId, // Add created by user ID here

        items: {
          create: validatedItems.map((item) => ({
            productId: item.productId,
            batchId: item.batchId,
            unitOfMeasureId: item.unitOfMeasureId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: true,
            batch: true,
            unitOfMeasure: true,
          },
        },
        supplier: true,
        store: true,
        createdBy: true, // Include createdBy relation in the response
      },
    });

    return purchase;
  });

  return result;
};

// Update Purchase
const updatePurchase = async (purchaseId, purchaseBody, userId) => {
  // Check if purchase exists
  const existingPurchase = await getPurchaseById(purchaseId);
  if (!existingPurchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }
  // Check if current user is the creator of this purchase
  if (existingPurchase.createdById !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only the creator can update this purchase',
    );
  }

  // Check if invoice number already exists (excluding current purchase)
  if (
    purchaseBody.invoiceNo &&
    purchaseBody.invoiceNo !== existingPurchase.invoiceNo
  ) {
    if (await getPurchaseByInvoiceNo(purchaseBody.invoiceNo)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Invoice number already taken',
      );
    }
  }

  // Parse items if it's a string
  const { items: itemsString, ...restPurchaseBody } = purchaseBody;
  const items =
    typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Purchase must have at least one item',
    );
  }

  // Validate individual item properties
  items.forEach((item, index) => {
    if (!item.productId || !item.batchId || !item.unitOfMeasureId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${
          index + 1
        } is missing required fields (productId, batchId, or unitOfMeasureId)`,
      );
    }
    if (item.quantity <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid quantity`,
      );
    }
    if (item.unitPrice < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid unit price`,
      );
    }
  });

  // Recalculate totalPrice for security
  const validatedItems = items.map((item) => ({
    ...item,
    totalPrice: item.quantity * item.unitPrice,
  }));

  // Convert purchaseDate to DateTime object if provided
  let { purchaseDate } = existingPurchase;
  if (restPurchaseBody.purchaseDate) {
    purchaseDate = new Date(restPurchaseBody.purchaseDate);
    if (Number.isNaN(purchaseDate.getTime())) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid purchase date');
    }
  }

  // Calculate totals (removed totalQuantity as per schema)
  const totalProducts = validatedItems.length;
  const subTotal = validatedItems.reduce(
    (sum, item) => sum + item.totalPrice,
    0,
  );
  const grandTotal = subTotal; // You might add taxes/discounts here later

  // Update the purchase transaction
  const result = await prisma.$transaction(async (tx) => {
    // First delete all existing items
    await tx.purchaseItem.deleteMany({
      where: {
        purchaseId,
      },
    });

    // Update the purchase
    const purchase = await tx.purchase.update({
      where: {
        id: purchaseId,
      },
      data: {
        ...restPurchaseBody,
        purchaseDate,
        totalProducts,
        subTotal,
        grandTotal,
        items: {
          create: validatedItems.map((item) => ({
            productId: item.productId,
            batchId: item.batchId,
            unitOfMeasureId: item.unitOfMeasureId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: true,
            batch: true,
            unitOfMeasure: true,
          },
        },
        supplier: true,
        store: true,
      },
    });

    return purchase;
  });

  return result;
};

// Delete Purchase
const deletePurchase = async (id, userId) => {
  const existingPurchase = await getPurchaseById(id);
  if (!existingPurchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }

  await prisma.$transaction(async (tx) => {
    // Check if this purchase was approved (has stock ledger entries)
    const existingLedgerEntries = await tx.stockLedger.count({
      where: {
        reference: existingPurchase.invoiceNo,
        movementType: 'IN',
      },
    });

    const wasApproved = existingLedgerEntries > 0;

    // Process all items in parallel
    await Promise.all(
      existingPurchase.items.map(async (item) => {
        const operations = [];

        // Only reverse stock operations if purchase was approved
        if (wasApproved) {
          // 1. Update ProductBatch stock
          operations.push(
            tx.productBatch.update({
              where: { id: item.batchId },
              data: {
                stock: {
                  decrement: item.quantity,
                },
              },
            }),
          );

          // 2. Create reversal stock ledger entry
          operations.push(
            tx.stockLedger.create({
              data: {
                batchId: item.batchId,
                storeId: existingPurchase.storeId,
                movementType: 'OUT',
                quantity: item.quantity,
                unitOfMeasureId: item.unitOfMeasureId,
                reference: `PURCHASE-DELETE-${existingPurchase.invoiceNo}`,
                userId,
                notes: `Stock reversed from deleted purchase ${existingPurchase.invoiceNo}`,
                movementDate: new Date(),
              },
            }),
          );

          // 3. Update StoreStock
          const existingStoreStock = await tx.storeStock.findUnique({
            where: {
              storeId_batchId: {
                storeId: existingPurchase.storeId,
                batchId: item.batchId,
              },
            },
          });

          if (existingStoreStock) {
            const newQuantity = existingStoreStock.quantity - item.quantity;

            if (newQuantity <= 0) {
              // Delete the store stock if quantity becomes 0 or negative
              operations.push(
                tx.storeStock.delete({
                  where: {
                    storeId_batchId: {
                      storeId: existingPurchase.storeId,
                      batchId: item.batchId,
                    },
                  },
                }),
              );
            } else {
              // Update the store stock quantity
              operations.push(
                tx.storeStock.update({
                  where: {
                    storeId_batchId: {
                      storeId: existingPurchase.storeId,
                      batchId: item.batchId,
                    },
                  },
                  data: {
                    quantity: {
                      decrement: item.quantity,
                    },
                  },
                }),
              );
            }
          }
        }

        // Execute all operations for this item
        if (operations.length > 0) {
          await Promise.all(operations);
        }
      }),
    );

    // Delete all purchase items
    await tx.purchaseItem.deleteMany({
      where: { purchaseId: id },
    });

    // Delete the purchase
    await tx.purchase.delete({
      where: { id },
    });

    // Create log entry
    await tx.log.create({
      data: {
        action: `Deleted purchase ${existingPurchase.invoiceNo}${
          wasApproved ? ' and reversed stock' : ''
        }`,
        userId,
      },
    });
  });

  return { message: 'Purchase deleted successfully' };
};
const acceptPurchase = async (purchaseId, paymentStatus, userId) => {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        items: {
          include: {
            batch: true,
            unitOfMeasure: true,
          },
        },
        store: true,
      },
    });

    if (!purchase) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
    }

    // Check if purchase is already accepted (has stock ledger entries)
    const existingLedgerEntries = await prisma.stockLedger.count({
      where: {
        reference: purchase.invoiceNo,
        movementType: 'IN',
      },
    });

    if (existingLedgerEntries > 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Purchase already accepted');
    }

    // Update payment status
    const updatedPurchase = await prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        paymentStatus,
        updatedById: userId,
      },
    });

    // Only create stock for fully paid purchases
    if (paymentStatus === 'APPROVED') {
      const result = await prisma.$transaction(async (tx) => {
        // Get all existing store stocks in one query
        const batchIds = purchase.items.map((item) => item.batchId);
        const existingStoreStocks = await tx.storeStock.findMany({
          where: {
            storeId: purchase.storeId,
            batchId: { in: batchIds },
          },
        });

        const existingStoreStockMap = existingStoreStocks.reduce(
          (acc, stock) => {
            acc[stock.batchId] = stock;
            return acc;
          },
          {},
        );

        // Prepare all operations
        const storeStockOperations = [];
        const stockLedgerOperations = [];
        const batchUpdateOperations = [];

        purchase.items.forEach((item) => {
          const { quantity, unitOfMeasureId, batchId } = item;

          // Store stock operations
          const existingStoreStock = existingStoreStockMap[batchId];
          if (existingStoreStock) {
            // Update existing store stock
            storeStockOperations.push(
              tx.storeStock.update({
                where: { id: existingStoreStock.id },
                data: {
                  quantity: { increment: quantity },
                  // Ensure status remains Available when updating
                  status: 'Available',
                  unitOfMeasureId,
                },
              }),
            );
          } else {
            // Create new store stock with Available status
            storeStockOperations.push(
              tx.storeStock.create({
                data: {
                  storeId: purchase.storeId,
                  batchId,
                  quantity,
                  status: 'Available',
                  unitOfMeasureId,
                },
              }),
            );
          }

          // Stock ledger operations
          stockLedgerOperations.push(
            tx.stockLedger.create({
              data: {
                batchId,
                storeId: purchase.storeId,
                movementType: 'IN',
                quantity,
                unitOfMeasureId,
                reference: purchase.invoiceNo,
                userId,
                notes: `Purchase acceptance - ${purchase.invoiceNo}`,
                movementDate: purchase.purchaseDate,
              },
            }),
          );

          // Batch update operations - increment batch stock
          batchUpdateOperations.push(
            tx.productBatch.update({
              where: { id: batchId },
              data: {
                stock: { increment: quantity },
              },
            }),
          );
        });

        // Execute all operations in parallel
        const [storeStockUpdates, stockLedgerEntries, batchUpdates] =
          await Promise.all([
            Promise.all(storeStockOperations),
            Promise.all(stockLedgerOperations),
            Promise.all(batchUpdateOperations),
          ]);

        // Create log entry
        await tx.log.create({
          data: {
            action: `Accepted purchase ${purchase.invoiceNo} with ${purchase.items.length} items`,
            userId,
          },
        });

        return {
          purchase: updatedPurchase,
          stockLedgerEntries,
          storeStockUpdates,
          batchUpdates,
        };
      });

      return result;
    }

    // For non-PAID status, just update the payment status and return
    await prisma.log.create({
      data: {
        action: `Updated payment status of purchase ${purchase.invoiceNo} to ${paymentStatus}`,
        userId,
      },
    });

    return {
      purchase: updatedPurchase,
      message: `Payment status updated to ${paymentStatus}. No stock created as purchase is not fully paid.`,
    };
  } catch (error) {
    // Handle transaction errors specifically
    if (error.code === 'P2025') {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Related record not found during transaction',
      );
    }
    throw error;
  }
};
module.exports = {
  getPurchaseById,
  getPurchaseByInvoiceNo,
  getAllPurchases,
  createPurchase,
  updatePurchase,
  deletePurchase,
  acceptPurchase,
};
