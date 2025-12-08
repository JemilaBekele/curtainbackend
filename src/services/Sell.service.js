const httpStatus = require('http-status');
const { subMonths } = require('date-fns');
const { getIO } = require('../socket/s');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');

const getSellById = async (identifier) => {
  const sell = await prisma.sell.findFirst({
    where: {
      OR: [{ id: identifier }, { invoiceNo: identifier }],
    },
    include: {
      branch: true,
      customer: true,
      createdBy: true,
      updatedBy: true,
      items: {
        include: {
          product: {
            include: {
              unitOfMeasure: true,
              category: true,
            },
          },
          shop: true,
          unitOfMeasure: true,
          batches: {
            include: {
              batch: true,
            },
          },
        },
      },
    },
  });
  return sell;
};
const getSellByIdByuser = async (id, userId = null) => {
  // Get the sell with all items first
  const sell = await prisma.sell.findUnique({
    where: { id },
    include: {
      branch: true,
      customer: true,
      createdBy: true,
      updatedBy: true,
      items: {
        include: {
          product: {
            include: {
              unitOfMeasure: true,
              category: true,
            },
          },
          shop: true,
          unitOfMeasure: true,
          batches: {
            include: {
              batch: true, // Just include the batch relation directly
            },
          },
        },
      },
    },
  });
  const existingSell = await prisma.sell.findUnique({
    where: { id },
    select: { locked: true, lockedAt: true },
  });

  // If record is unlocked (false), check time validity
  if (existingSell && existingSell.locked === false) {
    // Case 1: lockedAt is missing → lock immediately
    if (!existingSell.lockedAt) {
      return prisma.sell.update({
        where: { id },
        data: {
          locked: true,
          lockedAt: new Date(),
        },
      });
    }

    // Case 2: lockedAt exists → check 20 minutes rule
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);

    if (existingSell.lockedAt < twentyMinutesAgo) {
      return prisma.sell.update({
        where: { id },
        data: {
          locked: true,
          lockedAt: new Date(),
        },
      });
    }
  }

  if (!sell) return null;

  // If userId is provided, filter items and return both versions
  if (userId) {
    const userWithShops = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        shops: {
          select: { id: true },
        },
      },
    });

    const userShopIds = userWithShops?.shops?.map((shop) => shop.id) || [];

    const filteredItems = sell.items.filter((item) =>
      userShopIds.includes(item.shopId),
    );

    return {
      ...sell,
      items: filteredItems,
      // Include metadata about the filtering
      _metadata: {
        totalItems: sell.items.length,
        accessibleItems: filteredItems.length,
        hasRestrictedAccess: filteredItems.length < sell.items.length,
      },
    };
  }

  return sell;
};

// Get Sell by invoice number
const getSellByInvoiceNo = async (invoiceNo) => {
  const sell = await prisma.sell.findFirst({
    where: { invoiceNo },
    include: {
      branch: true,
      customer: true,
      items: {
        include: {
          product: {
            include: {
              unitOfMeasure: true,
              category: true,
            },
          },
          shop: true,
          unitOfMeasure: true,
          batches: {
            include: {
              batch: true,
            },
          },
        },
      },
    },
  });
  return sell;
};

// Get all Sells
const getAllSells = async ({
  startDate,
  endDate,
  saleStatus,
  branchId,
} = {}) => {
  const whereClause = {};
  const twelveMonthsAgo = subMonths(new Date(), 12); // Default time range

  // Convert string dates to Date objects if they exist
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  // Build the date filter
  if (startDateObj && endDateObj) {
    whereClause.saleDate = {
      gte: startDateObj,
      lte: endDateObj,
    };
  } else if (startDateObj) {
    whereClause.saleDate = {
      gte: startDateObj,
      lte: new Date(),
    };
  } else if (endDateObj) {
    whereClause.saleDate = {
      gte: twelveMonthsAgo,
      lte: endDateObj,
    };
  } else {
    whereClause.saleDate = {
      gte: twelveMonthsAgo,
    };
  }

  // Add sale status filter if provided
  if (saleStatus) {
    whereClause.saleStatus = saleStatus;
  }

  // Add branch filter if provided
  if (branchId) {
    whereClause.branchId = branchId;
  }

  const sells = await prisma.sell.findMany({
    where: whereClause,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      branch: true,
      customer: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      items: {
        include: {
          product: {
            include: {
              unitOfMeasure: true,
              category: true,
            },
          },
          shop: true,
          unitOfMeasure: true,
          batches: {
            include: {
              batch: true,
            },
          },
        },
      },
      _count: {
        select: { items: true },
      },
    },
  });

  return {
    sells,
    count: sells.length,
  };
};

const generateInvoiceNumber = async () => {
  // Get the current year and month
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');

  // Find the latest invoice for this month
  const latestSell = await prisma.sell.findFirst({
    where: {
      invoiceNo: {
        startsWith: `INV-${year}${month}`,
      },
    },
    orderBy: {
      invoiceNo: 'desc',
    },
  });

  let sequence = 1;

  if (latestSell) {
    // Extract the sequence number from the latest invoice
    const match = latestSell.invoiceNo.match(/-(\d+)$/);
    if (match && match[1]) {
      sequence = parseInt(match[1], 10) + 1;
    }
  }

  // Format: INV-YYMM-0001
  return `INV-${year}${month}-${sequence.toString().padStart(4, '0')}`;
};
// Create Sell
// Create Sell
const createSell = async (sellBody, userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { branch: true },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const { items: itemsString, ...restSellBody } = sellBody;
  const items =
    typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Sale must have at least one item',
    );
  }

  const invoiceNo = await generateInvoiceNumber();

  // Extract product IDs and shop IDs from items
  const productIds = items.map((item) => item.productId).filter(Boolean);
  const shopIds = items.map((item) => item.shopId).filter(Boolean);

  if (productIds.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'All items must have a productId',
    );
  }

  if (shopIds.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'All items must have a shopId');
  }

  // Fetch products with their additional prices and unit of measure
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      unitOfMeasure: true,
      AdditionalPrice: {
        where: {
          OR: [
            { shopId: null }, // Global additional prices
            { shopId: { in: shopIds } }, // Shop-specific additional prices
          ],
        },
      },
    },
  });

  // Fetch available shop stocks for validation - corrected query
  const shopStocks = await prisma.shopStock.findMany({
    where: {
      shopId: { in: shopIds },
      status: 'Available',
      quantity: { gt: 0 },
      batch: {
        productId: { in: productIds }, // Access productId through batch relation
      },
    },
    include: {
      batch: {
        include: {
          product: true, // Include product to access productId
        },
      },
      shop: true,
    },
  });

  let allItemsApproved = true;
  const enhancedItems = items.map((item, index) => {
    if (!item.productId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} is missing productId`,
      );
    }

    if (!item.shopId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} is missing shopId`,
      );
    }

    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid productId`,
      );
    }

    // Check available stock for this product in the selected shop (for validation only)
    const availableStock = shopStocks
      .filter(
        (stock) =>
          stock.batch.productId === item.productId &&
          stock.shopId === item.shopId,
      )
      .reduce((sum, stock) => sum + stock.quantity, 0);

    if (item.quantity <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid quantity`,
      );
    }

    if (item.quantity > availableStock) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} quantity (${
          item.quantity
        }) exceeds available stock (${availableStock}) in shop`,
      );
    }

    // ✅ Ensure unitPrice is converted to a number
    const unitPrice = Number(item.unitPrice);
    if (
      typeof unitPrice !== 'number' ||
      Number.isNaN(unitPrice) ||
      unitPrice < 0
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid unit price`,
      );
    }

    // ✅ Get standard price from product
    const standardPrice = product.sellPrice ? Number(product.sellPrice) : 0;

    // ✅ Get additional prices for THIS specific shop (both global and shop-specific)
    const shopAdditionalPrices = product.AdditionalPrice.filter(
      (ap) => ap.shopId === null || ap.shopId === item.shopId,
    );

    // ✅ Check if unit price matches standard price OR any additional price for this shop
    const isStandardPrice = unitPrice === standardPrice;
    const isAdditionalPrice = shopAdditionalPrices.some(
      (ap) => ap.price === unitPrice,
    );

    const isPriceValid = isStandardPrice || isAdditionalPrice;

    // If any item has invalid price, mark the entire sale as not approved
    if (!isPriceValid) {
      allItemsApproved = false;
    }

    return {
      ...item,
      productId: item.productId,
      shopId: item.shopId,
      unitOfMeasureId: item.unitOfMeasureId || product.unitOfMeasureId,
      unitPrice,
      isPriceValid, // Track if this item's price is valid
      availableStock, // Store available stock for reference
    };
  });

  const subTotal = enhancedItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const discount = restSellBody.discount || 0;
  const vat = restSellBody.vat || 0;
  const grandTotal = subTotal - discount + vat;

  // Determine sale status based on price validation
  const saleStatus = allItemsApproved ? 'APPROVED' : 'NOT_APPROVED';

  // Create only the sell record without stock updates
  const sell = await prisma.sell.create({
    data: {
      invoiceNo,
      customerId: restSellBody.customerId,
      totalProducts: enhancedItems.length,
      subTotal,
      discount,
      vat,
      grandTotal,
      NetTotal: grandTotal,
      saleStatus, // Set status based on price validation
      saleDate: restSellBody.saleDate
        ? new Date(restSellBody.saleDate)
        : new Date(),
      notes: restSellBody.notes,
      branchId: user.branchId,
      createdById: userId,
      updatedById: userId,
      items: {
        create: enhancedItems.map((item) => ({
          productId: item.productId,
          shopId: item.shopId,
          unitOfMeasureId: item.unitOfMeasureId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.unitPrice * item.quantity,
          itemSaleStatus: 'PENDING', // Default status for items
        })),
      },
    },
    include: {
      branch: true,
      customer: true,
      createdBy: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          product: {
            include: {
              unitOfMeasure: true,
              category: true,
            },
          },
          unitOfMeasure: true,
          shop: true,
        },
      },
    },
  });

  if (saleStatus === 'APPROVED') {
    try {
      const uniqueShopIds = sell.items
        .map((item) => item.shopId)
        .filter(Boolean)
        .filter((shopId, index, array) => array.indexOf(shopId) === index);

      // Find users who have access to these shops
      const usersWithShopAccess = await prisma.user.findMany({
        where: {
          shops: {
            some: {
              id: { in: uniqueShopIds },
            },
          },
          status: 'Active', // Only active users
        },
        select: {
          id: true,
          name: true,
          email: true,
          shops: {
            where: {
              id: { in: uniqueShopIds },
            },
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Create shop notifications (store in database)
      const shopNotifications = await Promise.allSettled(
        uniqueShopIds.map((shopId) =>
          prisma.notification.create({
            data: {
              shopId,
              title: 'Sale Approved - Prepare for Delivery',
              message: `Sale #${sell.invoiceNo} has been approved and is ready for delivery preparation`,
              type: 'SELL_READY_FOR_DELIVERY',
              relatedEntityType: 'SELL',
            },
          }),
        ),
      );

      // Get the Socket.IO instance
      const io = getIO();

      // Create notification object for real-time sending
      const realTimeNotification = {
        title: 'New Sale Approved',
        message: `Sale #${sell.invoiceNo} has been approved and needs delivery preparation`,
        type: 'SELL_READY_FOR_DELIVERY',
        relatedEntityType: 'SELL',
        saleId: sell.id,
        invoiceNo: sell.invoiceNo,
        timestamp: new Date().toISOString(),
      };

      // ✅ FIXED: Remove prefixes to match frontend
      // Send real-time notifications to shops
      shopNotifications
        .filter((result, index) => result.status === 'fulfilled')
        .forEach((result, index) => {
          const shopId = uniqueShopIds[index];
          const notification = result.value;

          // Remove 'shop:' prefix to match frontend
          io.to(shopId).emit('new-notification', notification);
          console.log(`✅ Sent real-time notification to shop ${shopId}`);
        });

      // Send real-time notifications to users with shop access
      usersWithShopAccess.forEach((user) => {
        // Send to each user individually - remove 'user:' prefix
        io.to(user.id).emit('new-notification', realTimeNotification);
        console.log(
          `✅ Sent real-time notification to user ${user.name} (${user.id})`,
        );

        // Also send to user's shops for additional targeting
        user.shops.forEach((shop) => {
          // Remove prefixes to match what frontend will join
          io.to(`${user.id}:${shop.id}`).emit(
            'new-notification',
            realTimeNotification,
          );
        });
      });

      // Log statistics
      const successfulShopCount = shopNotifications.filter(
        (result) => result.status === 'fulfilled',
      ).length;

      console.log(
        `📢 Successfully processed notifications for ${successfulShopCount} shops and ${usersWithShopAccess.length} users for approved sale #${sell.invoiceNo}`,
      );
    } catch (notificationError) {
      console.error(
        '❌ Unexpected error in notification process:',
        notificationError,
      );
    }
  }

  return sell;
};

// Update Sell
const updateSell = async (sellId, sellBody, userId) => {
  // Check if sell exists
  const existingSell = await getSellById(sellId);
  if (!existingSell) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  // ✅ DON'T UPDATE IF LOCK IS TRUE
  if (existingSell.locked === true) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot update locked sale');
  }

  // Cannot update delivered or cancelled sells
  if (
    ['DELIVERED', 'PARTIALLY_DELIVERED', 'CANCELLED'].includes(
      existingSell.saleStatus,
    )
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot update ${existingSell.saleStatus.toLowerCase()} sale`,
    );
  }

  // Check if invoice number already exists (excluding current sell)
  if (sellBody.invoiceNo && sellBody.invoiceNo !== existingSell.invoiceNo) {
    if (await getSellByInvoiceNo(sellBody.invoiceNo)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Invoice number already taken',
      );
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { branch: true },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const { items: itemsString, ...restSellBody } = sellBody;
  const items =
    typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Sale must have at least one item',
    );
  }

  // Extract product IDs and shop IDs from items
  const productIds = items.map((item) => item.productId).filter(Boolean);
  const shopIds = items.map((item) => item.shopId).filter(Boolean);

  if (productIds.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'All items must have a productId',
    );
  }

  if (shopIds.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'All items must have a shopId');
  }

  // Fetch products with their additional prices and unit of measure
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      unitOfMeasure: true,
      AdditionalPrice: {
        where: {
          OR: [
            { shopId: null }, // Global additional prices
            { shopId: { in: shopIds } }, // Shop-specific additional prices
          ],
        },
      },
    },
  });

  // Fetch available shop stocks for validation
  const shopStocks = await prisma.shopStock.findMany({
    where: {
      shopId: { in: shopIds },
      status: 'Available',
      quantity: { gt: 0 },
      batch: {
        productId: { in: productIds },
      },
    },
    include: {
      batch: {
        include: {
          product: true,
        },
      },
      shop: true,
    },
  });

  let allItemsApproved = true;
  const enhancedItems = items.map((item, index) => {
    if (!item.productId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} is missing productId`,
      );
    }

    if (!item.shopId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} is missing shopId`,
      );
    }

    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid productId`,
      );
    }

    // Check available stock for this product in the selected shop
    // For updates, we need to consider the existing sale quantities
    const availableStock = shopStocks
      .filter(
        (stock) =>
          stock.batch.productId === item.productId &&
          stock.shopId === item.shopId,
      )
      .reduce((sum, stock) => sum + stock.quantity, 0);

    // For update, we need to add back the quantities from existing sale items
    const existingItem = existingSell.items.find(
      (existing) =>
        existing.productId === item.productId &&
        existing.shopId === item.shopId,
    );

    const adjustedAvailableStock = existingItem
      ? availableStock + existingItem.quantity
      : availableStock;

    if (item.quantity <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid quantity`,
      );
    }

    if (item.quantity > adjustedAvailableStock) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} quantity (${
          item.quantity
        }) exceeds available stock (${adjustedAvailableStock}) in shop`,
      );
    }

    // ✅ Ensure unitPrice is converted to a number
    const unitPrice = Number(item.unitPrice);
    if (
      typeof unitPrice !== 'number' ||
      Number.isNaN(unitPrice) ||
      unitPrice < 0
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Item ${index + 1} has invalid unit price`,
      );
    }

    // ✅ Get standard price from product
    const standardPrice = product.sellPrice ? Number(product.sellPrice) : 0;

    // ✅ Get additional prices for THIS specific shop (both global and shop-specific)
    const shopAdditionalPrices = product.AdditionalPrice.filter(
      (ap) => ap.shopId === null || ap.shopId === item.shopId,
    );

    // ✅ Check if unit price matches standard price OR any additional price for this shop
    const isStandardPrice = unitPrice === standardPrice;
    const isAdditionalPrice = shopAdditionalPrices.some(
      (ap) => ap.price === unitPrice,
    );

    const isPriceValid = isStandardPrice || isAdditionalPrice;

    // If any item has invalid price, mark the entire sale as not approved
    if (!isPriceValid) {
      allItemsApproved = false;
    }

    return {
      ...item,
      productId: item.productId,
      shopId: item.shopId,
      unitOfMeasureId: item.unitOfMeasureId || product.unitOfMeasureId,
      unitPrice,
      isPriceValid, // Track if this item's price is valid
      availableStock: adjustedAvailableStock, // Store adjusted available stock for reference
    };
  });

  const subTotal = enhancedItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const discount = restSellBody.discount || 0;
  const vat = restSellBody.vat || 0;
  const grandTotal = subTotal - discount + vat;

  // Determine sale status based on price validation
  const saleStatus = allItemsApproved ? 'APPROVED' : 'NOT_APPROVED';

  // Update the sell inside a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Delete all existing items
    await tx.sellItem.deleteMany({
      where: { sellId },
    });

    // Update sell with new items, totals, and status
    const sell = await tx.sell.update({
      where: { id: sellId },
      data: {
        customerId: restSellBody.customerId,
        totalProducts: enhancedItems.length,
        subTotal,
        discount,
        vat,
        grandTotal,
        NetTotal: grandTotal,
        saleStatus, // Set status based on price validation
        saleDate: restSellBody.saleDate
          ? new Date(restSellBody.saleDate)
          : existingSell.saleDate,
        notes: restSellBody.notes,
        updatedById: userId,
        items: {
          create: enhancedItems.map((item) => ({
            productId: item.productId,
            shopId: item.shopId,
            unitOfMeasureId: item.unitOfMeasureId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * item.quantity,
            itemSaleStatus: 'PENDING', // Default status for items
          })),
        },
      },
      include: {
        branch: true,
        customer: true,
        createdBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: {
              include: {
                unitOfMeasure: true,
                category: true,
              },
            },
            unitOfMeasure: true,
            shop: true,
          },
        },
      },
    });
    return sell;
  });

  // ✅ ADD NOTIFICATION CREATION HERE - Only if sell status changed to APPROVED
  if (existingSell.saleStatus !== 'APPROVED' && saleStatus === 'APPROVED') {
    try {
      const uniqueShopIds = result.items
        .map((item) => item.shopId)
        .filter(Boolean)
        .filter((shopId, index, array) => array.indexOf(shopId) === index);

      // Find users who have access to these shops
      const usersWithShopAccess = await prisma.user.findMany({
        where: {
          shops: {
            some: {
              id: { in: uniqueShopIds },
            },
          },
          status: 'Active', // Only active users
        },
        select: {
          id: true,
          name: true,
          email: true,
          shops: {
            where: {
              id: { in: uniqueShopIds },
            },
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Create shop notifications (store in database)
      const shopNotifications = await Promise.allSettled(
        uniqueShopIds.map((shopId) =>
          prisma.notification.create({
            data: {
              shopId,
              title: 'Sale Approved - Prepare for Delivery',
              message: `Sale #${result.invoiceNo} has been approved and is ready for delivery preparation`,
              type: 'SELL_READY_FOR_DELIVERY',
              relatedEntityType: 'SELL',
            },
          }),
        ),
      );

      // Get the Socket.IO instance
      const io = getIO();

      // Create notification object for real-time sending
      const realTimeNotification = {
        title: 'Sale Updated & Approved',
        message: `Sale #${result.invoiceNo} has been updated and approved, ready for delivery preparation`,
        type: 'SELL_READY_FOR_DELIVERY',
        relatedEntityType: 'SELL',
        saleId: result.id,
        invoiceNo: result.invoiceNo,
        timestamp: new Date().toISOString(),
      };

      // ✅ FIXED: Remove prefixes to match frontend
      // Send real-time notifications to shops
      shopNotifications
        .filter((result, index) => result.status === 'fulfilled')
        .forEach((result, index) => {
          const shopId = uniqueShopIds[index];
          const notification = result.value;

          // Remove 'shop:' prefix to match frontend
          io.to(shopId).emit('new-notification', notification);
          console.log(`✅ Sent real-time notification to shop ${shopId}`);
        });

      // Send real-time notifications to users with shop access
      usersWithShopAccess.forEach((user) => {
        // Send to each user individually - remove 'user:' prefix
        io.to(user.id).emit('new-notification', realTimeNotification);
        console.log(
          `✅ Sent real-time notification to user ${user.name} (${user.id})`,
        );

        // Also send to user's shops for additional targeting
        user.shops.forEach((shop) => {
          // Remove prefixes to match what frontend will join
          io.to(`${user.id}:${shop.id}`).emit(
            'new-notification',
            realTimeNotification,
          );
        });
      });

      // Log statistics
      const successfulShopCount = shopNotifications.filter(
        (result) => result.status === 'fulfilled',
      ).length;

      console.log(
        `📢 Successfully processed notifications for ${successfulShopCount} shops and ${usersWithShopAccess.length} users for updated & approved sale #${result.invoiceNo}`,
      );
    } catch (notificationError) {
      console.error(
        '❌ Unexpected error in notification process:',
        notificationError,
      );
      // Don't throw error - the sale was updated successfully
    }
  }

  return result;
};
// Delete Sell
const deleteSell = async (id, userId) => {
  const existingSell = await getSellById(id);
  if (!existingSell) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  // Delete the sell with stock reversal
  await prisma.$transaction(async (tx) => {
    // Get all sell items with their batches
    const sellItemsWithBatches = await tx.sellItem.findMany({
      where: { sellId: id },
      include: {
        batches: {
          include: {
            batch: true,
          },
        },
        shop: true,
        unitOfMeasure: true,
      },
    });

    // Prepare operations for stock reversal
    const reversalOperations = [];

    // Reverse stock for each delivered item
    sellItemsWithBatches.forEach((sellItem) => {
      // Only reverse stock if the item was delivered (has batches)
      if (
        sellItem.batches.length > 0 &&
        sellItem.itemSaleStatus === 'DELIVERED'
      ) {
        sellItem.batches.forEach((sellItemBatch) => {
          const quantityToRestore = sellItemBatch.quantity;

          // Restore stock to shop for this specific batch
          reversalOperations.push(
            tx.shopStock.update({
              where: {
                shopId_batchId: {
                  shopId: sellItem.shopId,
                  batchId: sellItemBatch.batchId,
                },
              },
              data: {
                quantity: { increment: quantityToRestore },
              },
            }),
          );

          // Create reverse stock ledger entry (IN movement to reverse the OUT)
          reversalOperations.push(
            tx.stockLedger.create({
              data: {
                batchId: sellItemBatch.batchId,
                shopId: sellItem.shopId,
                movementType: 'IN',
                quantity: quantityToRestore,
                unitOfMeasureId: sellItem.unitOfMeasureId,
                reference: `Sell-Delete-${existingSell.invoiceNo}`,
                userId,
                notes: `Sale deletion - Stock reversal for Item: ${sellItem.id}`,
                movementDate: new Date(),
              },
            }),
          );
        });
      }
    });

    // Delete all sell item batches first (due to foreign key constraints)
    const sellItemIds = sellItemsWithBatches.map((item) => item.id);
    if (sellItemIds.length > 0) {
      await tx.sellItemBatch.deleteMany({
        where: {
          sellItemId: { in: sellItemIds },
        },
      });
    }

    // Execute stock reversal operations if any
    if (reversalOperations.length > 0) {
      await Promise.all(reversalOperations);
    }

    // Delete all sell items
    await tx.sellItem.deleteMany({
      where: { sellId: id },
    });

    // Delete the sell
    await tx.sell.delete({
      where: { id },
    });

    // Create log entry for the deletion with stock reversal info
    const deliveredItems = sellItemsWithBatches.filter(
      (item) => item.itemSaleStatus === 'DELIVERED' && item.batches.length > 0,
    );

    let logMessage = `Sale ${existingSell.invoiceNo} deleted`;

    if (deliveredItems.length > 0) {
      const totalItemsReversed = deliveredItems.length;
      const totalBatchesReversed = deliveredItems.reduce(
        (sum, item) => sum + item.batches.length,
        0,
      );
      const totalQuantityReversed = deliveredItems.reduce(
        (sum, item) =>
          sum +
          item.batches.reduce((itemSum, batch) => itemSum + batch.quantity, 0),
        0,
      );

      logMessage += ` - Stock reversed: ${totalItemsReversed} items, ${totalBatchesReversed} batches, ${totalQuantityReversed} units`;
    }

    await tx.log.create({
      data: {
        action: logMessage,
        userId,
      },
    });
  });

  return { message: 'Sale deleted successfully with stock reversal' };
};

// Complete Sale (Deliver items and update stock)
// Complete Sale Delivery - Deliver specific items based on provided item IDs\

const completeSaleDelivery = async (saleId, deliveryData, userId) => {
  const sell = await getSellById(saleId);

  if (!sell) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  return prisma.$transaction(async (tx) => {
    // Get all unit of measures for the sale items
    const unitOfMeasureIds = sell.items.map((item) => item.unitOfMeasureId);
    const unitOfMeasures = await tx.unitOfMeasure.findMany({
      where: { id: { in: unitOfMeasureIds } },
    });

    const unitOfMeasureMap = unitOfMeasures.reduce((acc, uom) => {
      acc[uom.id] = uom;
      return acc;
    }, {});

    // Get sell items that are being delivered
    const sellItemsToDeliver = await tx.sellItem.findMany({
      where: {
        id: { in: deliveryData.items.map((item) => item.itemId) },
        sellId: saleId,
      },
    });

    if (sellItemsToDeliver.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No valid items found for delivery. Please check the provided item IDs.',
      );
    }

    // Validate delivery data structure
    if (!deliveryData.items || !Array.isArray(deliveryData.items)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Invalid delivery data format. Expected items array.',
      );
    }

    // Validate all items and batches first
    deliveryData.items.forEach((deliveryItem) => {
      const sellItem = sellItemsToDeliver.find(
        (item) => item.id === deliveryItem.itemId,
      );

      if (!sellItem) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${deliveryItem.itemId} not found in sale`,
        );
      }

      const unitOfMeasure = unitOfMeasureMap[sellItem.unitOfMeasureId];

      if (!unitOfMeasure) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Unit of measure not found for item ${sellItem.id}`,
        );
      }

      // Validate item status transition
      const allowedItemTransitions = {
        PENDING: ['DELIVERED', 'CANCELLED'],
        DELIVERED: ['RETURNED'],
        CANCELLED: [],
        RETURNED: [],
      };

      if (
        !allowedItemTransitions[sellItem.itemSaleStatus]?.includes('DELIVERED')
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Cannot deliver item ${sellItem.id} from current status: ${sellItem.itemSaleStatus}. Item must be in PENDING status to be delivered.`,
        );
      }

      // Validate that batches exist for this item in delivery data
      if (
        !deliveryItem.batches ||
        !Array.isArray(deliveryItem.batches) ||
        deliveryItem.batches.length === 0
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${sellItem.id} has no batches specified in delivery data`,
        );
      }

      // Validate total batch quantities match item quantity
      const totalBatchQuantity = deliveryItem.batches.reduce(
        (sum, batch) => sum + (batch.quantity || 0),
        0,
      );
      if (totalBatchQuantity !== sellItem.quantity) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Item ${sellItem.id}: Total batch quantities (${totalBatchQuantity}) do not match item quantity (${sellItem.quantity})`,
        );
      }

      // Validate each batch
      deliveryItem.batches.forEach((batch, index) => {
        if (!batch.batchId) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Batch ${index + 1} for item ${sellItem.id} is missing batchId`,
          );
        }
        if (!batch.quantity || batch.quantity <= 0) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Batch ${batch.batchId} for item ${sellItem.id} has invalid quantity`,
          );
        }
      });
    });

    // Prepare operations for creating batches and processing delivery
    const operations = deliveryData.items.flatMap((deliveryItem) => {
      const sellItem = sellItemsToDeliver.find(
        (item) => item.id === deliveryItem.itemId,
      );
      const itemOperations = [];

      // First, create SellItemBatch records for this item
      deliveryItem.batches.forEach((batch) => {
        itemOperations.push(
          tx.sellItemBatch.create({
            data: {
              sellItemId: deliveryItem.itemId,
              batchId: batch.batchId,
              quantity: batch.quantity,
            },
          }),
        );
      });

      // Process each batch for stock updates
      deliveryItem.batches.forEach((batch) => {
        const quantityToUse = batch.quantity;

        // Remove stock from shop for this specific batch
        itemOperations.push(
          tx.shopStock.update({
            where: {
              shopId_batchId: {
                shopId: sellItem.shopId,
                batchId: batch.batchId,
              },
            },
            data: {
              quantity: { decrement: quantityToUse },
            },
          }),
        );

        // Create stock ledger entry for this batch
        itemOperations.push(
          tx.stockLedger.create({
            data: {
              batchId: batch.batchId,
              shopId: sellItem.shopId,
              movementType: 'OUT',
              quantity: quantityToUse,
              unitOfMeasureId: sellItem.unitOfMeasureId,
              reference: `Sell-${sell.invoiceNo}`,
              userId,
              notes: `Sale delivery to customer - Item: ${sellItem.id}`,
              movementDate: new Date(),
            },
          }),
        );
      });

      // Update item status to DELIVERED
      itemOperations.push(
        tx.sellItem.update({
          where: { id: deliveryItem.itemId },
          data: { itemSaleStatus: 'DELIVERED' },
        }),
      );

      return itemOperations;
    });

    const updatedItems = deliveryData.items.map((deliveryItem) => {
      const sellItem = sellItemsToDeliver.find(
        (item) => item.id === deliveryItem.itemId,
      );
      return {
        id: sellItem.id,
        shopId: sellItem.shopId,
        previousStatus: sellItem.itemSaleStatus,
        newStatus: 'DELIVERED',
        batchCount: deliveryItem.batches.length,
        totalQuantity: sellItem.quantity,
      };
    });

    // Execute all operations in parallel
    await Promise.all(operations);

    // Recalculate overall sale status based on all item statuses
    const allSaleItems = await tx.sellItem.findMany({
      where: { sellId: saleId },
      include: {
        batches: true,
      },
    });

    const itemStatuses = allSaleItems.map((item) => item.itemSaleStatus);
    let newSaleStatus;

    // Determine overall status based on individual item statuses
    if (itemStatuses.every((status) => status === 'DELIVERED')) {
      newSaleStatus = 'DELIVERED';
    } else if (itemStatuses.every((status) => status === 'CANCELLED')) {
      newSaleStatus = 'CANCELLED';
    } else if (itemStatuses.every((status) => status === 'RETURNED')) {
      newSaleStatus = 'RETURNED';
    } else if (itemStatuses.some((status) => status === 'DELIVERED')) {
      // If any items are delivered, status should be PARTIALLY_DELIVERED (mixed status)
      newSaleStatus = 'PARTIALLY_DELIVERED';
    } else if (itemStatuses.every((status) => status === 'PENDING')) {
      newSaleStatus = 'NOT_APPROVED';
    } else {
      // Default fallback
      newSaleStatus = 'NOT_APPROVED';
    }

    // Update the sale status
    const finalUpdatedSale = await tx.sell.update({
      where: { id: saleId },
      data: {
        saleStatus: newSaleStatus,
        updatedById: userId,
      },
      include: {
        items: {
          include: {
            shop: true,
            product: true,
            unitOfMeasure: true,
            batches: {
              include: {
                batch: true,
              },
            },
          },
        },
        customer: true,
        branch: true,
      },
    });

    // Group delivered items by shop for better logging
    const shopDeliveries = updatedItems.reduce((acc, item) => {
      if (!acc[item.shopId]) {
        acc[item.shopId] = { items: 0, batches: 0, quantity: 0 };
      }
      acc[item.shopId].items += 1;
      acc[item.shopId].batches += item.batchCount;
      acc[item.shopId].quantity += item.totalQuantity;
      return acc;
    }, {});

    // Create log entry for delivered items
    const shopSummary = Object.entries(shopDeliveries)
      .map(
        ([shopId, stats]) => `Shop${shopId}:${stats.items}i,${stats.batches}b`,
      )
      .join('; ');

    await tx.log.create({
      data: {
        action: `Sale ${sell.invoiceNo} delivered: ${shopSummary}`,
        userId,
      },
    });

    return finalUpdatedSale;
  });
};
const deliverAllSaleItems = async (saleId, deliveryData, userId) => {
  const sell = await getSellById(saleId);

  if (!sell) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  // Get all items that can be delivered (PENDING status)
  const deliverableItems = sell.items.filter(
    (item) => item.itemSaleStatus === 'PENDING',
  );

  if (deliverableItems.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'No deliverable items found in this sale. All items are either already delivered, cancelled, or returned.',
    );
  }

  return completeSaleDelivery(saleId, deliveryData, userId);
};

const partialSaleDelivery = async (saleId, deliveryData, userId) => {
  return completeSaleDelivery(saleId, deliveryData, userId);
};

const updateSaleStatus = async (saleId, newStatus, userId) => {
  const sale = await getSellById(saleId);

  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  // Validate status transition
  const allowedTransitions = {
    NOT_APPROVED: ['APPROVED', 'CANCELLED'],
    APPROVED: ['DELIVERED', 'CANCELLED'],
    DELIVERED: ['RETURNED'],
    CANCELLED: [],
    RETURNED: [],
  };

  if (!allowedTransitions[sale.saleStatus]?.includes(newStatus)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot change status from ${sale.saleStatus} to ${newStatus}`,
    );
  }

  // Use prisma.sell.update() instead of prisma.sale.update()
  const updatedSale = await prisma.sell.update({
    where: { id: saleId },
    data: {
      saleStatus: newStatus,
      updatedById: userId,
    },
    include: {
      items: {
        include: {
          shop: true,
        },
      },
      customer: true,
    },
  });

  // Create log entry
  await prisma.log.create({
    data: {
      action: `Updated sale ${sale.invoiceNo} status from ${sale.saleStatus} to ${newStatus}`,
      userId,
    },
  });

  // ✅ ADD REAL-TIME NOTIFICATIONS HERE - For status changes to APPROVED or CANCELLED
  if (newStatus === 'APPROVED' || newStatus === 'CANCELLED') {
    try {
      const uniqueShopIds = updatedSale.items
        .map((item) => item.shopId)
        .filter(Boolean)
        .filter((shopId, index, array) => array.indexOf(shopId) === index);

      // Find users who have access to these shops
      const usersWithShopAccess = await prisma.user.findMany({
        where: {
          shops: {
            some: {
              id: { in: uniqueShopIds },
            },
          },
          status: 'Active', // Only active users
        },
        select: {
          id: true,
          name: true,
          email: true,
          shops: {
            where: {
              id: { in: uniqueShopIds },
            },
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Determine notification type and message based on status
      const notificationConfig = {
        APPROVED: {
          type: 'SELL_READY_FOR_DELIVERY',
          title: 'Sale Approved - Prepare for Delivery',
          message: `Sale #${updatedSale.invoiceNo} has been approved and is ready for delivery preparation`,
          realTimeTitle: 'Sale Approved',
          realTimeMessage: `Sale #${updatedSale.invoiceNo} has been approved and needs delivery preparation`,
        },
        CANCELLED: {
          type: 'SELL_CANCELLED',
          title: 'Sale Cancelled',
          message: `Sale #${updatedSale.invoiceNo} has been cancelled`,
          realTimeTitle: 'Sale Cancelled',
          realTimeMessage: `Sale #${updatedSale.invoiceNo} has been cancelled`,
        },
      };

      const config = notificationConfig[newStatus];

      // Create shop notifications (store in database)
      const shopNotifications = await Promise.allSettled(
        uniqueShopIds.map((shopId) =>
          prisma.notification.create({
            data: {
              shopId,
              title: config.title,
              message: config.message,
              type: config.type,
              relatedEntityType: 'SELL',
            },
          }),
        ),
      );

      // Get the Socket.IO instance
      const io = getIO();

      // Create notification object for real-time sending
      const realTimeNotification = {
        title: config.realTimeTitle,
        message: config.realTimeMessage,
        type: config.type,
        relatedEntityType: 'SELL',
        saleId: updatedSale.id,
        invoiceNo: updatedSale.invoiceNo,
        status: newStatus,
        timestamp: new Date().toISOString(),
      };

      // ✅ FIXED: Remove prefixes to match frontend
      // Send real-time notifications to shops
      shopNotifications
        .filter((result, index) => result.status === 'fulfilled')
        .forEach((result, index) => {
          const shopId = uniqueShopIds[index];
          const notification = result.value;

          // Remove 'shop:' prefix to match frontend
          io.to(shopId).emit('new-notification', notification);
          console.log(`✅ Sent real-time notification to shop ${shopId}`);
        });

      // Send real-time notifications to users with shop access
      usersWithShopAccess.forEach((user) => {
        // Send to each user individually - remove 'user:' prefix
        io.to(user.id).emit('new-notification', realTimeNotification);
        console.log(
          `✅ Sent real-time notification to user ${user.name} (${user.id})`,
        );

        // Also send to user's shops for additional targeting
        user.shops.forEach((shop) => {
          // Remove prefixes to match what frontend will join
          io.to(`${user.id}:${shop.id}`).emit(
            'new-notification',
            realTimeNotification,
          );
        });
      });

      // Log statistics
      const successfulShopCount = shopNotifications.filter(
        (result) => result.status === 'fulfilled',
      ).length;

      console.log(
        `📢 Successfully processed ${newStatus.toLowerCase()} notifications for ${successfulShopCount} shops and ${
          usersWithShopAccess.length
        } users for sale #${updatedSale.invoiceNo}`,
      );
    } catch (notificationError) {
      console.error(
        `❌ Unexpected error in ${newStatus.toLowerCase()} notification process:`,
        notificationError,
      );
      // Don't throw error - the sale status was updated successfully
    }
  }

  return updatedSale;
};

// Update Payment Status
const updatePaymentStatus = async (saleId, newPaymentStatus, userId) => {
  const sale = await getSellById(saleId);

  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  const updatedSale = await prisma.sell.update({
    where: { id: saleId },
    data: {
      paymentStatus: newPaymentStatus,
      updatedById: userId,
    },
    include: {
      items: true,
      customer: true,
    },
  });

  // Create log entry
  await prisma.log.create({
    data: {
      action: `Updated sale ${sale.invoiceNo} payment status to ${newPaymentStatus}`,
      userId,
    },
  });

  return updatedSale;
};

// Cancel Sale (Before delivery)
const cancelSale = async (saleId, userId) => {
  const sale = await getSellById(saleId);

  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  if (sale.saleStatus === 'DELIVERED') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot cancel delivered sale. Use return instead.',
    );
  }

  const updatedSale = await prisma.sell.update({
    where: { id: saleId },
    data: {
      saleStatus: 'CANCELLED',
      updatedById: userId,
    },
    include: {
      items: {
        include: {
          shop: true,
        },
      },
      customer: true,
    },
  });

  // Create log entry
  await prisma.log.create({
    data: {
      action: `Cancelled sale ${sale.invoiceNo}`,
      userId,
    },
  });

  // ✅ ADD REAL-TIME NOTIFICATIONS HERE - Create cancellation notifications
  try {
    const uniqueShopIds = updatedSale.items
      .map((item) => item.shopId)
      .filter(Boolean)
      .filter((shopId, index, array) => array.indexOf(shopId) === index);

    // Find users who have access to these shops
    const usersWithShopAccess = await prisma.user.findMany({
      where: {
        shops: {
          some: {
            id: { in: uniqueShopIds },
          },
        },
        status: 'Active', // Only active users
      },
      select: {
        id: true,
        name: true,
        email: true,
        shops: {
          where: {
            id: { in: uniqueShopIds },
          },
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Create shop notifications (store in database)
    const shopNotifications = await Promise.allSettled(
      uniqueShopIds.map((shopId) =>
        prisma.notification.create({
          data: {
            shopId,
            title: 'Sale Cancelled',
            message: `Sale #${updatedSale.invoiceNo} has been cancelled`,
            type: 'SELL_CANCELLED',
            relatedEntityType: 'SELL',
          },
        }),
      ),
    );

    // Get the Socket.IO instance
    const io = getIO();

    // Create notification object for real-time sending
    const realTimeNotification = {
      title: 'Sale Cancelled',
      message: `Sale #${updatedSale.invoiceNo} has been cancelled`,
      type: 'SELL_CANCELLED',
      relatedEntityType: 'SELL',
      saleId: updatedSale.id,
      invoiceNo: updatedSale.invoiceNo,
      timestamp: new Date().toISOString(),
    };

    // ✅ FIXED: Remove prefixes to match frontend
    // Send real-time notifications to shops
    shopNotifications
      .filter((result, index) => result.status === 'fulfilled')
      .forEach((result, index) => {
        const shopId = uniqueShopIds[index];
        const notification = result.value;

        // Remove 'shop:' prefix to match frontend
        io.to(shopId).emit('new-notification', notification);
        console.log(`✅ Sent real-time notification to shop ${shopId}`);
      });

    // Send real-time notifications to users with shop access
    usersWithShopAccess.forEach((user) => {
      // Send to each user individually - remove 'user:' prefix
      io.to(user.id).emit('new-notification', realTimeNotification);
      console.log(
        `✅ Sent real-time notification to user ${user.name} (${user.id})`,
      );

      // Also send to user's shops for additional targeting
      user.shops.forEach((shop) => {
        // Remove prefixes to match what frontend will join
        io.to(`${user.id}:${shop.id}`).emit(
          'new-notification',
          realTimeNotification,
        );
      });
    });

    // Log statistics
    const successfulShopCount = shopNotifications.filter(
      (result) => result.status === 'fulfilled',
    ).length;

    console.log(
      `📢 Successfully processed cancellation notifications for ${successfulShopCount} shops and ${usersWithShopAccess.length} users for sale #${updatedSale.invoiceNo}`,
    );
  } catch (notificationError) {
    console.error(
      '❌ Unexpected error in cancellation notification process:',
      notificationError,
    );
    // Don't throw error - the sale was cancelled successfully
  }

  return updatedSale;
};
const getAllSellsuser = async ({ startDate, endDate, userId }) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const whereClause = {
    createdById: userId,
  };

  // If BOTH startDate and endDate are provided, filter by date range
  if (startDate && endDate) {
    try {
      // Parse dates to local time
      const [startYear, startMonth, startDay] = startDate.split('-');
      const [endYear, endMonth, endDay] = endDate.split('-');

      const startOfRange = new Date(
        startYear,
        startMonth - 1,
        startDay,
        0,
        0,
        0,
        0,
      );
      const endOfRange = new Date(
        endYear,
        endMonth - 1,
        endDay,
        23,
        59,
        59,
        999,
      );

      whereClause.createdAt = {
        gte: startOfRange,
        lte: endOfRange,
      };
    } catch (error) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }
  }
  // If only startDate is provided, filter from that date to now
  else if (startDate && !endDate) {
    const [year, month, day] = startDate.split('-');
    const startOfRange = new Date(year, month - 1, day, 0, 0, 0, 0);

    whereClause.createdAt = {
      gte: startOfRange,
    };
  }
  // If only endDate is provided, filter from 12 months ago to that date
  else if (endDate && !startDate) {
    const [year, month, day] = endDate.split('-');
    const endOfRange = new Date(year, month - 1, day, 23, 59, 59, 999);
    const twelveMonthsAgo = subMonths(new Date(), 12);

    whereClause.createdAt = {
      gte: twelveMonthsAgo,
      lte: endOfRange,
    };
  }
  // If no dates provided, default to last 12 months
  else {
    whereClause.createdAt = {
      gte: subMonths(new Date(), 12),
    };
  }

  const sells = await prisma.sell.findMany({
    where: whereClause,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      branch: true,
      customer: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      items: {
        include: {
          product: {
            include: {
              unitOfMeasure: true,
              category: true,
            },
          },
          shop: true,
          unitOfMeasure: true,
          batches: {
            include: {
              batch: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: { items: true },
      },
    },
  });

  return {
    sells,
    count: sells.length,
    meta: {
      dateRange: {
        requestedStart: startDate,
        requestedEnd: endDate,
        actualCount: sells.length,
      },
    },
  };
};

// Get all Sells filtered by user's shops
const getAllSellsForStore = async ({ startDate, endDate, userId } = {}) => {
  const whereClause = { saleStatus: { not: 'NOT_APPROVED' } }; // Exclude cancelled sales by default
  const twelveMonthsAgo = subMonths(new Date(), 12); // Default time range

  // Convert string dates to Date objects if they exist
  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;

  // Build the date filter
  if (startDateObj && endDateObj) {
    whereClause.saleDate = {
      gte: startDateObj,
      lte: endDateObj,
    };
  } else if (startDateObj) {
    whereClause.saleDate = {
      gte: startDateObj,
      lte: new Date(),
    };
  } else if (endDateObj) {
    whereClause.saleDate = {
      gte: twelveMonthsAgo,
      lte: endDateObj,
    };
  } else {
    whereClause.saleDate = {
      gte: twelveMonthsAgo,
    };
  }

  // If userId is provided, get user's shops and filter sells by those shops
  if (userId) {
    // First, get the user with their associated shops
    const userWithShops = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        shops: {
          select: { id: true },
        },
      },
    });

    // If user has shops, add shop filter to whereClause
    if (userWithShops && userWithShops.shops.length > 0) {
      const userShopIds = userWithShops.shops.map((shop) => shop.id);

      whereClause.items = {
        some: {
          shopId: {
            in: userShopIds,
          },
        },
      };
    } else {
      // If user has no shops, return empty results
      return {
        sells: [],
        count: 0,
      };
    }
  }

  const sells = await prisma.sell.findMany({
    where: whereClause,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      branch: true,
      customer: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      items: {
        include: {
          product: {
            include: {
              unitOfMeasure: true,
              category: true,
            },
          },
          shop: true,
          unitOfMeasure: true,
          batches: {
            include: {
              batch: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: { items: true },
      },
    },
  });

  return {
    sells,
    count: sells.length,
  };
};

// 2. Separate function to unlock a sell record
const unlockSell = async (id) => {
  const sell = await prisma.sell.update({
    where: { id },
    data: {
      locked: false,
      lockedAt: new Date(), // re-lock now
    },
  });
  return sell;
};
module.exports = {
  unlockSell,
  getSellById,
  getSellByInvoiceNo,
  getAllSells,
  createSell,
  updateSell,
  deleteSell,
  deliverAllSaleItems,
  completeSaleDelivery,
  updateSaleStatus,
  updatePaymentStatus,
  cancelSale,
  partialSaleDelivery,
  getAllSellsuser,
  getAllSellsForStore,
  getSellByIdByuser,
};
